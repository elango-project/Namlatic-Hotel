const { rateLimit } = require('express-rate-limit');
const env = require('../config/env');

/**
 * ============================================================================
 * Rate Limiting Middleware (Phase 5C)
 * ============================================================================
 * Protects write endpoints and general API from abuse and denial of service.
 *
 * ARCHITECTURAL LIMITATION & SECURITY NOTICE:
 * - The default in-memory store is scoped strictly to a single backend process.
 *   If the application scales horizontally to multiple Render instances, a
 *   centralized shared store (e.g. Redis) is required for cross-instance tracking.
 * - IMPORTANT: Rate limiting is NOT authentication. Any client can issue
 *   requests up to the rate limit. Establishing true property ownership requires
 *   an owner authentication mechanism before public deployment.
 * ============================================================================
 */

/**
 * Custom 429 JSON response handler.
 */
function createRateLimitHandler(customMessage) {
  return (_req, res) => {
    res.status(429).json({
      status: 'error',
      statusCode: 429,
      message: customMessage,
    });
  };
}

/**
 * Strict limiter for mutating operations: POST, PUT, DELETE.
 */
const writeLimiter = rateLimit({
  windowMs: env.rateLimit.writeWindowMs,
  limit: env.rateLimit.writeMax,
  standardHeaders: true, // Return standard RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  handler: createRateLimitHandler(
    'Too many hotel modification requests from this IP. Please try again later.'
  ),
  skip: (req) => {
    // In test environment, skip if header is explicitly provided
    if (env.nodeEnv === 'test' && req.headers['x-skip-rate-limit'] === 'true') {
      return true;
    }
    return false;
  },
});

/**
 * General limiter for public API endpoints.
 * Automatically skips health and readiness probes to prevent orchestrator check failures.
 */
const generalLimiter = rateLimit({
  windowMs: env.rateLimit.generalWindowMs,
  limit: env.rateLimit.generalMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many requests from this IP. Please try again later.'),
  skip: (req) => {
    // Never rate-limit liveness or readiness probes
    if (req.path === '/health' || req.path === '/ready' || req.path === '/api/health' || req.path === '/api/ready') {
      return true;
    }
    if (env.nodeEnv === 'test' && req.headers['x-skip-rate-limit'] === 'true') {
      return true;
    }
    return false;
  },
});

module.exports = {
  writeLimiter,
  generalLimiter,
  createRateLimitHandler,
};
