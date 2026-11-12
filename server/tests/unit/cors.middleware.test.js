const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const cors = require('cors');
const { createCorsOptions } = require('../../src/middleware/cors.middleware');
const errorHandler = require('../../src/middleware/errorHandler');

describe('Unit Tests: CORS Middleware & Preflight Handling', () => {
  const allowedOrigins = [
    'https://namlatic-hotel.vercel.app',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
  ];

  // --------------------------------------------------------------------------
  // 1. Configuration & Origin Function Verification
  // --------------------------------------------------------------------------
  describe('createCorsOptions() Options & Validator Function', () => {
    const corsOptions = createCorsOptions(allowedOrigins);

    it('allows requests with missing or empty Origin header (same-origin, curl, server-to-server)', (t, done) => {
      corsOptions.origin(undefined, (err, allow) => {
        assert.equal(err, null);
        assert.equal(allow, true);
        done();
      });
    });

    it('allows exact production origin https://namlatic-hotel.vercel.app', (t, done) => {
      corsOptions.origin('https://namlatic-hotel.vercel.app', (err, allow) => {
        assert.equal(err, null);
        assert.equal(allow, true);
        done();
      });
    });

    it('allows exact production origin with trailing slash safely normalized', (t, done) => {
      corsOptions.origin('https://namlatic-hotel.vercel.app/', (err, allow) => {
        assert.equal(err, null);
        assert.equal(allow, true);
        done();
      });
    });

    it('allows localhost development origins (5173 and 4173)', (t, done) => {
      corsOptions.origin('http://localhost:5173', (err, allow) => {
        assert.equal(err, null);
        assert.equal(allow, true);

        corsOptions.origin('http://127.0.0.1:5173', (err2, allow2) => {
          assert.equal(err2, null);
          assert.equal(allow2, true);
          done();
        });
      });
    });

    it('rejects untrusted origin with HTTP 403 error and exact violation message', (t, done) => {
      corsOptions.origin('https://malicious-website.com', (err, allow) => {
        assert.ok(err instanceof Error);
        assert.equal(err.statusCode, 403);
        assert.equal(
          err.message,
          'CORS policy violation: Origin "https://malicious-website.com" is not allowed.'
        );
        assert.equal(allow, false);
        done();
      });
    });

    it('rejects attacker subdomains and crafted prefix/suffix domains', (t, done) => {
      corsOptions.origin('https://namlatic-hotel.vercel.app.attacker.com', (err, allow) => {
        assert.ok(err instanceof Error);
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /CORS policy violation/);
        assert.equal(allow, false);
        done();
      });
    });

    it('rejects plain HTTP scheme for production domain', (t, done) => {
      corsOptions.origin('http://namlatic-hotel.vercel.app', (err, allow) => {
        assert.ok(err instanceof Error);
        assert.equal(err.statusCode, 403);
        assert.equal(allow, false);
        done();
      });
    });

    it('enforces credentials: true for secure cookie-based session transmission', () => {
      assert.equal(corsOptions.credentials, true);
    });

    it('allows standard HTTP REST methods including OPTIONS', () => {
      assert.deepEqual(corsOptions.methods, ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']);
    });

    it('includes required request headers in allowedHeaders', () => {
      const headers = corsOptions.allowedHeaders.map((h) => h.toLowerCase());
      assert.ok(headers.includes('content-type'));
      assert.ok(headers.includes('authorization'));
      assert.ok(headers.includes('x-requested-with'));
      assert.ok(headers.includes('accept'));
      assert.ok(headers.includes('x-vercel-proxy-secret'));
    });

    it('configures preflight cache maxAge (86400s) and optionsSuccessStatus (204)', () => {
      assert.equal(corsOptions.maxAge, 86400);
      assert.equal(corsOptions.optionsSuccessStatus, 204);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Express HTTP Server Integration & OPTIONS Preflight Tests
  // --------------------------------------------------------------------------
  describe('Express HTTP Request & Preflight (OPTIONS) Handling', () => {
    let app;
    let server;
    let serverUrl;

    before(async () => {
      app = express();

      // Mount CORS middleware with explicit allowlist
      app.use(cors(createCorsOptions(allowedOrigins)));

      // Test endpoints
      app.get('/api/test', (_req, res) => {
        res.status(200).json({ status: 'success', data: 'hello' });
      });

      app.post('/api/test', express.json(), (req, res) => {
        res.status(201).json({ status: 'created', received: req.body });
      });

      // Error handler
      app.use(errorHandler);

      server = http.createServer(app);
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      serverUrl = `http://127.0.0.1:${address.port}`;
    });

    after(async () => {
      if (server) {
        await new Promise((resolve) => server.close(resolve));
      }
    });

    it('serves GET request from allowed production origin with ACAO and credentials headers', async () => {
      const res = await fetch(`${serverUrl}/api/test`, {
        method: 'GET',
        headers: {
          Origin: 'https://namlatic-hotel.vercel.app',
        },
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), 'https://namlatic-hotel.vercel.app');
      assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
      assert.notEqual(res.headers.get('access-control-allow-origin'), '*');

      const body = await res.json();
      assert.equal(body.status, 'success');
    });

    it('serves GET request from localhost development origin with correct ACAO header', async () => {
      const res = await fetch(`${serverUrl}/api/test`, {
        method: 'GET',
        headers: {
          Origin: 'http://localhost:5173',
        },
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
      assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
    });

    it('serves GET request without Origin header (e.g. server-to-server or curl) successfully', async () => {
      const res = await fetch(`${serverUrl}/api/test`, {
        method: 'GET',
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'success');
    });

    it('handles OPTIONS preflight request from production origin, returning HTTP 204 with required headers', async () => {
      const res = await fetch(`${serverUrl}/api/test`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://namlatic-hotel.vercel.app',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, X-Requested-With, x-vercel-proxy-secret',
        },
      });

      assert.equal(res.status, 204);
      assert.equal(res.headers.get('access-control-allow-origin'), 'https://namlatic-hotel.vercel.app');
      assert.equal(res.headers.get('access-control-allow-credentials'), 'true');

      const allowMethods = res.headers.get('access-control-allow-methods') || '';
      assert.ok(allowMethods.includes('POST'));
      assert.ok(allowMethods.includes('OPTIONS'));

      const allowHeaders = (res.headers.get('access-control-allow-headers') || '').toLowerCase();
      assert.ok(allowHeaders.includes('content-type'));
      assert.ok(allowHeaders.includes('x-requested-with'));
      assert.ok(allowHeaders.includes('x-vercel-proxy-secret'));

      assert.equal(res.headers.get('access-control-max-age'), '86400');
    });

    it('handles OPTIONS preflight request from localhost development origin, returning HTTP 204', async () => {
      const res = await fetch(`${serverUrl}/api/test`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'PUT',
          'Access-Control-Request-Headers': 'Content-Type',
        },
      });

      assert.equal(res.status, 204);
      assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
      assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
    });

    it('rejects OPTIONS preflight from unauthorized origin with HTTP 403 and error payload', async () => {
      const res = await fetch(`${serverUrl}/api/test`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://unauthorized-attacker.com',
          'Access-Control-Request-Method': 'POST',
        },
      });

      assert.equal(res.status, 403);
      assert.equal(res.headers.get('access-control-allow-origin'), null);

      const body = await res.json();
      assert.equal(body.status, 'error');
      assert.equal(body.statusCode, 403);
      assert.match(body.message, /CORS policy violation: Origin "https:\/\/unauthorized-attacker\.com" is not allowed\./);
    });

    it('rejects POST request from unauthorized origin with HTTP 403 and never executes endpoint', async () => {
      const res = await fetch(`${serverUrl}/api/test`, {
        method: 'POST',
        headers: {
          Origin: 'https://evil-site.org',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ attack: true }),
      });

      assert.equal(res.status, 403);
      assert.equal(res.headers.get('access-control-allow-origin'), null);

      const body = await res.json();
      assert.equal(body.status, 'error');
      assert.equal(body.statusCode, 403);
      assert.match(body.message, /CORS policy violation: Origin "https:\/\/evil-site\.org" is not allowed\./);
    });
  });
});
