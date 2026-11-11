const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  parseCookies,
  sanitizeIp,
  truncateUserAgent,
  buildSessionCookie,
  buildClearSessionCookie,
} = require('../../src/utils/cookieHelper');

describe('Unit Tests: Cookie & Header Utilities (Phase 5F-A2.2)', () => {
  describe('parseCookies()', () => {
    it('returns empty object for falsy or non-string headers', () => {
      assert.deepEqual(parseCookies(null), {});
      assert.deepEqual(parseCookies(undefined), {});
      assert.deepEqual(parseCookies(''), {});
      assert.deepEqual(parseCookies(123), {});
    });

    it('parses single cookie correctly', () => {
      const result = parseCookies('session_id=abc123xyz');
      assert.deepEqual(result, { session_id: 'abc123xyz' });
    });

    it('parses multiple cookies separated by semicolon and space', () => {
      const header = 'theme=dark; __Host-namlatic_session=deadbeef; tracking=false';
      const result = parseCookies(header);
      assert.equal(result.theme, 'dark');
      assert.equal(result['__Host-namlatic_session'], 'deadbeef');
      assert.equal(result.tracking, 'false');
    });

    it('handles quoted cookie values safely', () => {
      const header = 'user="owner@namlatic.com"; token="quoted_value"';
      const result = parseCookies(header);
      assert.equal(result.user, 'owner@namlatic.com');
      assert.equal(result.token, 'quoted_value');
    });

    it('decodes URI-encoded values safely without crashing on malformed encoding', () => {
      const header = 'name=Hello%20World; bad=%E0%A4%A';
      const result = parseCookies(header);
      assert.equal(result.name, 'Hello World');
      assert.equal(result.bad, '%E0%A4%A'); // Falls back safely to raw value
    });

    it('ignores empty segments and malformed pairs without =', () => {
      const header = ';;valid=yes;invalid;';
      const result = parseCookies(header);
      assert.deepEqual(result, { valid: 'yes' });
    });
  });

  describe('sanitizeIp()', () => {
    it('accepts valid standard IPv4 addresses', () => {
      assert.equal(sanitizeIp('127.0.0.1'), '127.0.0.1');
      assert.equal(sanitizeIp('192.168.1.100'), '192.168.1.100');
      assert.equal(sanitizeIp('203.0.113.195'), '203.0.113.195');
    });

    it('accepts valid IPv6 addresses', () => {
      assert.equal(sanitizeIp('::1'), '::1');
      assert.equal(sanitizeIp('2001:db8::1'), '2001:db8::1');
    });

    it('accepts IPv4-mapped IPv6 addresses', () => {
      assert.equal(sanitizeIp('::ffff:192.0.2.1'), '::ffff:192.0.2.1');
    });

    it('returns null for missing, non-string, or malformed IP addresses', () => {
      assert.equal(sanitizeIp(null), null);
      assert.equal(sanitizeIp(undefined), null);
      assert.equal(sanitizeIp(''), null);
      assert.equal(sanitizeIp('not-an-ip'), null);
      assert.equal(sanitizeIp('999.999.999.999'), null);
      assert.equal(sanitizeIp('127.0.0.1:8080'), null); // Port appended is invalid INET
      assert.equal(sanitizeIp('malicious"injection'), null);
    });
  });

  describe('truncateUserAgent()', () => {
    it('preserves user agent strings within 512 characters', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0';
      assert.equal(truncateUserAgent(ua), ua);
    });

    it('truncates user agent strings exceeding 512 characters to exactly 512 characters', () => {
      const longUa = 'A'.repeat(600);
      const truncated = truncateUserAgent(longUa);
      assert.equal(truncated.length, 512);
      assert.equal(truncated, 'A'.repeat(512));
    });

    it('returns null for non-string or missing values', () => {
      assert.equal(truncateUserAgent(null), null);
      assert.equal(truncateUserAgent(undefined), null);
      assert.equal(truncateUserAgent(123), null);
    });
  });

  describe('Cookie Header Builders', () => {
    it('buildSessionCookie adheres to __Host- specifications', () => {
      const token = 'abcdef1234567890abcdef1234567890';
      const cookie = buildSessionCookie(token, { isProduction: false });

      assert.equal(cookie.includes(`${COOKIE_NAME}=${token}`), true);
      assert.equal(cookie.includes('Path=/'), true);
      assert.equal(cookie.includes('HttpOnly'), true);
      assert.equal(cookie.includes('SameSite=Lax'), true);
      assert.equal(cookie.includes(`Max-Age=${SESSION_MAX_AGE_SECONDS}`), true);
      assert.equal(cookie.includes('Domain'), false); // __Host- cookies must not specify Domain
      assert.equal(cookie.includes('Secure'), false); // Development without Secure
    });

    it('buildSessionCookie includes Secure flag when isProduction is true', () => {
      const token = 'securetoken123';
      const cookie = buildSessionCookie(token, { isProduction: true });

      assert.equal(cookie.includes('Secure'), true);
      assert.equal(cookie.includes('HttpOnly'), true);
      assert.equal(cookie.includes('SameSite=Lax'), true);
    });

    it('buildClearSessionCookie clears cookie with Max-Age=0 and past Expires date', () => {
      const cookie = buildClearSessionCookie({ isProduction: true });

      assert.equal(cookie.includes(`${COOKIE_NAME}=;`), true);
      assert.equal(cookie.includes('Max-Age=0'), true);
      assert.equal(cookie.includes('Expires=Thu, 01 Jan 1970 00:00:00 GMT'), true);
      assert.equal(cookie.includes('Path=/'), true);
      assert.equal(cookie.includes('Secure'), true);
    });
  });
});
