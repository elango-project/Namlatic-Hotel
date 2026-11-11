/**
 * Internal Reverse Proxy Authentication Middleware
 *
 * Verifies the shared secret header ('x-vercel-proxy-secret') injected by Vercel edge routes.
 *
 * Security Requirements:
 * - Constant-time comparison using crypto.timingSafeEqual on SHA-256 digests to protect against timing attacks.
 * - Supports dual-secret rotation (BACKEND_PROXY_SECRET and BACKEND_PROXY_SECRET_OLD).
 * - Fails closed in production (NODE_ENV === 'production').
 * - Narrow exception: Health and readiness probes (/api/health, /api/ready) bypass proxy secret checks
 *   to allow hosting platform orchestrator monitoring without credentials.
 */

const crypto = require('crypto');
const env = require('../config/env');

const EXEMPT_PATHS = new Set(['/health', '/ready', '/api/health', '/api/ready']);

/**
 * Constant-time comparison of two string secrets using SHA-256 pre-hashing.
 * Pre-hashing to fixed-length 32-byte buffers ensures timingSafeEqual never throws
 * due to length differences and prevents timing leaks.
 *
 * @param {any} secretA
 * @param {any} secretB
 * @returns {boolean}
 */
function timingSafeSecretCompare(secretA, secretB) {
  if (typeof secretA !== 'string' || typeof secretB !== 'string') {
    return false;
  }

  const hashA = crypto.createHash('sha256').update(secretA).digest();
  const hashB = crypto.createHash('sha256').update(secretB).digest();

  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Express middleware to verify incoming reverse-proxy secrets.
 */
function verifyProxySecret(req, res, next) {
  // 1. Check narrow health probe exemption: strictly GET or HEAD on /health or /ready
  const isProbeMethod = req.method === 'GET' || req.method === 'HEAD';
  const cleanPath = (req.path || '').split('?')[0];
  const cleanOriginalUrl = (req.originalUrl || '').split('?')[0];

  if (isProbeMethod && (EXEMPT_PATHS.has(cleanPath) || EXEMPT_PATHS.has(cleanOriginalUrl))) {
    return next();
  }

  const currentSecret = env.backendProxySecret;
  const oldSecret = env.backendProxySecretOld;

  // In production, failure to configure BACKEND_PROXY_SECRET fails closed immediately
  if (env.nodeEnv === 'production' && !currentSecret) {
    return res.status(403).json({
      status: 'error',
      statusCode: 403,
      message: 'Forbidden: proxy secret is not configured on server.',
    });
  }

  // If secret is not configured in local development, allow through
  if (!currentSecret && env.nodeEnv === 'development') {
    return next();
  }

  const headerSecret = req.headers['x-vercel-proxy-secret'];
  if (!headerSecret || typeof headerSecret !== 'string') {
    return res.status(403).json({
      status: 'error',
      statusCode: 403,
      message: 'Forbidden: missing or invalid proxy secret.',
    });
  }

  // Check current secret
  if (timingSafeSecretCompare(headerSecret, currentSecret)) {
    return next();
  }

  // Check optional old secret during zero-downtime rotation
  if (oldSecret && timingSafeSecretCompare(headerSecret, oldSecret)) {
    return next();
  }

  return res.status(403).json({
    status: 'error',
    statusCode: 403,
    message: 'Forbidden: missing or invalid proxy secret.',
  });
}

module.exports = {
  verifyProxySecret,
  timingSafeSecretCompare,
};
