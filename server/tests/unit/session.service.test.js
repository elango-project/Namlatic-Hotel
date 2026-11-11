const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  ABSOLUTE_LIFETIME_MS,
  IDLE_TIMEOUT_MS,
  REFRESH_THROTTLE_MS,
  hashSessionToken,
  generateRawToken,
  validateSession,
  revokeSession,
  revokeAllUserSessions,
} = require('../../src/services/session.service');

describe('Unit Tests: Session Service Logic & Token Hashing (Phase 5F-A2.2)', () => {
  describe('Constants & Security Lifecycles', () => {
    it('enforces 7-day hard absolute lifetime', () => {
      assert.equal(ABSOLUTE_LIFETIME_MS, 7 * 24 * 60 * 60 * 1000);
    });

    it('enforces 2-hour sliding idle timeout', () => {
      assert.equal(IDLE_TIMEOUT_MS, 2 * 60 * 60 * 1000);
    });

    it('enforces 5-minute sliding refresh throttle', () => {
      assert.equal(REFRESH_THROTTLE_MS, 5 * 60 * 1000);
    });
  });

  describe('generateRawToken()', () => {
    it('generates 256-bit (32 bytes) hex string of length 64', () => {
      const token = generateRawToken();
      assert.equal(typeof token, 'string');
      assert.equal(token.length, 64);
      assert.match(token, /^[0-9a-f]{64}$/);
    });

    it('generates unique cryptographically secure random tokens on consecutive calls', () => {
      const tokens = new Set();
      for (let i = 0; i < 50; i++) {
        tokens.add(generateRawToken());
      }
      assert.equal(tokens.size, 50);
    });
  });

  describe('hashSessionToken()', () => {
    it('computes consistent lowercase SHA-256 hex digest of raw token', () => {
      const token = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const hash1 = hashSessionToken(token);
      const hash2 = hashSessionToken(token);

      assert.equal(hash1, hash2);
      assert.equal(hash1.length, 64);
      assert.match(hash1, /^[0-9a-f]{64}$/);
      assert.notEqual(token, hash1); // Raw token is never identical to hash
    });
  });

  describe('Input Validation on Database Methods', () => {
    it('validateSession returns null safely when raw token is null or not a string', async () => {
      assert.equal(await validateSession(null), null);
      assert.equal(await validateSession(undefined), null);
      assert.equal(await validateSession(''), null);
      assert.equal(await validateSession(12345), null);
    });

    it('revokeSession returns false safely when raw token is null or not a string', async () => {
      assert.equal(await revokeSession(null), false);
      assert.equal(await revokeSession(undefined), false);
      assert.equal(await revokeSession(''), false);
    });

    it('revokeAllUserSessions returns 0 safely when userId is invalid', async () => {
      assert.equal(await revokeAllUserSessions(null), 0);
      assert.equal(await revokeAllUserSessions('abc'), 0);
      assert.equal(await revokeAllUserSessions(NaN), 0);
    });

    it('validateSession returns null when session is concurrently revoked during idle update', async () => {
      const mockPool = {
        query: async (sql, params) => {
          if (sql.includes('FROM sessions s')) {
            const now = new Date();
            return {
              rows: [{
                id: 101,
                user_id: 1,
                created_at: new Date(now.getTime() - 3600000),
                last_active_at: new Date(now.getTime() - 600000), // 10 minutes ago (> 5m throttle)
                expires_at: new Date(now.getTime() + 86400000),
                idle_expires_at: new Date(now.getTime() + 3600000),
                revoked_at: null,
                user_actual_id: 1,
                email: 'test@namlatic.com',
                role: 'owner',
                status: 'active',
              }],
            };
          }
          if (sql.includes('UPDATE sessions')) {
            // Simulate concurrent revocation: row was revoked in flight, so rowCount is 0
            return { rowCount: 0 };
          }
          return { rows: [] };
        },
      };

      const result = await validateSession('some_valid_looking_token', {}, mockPool);
      assert.equal(result, null);
    });
  });
});
