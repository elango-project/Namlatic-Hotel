const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool(env.dbPoolConfig);

// Log connection events in development
pool.on('connect', () => {
  if (env.nodeEnv === 'development') {
    console.log('[DB] New client connected to PostgreSQL');
  }
});

// Prevent idle client errors from crashing the Node.js process (vital for serverless DB compute sleep)
pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err.message);
});

/**
 * Execute a parameterized SQL query.
 * @param {string} text   - SQL statement with $1, $2… placeholders
 * @param {any[]}  params - Bind values
 * @returns {Promise<import('pg').QueryResult>}
 */
const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
