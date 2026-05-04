// Express entry point: serves the static frontend from /public and mounts the JSON API.
const path = require('path');
const express = require('express');
require('dotenv').config(); // loads PORT and DATABASE_URL from .env into process.env

const employeesRouter = require('./routes/employees');
const timeEntriesRouter = require('./routes/timeEntries');
const payrollRouter = require('./routes/payroll');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware: parse JSON request bodies, serve the HTML/CSS/JS frontend.
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API routes — each router lives in routes/ and owns its URL prefix.
app.use('/api/employees', employeesRouter);
app.use('/api/time-entries', timeEntriesRouter);
app.use('/api/payroll', payrollRouter);

// Liveness check — useful for sanity tests without touching the DB.
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Catch-all error handler: any thrown / next(err) from a route lands here.
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`Employee time tracker running on http://localhost:${PORT}`);
});
