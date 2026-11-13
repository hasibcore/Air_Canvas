const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.dbSslMode === 'require' ? { rejectUnauthorized: true } : false,
  max: config.dbPoolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: config.dbStatementTimeoutMs,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL idle client error:', err.message);
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function closePool() {
  await pool.end();
}

module.exports = { pool, query, closePool };
