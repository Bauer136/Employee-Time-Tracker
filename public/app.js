// Frontend logic for the time-tracker UI.
// Talks to the Express API via fetch(); no framework, just vanilla DOM.

// Thin wrapper around fetch — keeps URL strings and headers in one place so the rest of the file stays readable.
const api = {
    listEmployees: () => fetch('/api/employees').then(r => r.json()),
    addEmployee: (data) => fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    }),
    updateEmployeeRate: (id, hourly_rate) => fetch(`/api/employees/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hourly_rate }),
    }),
    deleteEmployee: (id) => fetch(`/api/employees/${id}`, { method: 'DELETE' }),
    listEntries: () => fetch('/api/time-entries?limit=50').then(r => r.json()),
    activeEntry: (employeeId) => fetch(`/api/time-entries/active/${employeeId}`).then(r => r.json()),
    clockIn: (data) => fetch('/api/time-entries/clock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    }),
    clockOut: (data) => fetch('/api/time-entries/clock-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    }),
    payPreview: (start) => fetch(`/api/payroll/preview?start=${encodeURIComponent(start)}`),
};

// ---- Formatting helpers ----

// Renders an ISO timestamp string in the user's local locale, or an em-dash if missing.
function fmt(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString();
}

// Formats a duration in seconds as HH:MM:SS for the entries table.
function fmtDuration(seconds) {
    if (seconds == null) return '—';
    const s = Math.max(0, Math.floor(Number(seconds)));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// Live wall-clock in the top-right of the page; ticks every second.
function tickClock() {
    const el = document.getElementById('clock');
    el.textContent = new Date().toLocaleTimeString();
}
setInterval(tickClock, 1000);
tickClock();

// Writes a status line under a form. `kind` is '', 'success', or 'error' — controls CSS color.
function setMessage(elId, text, kind = '') {
    const el = document.getElementById(elId);
    el.textContent = text;
    el.className = `msg ${kind}`;
}

// Re-fetches the employee list and rebuilds both the dropdown and the employees table.
// Also fires one /active call per employee so the status badge stays current.
async function refreshEmployees() {
    const employees = await api.listEmployees();
    const select = document.getElementById('employee-select');
    // Preserve the user's current dropdown selection across the re-render.
    const prev = select.value;
    select.innerHTML = '';
    if (employees.length === 0) {
        const opt = document.createElement('option');
        opt.textContent = '— No employees yet —';
        opt.value = '';
        select.appendChild(opt);
    } else {
        for (const e of employees) {
            const opt = document.createElement('option');
            opt.value = e.id;
            opt.textContent = `${e.name} (${e.email})`;
            select.appendChild(opt);
        }
        if (prev) select.value = prev;
    }

    const tbody = document.querySelector('#employees-table tbody');
    tbody.innerHTML = '';
    // Parallel fetch for "is this employee currently clocked in?" — small N, much faster than serial.
    const statuses = await Promise.all(employees.map(e => api.activeEntry(e.id)));
    employees.forEach((e, idx) => {
        const tr = document.createElement('tr');
        const isIn = !!statuses[idx];
        const rate = Number(e.hourly_rate || 0).toFixed(2);
        tr.innerHTML = `
            <td>${escapeHtml(e.name)}</td>
            <td>${escapeHtml(e.email)}</td>
            <td>${escapeHtml(e.role || '')}</td>
            <td><input type="number" min="0" step="0.01" value="${rate}" data-rate="${e.id}" style="width:90px;" /></td>
            <td><span class="badge ${isIn ? 'in' : 'out'}">${isIn ? 'Clocked In' : 'Out'}</span></td>
            <td><button class="subtle" data-del="${e.id}">Delete</button></td>
        `;
        tbody.appendChild(tr);
    });

    // Wire up the per-row delete buttons after the rows are in the DOM.
    tbody.querySelectorAll('button[data-del]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Delete this employee and all their time entries?')) return;
            await api.deleteEmployee(btn.dataset.del);
            await refreshAll();
        });
    });

    // Inline rate editing: PATCH on `change` (fires when the input loses focus or Enter is pressed).
    tbody.querySelectorAll('input[data-rate]').forEach(input => {
        input.addEventListener('change', async () => {
            const id = input.dataset.rate;
            const value = Number(input.value);
            if (Number.isNaN(value) || value < 0) return;
            await api.updateEmployeeRate(id, value);
        });
    });
}

// Re-fetches the most recent 50 time entries and rebuilds the entries table.
async function refreshEntries() {
    const entries = await api.listEntries();
    const tbody = document.querySelector('#entries-table tbody');
    tbody.innerHTML = '';
    if (entries.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="5" style="color:#6b7280;text-align:center;">No time entries yet.</td>';
        tbody.appendChild(tr);
        return;
    }
    for (const t of entries) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(t.employee_name)}</td>
            <td>${fmt(t.clock_in)}</td>
            <td>${t.clock_out ? fmt(t.clock_out) : '<em style="color:#059669;">In progress</em>'}</td>
            <td>${fmtDuration(t.duration_seconds)}</td>
            <td>${escapeHtml(t.note || '')}</td>
        `;
        tbody.appendChild(tr);
    }
}

// Replaces HTML-special characters with entities so user-supplied strings (names, emails, notes)
// can't inject markup or scripts when interpolated into innerHTML.
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// Convenience: refresh both tables together. Used after any action that changes either dataset.
async function refreshAll() {
    await Promise.all([refreshEmployees(), refreshEntries()]);
}

// ---- Form & button handlers ----

