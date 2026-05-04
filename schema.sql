-- Schema for the time-tracker. Idempotent so `npm run init-db` can be re-run safely.

-- Employees: one row per person who can clock in. Email is unique so the UI can use it as a stable identifier.
-- hourly_rate is stored on the employee for simplicity (a real payroll system would version rates over time).
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT,
    hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Upgrade path for databases created before hourly_rate existed. Safe no-op if the column is already there.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Time entries: each clock-in creates a row, clock-out fills in clock_out.
-- ON DELETE CASCADE means deleting an employee also wipes their time entries.
CREATE TABLE IF NOT EXISTS time_entries (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    clock_in TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    clock_out TIMESTAMPTZ,
    note TEXT
);

-- Plain index for "all entries for this employee" lookups.
CREATE INDEX IF NOT EXISTS idx_time_entries_employee_id ON time_entries(employee_id);

-- Partial index makes "is this employee currently clocked in?" queries near-instant
-- by indexing only the (usually tiny) set of open entries.
CREATE INDEX IF NOT EXISTS idx_time_entries_open ON time_entries(employee_id) WHERE clock_out IS NULL;
