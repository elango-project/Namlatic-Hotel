/**
 * Session Authentication Middleware
 *
 * Verifies the __Host-namlatic_session cookie against PostgreSQL.
 * Rejects expired, revoked, or non-existent sessions with HTTP 401.
 * Injects strict cache-prevention headers to prevent intermediate proxy/edge caching.
 */

const sessionService = require('../services/session.service');
const { parseCookies, COOKIE_NAME } = require('../utils/cookieHelper');

const NO_CACHE_VALUE = 'private, no-store, no-cache, max-age=0, must-revalidate';

/**
 * Express middleware to enforce owner session authentication.
 */
async function requireAuth(req, res, next) {
  // Always inject private no-store headers on authenticated endpoints
  res.setHeader('Cache-Control', NO_CACHE_VALUE);

  const cookies = parseCookies(req.headers.cookie);
  const rawToken = cookies[COOKIE_NAME];

  if (!rawToken) {
    return res.status(401).json({
      status: 'error',
      statusCode: 401,
      message: 'Unauthorized: authentication required.',
    });
  }

  try {
    const sessionData = await sessionService.validateSession(rawToken, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (!sessionData) {
      return res.status(401).json({
        status: 'error',
        statusCode: 401,
        message: 'Unauthorized: session expired or invalid.',
      });
    }

    req.user = sessionData.user;
    req.sessionId = sessionData.sessionId;
    req.rawSessionToken = rawToken;

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  requireAuth,
  NO_CACHE_VALUE,
};