// Add-employee form: POSTs to /api/employees, then refreshes the page state.
document.getElementById('employee-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('emp-name').value.trim();
    const email = document.getElementById('emp-email').value.trim();
    const role = document.getElementById('emp-role').value.trim();
    const rateRaw = document.getElementById('emp-rate').value.trim();
    const hourly_rate = rateRaw === '' ? 0 : Number(rateRaw);
    const res = await api.addEmployee({ name, email, role, hourly_rate });
    if (res.ok) {
        setMessage('employee-form-msg', `Added ${name}.`, 'success');
        e.target.reset();
        await refreshAll();
    } else {
        const data = await res.json().catch(() => ({}));
        setMessage('employee-form-msg', data.error || 'Failed to add employee.', 'error');
    }
});

// Clock-in button: posts the selected employee's id (and optional note) to the API.
document.getElementById('clock-in-btn').addEventListener('click', async () => {
    const employee_id = document.getElementById('employee-select').value;
    const note = document.getElementById('clock-note').value.trim();
    if (!employee_id) {
        setMessage('clock-status', 'Select an employee first.', 'error');
        return;
    }
    const res = await api.clockIn({ employee_id, note });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
        setMessage('clock-status', `Clocked in at ${fmt(data.clock_in)}.`, 'success');
        document.getElementById('clock-note').value = '';
        await refreshAll();
    } else {
        setMessage('clock-status', data.error || 'Failed to clock in.', 'error');
    }
});

// Clock-out button: closes the open entry for the selected employee.
document.getElementById('clock-out-btn').addEventListener('click', async () => {
    const employee_id = document.getElementById('employee-select').value;
    if (!employee_id) {
        setMessage('clock-status', 'Select an employee first.', 'error');
        return;
    }
    const res = await api.clockOut({ employee_id });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
        setMessage('clock-status', `Clocked out at ${fmt(data.clock_out)}.`, 'success');
        await refreshAll();
    } else {
        setMessage('clock-status', data.error || 'Failed to clock out.', 'error');
    }
});

// ---- Pay-period export card ----

// Local-time YYYY-MM-DD formatter (toISOString would shift days near midnight UTC).
function isoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// Updates the "→ through YYYY-MM-DD (14 days)" hint shown next to the date picker.
// Adds 13 (not 14) because the displayed end date is inclusive, while the API window is half-open.
function updatePayEndLabel() {
    const startStr = document.getElementById('pay-start').value;
    const label = document.getElementById('pay-end-label');
    if (!startStr) { label.textContent = ''; return; }
    const start = new Date(`${startStr}T00:00:00`);
    const endInclusive = new Date(start);
    endInclusive.setDate(endInclusive.getDate() + 13);
    label.textContent = `→ through ${isoDate(endInclusive)} (14 days)`;
}

// Default the date picker to "13 days ago" so the current 14-day window ends today.
(function initPayCard() {
    const today = new Date();
    const defaultStart = new Date(today);
    defaultStart.setDate(defaultStart.getDate() - 13);
    document.getElementById('pay-start').value = isoDate(defaultStart);
    updatePayEndLabel();
})();

document.getElementById('pay-start').addEventListener('change', updatePayEndLabel);

// Preview button: renders the same data the .xlsx would contain, in an HTML table, without downloading anything.
document.getElementById('pay-preview-btn').addEventListener('click', async () => {
    const start = document.getElementById('pay-start').value;
    if (!start) {
        setMessage('pay-status', 'Pick a start date.', 'error');
        return;
    }
    const res = await api.payPreview(start);
    const table = document.getElementById('pay-preview-table');
    const tbody = table.querySelector('tbody');
    const tfoot = table.querySelector('tfoot');
    tbody.innerHTML = '';
    tfoot.innerHTML = '';
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage('pay-status', data.error || 'Failed to load preview.', 'error');
        table.style.display = 'none';
        return;
    }
    const data = await res.json();
    if (data.rows.length === 0) {
        setMessage('pay-status', 'No employees to report.', '');
        table.style.display = 'none';
        return;
    }
    let totalHours = 0, totalPay = 0;
    for (const r of data.rows) {
        const hours = Number(r.hours);
        const rate = Number(r.hourly_rate);
        const pay = hours * rate;
        totalHours += hours;
        totalPay += pay;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(r.name)}</td>
            <td>${hours.toFixed(2)}</td>
            <td>$${rate.toFixed(2)}</td>
            <td>$${pay.toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
    }
    const trTotal = document.createElement('tr');
    trTotal.innerHTML = `
        <td><strong>Totals</strong></td>
        <td><strong>${totalHours.toFixed(2)}</strong></td>
        <td></td>
        <td><strong>$${totalPay.toFixed(2)}</strong></td>
    `;
    tfoot.appendChild(trTotal);
    table.style.display = 'table';
    setMessage('pay-status', `Preview for ${start} (14 days).`, 'success');
});

// Download button: navigating to the export URL triggers the browser's download dialog
// because the server sends Content-Disposition: attachment.
document.getElementById('pay-export-btn').addEventListener('click', () => {
    const start = document.getElementById('pay-start').value;
    if (!start) {
        setMessage('pay-status', 'Pick a start date.', 'error');
        return;
    }
    window.location.href = `/api/payroll/export?start=${encodeURIComponent(start)}`;
    setMessage('pay-status', 'Generating spreadsheet…', 'success');
});

// Initial load + auto-refresh of entries every 30s so an "in progress" duration appears reasonably current.
refreshAll();
setInterval(refreshEntries, 30000);
