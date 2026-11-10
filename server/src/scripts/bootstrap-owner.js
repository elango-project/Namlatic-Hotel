/**
 * One-Time Owner Account Bootstrap CLI
 *
 * Provisoning workflow:
 * 1. Read credentials via environment variables (OWNER_EMAIL, OWNER_PASSWORD)
 *    or prompt interactively if running in a TTY terminal.
 * 2. Validate email and password without trimming or mutating password.
 * 3. Precompute Argon2id hash BEFORE opening database connection or transaction.
 * 4. Acquire single client from connection pool.
 * 5. BEGIN transaction.
 * 6. Acquire transaction-scoped advisory lock: pg_try_advisory_xact_lock(987654321).
 * 7. If lock held by another process: exit cleanly with status 'locked'.
 * 8. Query existing owner: SELECT id FROM users WHERE role = 'owner' LIMIT 1 FOR UPDATE.
 * 9. If owner exists: exit cleanly with status 'exists' (never overwrite).
 * 10. Insert owner with precomputed hash, COMMIT, release client.
 */

const readline = require('readline');
const { pool } = require('../config/db');
const { validateEmail, validatePassword } = require('../validators/auth.validator');
const { hashPassword } = require('../services/password.service');

const BOOTSTRAP_ADVISORY_LOCK_ID = 987654321;

/**
 * Prompts user for a masked input line in interactive TTY terminals.
 *
 * @param {string} promptText
 * @returns {Promise<string>}
 */
function promptMasked(promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    process.stdout.write(promptText);

    let input = '';
    const onData = (char) => {
      char = char.toString('utf8');
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004':
          process.stdin.removeListener('data', onData);
          break;
        default:
          process.stdout.write('*');
          input += char;
          break;
      }
    };

    process.stdin.on('data', onData);

    rl.question('', () => {
      rl.close();
      console.log(''); // newline after enter
      resolve(input);
    });
  });
}

/**
 * Prompts user for plain text in interactive TTY terminals.
 *
 * @param {string} promptText
 * @returns {Promise<string>}
 */
function promptText(promptText) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(promptText, (ans) => {
      rl.close();
      resolve(ans);
    });
  });
}

/**
 * Core bootstrap logic.
 *
 * @param {object} [opts]
 * @param {string} [opts.email]
 * @param {string} [opts.password]
 * @param {import('pg').PoolClient} [opts.customClient]
 * @returns {Promise<{ status: string, created: boolean, user?: object, message?: string }>}
 */
async function bootstrapOwner(opts = {}) {
  let rawEmail = opts.email || process.env.OWNER_EMAIL;
  let rawPassword = opts.password || process.env.OWNER_PASSWORD;

  // If in interactive terminal and credentials not in env, prompt interactively
  if (!rawEmail && process.stdin.isTTY) {
    rawEmail = await promptText('Enter owner email: ');
  }

  if (!rawPassword && process.stdin.isTTY) {
    rawPassword = await promptMasked('Enter owner password (min 12 Unicode chars): ');
  }

  if (!rawEmail) {
    throw new Error('OWNER_EMAIL environment variable or interactive input is required.');
  }

  if (!rawPassword) {
    throw new Error('OWNER_PASSWORD environment variable or interactive input is required.');
  }

  // 1. Validate inputs before touching database
  const normalizedEmail = validateEmail(rawEmail);
  validatePassword(rawPassword);

  // 2. Precompute Argon2id hash BEFORE acquiring connection or transaction
  console.log('[BOOTSTRAP] Precomputing Argon2id hash for owner password...');
  const passwordHash = await hashPassword(rawPassword);

  // 3. Acquire database client
  const client = opts.customClient || (await pool.connect());
  const shouldRelease = !opts.customClient;

  try {
    // 4. Begin transaction
    await client.query('BEGIN');

    // 5. Acquire transaction-scoped advisory lock (automatically released on COMMIT/ROLLBACK)
    const lockRes = await client.query(
      'SELECT pg_try_advisory_xact_lock($1) AS acquired',
      [BOOTSTRAP_ADVISORY_LOCK_ID]
    );

    if (!lockRes.rows[0].acquired) {
      console.log('[BOOTSTRAP] Advisory lock held by another process. Exiting cleanly.');
      await client.query('ROLLBACK');
      return { status: 'locked', created: false, message: 'Bootstrap lock held by another process' };
    }

    // 6. Check for existing owner
    const existing = await client.query(
      "SELECT id, email FROM users WHERE role = 'owner' LIMIT 1 FOR UPDATE"
    );

    if (existing.rows.length > 0) {
      console.log(`[BOOTSTRAP] Owner account already exists (${existing.rows[0].email}). Bootstrap skipping.`);
      await client.query('COMMIT');
      return {
        status: 'exists',
        created: false,
        email: existing.rows[0].email,
        message: 'Owner account already exists',
      };
    }

    // 7. Insert single owner account
    const insertRes = await client.query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'owner', 'active')
       RETURNING id, email, role, status, created_at;`,
      [normalizedEmail, passwordHash]
    );

    // 8. Commit transaction
    await client.query('COMMIT');
    const createdUser = insertRes.rows[0];
    console.log(`[BOOTSTRAP] Successfully created owner account: ${createdUser.email} (ID: ${createdUser.id})`);

    return {
      status: 'created',
      created: true,
      user: createdUser,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    if (shouldRelease) {
      client.release();
    }
  }
}

// Standalone CLI execution
if (require.main === module) {
  bootstrapOwner()
    .then((result) => {
      console.log(`[BOOTSTRAP RESULT] Status: ${result.status}, Created: ${result.created}`);
      return pool.end();
    })
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('[BOOTSTRAP ERROR]', err.message);
      pool.end().finally(() => process.exit(1));
    });
}

module.exports = {
  BOOTSTRAP_ADVISORY_LOCK_ID,
  bootstrapOwner,
};
