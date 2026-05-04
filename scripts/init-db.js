// One-shot script: applies schema.sql to the configured DATABASE_URL.
// Safe to run multiple times — every statement in schema.sql is idempotent.
const fs = require('fs');
const path = require('path');
const db = require('../db');

(async () => {
    try {
        const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
        await db.query(sql);
        console.log('Database initialized successfully.');
    } catch (err) {
        console.error('Failed to initialize database:', err.message);
        process.exitCode = 1;
    } finally {
        // Without this, the pool keeps the process alive forever.
        await db.pool.end();
    }
})();
