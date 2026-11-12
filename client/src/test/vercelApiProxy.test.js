import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import {
  proxyHandler,
  validateBackendOrigin,
  resolveTargetPath,
  buildForwardHeaders,
  config,
} from '../../api/proxyHandler.js';

describe('Vercel Serverless API Proxy (client/api/)', () => {
  let backendServer;
  let backendUrl;
  let proxyServer;
  let proxyUrl;

  const TEST_SECRET = 'test_backend_proxy_secret_at_least_32_chars_12345';
  let lastBackendRequest = null;

  beforeAll(async () => {
    // 1. Start mock Render backend server
    backendServer = http.createServer((req, res) => {
      let bodyChunks = [];
      req.on('data', (chunk) => bodyChunks.push(chunk));
      req.on('end', () => {
        const rawBody = Buffer.concat(bodyChunks);
        lastBackendRequest = {
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: rawBody.toString('utf-8'),
          rawBody,
        };

        // Route handling
        if (req.url === '/api/health') {
          res.writeHead(200, {
            'content-type': 'application/json',
            'cache-control': 'private, no-store',
          });
          res.end(JSON.stringify({ status: 'ok', environment: 'production' }));
          return;
        }

        if (req.url === '/api/ready') {
          res.writeHead(200, {
            'content-type': 'application/json',
            'cache-control': 'private, no-store',
          });
          res.end(JSON.stringify({ status: 'ready', database: 'connected' }));
          return;
        }

        if (req.url.startsWith('/api/hotels')) {
          if (req.method === 'GET') {
            res.writeHead(200, {
              'content-type': 'application/json',
              'cache-control': 'private, no-store',
            });
            res.end(
              JSON.stringify({
                data: [{ id: 101, title: 'Grand Hotel' }],
                pagination: { total: 1, limit: 10, offset: 0 },
              })
            );
            return;
          }

          if (req.method === 'POST') {
            // Check if multipart or JSON
            const isMultipart = (req.headers['content-type'] || '').includes('multipart/form-data');
            res.writeHead(201, {
              'content-type': 'application/json',
              'cache-control': 'private, no-store',
            });
            res.end(
              JSON.stringify({
                status: 'success',
                isMultipart,
                receivedBytes: rawBody.length,
                hotel: { id: 102, title: 'Created Hotel' },
              })
            );
            return;
          }

          if (req.method === 'PUT') {
            res.writeHead(200, {
              'content-type': 'application/json',
              'cache-control': 'private, no-store',
            });
            res.end(
              JSON.stringify({
                status: 'success',
                hotel: { id: 101, title: 'Updated Hotel' },
              })
            );
            return;
          }

          if (req.method === 'DELETE') {
            res.writeHead(200, {
              'content-type': 'application/json',
              'cache-control': 'private, no-store',
            });
            res.end(
              JSON.stringify({
                status: 'success',
                message: 'Hotel deleted successfully',
              })
            );
            return;
          }
        }

        if (req.url === '/api/auth/login' && req.method === 'POST') {
          res.writeHead(200, {
            'content-type': 'application/json',
            'cache-control': 'private, no-store',
            'set-cookie': [
              '__Host-auth_token=sess_abc123xyz456; Path=/; Secure; HttpOnly; SameSite=Lax',
            ],
          });
          res.end(
            JSON.stringify({
              user: { id: 1, email: 'owner@namlatic.com' },
            })
          );
          return;
        }

        if (req.url === '/api/simulated-backend-error') {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'Database query failed' }));
          return;
        }

        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
      });
    });

    await new Promise((resolve) => backendServer.listen(0, '127.0.0.1', resolve));
    backendUrl = `http://127.0.0.1:${backendServer.address().port}`;

    // 2. Start mock Vercel runtime server invoking proxyHandler
    proxyServer = http.createServer((req, res) => {
      proxyHandler(req, res);
    });

    await new Promise((resolve) => proxyServer.listen(0, '127.0.0.1', resolve));
    proxyUrl = `http://127.0.0.1:${proxyServer.address().port}`;
  });

  afterAll(async () => {
    if (proxyServer) await new Promise((r) => proxyServer.close(r));
    if (backendServer) await new Promise((r) => backendServer.close(r));
  });

  beforeEach(() => {
    process.env.BACKEND_ORIGIN = backendUrl;
    process.env.BACKEND_PROXY_SECRET = TEST_SECRET;
    process.env.NODE_ENV = 'development';
    lastBackendRequest = null;
  });

  // --------------------------------------------------------------------------
  // 1. Vercel Function Configuration Verification
  // --------------------------------------------------------------------------
  describe('Vercel Function Configuration', () => {
    it('disables automatic body parsing to preserve raw multipart streaming', () => {
      expect(config.api?.bodyParser).toBe(false);
      expect(config.maxDuration).toBe(60);
    });
  });

  // --------------------------------------------------------------------------
  // 2. BACKEND_ORIGIN & Target URL Validation
  // --------------------------------------------------------------------------
  describe('validateBackendOrigin & resolveTargetPath', () => {
    it('accepts valid HTTPS origin in production mode', () => {
      const origin = validateBackendOrigin(
        'https://namlatic-hotel-backend.onrender.com',
        'production'
      );
      expect(origin).toBe('https://namlatic-hotel-backend.onrender.com');
    });

    it('normalizes origin by stripping path components and trailing slashes', () => {
      const origin = validateBackendOrigin(
        'https://namlatic-hotel-backend.onrender.com/api/',
        'production'
      );
      expect(origin).toBe('https://namlatic-hotel-backend.onrender.com');
    });

    it('rejects HTTP origin in production mode (enforces HTTPS)', () => {
      expect(() => {
        validateBackendOrigin('http://namlatic-hotel-backend.onrender.com', 'production');
      }).toThrow(/BACKEND_ORIGIN must use the "https:" protocol/);
    });

    it('accepts HTTP origin in development or test mode', () => {
      const origin = validateBackendOrigin('http://127.0.0.1:5000', 'development');
      expect(origin).toBe('http://127.0.0.1:5000');
    });

    it('fails closed when BACKEND_ORIGIN is missing or empty', () => {
      expect(() => validateBackendOrigin('', 'production')).toThrow(/required and cannot be empty/);
      expect(() => validateBackendOrigin(null, 'production')).toThrow(/required and cannot be empty/);
      const original = process.env.BACKEND_ORIGIN;
      delete process.env.BACKEND_ORIGIN;
      expect(() => validateBackendOrigin(undefined, 'production')).toThrow(
        /required and cannot be empty/
      );
      process.env.BACKEND_ORIGIN = original;
    });

    it('rejects malformed or non-URL origin strings', () => {
      expect(() => validateBackendOrigin('not-a-valid-url', 'development')).toThrow(
        /valid absolute URL/
      );
    });

    it('rejects origins with embedded credentials (username/password)', () => {
      expect(() =>
        validateBackendOrigin('https://user:pass@namlatic-hotel.onrender.com', 'production')
      ).toThrow(/embedded credentials/);
    });

    it('resolveTargetPath normalizes paths and preserves query strings', () => {
      expect(resolveTargetPath('/api/health')).toBe('/api/health');
      expect(resolveTargetPath('/api/hotels?title=grand&min=100')).toBe(
        '/api/hotels?title=grand&min=100'
      );
      expect(resolveTargetPath('/health')).toBe('/api/health');
      expect(resolveTargetPath('/hotels/42')).toBe('/api/hotels/42');
      expect(resolveTargetPath('')).toBe('/api');
      expect(resolveTargetPath(null)).toBe('/api');
      expect(resolveTargetPath('/', { path: ['health'] })).toBe('/api/health');
      expect(resolveTargetPath('/', { path: ['hotels', '99'] })).toBe('/api/hotels/99');
      expect(resolveTargetPath('/api/index.js?__path=health')).toBe('/api/health');
      expect(resolveTargetPath('/api/index.js?__path=hotels&title=grand')).toBe(
        '/api/hotels?title=grand'
      );
      expect(resolveTargetPath('/api/index.js')).toBe('/api');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Header Sanitation & Proxy Secret Injection
  // --------------------------------------------------------------------------
  describe('buildForwardHeaders', () => {
    it('injects x-vercel-proxy-secret and sets upstream host header', () => {
      const targetUrl = new URL('https://namlatic-hotel-backend.onrender.com/api/health');
      const headers = buildForwardHeaders(
        {
          accept: 'application/json',
          'user-agent': 'Mozilla/5.0',
          'x-vercel-proxy-secret': 'client_attempted_spoof',
        },
        targetUrl,
        TEST_SECRET
      );

      expect(headers['x-vercel-proxy-secret']).toBe(TEST_SECRET);
      expect(headers['host']).toBe('namlatic-hotel-backend.onrender.com');
      expect(headers['accept']).toBe('application/json');
      expect(headers['x-forwarded-proto']).toBe('https');
    });

    it('strips RFC hop-by-hop headers', () => {
      const targetUrl = new URL('https://namlatic-hotel-backend.onrender.com/api/health');
      const headers = buildForwardHeaders(
        {
          connection: 'keep-alive',
          'keep-alive': 'timeout=5',
          upgrade: 'websocket',
          'transfer-encoding': 'chunked',
          cookie: 'auth_token=xyz',
        },
        targetUrl,
        TEST_SECRET
      );

      expect(headers.connection).toBeUndefined();
      expect(headers['keep-alive']).toBeUndefined();
      expect(headers.upgrade).toBeUndefined();
      expect(headers['transfer-encoding']).toBeUndefined();
      expect(headers.cookie).toBe('auth_token=xyz');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Live Forwarding Integration Tests
  // --------------------------------------------------------------------------
  describe('Live Request Proxying', () => {
    it('successfully forwards GET /api/health and injects proxy secret', async () => {
      const res = await fetch(`${proxyUrl}/api/health`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({ status: 'ok', environment: 'production' });

      // Verify backend received the request with proxy secret and no-cache
      expect(lastBackendRequest).not.toBeNull();
      expect(lastBackendRequest.method).toBe('GET');
      expect(lastBackendRequest.url).toBe('/api/health');
      expect(lastBackendRequest.headers['x-vercel-proxy-secret']).toBe(TEST_SECRET);
      expect(res.headers.get('cache-control')).toContain('no-store');
    });

    it('successfully forwards GET /api/ready probe', async () => {
      const res = await fetch(`${proxyUrl}/api/ready`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({ status: 'ready', database: 'connected' });
      expect(lastBackendRequest.headers['x-vercel-proxy-secret']).toBe(TEST_SECRET);
    });

    it('successfully forwards GET /api/hotels with query parameters intact', async () => {
      const res = await fetch(`${proxyUrl}/api/hotels?title=grand&minPrice=100&offset=0`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data[0].title).toBe('Grand Hotel');
      expect(lastBackendRequest.url).toBe('/api/hotels?title=grand&minPrice=100&offset=0');
      expect(lastBackendRequest.headers['x-vercel-proxy-secret']).toBe(TEST_SECRET);
    });

    it('successfully forwards POST /api/auth/login and preserves Set-Cookie headers', async () => {
      const res = await fetch(`${proxyUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-requested-with': 'XMLHttpRequest',
        },
        body: JSON.stringify({ email: 'owner@namlatic.com', password: 'secret_password_123' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.user.email).toBe('owner@namlatic.com');

      // Verify Set-Cookie header is preserved intact for browser session storage
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain('__Host-auth_token=sess_abc123xyz456');
      expect(setCookie).toContain('HttpOnly');

      expect(lastBackendRequest.method).toBe('POST');
      expect(lastBackendRequest.headers['x-requested-with']).toBe('XMLHttpRequest');
      expect(JSON.parse(lastBackendRequest.body)).toEqual({
        email: 'owner@namlatic.com',
        password: 'secret_password_123',
      });
    });

    it('successfully forwards PUT /api/hotels/:id with body', async () => {
      const res = await fetch(`${proxyUrl}/api/hotels/101`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'x-requested-with': 'XMLHttpRequest',
        },
        body: JSON.stringify({ title: 'Updated Luxury Resort' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.hotel.title).toBe('Updated Hotel');
      expect(lastBackendRequest.method).toBe('PUT');
      expect(lastBackendRequest.url).toBe('/api/hotels/101');
    });

    it('successfully forwards DELETE /api/hotels/:id with authentication cookie', async () => {
      const res = await fetch(`${proxyUrl}/api/hotels/101`, {
        method: 'DELETE',
        headers: {
          cookie: '__Host-auth_token=sess_abc123xyz456',
          'x-requested-with': 'XMLHttpRequest',
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.message).toBe('Hotel deleted successfully');
      expect(lastBackendRequest.method).toBe('DELETE');
      expect(lastBackendRequest.headers['cookie']).toBe('__Host-auth_token=sess_abc123xyz456');
    });

    it('successfully streams multipart/form-data upload without body consumption or corruption', async () => {
      const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
      const multipartBody = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="title"',
        '',
        'Beachfront Paradise Villa',
        `--${boundary}`,
        'Content-Disposition: form-data; name="image"; filename="photo.jpg"',
        'Content-Type: image/jpeg',
        '',
        '\xFF\xD8\xFF\xE0\x00\x10JFIF', // Fake JPEG header
        `--${boundary}--`,
        '',
      ].join('\r\n');

      const res = await fetch(`${proxyUrl}/api/hotels`, {
        method: 'POST',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
          'x-requested-with': 'XMLHttpRequest',
          cookie: '__Host-auth_token=sess_abc123xyz456',
        },
        body: multipartBody,
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.status).toBe('success');
      expect(json.isMultipart).toBe(true);

      // Verify raw bytes received by backend match exactly
      expect(lastBackendRequest.headers['content-type']).toContain(boundary);
      expect(lastBackendRequest.body).toContain('Beachfront Paradise Villa');
      expect(lastBackendRequest.body).toContain('photo.jpg');
    });
  });

  // --------------------------------------------------------------------------
  // 5. Error Resilience & Boundary Conditions
  // --------------------------------------------------------------------------
  describe('Error Resilience & Boundary Conditions', () => {
    it('returns HTTP 500 when BACKEND_PROXY_SECRET is missing', async () => {
      process.env.BACKEND_PROXY_SECRET = '';

      const res = await fetch(`${proxyUrl}/api/health`);
      expect(res.status).toBe(500);

      const json = await res.json();
      expect(json.statusCode).toBe(500);
      expect(json.message).toContain('BACKEND_PROXY_SECRET is not configured');
    });

    it('returns HTTP 500 when BACKEND_ORIGIN is invalid', async () => {
      process.env.BACKEND_ORIGIN = 'not-a-valid-origin';

      const res = await fetch(`${proxyUrl}/api/health`);
      expect(res.status).toBe(500);

      const json = await res.json();
      expect(json.statusCode).toBe(500);
      expect(json.message).toContain('valid absolute URL');
    });

    it('returns HTTP 502 Bad Gateway when backend is unreachable or offline', async () => {
      // Point to a closed port on loopback
      process.env.BACKEND_ORIGIN = 'http://127.0.0.1:1';

      const res = await fetch(`${proxyUrl}/api/health`);
      expect(res.status).toBe(502);

      const json = await res.json();
      expect(json.statusCode).toBe(502);
      expect(json.message).toContain('Backend service unavailable');
    });

    it('forwards upstream backend errors (e.g. HTTP 500) with response body intact', async () => {
      const res = await fetch(`${proxyUrl}/api/simulated-backend-error`);
      expect(res.status).toBe(500);

      const json = await res.json();
      expect(json.error).toBe('Database query failed');
    });
  });
});
