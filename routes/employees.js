// CRUD endpoints for employees, mounted at /api/employees by server.js.
const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/employees — list every employee, alphabetized for predictable display order.
router.get('/', async (req, res, next) => {
    try {
        const { rows } = await db.query(
            'SELECT id, name, email, role, hourly_rate, created_at FROM employees ORDER BY name ASC'
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// POST /api/employees — create a new employee.
// Body: { name, email, role?, hourly_rate? }
router.post('/', async (req, res, next) => {
    const { name, email, role, hourly_rate } = req.body || {};
    if (!name || !email) {
        return res.status(400).json({ error: 'name and email are required' });
    }
    // Treat missing/blank rate as 0; reject negatives and non-numbers.
    const rate = hourly_rate == null || hourly_rate === '' ? 0 : Number(hourly_rate);
    if (Number.isNaN(rate) || rate < 0) {
        return res.status(400).json({ error: 'hourly_rate must be a non-negative number' });
    }
    try {
        const { rows } = await db.query(
            `INSERT INTO employees (name, email, role, hourly_rate)
             VALUES ($1, $2, $3, $4)
             RETURNING id, name, email, role, hourly_rate, created_at`,
            [name, email, role || null, rate]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        // Postgres error code 23505 = unique_violation (duplicate email).
        if (err.code === '23505') {
            return res.status(409).json({ error: 'An employee with that email already exists' });
        }
        next(err);
    }
});

// PATCH /api/employees/:id — update only the hourly rate (used by the inline rate input in the UI).
router.patch('/:id', async (req, res, next) => {
    const { hourly_rate } = req.body || {};
    if (hourly_rate == null) {
        return res.status(400).json({ error: 'hourly_rate is required' });
    }
    const rate = Number(hourly_rate);
    if (Number.isNaN(rate) || rate < 0) {
        return res.status(400).json({ error: 'hourly_rate must be a non-negative number' });
    }
    try {
        const { rows } = await db.query(
            `UPDATE employees SET hourly_rate = $1
             WHERE id = $2
             RETURNING id, name, email, role, hourly_rate, created_at`,
            [rate, req.params.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/employees/:id — removes the employee and (via ON DELETE CASCADE) all their time entries.
router.delete('/:id', async (req, res, next) => {
    try {
        const result = await db.query('DELETE FROM employees WHERE id = $1', [req.params.id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        res.status(204).end();
    } catch (err) {
        next(err);
    }
});

module.exports = router;
