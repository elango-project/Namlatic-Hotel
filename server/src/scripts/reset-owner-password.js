/**
 * Administrative Owner Password Recovery CLI
 *
 * Password Recovery workflow:
 * 1. CLI only — no public HTTP endpoint.
 * 2. Reads new password via NEW_OWNER_PASSWORD environment variable or genuine masked interactive prompt.
 * 3. Validates password length and UTF-8 byte bounds without trimming or mutating.
 * 4. Precomputes Argon2id hash BEFORE opening database transaction.
 * 5. Requires an existing owner account (errors out if none exists).
 * 6. Updates owner password_hash and revokes all active sessions in an atomic transaction.
 * 7. Never echoes password or hash to logs.
 */

const { pool } = require('../config/db');
const { validatePassword } = require('../validators/auth.validator');
const { hashPassword } = require('../services/password.service');
const { promptMasked } = require('../utils/terminalPrompt');
const { BOOTSTRAP_ADVISORY_LOCK_ID } = require('./bootstrap-owner');

/**
 * Core password reset logic.
 *
 * @param {object} [opts]
 * @param {string} [opts.newPassword]
 * @param {import('pg').PoolClient} [opts.customClient]
 * @param {import('pg').Pool} [opts.pool]
 * @param {object} [extraOpts]
 * @returns {Promise<{ status: string, reset: boolean, email?: string, revokedCount?: number }>}
 */
async function resetOwnerPassword(opts = {}, extraOpts = {}) {
  const mergedOpts = typeof opts === 'object' && opts !== null ? { ...opts, ...extraOpts } : { ...extraOpts };
  let rawPassword = mergedOpts.newPassword || process.env.NEW_OWNER_PASSWORD;

  if (!rawPassword && process.stdin.isTTY) {
    rawPassword = await promptMasked('Enter new owner password (min 12 Unicode chars): ');
  }

  if (!rawPassword) {
    throw new Error('NEW_OWNER_PASSWORD environment variable or interactive input is required.');
  }

  // 1. Validate password without trimming or mutating
  validatePassword(rawPassword);

  // 2. Precompute Argon2id hash BEFORE acquiring database connection
  console.log('[RESET] Precomputing Argon2id hash for new password...');
  const newHash = await hashPassword(rawPassword);

  // 3. Acquire database client
  const activePool = mergedOpts.pool || pool;
  const client = mergedOpts.customClient || (await activePool.connect());
  const shouldRelease = !mergedOpts.customClient;

  try {
    // 4. Begin transaction
    await client.query('BEGIN');

    // 5. Acquire advisory lock to prevent concurrent reset/bootstrap race conditions
    const lockRes = await client.query(
      'SELECT pg_try_advisory_xact_lock($1) AS acquired',
      [BOOTSTRAP_ADVISORY_LOCK_ID]
    );

    if (!lockRes.rows[0].acquired) {
      console.error('[RESET] Another administration process is currently running. Exiting.');
      await client.query('ROLLBACK');
      return { status: 'locked', reset: false };
    }

    // 6. Find existing owner
    const ownerRes = await client.query(
      "SELECT id, email FROM users WHERE role = 'owner' LIMIT 1 FOR UPDATE"
    );

    if (ownerRes.rows.length === 0) {
      console.error('[RESET] No owner account found. Please run bootstrap-owner.js first.');
      await client.query('ROLLBACK');
      return { status: 'not_found', reset: false };
    }

    const owner = ownerRes.rows[0];

    // 7. Update password hash
    await client.query(
      'UPDATE users SET password_hash = $1, updated_at = statement_timestamp() WHERE id = $2',
      [newHash, owner.id]
    );

    // 8. Revoke all active sessions for that owner
    const revokeRes = await client.query(
      'UPDATE sessions SET revoked_at = statement_timestamp() WHERE user_id = $1 AND revoked_at IS NULL RETURNING id',
      [owner.id]
    );

    // 9. Commit transaction
    await client.query('COMMIT');
    console.log(
      `[RESET] Successfully reset password for owner (${owner.email}). Revoked ${revokeRes.rowCount} active session(s).`
    );

    return {
      status: 'success',
      reset: true,
      email: owner.email,
      revokedCount: revokeRes.rowCount,
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
  resetOwnerPassword()
    .then((result) => {
      console.log(`[RESET RESULT] Status: ${result.status}, Reset: ${result.reset}`);
      return pool.end();
    })
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('[RESET ERROR]', err.message);
      pool.end().finally(() => process.exit(1));
    });
}

module.exports = {
  resetOwnerPassword,
};
