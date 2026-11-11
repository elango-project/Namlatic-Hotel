/**
 * Dedicated Test Database Isolation Helper (Phase 5F-A2.1.1 & Phase 5F-A2.1.2)
 *
 * Guarantees that integration tests:
 * 1. Strictly require an explicit TEST_DATABASE_URL.
 * 2. Reject execution when NODE_ENV is 'production'.
 * 3. Enforce exact test database name (namlatic_hotel_test or TEST_DB_NAME).
 * 4. Reject protected database names ('namlatic_hotel', 'postgres', 'production', 'neondb') and non-test databases.
 * 5. Enforce explicit authorized host configuration (default: localhost, 127.0.0.1, ::1, or TEST_DB_ALLOWED_HOSTS).
 * 6. Require an explicit non-superuser test database role (default: namlatic_test or TEST_DB_USER).
 * 7. Strictly reject the normal application database user ('namlatic_app' or DB_USER).
 * 8. Strictly reject administrative/superuser accounts ('postgres', 'root', 'admin').
 * 9. Never touch the application development or production database.
 * 10. Log only sanitized database and host identity without exposing credentials.
 */

const { Pool } = require('pg');
const path = require('path');
const dotenv = require('dotenv');

// Load environment from server/.env if present
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DEFAULT_EXPECTED_DB = 'namlatic_hotel_test';
const DEFAULT_EXPECTED_ROLE = 'namlatic_test';
const PROTECTED_DATABASES = new Set(['namlatic_hotel', 'postgres', 'production', 'neondb']);
const FORBIDDEN_ADMIN_ROLES = new Set(['postgres', 'root', 'admin', 'administrator', 'superuser']);
const DEFAULT_LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];

/**
 * Returns the set of authorized database hosts for integration tests.
 * Defaults strictly to local loopback hosts (localhost, 127.0.0.1, ::1).
 * Custom hosts for isolated CI pipelines can be explicitly added via TEST_DB_ALLOWED_HOSTS.
 *
 * @returns {Set<string>}
 */
function getAuthorizedHosts() {
  const customHosts = process.env.TEST_DB_ALLOWED_HOSTS
    ? process.env.TEST_DB_ALLOWED_HOSTS.split(',')
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean)
    : [];
  return new Set([...DEFAULT_LOOPBACK_HOSTS, ...customHosts]);
}

