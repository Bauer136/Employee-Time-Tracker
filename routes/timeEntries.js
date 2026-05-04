// Clock-in / clock-out endpoints, mounted at /api/time-entries by server.js.
const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/time-entries — recent entries, optionally filtered to one employee.
// Returns each row's duration in seconds; for entries still in progress, duration is measured against NOW().
router.get('/', async (req, res, next) => {
    const { employee_id, limit } = req.query;
    const params = [];
    let where = '';
    if (employee_id) {
        params.push(employee_id);
        where = `WHERE t.employee_id = $${params.length}`;
    }
    // Cap the limit to protect the server from huge result sets.
    const lim = Math.min(parseInt(limit, 10) || 100, 500);
    try {
        const { rows } = await db.query(
            `SELECT t.id, t.employee_id, e.name AS employee_name, t.clock_in, t.clock_out, t.note,
                    EXTRACT(EPOCH FROM (COALESCE(t.clock_out, NOW()) - t.clock_in)) AS duration_seconds
             FROM time_entries t
             JOIN employees e ON e.id = t.employee_id
             ${where}
             ORDER BY t.clock_in DESC
             LIMIT ${lim}`,
            params
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// GET /api/time-entries/active/:employeeId — returns the open (clock_out IS NULL) entry, or null.
// The frontend uses this to decide whether to show the "Clocked In" badge.
router.get('/active/:employeeId', async (req, res, next) => {
    try {
        const { rows } = await db.query(
            `SELECT id, employee_id, clock_in, clock_out, note
             FROM time_entries
             WHERE employee_id = $1 AND clock_out IS NULL
             ORDER BY clock_in DESC
             LIMIT 1`,
            [req.params.employeeId]
        );
        res.json(rows[0] || null);
    } catch (err) {
        next(err);
    }
});

// POST /api/time-entries/clock-in — start a new entry.
// Refuses to create one if the employee already has an open entry (prevents accidental double clock-ins).
router.post('/clock-in', async (req, res, next) => {
    const { employee_id, note } = req.body || {};
    if (!employee_id) {
        return res.status(400).json({ error: 'employee_id is required' });
    }
    try {
        const open = await db.query(
            'SELECT id FROM time_entries WHERE employee_id = $1 AND clock_out IS NULL',
            [employee_id]
        );
        if (open.rowCount > 0) {
            return res.status(409).json({ error: 'Employee already clocked in', entry_id: open.rows[0].id });
        }
        const { rows } = await db.query(
            `INSERT INTO time_entries (employee_id, note)
             VALUES ($1, $2)
             RETURNING id, employee_id, clock_in, clock_out, note`,
            [employee_id, note || null]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        // 23503 = foreign_key_violation — the employee_id doesn't reference a real employee.
        if (err.code === '23503') {
            return res.status(404).json({ error: 'Employee not found' });
        }
        next(err);
    }
});

// POST /api/time-entries/clock-out — close the employee's currently open entry by setting clock_out = NOW().
router.post('/clock-out', async (req, res, next) => {
    const { employee_id } = req.body || {};
    if (!employee_id) {
        return res.status(400).json({ error: 'employee_id is required' });
    }
    try {
        const { rows } = await db.query(
            `UPDATE time_entries
             SET clock_out = NOW()
             WHERE employee_id = $1 AND clock_out IS NULL
             RETURNING id, employee_id, clock_in, clock_out, note`,
            [employee_id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'No active clock-in found for this employee' });
        }
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
