const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');

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
 * Executes all pending SQL migration files transactionally in alphabetical order.
 *
 * @param {import('pg').PoolClient} [customClient] - Optional client (e.g. for testing)
 * @returns {Promise<{ applied: string[], skipped: string[] }>}
 */
async function runMigrations(customClient = null) {
  const client = customClient || (await pool.connect());
  const shouldRelease = !customClient;

  const applied = [];
  const skipped = [];

  try {
    await ensureMigrationsTable(client);

    // Fetch previously applied migration versions
    const { rows } = await client.query('SELECT version FROM schema_migrations ORDER BY version ASC');
    const appliedSet = new Set(rows.map((r) => r.version));

    // Read all .sql files in migrations directory sorted alphabetically
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

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

    return { applied, skipped };
  } finally {
    if (shouldRelease) {
      client.release();
    }
  }
}

// Standalone CLI execution
if (require.main === module) {
  console.log('[MIGRATE] Starting database migrations...');
  runMigrations()
    .then(({ applied, skipped }) => {
      console.log(
        `[MIGRATE] Completed. Applied: ${applied.length}, Skipped (Already applied): ${skipped.length}`
      );
      return pool.end();
    })
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('[MIGRATE FATAL]', err.message);
      pool.end().finally(() => process.exit(1));
    });
}

module.exports = {
  runMigrations,
  ensureMigrationsTable,
};
