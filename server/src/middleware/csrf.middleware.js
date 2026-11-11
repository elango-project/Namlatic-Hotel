/**
 * Tokenless Cross-Site Request Forgery (CSRF) Defense Middleware
 *
 * Implements modern multi-layered tokenless CSRF defense:
 * 1. Safe methods (GET, HEAD, OPTIONS) bypass CSRF checks.
 * 2. Custom header enforcement: State-changing requests (POST, PUT, DELETE, PATCH)
 *    MUST provide 'X-Requested-With: XMLHttpRequest'. Standard HTML forms cannot
 *    set custom headers cross-origin without triggering preflight.
 * 3. Fetch Metadata defense: Where supported by modern browsers, 'Sec-Fetch-Site: cross-site'
 *    is rejected immediately with HTTP 403.
 * 4. Origin & Referer Verification:
 *    - Strict rejection of 'Origin: null'.
 *    - Origin (or safe Referer fallback) must match the configured CORS allowlist.
 *    - Malformed Referers safely return HTTP 403, never HTTP 500.
 */

const env = require('../config/env');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Express middleware to verify tokenless CSRF safeguards on state-changing requests.
 */
function verifyTokenlessCsrf(req, res, next) {
  // Safe HTTP methods do not mutate state and are bypassed
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // 1. Enforce custom header requirement
  const requestedWith = req.headers['x-requested-with'];
  if (!requestedWith || typeof requestedWith !== 'string' || requestedWith.toLowerCase() !== 'xmlhttprequest') {
    return res.status(403).json({
      status: 'error',
      statusCode: 403,
      message: 'Cross-site request forgery protection: missing or invalid X-Requested-With header.',
    });
  }

  // 2. Fetch Metadata defense (if present)
  const secFetchSite = req.headers['sec-fetch-site'];
  if (secFetchSite && secFetchSite === 'cross-site') {
    return res.status(403).json({
      status: 'error',
      statusCode: 403,
      message: 'Cross-site request forgery protection: cross-site fetch rejected.',
    });
  }

  // 3. Exact Origin & Referer validation
  const origin = req.headers['origin'];
  const referer = req.headers['referer'];

  // Explicitly reject 'null' origin (e.g. sandboxed iframes, local files)
  if (origin === 'null') {
    return res.status(403).json({
      status: 'error',
      statusCode: 403,
      message: 'Cross-site request forgery protection: null origin rejected.',
    });
  }

  let effectiveOrigin = null;

  if (origin) {
    effectiveOrigin = origin;
  } else if (referer) {
    try {
      const parsed = new URL(referer);
      effectiveOrigin = parsed.origin;
    } catch (_err) {
      // Malformed Referer must return 403, never throw 500
      return res.status(403).json({
        status: 'error',
        statusCode: 403,
        message: 'Cross-site request forgery protection: malformed referer.',
      });
    }
  }

  if (!effectiveOrigin || !env.corsOrigins.includes(effectiveOrigin)) {
    return res.status(403).json({
      status: 'error',
      statusCode: 403,
      message: 'Cross-site request forgery protection: untrusted origin.',
    });
  }

  return next();
}

module.exports = {
  verifyTokenlessCsrf,
};
