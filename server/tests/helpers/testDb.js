/**
 * Dedicated Test Database Isolation Helper
 *
 * Guarantees that integration tests:
 * 1. Strictly require an explicit TEST_DATABASE_URL.
 * 2. Reject execution when NODE_ENV is 'production'.
 * 3. Enforce that the database name is a disposable test database (must contain 'test' and cannot be 'namlatic_hotel' or 'postgres').
 * 4. Never touch the application development or production database.
 * 5. Log only the sanitized database name (never credentials or full connection strings).
 */

const { Pool } = require('pg');
const path = require('path');
const dotenv = require('dotenv');

// Load environment from server/.env if present
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Validates and sanitizes TEST_DATABASE_URL against accidental execution
 * on development or production databases.
 *
 * @returns {{ connectionString: string, dbName: string }}
 */
function validateTestDatabaseConfig() {
  const nodeEnv = process.env.NODE_ENV || 'test';
  if (nodeEnv === 'production') {
    throw new Error('Safety check failed: Integration tests must not run when NODE_ENV is set to "production".');
  }

  const rawUrl = process.env.TEST_DATABASE_URL;
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    throw new Error(
      'TEST_DATABASE_URL environment variable is required to run integration tests. ' +
        'Tests must execute against an isolated disposable database (e.g. postgresql://user:pass@localhost:5432/namlatic_hotel_test) ' +
        'and never against development or production databases.'
    );
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch (_e) {
    throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL connection URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('TEST_DATABASE_URL must use postgres: or postgresql: protocol.');
  }

  const dbName = parsed.pathname.replace(/^\//, '').trim();
  if (!dbName) {
    throw new Error('TEST_DATABASE_URL must specify a target database name in its path.');
  }

  // Safety checks against primary/production databases
  const lowerDb = dbName.toLowerCase();
  if (lowerDb === 'namlatic_hotel' || lowerDb === 'postgres' || lowerDb === 'production' || lowerDb === 'neondb') {
    throw new Error(
      `Safety check failed: TEST_DATABASE_URL points to protected database "${dbName}". ` +
        'Integration tests must run against a designated disposable test database (e.g. "namlatic_hotel_test").'
    );
  }

  if (!lowerDb.includes('test')) {
    throw new Error(
      `Safety check failed: Test database name "${dbName}" must contain "test" to guarantee it is disposable.`
    );
  }

  return {
    connectionString: rawUrl.trim(),
    dbName,
  };
}

let testPoolInstance = null;

/**
 * Returns a dedicated Pool instance for the test database.
 * @returns {import('pg').Pool}
 */
function getTestPool() {
  if (!testPoolInstance) {
    const { connectionString, dbName } = validateTestDatabaseConfig();
    testPoolInstance = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
    });

    testPoolInstance.on('error', (err) => {
      console.error('[TEST DB ERROR]', err.message);
    });

    // Output sanitized database identity (database name only)
    console.log(`[TEST DB] Verified connection to dedicated test database: "${dbName}"`);
  }
  return testPoolInstance;
}

/**
 * Closes the dedicated test Pool instance.
 */
async function closeTestPool() {
  if (testPoolInstance) {
    await testPoolInstance.end();
    testPoolInstance = null;
  }
}

module.exports = {
  validateTestDatabaseConfig,
  getTestPool,
  closeTestPool,
};
