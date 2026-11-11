const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { getTestPool, closeTestPool } = require('../helpers/testDb');
const { setPool, resetPool } = require('../../src/config/db');
const app = require('../../src/app');
const env = require('../../src/config/env');
const sessionService = require('../../src/services/session.service');
const { hashPassword } = require('../../src/services/password.service');
const { COOKIE_NAME, parseCookies } = require('../../src/utils/cookieHelper');
const { defaultLoginThrottler } = require('../../src/services/loginThrottler.service');
const { defaultArgonSemaphore } = require('../../src/utils/argonSemaphore');

const PORT = 5002; // Dedicated port for auth API test isolation
const BASE_URL = `http://localhost:${PORT}/api`;
const PROXY_SECRET = env.backendProxySecret || 'test_proxy_secret_at_least_32_chars_long_12345';
const CORS_ORIGIN = env.corsOrigins[0];

describe('Integration Tests: Owner Authentication, Sessions & Route Protection (Phase 5F-A2.2)', () => {
  let testPool;
  let server;
  let testOwnerUser = null;
  const TEST_PASSWORD = 'CorrectHorseBatteryStaple123!';
  const createdUserIds = [];

  before(async () => {
    testPool = getTestPool();
    setPool(testPool);

    // Clean up any stale test owners
    await testPool.query("DELETE FROM users WHERE email LIKE 'authtest-%@namlatic.com'");

    // Create a known test owner user with Argon2id hash
    const ownerEmail = `authtest-${Date.now()}@namlatic.com`;
    const passwordHash = await hashPassword(TEST_PASSWORD);

    const insertResult = await testPool.query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES ($1, $2, 'owner', 'active')
       RETURNING id, email, role, status`,
      [ownerEmail, passwordHash]
    );

    testOwnerUser = insertResult.rows[0];
    createdUserIds.push(testOwnerUser.id);

    // Start isolated test server
    await new Promise((resolve) => {
      server = app.listen(PORT, resolve);
    });
  });

  after(async () => {
    // Teardown created users and cascade sessions
    if (createdUserIds.length > 0) {
      await testPool.query('DELETE FROM users WHERE id = ANY($1::bigint[]);', [createdUserIds]);
    }

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }

    resetPool();
    await closeTestPool();
  });

  beforeEach(() => {
    defaultLoginThrottler.reset();
  });

  // Helper for requests
  function makeHeaders({ secret = PROXY_SECRET, token = null, csrf = true, origin = CORS_ORIGIN, extra = {} } = {}) {
    const headers = { ...extra };
    if (secret) headers['x-vercel-proxy-secret'] = secret;
    if (token) headers['Cookie'] = `${COOKIE_NAME}=${token}`;
    if (csrf) headers['X-Requested-With'] = 'XMLHttpRequest';
    if (origin) headers['Origin'] = origin;
    return headers;
  }

  // ==========================================================================
  // 1. Health Probe Exemptions (No Secret, No Auth, No CSRF)
  // ==========================================================================
  describe('1. Health & Readiness Probe Reliability', () => {
    it('GET /api/health succeeds (HTTP 200) without proxy secret, session cookie, or CSRF headers', async () => {
      const res = await fetch(`${BASE_URL}/health`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'ok');
    });

    it('GET /api/ready succeeds (HTTP 200) without proxy secret, session cookie, or CSRF headers', async () => {
      const res = await fetch(`${BASE_URL}/ready`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'ready');
      assert.equal(data.database.connected, true);
    });
  });

  // ==========================================================================
  // 2. Reverse Proxy Secret Verification
  // ==========================================================================
  describe('2. Reverse Proxy Secret Verification', () => {
    it('rejects POST /api/auth/login when x-vercel-proxy-secret header is missing with HTTP 403', async () => {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: makeHeaders({ secret: null }),
        body: JSON.stringify({ email: testOwnerUser.email, password: TEST_PASSWORD }),
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.status, 'error');
      assert.equal(data.statusCode, 403);
      assert.match(data.message, /proxy secret/i);
    });

    it('rejects POST /api/auth/login with invalid proxy secret with HTTP 403', async () => {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: makeHeaders({ secret: 'attacker_invalid_secret_token_at_least_32_chars' }),
        body: JSON.stringify({ email: testOwnerUser.email, password: TEST_PASSWORD }),
      });
      assert.equal(res.status, 403);
    });

    it('permits POST /api/auth/login with valid proxy secret', async () => {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: makeHeaders({
          extra: { 'Content-Type': 'application/json' },
        }),
        body: JSON.stringify({ email: testOwnerUser.email, password: TEST_PASSWORD }),
      });
      assert.equal(res.status, 200);
    });
  });

  // ==========================================================================
  // 3. Tokenless CSRF Defense
  // ==========================================================================
  describe('3. Tokenless CSRF Defense on State-Changing Endpoints', () => {
    it('rejects state-changing POST missing X-Requested-With header with HTTP 403', async () => {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: makeHeaders({ csrf: false, extra: { 'Content-Type': 'application/json' } }),
        body: JSON.stringify({ email: testOwnerUser.email, password: TEST_PASSWORD }),
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.match(data.message, /X-Requested-With/i);
    });

    it('rejects state-changing POST with Origin: null with HTTP 403', async () => {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: makeHeaders({ origin: 'null', extra: { 'Content-Type': 'application/json' } }),
        body: JSON.stringify({ email: testOwnerUser.email, password: TEST_PASSWORD }),
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.match(data.message, /null|Origin/i);
    });

    it('rejects state-changing POST with untrusted Origin with HTTP 403', async () => {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: makeHeaders({ origin: 'https://evil-hacker.com', extra: { 'Content-Type': 'application/json' } }),
        body: JSON.stringify({ email: testOwnerUser.email, password: TEST_PASSWORD }),
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.match(data.message, /Origin|untrusted/i);
    });

    it('rejects state-changing POST with Sec-Fetch-Site: cross-site with HTTP 403', async () => {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: makeHeaders({
          extra: {
            'Content-Type': 'application/json',
            'Sec-Fetch-Site': 'cross-site',
          },
        }),
        body: JSON.stringify({ email: testOwnerUser.email, password: TEST_PASSWORD }),
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.match(data.message, /cross-site/i);
    });
  });

  // ==========================================================================
  // 4. Owner Login Endpoint (POST /api/auth/login)
  // ==========================================================================
  describe('4. Owner Login Endpoint (POST /api/auth/login)', () => {
    it('rejects missing email or password with HTTP 400', async () => {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: makeHeaders({ extra: { 'Content-Type': 'application/json' } }),
        body: JSON.stringify({ email: '' }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.status, 'error');
      assert.equal(data.statusCode, 400);
    });

    it('rejects invalid email format with HTTP 400', async () => {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: makeHeaders({ extra: { 'Content-Type': 'application/json' } }),
        body: JSON.stringify({ email: 'not-an-email', password: 'Password12345!' }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.message, /Invalid email address format/i);
    });

    it('returns generic HTTP 401 for non-existent owner email', async () => {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: makeHeaders({ extra: { 'Content-Type': 'application/json' } }),
        body: JSON.stringify({ email: 'unknown-owner@namlatic.com', password: 'Password12345!' }),
      });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.message, 'Invalid email or password.');
    });

    it('returns generic HTTP 401 for incorrect password on existing owner', async () => {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: makeHeaders({ extra: { 'Content-Type': 'application/json' } }),
        body: JSON.stringify({ email: testOwnerUser.email, password: 'WrongPassword12345!' }),
      });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.message, 'Invalid email or password.');
    });

    it('returns generic HTTP 401 when owner account is suspended or disabled', async () => {
      // Temporarily mark owner as suspended
      await testPool.query("UPDATE users SET status = 'suspended' WHERE id = $1", [testOwnerUser.id]);

      try {
        const res = await fetch(`${BASE_URL}/auth/login`, {
          method: 'POST',
          headers: makeHeaders({ extra: { 'Content-Type': 'application/json' } }),
          body: JSON.stringify({ email: testOwnerUser.email, password: TEST_PASSWORD }),
        });
        assert.equal(res.status, 401);
        const data = await res.json();
        assert.equal(data.message, 'Invalid email or password.');
      } finally {
        await testPool.query("UPDATE users SET status = 'active' WHERE id = $1", [testOwnerUser.id]);
      }
    });

    it('successfully logs in with valid credentials, sets __Host- cookie, and returns safe user profile', async () => {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: makeHeaders({ extra: { 'Content-Type': 'application/json' } }),
        body: JSON.stringify({ email: testOwnerUser.email, password: TEST_PASSWORD }),
      });

      assert.equal(res.status, 200);

      // Verify Set-Cookie header
      const setCookieHeader = res.headers.get('set-cookie');
      assert.equal(Boolean(setCookieHeader), true);
      assert.equal(setCookieHeader.includes(`${COOKIE_NAME}=`), true);
      assert.equal(setCookieHeader.includes('Path=/'), true);
      assert.equal(setCookieHeader.includes('HttpOnly'), true);
      assert.equal(setCookieHeader.includes('SameSite=Lax'), true);

      // Verify response body contains safe fields only
      const body = await res.json();
      assert.equal(body.status, 'success');
      assert.equal(body.data.user.email, testOwnerUser.email);
      assert.equal(body.data.user.role, 'owner');
      assert.equal(body.data.user.password_hash, undefined);
      assert.equal(body.data.user.password, undefined);

      // Verify Cache-Control header
      assert.equal(res.headers.get('cache-control'), 'private, no-store, no-cache, max-age=0, must-revalidate');
    });

    it('triggers HTTP 429 when IP exceeds 5 failed login attempts in 15-minute window', async () => {
      // Execute 5 consecutive failed login attempts from this client
      for (let i = 0; i < 5; i++) {
        await fetch(`${BASE_URL}/auth/login`, {
          method: 'POST',
          headers: makeHeaders({ extra: { 'Content-Type': 'application/json' } }),
          body: JSON.stringify({ email: testOwnerUser.email, password: 'WrongPassword!' }),
        });
      }

      // 6th attempt must be rejected with HTTP 429 Too Many Requests
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: makeHeaders({ extra: { 'Content-Type': 'application/json' } }),
        body: JSON.stringify({ email: testOwnerUser.email, password: 'WrongPassword!' }),
      });

      assert.equal(res.status, 429);
      assert.equal(Boolean(res.headers.get('retry-after')), true);
      const data = await res.json();
      assert.match(data.message, /Too many failed login attempts/i);
    });
  });

  // ==========================================================================
  // 5. Current Owner Inspection (GET /api/auth/me) & Session Lifecycles
  // ==========================================================================
  describe('5. Session Inspection (GET /api/auth/me) & Lifecycles', () => {
    let sessionToken = null;

    beforeEach(async () => {
      // Create fresh valid session for testOwnerUser
      const session = await sessionService.createSession(
        { userId: testOwnerUser.id, ipAddress: '127.0.0.1', userAgent: 'TestRunner' },
        testPool
      );
      sessionToken = session.rawToken;
    });

    it('rejects GET /api/auth/me without session cookie with HTTP 401', async () => {
      const res = await fetch(`${BASE_URL}/auth/me`, {
        headers: makeHeaders({ token: null }),
      });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.match(data.message, /authentication required/i);
    });

    it('rejects GET /api/auth/me with invalid session token with HTTP 401', async () => {
      const res = await fetch(`${BASE_URL}/auth/me`, {
        headers: makeHeaders({ token: 'bogus_invalid_hex_token_that_does_not_exist_in_db_12345678' }),
      });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.match(data.message, /session expired or invalid/i);
    });

    it('returns owner profile with HTTP 200 for valid session', async () => {
      const res = await fetch(`${BASE_URL}/auth/me`, {
        headers: makeHeaders({ token: sessionToken }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'success');
      assert.equal(data.data.user.email, testOwnerUser.email);
      assert.equal(data.data.user.role, 'owner');
      assert.equal(res.headers.get('cache-control'), 'private, no-store, no-cache, max-age=0, must-revalidate');
    });

    it('rejects session when sliding idle timeout has expired (idle_expires_at in past) with HTTP 401', async () => {
      const tokenHash = sessionService.hashSessionToken(sessionToken);
      // Set created_at to 3 hours ago, idle_expires_at to 1 hour ago (satisfies chk_sessions_idle_after_created)
      await testPool.query(
        "UPDATE sessions SET created_at = NOW() - INTERVAL '3 hours', idle_expires_at = NOW() - INTERVAL '1 hour', expires_at = NOW() + INTERVAL '6 days' WHERE token_hash = $1",
        [tokenHash]
      );

      const res = await fetch(`${BASE_URL}/auth/me`, {
        headers: makeHeaders({ token: sessionToken }),
      });
      assert.equal(res.status, 401);
    });

    it('rejects session when absolute hard lifetime has expired (expires_at in past) with HTTP 401', async () => {
      const tokenHash = sessionService.hashSessionToken(sessionToken);
      // Set created_at to 8 days ago, expires_at to 1 day ago (satisfies chk_sessions_expires_after_created)
      await testPool.query(
        "UPDATE sessions SET created_at = NOW() - INTERVAL '8 days', expires_at = NOW() - INTERVAL '1 day', idle_expires_at = NOW() - INTERVAL '7 days' WHERE token_hash = $1",
        [tokenHash]
      );

      const res = await fetch(`${BASE_URL}/auth/me`, {
        headers: makeHeaders({ token: sessionToken }),
      });
      assert.equal(res.status, 401);
    });

    it('refreshes idle_expires_at when at least 5 minutes have elapsed since last_active_at', async () => {
      const tokenHash = sessionService.hashSessionToken(sessionToken);
      // Set last_active_at to 10 minutes ago, idle_expires_at to 1 hour in future
      await testPool.query(
        "UPDATE sessions SET last_active_at = NOW() - INTERVAL '10 minutes', idle_expires_at = NOW() + INTERVAL '1 hour' WHERE token_hash = $1",
        [tokenHash]
      );

      const res = await fetch(`${BASE_URL}/auth/me`, {
        headers: makeHeaders({ token: sessionToken }),
      });
      assert.equal(res.status, 200);

      // Query database to verify idle_expires_at was refreshed
      const row = (await testPool.query('SELECT last_active_at, idle_expires_at FROM sessions WHERE token_hash = $1', [tokenHash])).rows[0];
      const now = Date.now();
      const updatedLastActive = new Date(row.last_active_at).getTime();
      const updatedIdle = new Date(row.idle_expires_at).getTime();

      // last_active_at should be close to now (within 5 seconds)
      assert.equal(Math.abs(now - updatedLastActive) < 5000, true);
      // idle_expires_at should be roughly now + 2 hours (within 5 seconds)
      const expectedIdle = now + 2 * 60 * 60 * 1000;
      assert.equal(Math.abs(expectedIdle - updatedIdle) < 10000, true);
    });
  });

  // ==========================================================================
  // 6. Owner Logout Endpoint (POST /api/auth/logout)
  // ==========================================================================
  describe('6. Owner Logout Endpoint (POST /api/auth/logout)', () => {
    it('revokes session in PostgreSQL, clears cookie in browser, and subsequent requests fail', async () => {
      // 1. Create active session
      const session = await sessionService.createSession(
        { userId: testOwnerUser.id, ipAddress: '127.0.0.1' },
        testPool
      );
      const rawToken = session.rawToken;
      const tokenHash = sessionService.hashSessionToken(rawToken);

      // Verify session is active
      const meBefore = await fetch(`${BASE_URL}/auth/me`, {
        headers: makeHeaders({ token: rawToken }),
      });
      assert.equal(meBefore.status, 200);

      // 2. Call logout
      const logoutRes = await fetch(`${BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: makeHeaders({ token: rawToken }),
      });
      assert.equal(logoutRes.status, 200);

      // Verify Set-Cookie clears cookie
      const setCookie = logoutRes.headers.get('set-cookie');
      assert.equal(setCookie.includes('Max-Age=0'), true);
      assert.equal(setCookie.includes('Expires='), true);

      // 3. Verify session in DB is marked revoked_at IS NOT NULL
      const dbRow = (await testPool.query('SELECT revoked_at FROM sessions WHERE token_hash = $1', [tokenHash])).rows[0];
      assert.equal(Boolean(dbRow.revoked_at), true);

      // 4. Subsequent /api/auth/me returns HTTP 401
      const meAfter = await fetch(`${BASE_URL}/auth/me`, {
        headers: makeHeaders({ token: rawToken }),
      });
      assert.equal(meAfter.status, 401);
    });

    it('idempotently handles logout even when session cookie is missing or already revoked', async () => {
      const logoutRes = await fetch(`${BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: makeHeaders({ token: null }),
      });
      assert.equal(logoutRes.status, 200);
      const data = await logoutRes.json();
      assert.equal(data.status, 'success');
      assert.equal(logoutRes.headers.get('set-cookie').includes('Max-Age=0'), true);
    });
  });

  // ==========================================================================
  // 7. Complete Private Hotel Route Protection Matrix
  // ==========================================================================
  describe('7. Route Protection: All Hotel Endpoints Require Authentication & Proxy Secret', () => {
    let validSessionToken = null;

    before(async () => {
      const session = await sessionService.createSession(
        { userId: testOwnerUser.id, ipAddress: '127.0.0.1' },
        testPool
      );
      validSessionToken = session.rawToken;
    });

    const hotelEndpoints = [
      { method: 'GET', path: '/hotels' },
      { method: 'GET', path: '/hotels/stats' },
      { method: 'GET', path: '/hotels/1' },
      { method: 'POST', path: '/hotels', body: { title: 'Test Hotel' } },
      { method: 'PUT', path: '/hotels/1', body: { title: 'Updated Hotel' } },
      { method: 'DELETE', path: '/hotels/1' },
    ];

    for (const ep of hotelEndpoints) {
      it(`blocks unauthenticated ${ep.method} /api${ep.path} with HTTP 401 when session cookie is missing`, async () => {
        const res = await fetch(`${BASE_URL}${ep.path}`, {
          method: ep.method,
          headers: makeHeaders({ token: null, extra: { 'Content-Type': 'application/json' } }),
          body: ep.body ? JSON.stringify(ep.body) : undefined,
        });
        assert.equal(res.status, 401);
        const data = await res.json();
        assert.equal(data.status, 'error');
        assert.equal(data.statusCode, 401);
      });

      it(`blocks direct ${ep.method} /api${ep.path} with HTTP 403 when x-vercel-proxy-secret is missing`, async () => {
        const res = await fetch(`${BASE_URL}${ep.path}`, {
          method: ep.method,
          headers: makeHeaders({ secret: null, token: validSessionToken, extra: { 'Content-Type': 'application/json' } }),
          body: ep.body ? JSON.stringify(ep.body) : undefined,
        });
        assert.equal(res.status, 403);
        const data = await res.json();
        assert.equal(data.status, 'error');
        assert.equal(data.statusCode, 403);
      });
    }

    it('allows GET /api/hotels with valid proxy secret and valid session cookie', async () => {
      const res = await fetch(`${BASE_URL}/hotels`, {
        method: 'GET',
        headers: makeHeaders({ token: validSessionToken }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'success');
      assert.equal(Array.isArray(data.data), true);
    });

    it('allows GET /api/hotels/stats with valid proxy secret and valid session cookie', async () => {
      const res = await fetch(`${BASE_URL}/hotels/stats`, {
        method: 'GET',
        headers: makeHeaders({ token: validSessionToken }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'success');
      assert.equal(typeof data.data.total_properties, 'number');
    });
  });
});
