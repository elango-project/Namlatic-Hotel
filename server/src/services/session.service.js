/**
 * PostgreSQL-Backed Session Management Service
 *
 * Security Architecture:
 * - Session tokens: 256 bits (32 bytes) of cryptographically secure randomness.
 * - Persistence: ONLY the SHA-256 verifier hash is persisted (sessions.token_hash).
 *   Raw tokens are NEVER stored in the database.
 * - Lifetimes:
 *   * 7-day hard absolute lifetime (expires_at).
 *   * 2-hour sliding idle timeout (idle_expires_at).
 *   * 5-minute sliding refresh throttle to minimize database write load.
 *   * Sliding extension is capped by absolute expiration (Math.min).
 */

const crypto = require('crypto');
const { pool } = require('../config/db');
const { sanitizeIp, truncateUserAgent, COOKIE_NAME } = require('../utils/cookieHelper');

const ABSOLUTE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
const REFRESH_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Computes a SHA-256 hex digest of a raw session token.
 *
 * @param {string} rawToken
 * @returns {string} 64-character lowercase hex string
 */
function hashSessionToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Generates a new cryptographically random 256-bit session token.
 *
 * @returns {string} 64-character hex string (32 bytes)
 */
function generateRawToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Creates a new active session record in PostgreSQL for the given user.
 *
 * @param {{ userId: number, ipAddress?: string|null, userAgent?: string|null }} params
 * @param {import('pg').Pool} [dbPool]
 * @returns {Promise<{ rawToken: string, session: object }>}
 */
async function createSession({ userId, ipAddress, userAgent }, dbPool = pool) {
  const numericUserId = parseInt(userId, 10);
  if (!numericUserId || isNaN(numericUserId)) {
    throw new Error('Valid user ID is required to create a session.');
  }

  const rawToken = generateRawToken();
  const tokenHash = hashSessionToken(rawToken);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ABSOLUTE_LIFETIME_MS);
  const idleExpiresAt = new Date(now.getTime() + IDLE_TIMEOUT_MS);

  const safeIp = sanitizeIp(ipAddress);
  const safeUa = truncateUserAgent(userAgent);

  const query = `
    INSERT INTO sessions (
      user_id,
      token_hash,
      ip_address,
      user_agent,
      created_at,
      last_active_at,
      expires_at,
      idle_expires_at
    )
    VALUES ($1, $2, $3, $4, $5, $5, $6, $7)
    RETURNING id, user_id, created_at, expires_at, idle_expires_at
  `;

  const result = await dbPool.query(query, [
    userId,
    tokenHash,
    safeIp,
    safeUa,
    now,
    expiresAt,
    idleExpiresAt,
  ]);

  return {
    rawToken,
    session: result.rows[0],
  };
}

/**
 * Validates a candidate raw session token against PostgreSQL.
 * Verifies active user status, absolute expiration, idle expiration, and revocation.
 * Performs throttled sliding idle refresh (every 5 minutes).
 *
 * @param {string} rawToken - Candidate token received from cookie
 * @param {{ ipAddress?: string|null, userAgent?: string|null }} [metadata]
 * @param {import('pg').Pool} [dbPool]
 * @returns {Promise<{ sessionId: number, user: { id: number, email: string, role: string } } | null>}
 */
async function validateSession(rawToken, metadata = {}, dbPool = pool) {
  if (!rawToken || typeof rawToken !== 'string') {
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();

  const query = `
    SELECT
      s.id,
      s.user_id,
      s.created_at,
      s.last_active_at,
      s.expires_at,
      s.idle_expires_at,
      s.revoked_at,
      u.id AS user_actual_id,
      u.email,
      u.role,
      u.status
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token_hash = $1
  `;

  const result = await dbPool.query(query, [tokenHash]);
  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  // 1. Check revocation
  if (row.revoked_at !== null) {
    return null;
  }

  // 2. Check user account active status (status must be 'active')
  if (row.status !== 'active') {
    return null;
  }

  const expiresAt = new Date(row.expires_at);
  const idleExpiresAt = new Date(row.idle_expires_at);
  const lastActiveAt = new Date(row.last_active_at);

  // 3. Check absolute hard lifetime
  if (now.getTime() >= expiresAt.getTime()) {
    return null;
  }

  // 4. Check sliding idle timeout
  if (now.getTime() >= idleExpiresAt.getTime()) {
    return null;
  }

  // 5. Throttled sliding idle extension (at most once every 5 minutes)
  const msSinceLastActive = now.getTime() - lastActiveAt.getTime();
  if (msSinceLastActive >= REFRESH_THROTTLE_MS) {
    // Sliding idle extension is capped by hard absolute expiration
    const prospectiveIdle = now.getTime() + IDLE_TIMEOUT_MS;
    const newIdleExpiresAt = new Date(Math.min(prospectiveIdle, expiresAt.getTime()));

    const safeIp = sanitizeIp(metadata.ipAddress);
    const safeUa = truncateUserAgent(metadata.userAgent);

    const updateQuery = `
      UPDATE sessions
      SET last_active_at = $1,
          idle_expires_at = $2,
          ip_address = COALESCE($3, ip_address),
          user_agent = COALESCE($4, user_agent)
      WHERE id = $5
    `;

    // Fire update asynchronously or synchronously
    await dbPool.query(updateQuery, [now, newIdleExpiresAt, safeIp, safeUa, row.id]);
  }

  return {
    sessionId: row.id,
    user: {
      id: row.user_actual_id,
      email: row.email,
      role: row.role,
    },
  };
}

/**
 * Revokes a session given its raw token.
 * Operation is idempotent: revoking an already revoked or non-existent session
 * succeeds without throwing.
 *
 * @param {string} rawToken
 * @param {import('pg').Pool} [dbPool]
 * @returns {Promise<boolean>} True if an active session was revoked, false otherwise
 */
async function revokeSession(rawToken, dbPool = pool) {
  if (!rawToken || typeof rawToken !== 'string') {
    return false;
  }

  const tokenHash = hashSessionToken(rawToken);

  const query = `
    UPDATE sessions
    SET revoked_at = statement_timestamp()
    WHERE token_hash = $1 AND revoked_at IS NULL
    RETURNING id
  `;

  const result = await dbPool.query(query, [tokenHash]);
  return result.rows.length > 0;
}

/**
 * Revokes all active sessions for a specific user (e.g. on password change or admin action).
 *
 * @param {number} userId
 * @param {import('pg').Pool} [dbPool]
 * @returns {Promise<number>} Number of sessions revoked
 */
async function revokeAllUserSessions(userId, dbPool = pool) {
  const numericUserId = parseInt(userId, 10);
  if (!numericUserId || isNaN(numericUserId)) {
    return 0;
  }

  const query = `
    UPDATE sessions
    SET revoked_at = statement_timestamp()
    WHERE user_id = $1 AND revoked_at IS NULL
    RETURNING id
  `;

  const result = await dbPool.query(query, [userId]);
  return result.rowCount;
}

module.exports = {
  ABSOLUTE_LIFETIME_MS,
  IDLE_TIMEOUT_MS,
  REFRESH_THROTTLE_MS,
  hashSessionToken,
  generateRawToken,
  createSession,
  validateSession,
  revokeSession,
  revokeAllUserSessions,
};
