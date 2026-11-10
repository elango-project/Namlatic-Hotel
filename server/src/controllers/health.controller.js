const { pool } = require('../config/db');
const env = require('../config/env');

/**
 * Sanitize database error messages to prevent exposing internal credentials,
 * connection strings, or sensitive architecture details.
 *
 * @param {Error & { code?: string }} err
 * @returns {string} Safe, human-readable error description
 */
const sanitizeDbError = (err) => {
  if (!err) return 'Database connection unavailable';

  switch (err.code) {
    case 'ECONNREFUSED':
      return 'Database connection refused (PostgreSQL server is not reachable on configured port)';
    case 'ETIMEDOUT':
      return 'Database connection timed out';
    case 'ENOTFOUND':
      return 'Database host not found';
    case '28P01':
      return 'Database authentication failed (invalid credentials)';
    case '3D000':
      return 'Configured database does not exist';
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'CERT_HAS_EXPIRED':
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      return 'Database TLS/SSL certificate verification failed';
    default:
      return err.code
        ? `Database error (${err.code})`
        : 'Database connection unavailable';
  }
};

/**
 * GET /api/health
 * Liveness probe: verifies that the Express application process is alive and responsive.
 * Fast, non-blocking, zero external dependencies. Always returns HTTP 200 when alive.
 */
const getHealth = (_req, res) => {
  res.status(200).json({
    status: 'ok',
    environment: env.nodeEnv,
    uptime: `${Math.floor(process.uptime())}s`,
    timestamp: new Date().toISOString(),
  });
};

/**
 * GET /api/ready
 * Readiness probe: checks actual PostgreSQL database connectivity.
 * - Returns HTTP 200 if the database is reachable.
 * - Returns HTTP 503 (Service Unavailable) if the database cannot be queried.
 */
const getReadiness = async (_req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS server_time');

    return res.status(200).json({
      status: 'ready',
      database: {
        connected: true,
        serverTime: result.rows[0].server_time,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const safeError = sanitizeDbError(err);

    return res.status(503).json({
      status: 'unhealthy',
      database: {
        connected: false,
        error: safeError,
      },
      timestamp: new Date().toISOString(),
    });
  }
};

module.exports = {
  getHealth,
  getReadiness,
  sanitizeDbError,
};