/**
 * Validates and sanitizes TEST_DATABASE_URL against accidental execution
 * on development or production databases, unauthorized hosts, or privileged roles.
 *
 * @returns {{ connectionString: string, dbName: string, dbHost: string, dbUser: string }}
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
        'Tests must execute against an isolated disposable database (e.g. postgresql://namlatic_test:pass@localhost:5432/namlatic_hotel_test) ' +
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

  // 1. Host authorization validation
  const hostname = (parsed.hostname || '').toLowerCase();
  if (!hostname) {
    throw new Error('TEST_DATABASE_URL must specify a target host (e.g. localhost).');
  }

  const authorizedHosts = getAuthorizedHosts();
  if (!authorizedHosts.has(hostname)) {
    throw new Error(
      `Safety check failed: Host "${parsed.hostname}" is not an authorized test database host. ` +
        `Allowed hosts: [${Array.from(authorizedHosts).join(', ')}]. ` +
        'Do not run integration tests against unauthorized or remote hosts without explicit configuration in TEST_DB_ALLOWED_HOSTS.'
    );
  }

  // 2. Database user / role validation
  const rawUsername = parsed.username ? decodeURIComponent(parsed.username).trim() : '';
  if (!rawUsername) {
    throw new Error(
      'TEST_DATABASE_URL must specify a dedicated test database user (e.g. "namlatic_test").'
    );
  }

  // Rejection of application database user
  const appDbUser = (process.env.DB_USER || 'namlatic_app').trim().toLowerCase();
  const lowerUser = rawUsername.toLowerCase();
  if (lowerUser === 'namlatic_app' || lowerUser === appDbUser) {
    throw new Error(
      `Safety check failed: TEST_DATABASE_URL uses application database user "${rawUsername}". ` +
        'Integration tests must not run as the application database user. Use a dedicated non-superuser test role (e.g. "namlatic_test").'
    );
  }

  // Rejection of administrative / superuser accounts
  if (FORBIDDEN_ADMIN_ROLES.has(lowerUser)) {
    throw new Error(
      `Safety check failed: TEST_DATABASE_URL uses administrative/superuser role "${rawUsername}". ` +
        'Integration tests must run under a dedicated, non-superuser role with least privileges.'
    );
  }

  // Verification of designated test role
  const expectedRole = (process.env.TEST_DB_USER || DEFAULT_EXPECTED_ROLE).trim();
  if (rawUsername !== expectedRole) {
    throw new Error(
      `Safety check failed: Database role "${rawUsername}" in TEST_DATABASE_URL does not match designated test role "${expectedRole}".`
    );
  }

  // 3. Database name validation
  const dbName = parsed.pathname.replace(/^\//, '').trim();
  if (!dbName) {
    throw new Error('TEST_DATABASE_URL must specify a target database name in its path.');
  }

  const lowerDb = dbName.toLowerCase();
  if (PROTECTED_DATABASES.has(lowerDb)) {
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

  const expectedDbName = (process.env.TEST_DB_NAME || DEFAULT_EXPECTED_DB).trim();
  if (dbName !== expectedDbName) {
    throw new Error(
      `Safety check failed: Test database name "${dbName}" does not match exact expected test database name "${expectedDbName}".`
    );
  }

  return {
    connectionString: rawUrl.trim(),
    dbName,
    dbHost: parsed.hostname,
    dbUser: rawUsername,
  };
}

let testPoolInstance = null;

/**
 * Returns a dedicated Pool instance for the test database.
 * @returns {import('pg').Pool}
 */
function getTestPool() {
  if (!testPoolInstance) {
    const { connectionString, dbName, dbHost, dbUser } = validateTestDatabaseConfig();
    testPoolInstance = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
    });

    testPoolInstance.on('error', (err) => {
      console.error('[TEST DB ERROR]', err.message);
    });

    // Output sanitized database and role identity (never passwords or connection string)
    console.log(`[TEST DB] Verified connection to dedicated test database: "${dbName}" on "${dbHost}" as test role "${dbUser}"`);
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

/**
 * Verifies at runtime that the connected PostgreSQL role has least privileges:
 * - rolsuper = false
 * - rolcreatedb = false
 * - rolcreaterole = false
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<{ rolname: string, rolsuper: boolean, rolcreatedb: boolean, rolcreaterole: boolean }>}
 */
async function verifyTestRolePrivileges(pool) {
  const result = await pool.query(
    'SELECT rolname, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user'
  );

  if (!result || result.rows.length === 0) {
    throw new Error('Safety check failed: Unable to inspect current database role in pg_roles.');
  }

  const role = result.rows[0];
  if (role.rolsuper) {
    throw new Error(
      `Safety check failed: Connected test role "${role.rolname}" is a PostgreSQL superuser (rolsuper = true). Integration tests must run under a non-superuser role.`
    );
  }

  if (role.rolcreatedb) {
    throw new Error(
      `Safety check failed: Connected test role "${role.rolname}" has CREATEDB privilege (rolcreatedb = true). Integration tests must run with least privilege.`
    );
  }

  if (role.rolcreaterole) {
    throw new Error(
      `Safety check failed: Connected test role "${role.rolname}" has CREATEROLE privilege (rolcreaterole = true). Integration tests must run with least privilege.`
    );
  }

  return role;
}

module.exports = {
  validateTestDatabaseConfig,
  verifyTestRolePrivileges,
  getTestPool,
  closeTestPool,
  getAuthorizedHosts,
};
