const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateEmail, validatePassword } = require('../../src/validators/auth.validator');
const {
  hashPassword,
  verifyPassword,
  ARGON2_CONFIG,
  DUMMY_HASH,
} = require('../../src/services/password.service');
const { ArgonSemaphore } = require('../../src/utils/argonSemaphore');

describe('Unit Tests: Authentication Validation & Password Service (Phase 5F-A2.1)', () => {
  // ==========================================================================
  // 1. Email Normalization and Validation
  // ==========================================================================
  describe('Email Validation & Normalization', () => {
    it('normalizes email with leading/trailing whitespace and uppercase characters', () => {
      const input = '   Owner.Admin@Namlatic-Hotel.COM   ';
      const normalized = validateEmail(input);
      assert.equal(normalized, 'owner.admin@namlatic-hotel.com');
    });

    it('rejects email without @ symbol', () => {
      assert.throws(() => validateEmail('invalid-email.com'), {
        message: /Invalid email address format/,
      });
    });

    it('rejects empty or whitespace-only email', () => {
      assert.throws(() => validateEmail('   '), {
        message: /Email address cannot be empty/,
      });
    });

    it('rejects non-string email inputs', () => {
      assert.throws(() => validateEmail(null), {
        message: /Email must be a valid string/,
      });
      assert.throws(() => validateEmail(12345), {
        message: /Email must be a valid string/,
      });
      assert.throws(() => validateEmail({}), {
        message: /Email must be a valid string/,
      });
    });

    it('rejects email exceeding 255 characters', () => {
      const longEmail = 'a'.repeat(250) + '@namlatic.com';
      assert.throws(() => validateEmail(longEmail), {
        message: /Email address must not exceed 255 characters/,
      });
    });
  });

  // ==========================================================================
  // 2. Unicode Password Validation & Byte Bounds
  // ==========================================================================
  describe('Password Validation & Immutability Policy', () => {
    it('accepts password with at least 12 Unicode code points', () => {
      const valid = 'CorrectHorseBatteryStaple123!';
      const res = validatePassword(valid);
      assert.equal(res, valid);
    });

    it('accepts 12 emoji code points (multibyte astral symbols)', () => {
      // 12 emojis, each 4 UTF-8 bytes (total 48 bytes, 24 UTF-16 code units)
      const twelveEmojis = '🏨🔑🌴🏨🔑🌴🏨🔑🌴🏨🔑🌴';
      assert.equal(Array.from(twelveEmojis).length, 12);
      const res = validatePassword(twelveEmojis);
      assert.equal(res, twelveEmojis);
    });

    it('rejects 11 emoji code points despite UTF-16 length being 22', () => {
      // 11 emojis = 22 UTF-16 units, but only 11 Unicode code points
      const elevenEmojis = '🏨🔑🌴🏨🔑🌴🏨🔑🌴🏨🔑';
      assert.equal(elevenEmojis.length, 22); // UTF-16 code units
      assert.equal(Array.from(elevenEmojis).length, 11); // Actual code points

      assert.throws(() => validatePassword(elevenEmojis), {
        message: /Password must be at least 12 characters long/,
      });
    });

    it('accepts password of exactly 128 UTF-8 bytes', () => {
      const exactly128Bytes = 'A'.repeat(128);
      assert.equal(Buffer.byteLength(exactly128Bytes, 'utf8'), 128);
      const res = validatePassword(exactly128Bytes);
      assert.equal(res, exactly128Bytes);
    });

    it('rejects password exceeding 128 UTF-8 bytes (129 bytes)', () => {
      const exactly129Bytes = 'A'.repeat(129);
      assert.equal(Buffer.byteLength(exactly129Bytes, 'utf8'), 129);
      assert.throws(() => validatePassword(exactly129Bytes), {
        message: /Password must not exceed 128 UTF-8 bytes/,
      });
    });

    it('strictly preserves leading, trailing, and internal whitespace without trimming', () => {
      const spacedPassword = '   leading trailing and internal spaces 123   ';
      const res = validatePassword(spacedPassword);
      assert.equal(res, spacedPassword);
      assert.equal(res.startsWith('   '), true);
      assert.equal(res.endsWith('   '), true);
    });

    it('strictly preserves raw Unicode characters without normalization or casing mutation', () => {
      // e + combining acute accent (\u0065\u0301) decomposed form vs precomposed e with acute (\u00e9)
      const decomposed = 'cafe\u0301-secret-password-123';
      const res = validatePassword(decomposed);
      assert.equal(res, decomposed);
      // Ensure it is not silently converted to NFC
      assert.equal(res.includes('\u0301'), true);
    });

    it('rejects non-string password inputs', () => {
      assert.throws(() => validatePassword(null), {
        message: /Password must be a valid string/,
      });
      assert.throws(() => validatePassword(undefined), {
        message: /Password must be a valid string/,
      });
      assert.throws(() => validatePassword(123456789012), {
        message: /Password must be a valid string/,
      });
      assert.throws(() => validatePassword({ password: 'Password12345' }), {
        message: /Password must be a valid string/,
      });
    });
  });

  // ==========================================================================
  // 3. Argon2id Password Service
  // ==========================================================================
  describe('Argon2id Hashing & Verification', () => {
    it('verifies that hashing configuration adheres to OWASP recommendations', () => {
      assert.equal(ARGON2_CONFIG.memoryCost, 65536);
      assert.equal(ARGON2_CONFIG.timeCost, 3);
      assert.equal(ARGON2_CONFIG.parallelism, 1);
      assert.equal(ARGON2_CONFIG.hashLength, 32);
    });

    it('generates distinct encoded hashes for identical passwords due to unique salts', async () => {
      const pwd = 'UniqueSaltTestPassword123!';
      const hash1 = await hashPassword(pwd);
      const hash2 = await hashPassword(pwd);

      assert.notEqual(hash1, hash2);
      assert.equal(hash1.startsWith('$argon2id$v=19$m=65536,t=3,p=1$'), true);
      assert.equal(hash2.startsWith('$argon2id$v=19$m=65536,t=3,p=1$'), true);
    });

    it('verifies correct password returns true', async () => {
      const pwd = 'ValidOwnerSecretPassphrase2026!';
      const hash = await hashPassword(pwd);
      const isMatch = await verifyPassword(hash, pwd);
      assert.equal(isMatch, true);
    });

    it('verifies incorrect password returns false', async () => {
      const pwd = 'ValidOwnerSecretPassphrase2026!';
      const hash = await hashPassword(pwd);
      const isMatch = await verifyPassword(hash, 'WrongPasswordEntirely123!');
      assert.equal(isMatch, false);
    });

    it('rejects invalid password inputs before initiating expensive hash calculation', async () => {
      await assert.rejects(
        () => hashPassword('short'),
        { message: /Password must be at least 12 characters long/ }
      );
    });

    it('safely handles malformed hashes in verifyPassword without throwing exceptions', async () => {
      const isMatch = await verifyPassword('not-an-argon-hash', 'SomeValidPassword123!');
      assert.equal(isMatch, false);

      const emptyMatch = await verifyPassword('', 'SomeValidPassword123!');
      assert.equal(emptyMatch, false);

      const nullMatch = await verifyPassword(null, 'SomeValidPassword123!');
      assert.equal(nullMatch, false);
    });

    it('provides a valid precomputed dummy hash for constant-time mitigation', () => {
      assert.equal(typeof DUMMY_HASH, 'string');
      assert.equal(DUMMY_HASH.startsWith('$argon2id$v=19$m=65536,t=3,p=1$'), true);
    });
  });

  // ==========================================================================
  // 4. Bounded Concurrency Semaphore
  // ==========================================================================
  describe('Bounded Concurrency Semaphore', () => {
    it('allows up to maxActive concurrent tasks to execute simultaneously', async () => {
      const sem = new ArgonSemaphore(2, 5, 1000);
      let running = 0;
      let peakRunning = 0;

      const task = async () => {
        running++;
        peakRunning = Math.max(peakRunning, running);
        await new Promise((resolve) => setTimeout(resolve, 50));
        running--;
      };

      await Promise.all([sem.run(task), sem.run(task)]);
      assert.equal(peakRunning, 2);
      assert.equal(sem.activeCount, 0);
      assert.equal(sem.queueLength, 0);
    });

    it('queues tasks up to maxQueue and executes them in order when slots become available', async () => {
      const sem = new ArgonSemaphore(2, 3, 2000);
      const executionOrder = [];

      const makeTask = (id, delayMs) => async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        executionOrder.push(id);
      };

      // 2 active slots + 3 queued tasks = 5 tasks total
      const p1 = sem.run(makeTask(1, 40));
      const p2 = sem.run(makeTask(2, 40));
      const p3 = sem.run(makeTask(3, 20));
      const p4 = sem.run(makeTask(4, 20));
      const p5 = sem.run(makeTask(5, 20));

      assert.equal(sem.activeCount, 2);
      assert.equal(sem.queueLength, 3);

      await Promise.all([p1, p2, p3, p4, p5]);

      assert.equal(executionOrder.length, 5);
      assert.equal(sem.activeCount, 0);
      assert.equal(sem.queueLength, 0);
    });

    it('immediately rejects new tasks with HASHING_OVERLOAD when queue is full', async () => {
      const sem = new ArgonSemaphore(1, 2, 1000); // 1 active, 2 queued = max 3

      const blocker = () => new Promise((resolve) => setTimeout(resolve, 100));

      const p1 = sem.run(blocker); // Active: 1
      const p2 = sem.run(blocker); // Queued: 1
      const p3 = sem.run(blocker); // Queued: 2

      assert.equal(sem.activeCount, 1);
      assert.equal(sem.queueLength, 2);

      // 4th task exceeds queue limit of 2 -> must reject immediately with 503 overload
      await assert.rejects(
        () => sem.run(blocker),
        (err) => {
          assert.equal(err.code, 'HASHING_OVERLOAD');
          assert.equal(err.statusCode, 503);
          assert.equal(err.retryAfter, 3);
          return true;
        }
      );

      await Promise.all([p1, p2, p3]);
      assert.equal(sem.activeCount, 0);
    });

    it('times out queued tasks that wait longer than timeoutMs', async () => {
      const sem = new ArgonSemaphore(1, 2, 50); // 50ms queue timeout

      // Long blocker takes 150ms
      const longBlocker = () => new Promise((resolve) => setTimeout(resolve, 150));
      const fastTask = () => Promise.resolve('ok');

      const p1 = sem.run(longBlocker); // Active
      const p2 = sem.run(fastTask);    // Queued, will time out after 50ms

      await assert.rejects(
        () => p2,
        (err) => {
          assert.equal(err.code, 'HASHING_OVERLOAD');
          assert.equal(err.statusCode, 503);
          assert.equal(err.retryAfter, 3);
          return true;
        }
      );

      // Verify timed-out task is removed from queue
      assert.equal(sem.queueLength, 0);
      await p1;
      assert.equal(sem.activeCount, 0);
    });

    it('ensures active counter decrements and subsequent tasks run even when a task throws', async () => {
      const sem = new ArgonSemaphore(1, 2, 1000);

      const failingTask = async () => {
        throw new Error('Simulated internal task failure');
      };

      const successfulTask = async () => 'recovered';

      await assert.rejects(() => sem.run(failingTask), {
        message: 'Simulated internal task failure',
      });

      assert.equal(sem.activeCount, 0);

      // Next task should execute cleanly without counter starvation
      const res = await sem.run(successfulTask);
      assert.equal(res, 'recovered');
      assert.equal(sem.activeCount, 0);
    });
  });
});
