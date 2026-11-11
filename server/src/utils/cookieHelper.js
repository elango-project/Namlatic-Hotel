/**
 * Cookie Parsing & Session Header Helpers
 * Zero-dependency utilities for cookie extraction, IP sanitization, and Set-Cookie generation.
 */

const net = require('net');

const COOKIE_NAME = '__Host-namlatic_session';
const DEV_COOKIE_NAME = 'namlatic_session';
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days in seconds

/**
 * Returns the canonical session cookie name for the given runtime environment.
 * Production strictly enforces the RFC 6265bis '__Host-' prefix.
 * Plain-HTTP development environments safely fall back to 'namlatic_session'
 * to avoid browser rejection of non-Secure cookies with __Host- prefix.
 *
 * @param {boolean} [isProduction=false]
 * @returns {string}
 */
function getSessionCookieName(isProduction = false) {
  return isProduction ? COOKIE_NAME : DEV_COOKIE_NAME;
}

/**
 * Parses a standard HTTP Cookie header string into a key-value dictionary.
 * Robust against empty headers, quoted values, and URI encoding.
 *
 * @param {string|undefined|null} cookieHeader
 * @returns {Record<string, string>}
 */
function parseCookies(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return {};
  }

  const cookies = {};
  const pairs = cookieHeader.split(';');

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i].trim();
    if (!pair) continue;

    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;

    const key = pair.slice(0, eqIdx).trim();
    let val = pair.slice(eqIdx + 1).trim();

    // Strip optional surrounding quotes
    if (val.length >= 2 && val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }

    try {
      cookies[key] = decodeURIComponent(val);
    } catch (_err) {
      cookies[key] = val;
    }
  }

  return cookies;
}

/**
 * Validates and sanitizes a client IP string for PostgreSQL INET column storage.
 * Returns null if the IP is missing, invalid, or malformed, preventing SQL errors.
 *
 * @param {string|undefined|null} ip
 * @returns {string|null}
 */
function sanitizeIp(ip) {
  if (!ip || typeof ip !== 'string') {
    return null;
  }

  const trimmed = ip.trim();
  if (net.isIP(trimmed) !== 0) {
    return trimmed;
  }

  // Handle possible IPv4 mapped in IPv6 prefix formatting
  if (trimmed.startsWith('::ffff:')) {
    const v4 = trimmed.slice(7);
    if (net.isIPv4(v4)) {
      return trimmed;
    }
  }

  return null;
}

/**
 * Sanitizes and truncates a User-Agent header string to fit within VARCHAR(512).
 *
 * @param {string|undefined|null} ua
 * @returns {string|null}
 */
function truncateUserAgent(ua) {
  if (!ua || typeof ua !== 'string') {
    return null;
  }
  return ua.slice(0, 512);
}

/**
 * Constructs the Set-Cookie header value for an active owner session.
 *
 * RFC 6265bis Prefix Guarantees:
 * - If the cookie name begins with '__Host-', it MUST have Path=/, MUST have Secure,
 *   and MUST NOT have a Domain attribute.
 * - By default (production, testing, and secure localhost development):
 *   Uses strictly '__Host-namlatic_session' with the 'Secure' attribute.
 * - Safe development-only plain-HTTP fallback:
 *   If plain-HTTP development is explicitly enabled (COOKIE_PLAIN_HTTP=true or plainHttpDev: true)
 *   outside of production, falls back to 'namlatic_session' without Secure to prevent RFC 6265bis
 *   browser rejection when testing on non-HTTPS origins without secure contexts.
 *   Production environment NEVER permits unsecure or non-__Host cookies.
 *
 * @param {string} token
 * @param {{ isProduction?: boolean, maxAgeSeconds?: number, secure?: boolean, plainHttpDev?: boolean }} [options]
 * @returns {string}
 */
function buildSessionCookie(token, options = {}) {
  const isProduction = options.isProduction ?? (process.env.NODE_ENV === 'production');
  const isPlainHttpDev = !isProduction && (options.plainHttpDev ?? (process.env.COOKIE_PLAIN_HTTP === 'true'));
  const isSecure = options.secure ?? (!isPlainHttpDev || isProduction);
  const maxAge = options.maxAgeSeconds ?? SESSION_MAX_AGE_SECONDS;

  // Use __Host- prefix when Secure flag is present (RFC 6265bis requirement)
  const cookieName = isSecure ? COOKIE_NAME : DEV_COOKIE_NAME;

  const parts = [
    `${cookieName}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];

  if (isSecure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

/**
 * Constructs the Set-Cookie header value to clear/invalidate the session cookie in the browser.
 *
 * @param {{ isProduction?: boolean, secure?: boolean, plainHttpDev?: boolean }} [options]
 * @returns {string}
 */
function buildClearSessionCookie(options = {}) {
  const isProduction = options.isProduction ?? (process.env.NODE_ENV === 'production');
  const isPlainHttpDev = !isProduction && (options.plainHttpDev ?? (process.env.COOKIE_PLAIN_HTTP === 'true'));
  const isSecure = options.secure ?? (!isPlainHttpDev || isProduction);
  const cookieName = isSecure ? COOKIE_NAME : DEV_COOKIE_NAME;

  const parts = [
    `${cookieName}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'Max-Age=0',
  ];

  if (isSecure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

module.exports = {
  COOKIE_NAME,
  DEV_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  getSessionCookieName,
  parseCookies,
  sanitizeIp,
  truncateUserAgent,
  buildSessionCookie,
  buildClearSessionCookie,
};
