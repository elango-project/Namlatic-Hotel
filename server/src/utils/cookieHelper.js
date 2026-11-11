/**
 * Cookie Parsing & Session Header Helpers
 * Zero-dependency utilities for cookie extraction, IP sanitization, and Set-Cookie generation.
 */

const net = require('net');

const COOKIE_NAME = '__Host-namlatic_session';
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days in seconds

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
 * Adheres strictly to the __Host- prefix requirements:
 * - Cookie name begins with __Host-
 * - Path=/
 * - Secure flag present in production
 * - No Domain attribute
 * - HttpOnly and SameSite=Lax
 *
 * @param {string} token
 * @param {{ isProduction?: boolean, maxAgeSeconds?: number }} [options]
 * @returns {string}
 */
function buildSessionCookie(token, options = {}) {
  const isProduction = options.isProduction ?? false;
  const maxAge = options.maxAgeSeconds ?? SESSION_MAX_AGE_SECONDS;

  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];

  if (isProduction) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

/**
 * Constructs the Set-Cookie header value to clear/invalidate the session cookie in the browser.
 *
 * @param {{ isProduction?: boolean }} [options]
 * @returns {string}
 */
function buildClearSessionCookie(options = {}) {
  const isProduction = options.isProduction ?? false;

  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'Max-Age=0',
  ];

  if (isProduction) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

module.exports = {
  COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  parseCookies,
  sanitizeIp,
  truncateUserAgent,
  buildSessionCookie,
  buildClearSessionCookie,
};
