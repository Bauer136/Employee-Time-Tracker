// Payroll/export endpoints, mounted at /api/payroll by server.js.
// Provides a JSON preview and an .xlsx download covering a 14-day pay period.
const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../db');

const router = express.Router();

// Pay periods are exactly 14 days. Window is [start, start + 14 days) — half-open so days don't double-count.
const PERIOD_DAYS = 14;

// Parses "YYYY-MM-DD" from query string into a local-midnight Date. Returns null on bad input.
function parseStartDate(input) {
    if (!input) return null;
    const m = String(input).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(`${input}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
}

// Returns a new Date offset by `days` (positive or negative); does not mutate the input.
function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

// Formats a Date as "YYYY-MM-DD" for use in filenames and headers.
function fmtDate(d) {
    return d.toISOString().slice(0, 10);
}

// GET /api/payroll/preview?start=YYYY-MM-DD — JSON summary used by the in-page preview table.
router.get('/preview', async (req, res, next) => {
    const start = parseStartDate(req.query.start);
    if (!start) return res.status(400).json({ error: 'start must be YYYY-MM-DD' });
    const end = addDays(start, PERIOD_DAYS);
    try {
        const summary = await fetchSummary(start, end);
        res.json({
            period_start: start.toISOString(),
            period_end: end.toISOString(),
            rows: summary,
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/payroll/export?start=YYYY-MM-DD — streams an .xlsx file as the response body.
router.get('/export', async (req, res, next) => {
    const start = parseStartDate(req.query.start);
    if (!start) return res.status(400).json({ error: 'start must be YYYY-MM-DD' });
    const end = addDays(start, PERIOD_DAYS);

    try {
        // Run both queries in parallel — they don't depend on each other.
        const [summary, entries] = await Promise.all([
            fetchSummary(start, end),
            fetchEntries(start, end),
        ]);

        // Build the workbook in memory, then stream it to the client.
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Employee Time Tracker';
        workbook.created = new Date();

        // ---- Sheet 1: Pay Summary (one row per employee, plus a totals row) ----
        const summarySheet = workbook.addWorksheet('Pay Summary');
        const widths = [28, 28, 18, 14, 14, 14];
        widths.forEach((w, i) => { summarySheet.getColumn(i + 1).width = w; });

        // Title row spans columns A–F so the period dates read clearly above the table.
        summarySheet.mergeCells('A1:F1');
        summarySheet.getCell('A1').value =
            `Pay Period: ${fmtDate(start)} – ${fmtDate(addDays(end, -1))}`;
        summarySheet.getCell('A1').font = { italic: true, color: { argb: 'FF555555' } };

        const headerRow = summarySheet.addRow(
            ['Employee', 'Email', 'Role', 'Hours Worked', 'Hourly Rate', 'Gross Pay']
        );
        headerRow.font = { bold: true };
        headerRow.fill = {
            type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' },
        };

        // Accumulate totals as we go so we don't have to iterate twice.
        let totalHours = 0;
        let totalPay = 0;
        for (const r of summary) {
            const hours = Number(r.hours);
            const rate = Number(r.hourly_rate);
            const pay = hours * rate;
            totalHours += hours;
            totalPay += pay;
            const row = summarySheet.addRow(
                [r.name, r.email, r.role || '', hours, rate, pay]
            );
            // numFmt strings are Excel format codes — "0.00" = 2 decimals, '"$"#,##0.00' = currency.
            row.getCell(4).numFmt = '0.00';
            row.getCell(5).numFmt = '"$"#,##0.00';
            row.getCell(6).numFmt = '"$"#,##0.00';
        }

        summarySheet.addRow([]); // blank spacer row
        const totalRow = summarySheet.addRow(
            ['Totals', '', '', totalHours, '', totalPay]
        );
        totalRow.font = { bold: true };
        totalRow.getCell(4).numFmt = '0.00';
        totalRow.getCell(6).numFmt = '"$"#,##0.00';

        // ---- Sheet 2: Time Entries (per-clock-in detail rows) ----
        // Using `columns` here generates the header row automatically — fine because there's no merged title above it.
        const detailSheet = workbook.addWorksheet('Time Entries');
        detailSheet.columns = [
            { header: 'Employee', key: 'name', width: 28 },
            { header: 'Email', key: 'email', width: 28 },
            { header: 'Clock In', key: 'in', width: 22 },
            { header: 'Clock Out', key: 'out', width: 22 },
            { header: 'Hours', key: 'hours', width: 10, style: { numFmt: '0.00' } },
            { header: 'Note', key: 'note', width: 32 },
        ];
        detailSheet.getRow(1).font = { bold: true };

        for (const e of entries) {
            const seconds = Number(e.duration_seconds) || 0;
            detailSheet.addRow({
                name: e.employee_name,
                email: e.employee_email,
                // Pass real Date objects so Excel treats these cells as dates (sortable, formattable).
                in: new Date(e.clock_in),
                out: e.clock_out ? new Date(e.clock_out) : null,
                hours: seconds / 3600,
                note: e.note || '',
            });
            const last = detailSheet.lastRow;
            last.getCell(3).numFmt = 'yyyy-mm-dd hh:mm';
            last.getCell(4).numFmt = 'yyyy-mm-dd hh:mm';
        }

        // Tell the browser to download the file rather than render it inline.
        const filename = `pay_${fmtDate(start)}_to_${fmtDate(addDays(end, -1))}.xlsx`;
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        // Stream the workbook directly into the response.
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        next(err);
    }
});

// Aggregates worked hours per employee for the [start, end) window.
// LEFT JOIN keeps employees with zero hours in the result (so they still appear on the report).
// Only completed entries (clock_out IS NOT NULL) count toward pay.
async function fetchSummary(start, end) {
    const { rows } = await db.query(
        `SELECT e.id, e.name, e.email, e.role, e.hourly_rate,
                COALESCE(SUM(EXTRACT(EPOCH FROM (t.clock_out - t.clock_in))) / 3600.0, 0) AS hours
         FROM employees e
         LEFT JOIN time_entries t
             ON t.employee_id = e.id
            AND t.clock_out IS NOT NULL
            AND t.clock_in >= $1
            AND t.clock_in < $2
         GROUP BY e.id
         ORDER BY e.name ASC`,
        [start, end]
    );
    return rows;
}

// Returns one row per completed time entry within the window, used for the detail sheet.
async function fetchEntries(start, end) {
    const { rows } = await db.query(
        `SELECT t.id, t.clock_in, t.clock_out, t.note,
                e.name AS employee_name, e.email AS employee_email,
                EXTRACT(EPOCH FROM (t.clock_out - t.clock_in)) AS duration_seconds
         FROM time_entries t
         JOIN employees e ON e.id = t.employee_id
         WHERE t.clock_out IS NOT NULL
           AND t.clock_in >= $1
           AND t.clock_in < $2
         ORDER BY e.name ASC, t.clock_in ASC`,
        [start, end]
    );
    return rows;
}

module.exports = router;
