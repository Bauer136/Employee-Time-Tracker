// Single shared PostgreSQL connection pool used by every route.
// Pools reuse TCP connections instead of opening one per query — much faster under load.
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Crashes in idle pool clients shouldn't take down the whole server — log and move on.
pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
});

module.exports = {
    // db.query(text, params) — always use parameterized queries ($1, $2, ...) to avoid SQL injection.
    query: (text, params) => pool.query(text, params),
    pool,
};
