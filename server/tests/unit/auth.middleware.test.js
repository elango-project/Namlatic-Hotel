const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { requireAuth, NO_CACHE_VALUE } = require('../../src/middleware/auth.middleware');
const sessionService = require('../../src/services/session.service');
const env = require('../../src/config/env');
const { COOKIE_NAME, DEV_COOKIE_NAME } = require('../../src/utils/cookieHelper');

describe('Unit Tests: Session Authentication Middleware (Phase 5F-A2.2)', () => {
  function createMockRes() {
    return {
      statusCode: 200,
      headers: {},
      body: null,
      setHeader(name, value) {
        this.headers[name.toLowerCase()] = value;
      },
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

  it('injects private no-store Cache-Control header unconditionally on protected routes', async () => {
    const req = { headers: {} };
    const res = createMockRes();

    await requireAuth(req, res, () => {});

    assert.equal(res.headers['cache-control'], NO_CACHE_VALUE);
  });

  it('rejects requests missing session cookie with HTTP 401', async () => {
    let nextCalled = false;
    const req = { headers: {} };
    const res = createMockRes();

    await requireAuth(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.statusCode, 401);
    assert.equal(res.body.message.includes('authentication required'), true);
  });

  it('rejects requests with invalid or expired session tokens with HTTP 401', async () => {
    let nextCalled = false;
    const req = {
      headers: {
        cookie: `${COOKIE_NAME}=invalid_or_expired_token_value`,
      },
      ip: '127.0.0.1',
    };
    const res = createMockRes();

    // Mock validateSession to return null
    const originalValidate = sessionService.validateSession;
    sessionService.validateSession = async () => null;

    try {
      await requireAuth(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 401);
      assert.equal(res.body.message.includes('session expired or invalid'), true);
    } finally {
      sessionService.validateSession = originalValidate;
    }
  });

  it('attaches user profile and session ID to req and calls next on valid session', async () => {
    let nextCalled = false;
    const req = {
      headers: {
        cookie: `${COOKIE_NAME}=valid_session_token_1234567890`,
        'user-agent': 'Mozilla/5.0 TestBrowser',
      },
      ip: '127.0.0.1',
    };
    const res = createMockRes();

    const mockSessionData = {
      sessionId: 42,
      user: {
        id: 1,
        email: 'owner@namlatic.com',
        role: 'owner',
      },
    };

    const originalValidate = sessionService.validateSession;
    sessionService.validateSession = async () => mockSessionData;

    try {
      await requireAuth(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(req.sessionId, 42);
      assert.deepEqual(req.user, mockSessionData.user);
      assert.equal(req.rawSessionToken, 'valid_session_token_1234567890');
      assert.equal(res.headers['cache-control'], NO_CACHE_VALUE);
    } finally {
      sessionService.validateSession = originalValidate;
    }
  });

  it('strictly rejects plain-HTTP dev cookie in production mode', async () => {
    const originalEnv = env.nodeEnv;
    env.nodeEnv = 'production';

    const req = {
      headers: {
        cookie: `${DEV_COOKIE_NAME}=token_in_dev_cookie`,
      },
      ip: '127.0.0.1',
    };
    const res = createMockRes();

    try {
      let nextCalled = false;
      await requireAuth(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 401);
      assert.equal(res.body.message.includes('authentication required'), true);
    } finally {
      env.nodeEnv = originalEnv;
    }
  });

  it('accepts plain-HTTP dev cookie in development mode', async () => {
    const originalEnv = env.nodeEnv;
    env.nodeEnv = 'development';

    const req = {
      headers: {
        cookie: `${DEV_COOKIE_NAME}=valid_dev_token`,
      },
      ip: '127.0.0.1',
    };
    const res = createMockRes();

    const originalValidate = sessionService.validateSession;
    sessionService.validateSession = async (token) => {
      assert.equal(token, 'valid_dev_token');
      return { sessionId: 10, user: { id: 1, email: 'dev@namlatic.com', role: 'owner' } };
    };

    try {
      let nextCalled = false;
      await requireAuth(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(req.sessionId, 10);
      assert.equal(req.user.email, 'dev@namlatic.com');
    } finally {
      sessionService.validateSession = originalValidate;
      env.nodeEnv = originalEnv;
    }
  });
});
