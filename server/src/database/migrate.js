const fs = require('fs');
const path = require('path');
const { pool, getMigrationPool, closeMigrationPool } = require('../config/db');

const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');

// Distinct advisory lock identifier from owner bootstrap (987654321)
const MIGRATION_ADVISORY_LOCK_ID = 987654322;

/**
 * Initializes the schema_migrations tracking table if not present.
 * @param {import('pg').PoolClient} client
 */
async function ensureMigrationsTable(client) {
  const sql = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await client.query(sql);
}

/**
 * Executes all pending SQL migration files transactionally in alphabetical order,
 * protected by a pinned-client session advisory lock to prevent race conditions.
 *
 * @param {import('pg').PoolClient | import('pg').Pool} [customTarget] - Optional client or pool
 * @param {Record<string, string|undefined>} [rawEnv=process.env] - Optional environment map
 * @returns {Promise<{ applied: string[], skipped: string[], locked?: boolean }>}
 */
async function runMigrations(customTarget = null, rawEnv = process.env) {
  let client;
  let shouldRelease = false;

  if (customTarget && typeof customTarget.connect === 'function' && typeof customTarget.query === 'function') {
    // If a Pool was passed, acquire a dedicated client from it
    client = await customTarget.connect();
    shouldRelease = true;
  } else if (customTarget && typeof customTarget.query === 'function') {
    // If a PoolClient was passed, pin it directly
    client = customTarget;
    shouldRelease = false;
  } else {
    // Acquire dedicated client from migration pool (configured via MIGRATION_DATABASE_URL or fallback)
    const targetPool = getMigrationPool(rawEnv);
    client = await targetPool.connect();
    shouldRelease = true;
  }

  let lockAcquired = false;

  try {
    // 1. Acquire session-level advisory lock on this pinned client before reading applied versions
    const lockRes = await client.query(
      'SELECT pg_try_advisory_lock($1) AS acquired',
      [MIGRATION_ADVISORY_LOCK_ID]
    );

    if (!lockRes.rows[0].acquired) {
      console.log('[MIGRATE] Another migration runner is currently active. Exiting cleanly.');
      return { applied: [], skipped: [], locked: true };
    }

    lockAcquired = true;

    // 2. Ensure schema_migrations table exists
    await ensureMigrationsTable(client);

    // 3. Fetch previously applied migration versions
    const { rows } = await client.query('SELECT version FROM schema_migrations ORDER BY version ASC');
    const appliedSet = new Set(rows.map((r) => r.version));

    // 4. Read all .sql files in migrations directory sorted alphabetically
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const applied = [];
    const skipped = [];

    for (const file of files) {
      if (appliedSet.has(file)) {
        skipped.push(file);
        console.log(`[MIGRATE] Already applied: ${file}`);
        continue;
      }

      console.log(`[MIGRATE] Applying migration: ${file}...`);
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sqlContent = fs.readFileSync(filePath, 'utf8');

      // Execute each migration within its own isolated transaction
      await client.query('BEGIN');
      try {
        await client.query(sqlContent);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
        console.log(`[MIGRATE] Successfully applied: ${file}`);
      } catch (migrationErr) {
        await client.query('ROLLBACK');
        console.error(`[MIGRATE ERROR] Migration failed in ${file}:`, migrationErr.message);
        throw migrationErr;
      }
    }

    return { applied, skipped, locked: false };
  } finally {
    // 5. Always release the advisory lock on this client
    if (lockAcquired) {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_ADVISORY_LOCK_ID]).catch(() => {});
    }
    if (shouldRelease) {
      client.release();
    }
  }
}

// Standalone CLI execution
if (require.main === module) {
  console.log('[MIGRATE] Starting database migrations...');
  runMigrations()
    .then(({ applied, skipped, locked }) => {
      if (locked) {
        console.log('[MIGRATE] Process exited because another migration runner was active.');
      } else {
        console.log(
          `[MIGRATE] Completed. Applied: ${applied.length}, Skipped (Already applied): ${skipped.length}`
        );
      }
      return Promise.all([closeMigrationPool(), pool.end().catch(() => {})]);
    })
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('[MIGRATE FATAL]', err.message);
      Promise.all([closeMigrationPool(), pool.end().catch(() => {})]).finally(() => process.exit(1));
    });
}

module.exports = {
  MIGRATION_ADVISORY_LOCK_ID,
  runMigrations,
  ensureMigrationsTable,
};
