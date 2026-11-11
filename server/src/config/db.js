const { Pool } = require('pg');
const env = require('./env');

const defaultPool = new Pool(env.dbPoolConfig);

let activePool = defaultPool;
let migrationPoolInstance = null;

// Log connection events in development
defaultPool.on('connect', () => {
  if (env.nodeEnv === 'development') {
    console.log('[DB] New client connected to PostgreSQL');
  }
});

// Prevent idle client errors from crashing the Node.js process (vital for serverless DB compute sleep)
defaultPool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err.message);
});

/**
 * Execute a parameterized SQL query on the active pool.
 * @param {string} text   - SQL statement with $1, $2… placeholders
 * @param {any[]}  params - Bind values
 * @returns {Promise<import('pg').QueryResult>}
 */
const query = (text, params) => activePool.query(text, params);

/**
 * Delegating pool proxy: always forwards pool methods (connect, query, end, on)
 * to the currently active pool, supporting runtime redirection to the dedicated test pool.
 */
const pool = new Proxy(defaultPool, {
  get(_target, prop) {
    const val = activePool[prop];
    return typeof val === 'function' ? val.bind(activePool) : val;
  },
  set(_target, prop, value) {
    activePool[prop] = value;
    return true;
  },
});

/**
 * Sets the active pool instance (used by integration test harnesses).
 * @param {import('pg').Pool} customPool
 */
function setPool(customPool) {
  activePool = customPool;
}

/**
 * Resets the active pool instance to the default configured pool.
 */
function resetPool() {
  activePool = defaultPool;
}

/**
 * Returns a dedicated pool for schema migrations if MIGRATION_DATABASE_URL was configured,
 * or falls back to the active application pool.
 * @returns {import('pg').Pool}
 */
function getMigrationPool() {
  if (migrationPoolInstance) {
    return migrationPoolInstance;
  }
  if (env.migrationPoolConfig) {
    migrationPoolInstance = new Pool(env.migrationPoolConfig);
    migrationPoolInstance.on('error', (err) => {
      console.error('[DB MIGRATE] Unexpected error on idle migration client:', err.message);
    });
    return migrationPoolInstance;
  }
  return activePool;
}

/**
 * Closes the dedicated migration pool if one was instantiated.
 */
async function closeMigrationPool() {
  if (migrationPoolInstance) {
    await migrationPoolInstance.end().catch(() => {});
    migrationPoolInstance = null;
  }
}

module.exports = { pool, query, setPool, resetPool, getMigrationPool, closeMigrationPool };
