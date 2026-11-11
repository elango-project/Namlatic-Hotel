const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { verifyTokenlessCsrf } = require('../../src/middleware/csrf.middleware');
const env = require('../../src/config/env');

describe('Unit Tests: Tokenless CSRF Protection Middleware (Phase 5F-A2.2)', () => {
  function createMockRes() {
    return {
      statusCode: 200,
      headers: {},
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        return this;
      },
    };
  }

  describe('Safe HTTP Methods Bypass', () => {
    it('bypasses GET requests unconditionally', () => {
      let nextCalled = false;
      const req = { method: 'GET', headers: {} };
      const res = createMockRes();

      verifyTokenlessCsrf(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
    });

    it('bypasses HEAD requests unconditionally', () => {
      let nextCalled = false;
      const req = { method: 'HEAD', headers: {} };
      const res = createMockRes();

      verifyTokenlessCsrf(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
    });

    it('bypasses OPTIONS preflight requests unconditionally', () => {
      let nextCalled = false;
      const req = { method: 'OPTIONS', headers: {} };
      const res = createMockRes();

      verifyTokenlessCsrf(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
    });
  });

  describe('Custom Header Enforcement (X-Requested-With)', () => {
    it('rejects POST request missing X-Requested-With header with HTTP 403', () => {
      let nextCalled = false;
      const req = {
        method: 'POST',
        headers: {
          origin: env.corsOrigins[0],
        },
      };
      const res = createMockRes();

      verifyTokenlessCsrf(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.message.includes('X-Requested-With'), true);
    });

    it('rejects PUT request with invalid X-Requested-With header value with HTTP 403', () => {
      let nextCalled = false;
      const req = {
        method: 'PUT',
        headers: {
          'x-requested-with': 'FetchAPI',
          origin: env.corsOrigins[0],
        },
      };
      const res = createMockRes();

      verifyTokenlessCsrf(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 403);
    });

    it('accepts case-insensitive XMLHttpRequest header value', () => {
      let nextCalled = false;
      const req = {
        method: 'POST',
        headers: {
          'x-requested-with': 'xmlhttprequest',
          origin: env.corsOrigins[0],
        },
      };
      const res = createMockRes();

      verifyTokenlessCsrf(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
    });
  });

  describe('Fetch Metadata Defense (Sec-Fetch-Site)', () => {
    it('rejects state-changing requests when Sec-Fetch-Site is cross-site with HTTP 403', () => {
      let nextCalled = false;
      const req = {
        method: 'POST',
        headers: {
          'x-requested-with': 'XMLHttpRequest',
          'sec-fetch-site': 'cross-site',
          origin: env.corsOrigins[0],
        },
      };
      const res = createMockRes();

      verifyTokenlessCsrf(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.message.includes('cross-site fetch rejected'), true);
    });

    it('permits same-origin or same-site fetch metadata requests', () => {
      let nextCalled = false;
      const req = {
        method: 'POST',
        headers: {
          'x-requested-with': 'XMLHttpRequest',
          'sec-fetch-site': 'same-origin',
          origin: env.corsOrigins[0],
        },
      };
      const res = createMockRes();

      verifyTokenlessCsrf(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
    });
  });

  describe('Origin & Referer Validation', () => {
    it('rejects "null" origin explicitly with HTTP 403', () => {
      let nextCalled = false;
      const req = {
        method: 'POST',
        headers: {
          'x-requested-with': 'XMLHttpRequest',
          origin: 'null',
        },
      };
      const res = createMockRes();

      verifyTokenlessCsrf(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.message.includes('null origin rejected'), true);
    });

    it('rejects untrusted origin with HTTP 403', () => {
      let nextCalled = false;
      const req = {
        method: 'DELETE',
        headers: {
          'x-requested-with': 'XMLHttpRequest',
          origin: 'https://evil-attacker.com',
        },
      };
      const res = createMockRes();

      verifyTokenlessCsrf(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.message.includes('untrusted origin'), true);
    });

    it('accepts trusted origin in CORS allowlist', () => {
      let nextCalled = false;
      const req = {
        method: 'DELETE',
        headers: {
          'x-requested-with': 'XMLHttpRequest',
          origin: env.corsOrigins[0],
        },
      };
      const res = createMockRes();

      verifyTokenlessCsrf(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
    });

    it('falls back safely to Referer when Origin is absent', () => {
      let nextCalled = false;
      const trustedOrigin = env.corsOrigins[0];
      const req = {
        method: 'POST',
        headers: {
          'x-requested-with': 'XMLHttpRequest',
          referer: `${trustedOrigin}/hotels/new`,
        },
      };
      const res = createMockRes();

      verifyTokenlessCsrf(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
    });

    it('rejects malformed Referer with HTTP 403 without throwing HTTP 500', () => {
      let nextCalled = false;
      const req = {
        method: 'POST',
        headers: {
          'x-requested-with': 'XMLHttpRequest',
          referer: 'not_a_valid_url:::://///',
        },
      };
      const res = createMockRes();

      verifyTokenlessCsrf(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.message.includes('malformed referer'), true);
    });

    it('rejects request with neither Origin nor Referer with HTTP 403', () => {
      let nextCalled = false;
      const req = {
        method: 'POST',
        headers: {
          'x-requested-with': 'XMLHttpRequest',
        },
      };
      const res = createMockRes();

      verifyTokenlessCsrf(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.message.includes('untrusted origin'), true);
    });
  });
});
