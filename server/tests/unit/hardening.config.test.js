const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseCorsOrigins,
  parseTrustProxy,
  parseRateLimitConfig,
  parseAndValidateEnv,
} = require('../../src/config/env');

describe('Unit Tests: Express Backend Hardening Configuration (Phase 5C)', () => {
  // --------------------------------------------------------------------------
  // 1. Port Binding and Host
  // --------------------------------------------------------------------------
  describe('Port & Host Binding', () => {
    it('uses process.env.PORT when specified (e.g. Render assigned 10000)', () => {
      const config = parseAndValidateEnv({
        PORT: '10000',
        NODE_ENV: 'production',
        MEDIA_STORAGE_DRIVER: 'r2',
        R2_ACCOUNT_ID: 'acc123',
        R2_ACCESS_KEY_ID: 'key123',
        R2_SECRET_ACCESS_KEY: 'sec123',
        R2_BUCKET_NAME: 'hotel-bucket',
        R2_PUBLIC_BASE_URL: 'https://cdn.example.com',
        DATABASE_URL: 'postgresql://user:pass@ep-host.aws.neon.tech/neondb?sslmode=require&channel_binding=prefer',
        BACKEND_PROXY_SECRET: 'test_proxy_secret_at_least_32_chars_long_12345',
      });
      assert.equal(config.port, 10000);
      assert.equal(config.host, '0.0.0.0');
    });

    it('falls back to 5000 in development when PORT is not provided', () => {
      const config = parseAndValidateEnv({
        NODE_ENV: 'development',
      });
      assert.equal(config.port, 5000);
      assert.equal(config.host, '0.0.0.0');
    });

    it('respects custom HOST if explicitly set', () => {
      const config = parseAndValidateEnv({
        HOST: '127.0.0.1',
        NODE_ENV: 'development',
      });
      assert.equal(config.host, '127.0.0.1');
    });
  });

  // --------------------------------------------------------------------------
  // 2. CORS Origin Allowlist Parsing
  // --------------------------------------------------------------------------
  describe('CORS Origin Allowlist', () => {
    it('defaults to localhost development origins when CORS_ORIGIN is unset in development', () => {
      const origins = parseCorsOrigins(undefined, 'development');
      assert.equal(origins.includes('http://localhost:5173'), true);
      assert.equal(origins.includes('http://127.0.0.1:5173'), true);
      assert.equal(origins.includes('http://localhost:4173'), true);
    });

    it('parses a single production origin correctly', () => {
      const origins = parseCorsOrigins('https://namlatic-hotel.vercel.app', 'production');
      assert.deepEqual(origins, ['https://namlatic-hotel.vercel.app']);
    });

    it('parses multiple comma-separated origins and trims whitespace', () => {
      const raw = 'https://namlatic-hotel.vercel.app, https://preview-123.vercel.app, http://localhost:5173';
      const origins = parseCorsOrigins(raw, 'production');
      assert.equal(origins.length, 3);
      assert.equal(origins.includes('https://namlatic-hotel.vercel.app'), true);
      assert.equal(origins.includes('https://preview-123.vercel.app'), true);
      assert.equal(origins.includes('http://localhost:5173'), true);
    });

    it('strictly forbids wildcard (*) in production mode', () => {
      assert.throws(
        () => {
          parseCorsOrigins('*', 'production');
        },
        {
          name: 'Error',
          message: 'Wildcard CORS origin (*) is forbidden in production.',
        }
      );
    });

    it('rejects origins with invalid protocol (e.g. ftp, javascript)', () => {
      assert.throws(
        () => {
          parseCorsOrigins('ftp://invalid-server.com', 'production');
        },
        /Invalid CORS origin protocol/
      );
    });

    it('rejects origins containing path components (must be origin root)', () => {
      assert.throws(
        () => {
          parseCorsOrigins('https://namlatic-hotel.vercel.app/api/hotels', 'production');
        },
        /must not contain a path component/
      );
    });

    it('preserves localhost origins in development even when a custom origin is provided', () => {
      const origins = parseCorsOrigins('http://mycustomdev.local:3000', 'development');
      assert.equal(origins.includes('http://mycustomdev.local:3000'), true);
      assert.equal(origins.includes('http://localhost:5173'), true);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Reverse Proxy Trust Configuration (Render Reverse Proxy Topology)
  // --------------------------------------------------------------------------
  describe('Reverse Proxy Trust Configuration', () => {
    it('defaults to 1 hop in production to match Render reverse proxy topology', () => {
      const trust = parseTrustProxy(undefined, 'production');
      assert.equal(trust, 1);
    });

    it('defaults to false in development mode (direct connections)', () => {
      const trust = parseTrustProxy(undefined, 'development');
      assert.equal(trust, false);
    });

    it('respects explicitly configured integer proxy hops', () => {
      assert.equal(parseTrustProxy('2', 'production'), 2);
      assert.equal(parseTrustProxy('1', 'development'), 1);
    });

    it('parses boolean strings for TRUST_PROXY safely', () => {
      assert.equal(parseTrustProxy('false', 'production'), false);
      assert.equal(parseTrustProxy('true', 'production'), true);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Rate Limiting Configuration
  // --------------------------------------------------------------------------
  describe('Rate Limiting Configuration', () => {
    it('defaults to enabled with sensible write and general limits', () => {
      const config = parseRateLimitConfig({}, 'development');
      assert.equal(config.enabled, true);
      assert.equal(config.writeMax, 60);
      assert.equal(config.writeWindowMs, 15 * 60 * 1000);
      assert.equal(config.generalMax, 300);
      assert.equal(config.generalWindowMs, 15 * 60 * 1000);
    });

    it('allows disabling rate limits via RATE_LIMIT_ENABLED=false', () => {
      const config = parseRateLimitConfig({ RATE_LIMIT_ENABLED: 'false' }, 'development');
      assert.equal(config.enabled, false);
    });

    it('respects custom configured rate limit numbers and windows', () => {
      const config = parseRateLimitConfig(
        {
          RATE_LIMIT_WRITE_MAX: '30',
          RATE_LIMIT_WRITE_WINDOW_MS: '60000',
          RATE_LIMIT_GENERAL_MAX: '500',
          RATE_LIMIT_GENERAL_WINDOW_MS: '120000',
        },
        'production'
      );
      assert.equal(config.writeMax, 30);
      assert.equal(config.writeWindowMs, 60000);
      assert.equal(config.generalMax, 500);
      assert.equal(config.generalWindowMs, 120000);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Body Size Limit Configuration
  // --------------------------------------------------------------------------
  describe('Body Size Limits', () => {
    it('defaults bodyLimit to 10kb', () => {
      const config = parseAndValidateEnv({ NODE_ENV: 'development' });
      assert.equal(config.bodyLimit, '10kb');
    });

    it('respects custom BODY_LIMIT environment variable', () => {
      const config = parseAndValidateEnv({
        NODE_ENV: 'development',
        BODY_LIMIT: '25kb',
      });
      assert.equal(config.bodyLimit, '25kb');
    });
  });

  // --------------------------------------------------------------------------
  // 6. Proxy Trust & Anti-Spoofing IP Extraction
  // --------------------------------------------------------------------------
  describe('Proxy Trust & Anti-Spoofing IP Extraction', () => {
    it('accurately resolves client IP with trust proxy = 1 and blocks client IP spoofing', async () => {
      const express = require('express');
      const testApp = express();
      testApp.set('trust proxy', 1); // Render 1-hop topology

      testApp.get('/test-ip', (req, res) => {
        res.json({ ip: req.ip, ips: req.ips });
      });

      const server = testApp.listen(0);
      try {
        const port = server.address().port;
        // Malicious client prepends spoofed IP '203.0.113.195' before their actual IP '198.51.100.1'
        const res = await fetch(`http://localhost:${port}/test-ip`, {
          headers: {
            'X-Forwarded-For': '203.0.113.195, 198.51.100.1',
          },
        });
        const data = await res.json();

        // Express with trust proxy: 1 trusts only the last proxy and derives 198.51.100.1, ignoring spoofed 203.0.113.195
        assert.equal(data.ip, '198.51.100.1');
        assert.deepEqual(data.ips, ['198.51.100.1']);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it('demonstrates that trust proxy = true is vulnerable to IP spoofing (why blind true is forbidden)', async () => {
      const express = require('express');
      const testApp = express();
      testApp.set('trust proxy', true); // Dangerous blind trust

      testApp.get('/test-ip-insecure', (req, res) => {
        res.json({ ip: req.ip });
      });

      const server = testApp.listen(0);
      try {
        const port = server.address().port;
        const res = await fetch(`http://localhost:${port}/test-ip-insecure`, {
          headers: {
            'X-Forwarded-For': '203.0.113.195, 198.51.100.1',
          },
        });
        const data = await res.json();

        // With trust proxy: true, Express picks the leftmost spoofed IP
        assert.equal(data.ip, '203.0.113.195');
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });
  });

  // --------------------------------------------------------------------------
  // 7. Rate Limiter 429 Response Format & Headers
  // --------------------------------------------------------------------------
  describe('Rate Limiter 429 Behavior & Standard Headers', () => {
    it('returns HTTP 429 with standard RateLimit headers and structured JSON error when limit is exceeded', async () => {
      const express = require('express');
      const { rateLimit } = require('express-rate-limit');
      const testApp = express();

      const testLimiter = rateLimit({
        windowMs: 60000,
        limit: 2,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (_req, res) => {
          res.status(429).json({
            status: 'error',
            statusCode: 429,
            message: 'Too many requests. Limit exceeded.',
          });
        },
      });

      testApp.post('/api/write', testLimiter, (_req, res) => {
        res.json({ success: true });
      });

      const server = testApp.listen(0);
      try {
        const port = server.address().port;
        const r1 = await fetch(`http://localhost:${port}/api/write`, { method: 'POST' });
        const r2 = await fetch(`http://localhost:${port}/api/write`, { method: 'POST' });
        const r3 = await fetch(`http://localhost:${port}/api/write`, { method: 'POST' });

        assert.equal(r1.status, 200);
        assert.equal(r2.status, 200);
        assert.equal(r3.status, 429);

        // Check standard headers
        assert.equal(
          r3.headers.has('ratelimit-policy') ||
            r3.headers.has('ratelimit-limit') ||
            r3.headers.has('ratelimit'),
          true
        );
        assert.equal(r3.headers.has('x-ratelimit-limit'), false); // Legacy header disabled

        const body = await r3.json();
        assert.equal(body.status, 'error');
        assert.equal(body.statusCode, 429);
        assert.equal(body.message, 'Too many requests. Limit exceeded.');
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });
  });

  // --------------------------------------------------------------------------
  // 8. Production Error Sanitization & Stack Trace Confidentiality
  // --------------------------------------------------------------------------
  describe('Error Handler Production Sanitization', () => {
    it('sanitizes 500 error messages and excludes stack traces in production mode', () => {
      const errorHandler = require('../../src/middleware/errorHandler');

      let capturedStatus = null;
      let capturedJson = null;

      const mockRes = {
        status: (code) => {
          capturedStatus = code;
          return mockRes;
        },
        json: (payload) => {
          capturedJson = payload;
          return mockRes;
        },
      };

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const dangerousError = new Error('FATAL: Database table "secret_passwords" corrupted in /var/db/internal.pg');
        dangerousError.stack = 'Error: FATAL\n    at /secret/path/internal.js:12:34';

        errorHandler(dangerousError, {}, mockRes, () => {});

        assert.equal(capturedStatus, 500);
        assert.equal(capturedJson.status, 'error');
        assert.equal(capturedJson.statusCode, 500);
        assert.equal(capturedJson.message, 'Internal server error');
        assert.equal(capturedJson.stack, undefined);
        assert.equal(JSON.stringify(capturedJson).includes('secret_passwords'), false);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });
});
