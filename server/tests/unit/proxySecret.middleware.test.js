const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  verifyProxySecret,
  timingSafeSecretCompare,
} = require('../../src/middleware/proxySecret.middleware');
const env = require('../../src/config/env');

describe('Unit Tests: Internal Reverse Proxy Secret Middleware (Phase 5F-A2.2)', () => {
  describe('timingSafeSecretCompare()', () => {
    it('returns true for matching string secrets', () => {
      const secret = 'super_secret_proxy_token_at_least_32_chars_12345';
      assert.equal(timingSafeSecretCompare(secret, secret), true);
    });

    it('returns false for different secrets of identical length', () => {
      const a = 'super_secret_proxy_token_at_least_32_chars_12345';
      const b = 'super_secret_proxy_token_at_least_32_chars_99999';
      assert.equal(timingSafeSecretCompare(a, b), false);
    });

    it('returns false for secrets of differing lengths without throwing an exception', () => {
      const a = 'short_secret';
      const b = 'super_secret_proxy_token_at_least_32_chars_12345';
      assert.equal(timingSafeSecretCompare(a, b), false);
    });

    it('returns false safely for non-string inputs', () => {
      assert.equal(timingSafeSecretCompare(null, 'secret'), false);
      assert.equal(timingSafeSecretCompare('secret', undefined), false);
      assert.equal(timingSafeSecretCompare(12345, '12345'), false);
      assert.equal(timingSafeSecretCompare({}, {}), false);
    });
  });

  describe('verifyProxySecret() Express Middleware', () => {
    function createMockRes() {
      const res = {
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
      return res;
    }

    it('exempts health probe /api/health and /health without requiring secret', () => {
      let nextCalled = false;
      const req = { path: '/health', originalUrl: '/api/health', headers: {} };
      const res = createMockRes();

      verifyProxySecret(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(res.statusCode, 200);
    });

    it('exempts readiness probe /api/ready and /ready without requiring secret', () => {
      let nextCalled = false;
      const req = { path: '/ready', originalUrl: '/api/ready', headers: {} };
      const res = createMockRes();

      verifyProxySecret(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(res.statusCode, 200);
    });

    it('rejects state-changing and read requests missing x-vercel-proxy-secret with HTTP 403', () => {
      let nextCalled = false;
      const req = { path: '/hotels', originalUrl: '/api/hotels', headers: {} };
      const res = createMockRes();

      verifyProxySecret(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.status, 'error');
      assert.equal(res.body.statusCode, 403);
      assert.equal(res.body.message.includes('missing or invalid proxy secret'), true);
    });

    it('rejects requests with incorrect proxy secret with HTTP 403', () => {
      let nextCalled = false;
      const req = {
        path: '/hotels',
        originalUrl: '/api/hotels',
        headers: {
          'x-vercel-proxy-secret': 'attacker_supplied_fake_secret_token_12345678',
        },
      };
      const res = createMockRes();

      verifyProxySecret(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 403);
    });

    it('accepts requests with exact matching current proxy secret', () => {
      let nextCalled = false;
      const req = {
        path: '/hotels',
        originalUrl: '/api/hotels',
        headers: {
          'x-vercel-proxy-secret': env.backendProxySecret,
        },
      };
      const res = createMockRes();

      verifyProxySecret(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(res.statusCode, 200);
    });

    it('accepts requests with valid old proxy secret during zero-downtime rotation', () => {
      const originalOld = env.backendProxySecretOld;
      env.backendProxySecretOld = 'old_valid_secret_during_rotation_32_chars_12345';

      try {
        let nextCalled = false;
        const req = {
          path: '/hotels',
          originalUrl: '/api/hotels',
          headers: {
            'x-vercel-proxy-secret': 'old_valid_secret_during_rotation_32_chars_12345',
          },
        };
        const res = createMockRes();

        verifyProxySecret(req, res, () => {
          nextCalled = true;
        });

        assert.equal(nextCalled, true);
        assert.equal(res.statusCode, 200);
      } finally {
        env.backendProxySecretOld = originalOld;
      }
    });
  });
});
