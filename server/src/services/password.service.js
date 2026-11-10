/**
 * Argon2id Password Hashing & Verification Service
 * Enforces centralized cryptographic configuration, byte limits, and concurrency bounds.
 */

const argon2 = require('argon2');
const { validatePassword } = require('../validators/auth.validator');
const { defaultArgonSemaphore } = require('../utils/argonSemaphore');

/**
 * Standard OWASP-recommended Argon2id parameters.
 * - Algorithm: Argon2id (resistant to side-channel and GPU cracking attacks)
 * - Memory: 65536 KiB (64 MiB)
 * - Iterations (Time): 3 passes
 * - Parallelism: 1 thread
 * - Hash Length: 32 bytes
 * - Salt: 16 cryptographically secure random bytes generated per hash
 */
const ARGON2_CONFIG = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
});

/**
 * Hashes a plaintext password using Argon2id.
 *
 * @param {string} password - Raw, unmodified password
 * @param {import('../utils/argonSemaphore').ArgonSemaphore} [semaphore] - Concurrency controller
 * @returns {Promise<string>} Encoded Argon2id hash string
 * @throws {Error} If password fails validation or concurrency queue is full
 */
async function hashPassword(password, semaphore = defaultArgonSemaphore) {
  // 1. Strict pre-validation: validate code points and byte bounds before triggering CPU-intensive hashing
  validatePassword(password);

  // 2. Execute hash operation within bounded concurrency semaphore
  return semaphore.run(async () => {
    return argon2.hash(password, ARGON2_CONFIG);
  });
}

/**
 * Verifies a candidate password against a stored Argon2id hash.
 *
 * BOUNDARY SAFETY:
 * - Rejects non-string and empty inputs.
 * - Enforces the 128-byte maximum UTF-8 size BEFORE entering the concurrency semaphore.
 * - Preserves original password bytes exactly (never trimmed or normalized).
 * - Concurrency semaphore overload errors (HTTP 503) propagate to caller.
 *
 * @param {string} hash - Stored Argon2id hash string
 * @param {string} password - Candidate password
 * @param {import('../utils/argonSemaphore').ArgonSemaphore} [semaphore] - Concurrency controller
 * @returns {Promise<boolean>} True if password matches hash, false otherwise
 * @throws {Error} If the concurrency semaphore is overloaded or times out
 */
async function verifyPassword(hash, password, semaphore = defaultArgonSemaphore) {
  if (typeof hash !== 'string' || typeof password !== 'string') {
    return false;
  }

  // Reject empty inputs safely
  if (!hash.startsWith('$argon2') || password.length === 0) {
    return false;
  }

  // Enforce the 128-byte maximum before entering the concurrency queue to prevent DoS
  if (Buffer.byteLength(password, 'utf8') > 128) {
    return false;
  }

  return semaphore.run(async () => {
    try {
      return await argon2.verify(hash, password);
    } catch (_err) {
      // Return false on malformed hashes rather than throwing unexpected exceptions
      return false;
    }
  });
}

/**
 * Pre-computed valid dummy hash used to equalize execution timing
 * when a user is not found during authentication (prepared for Phase 5F-A2.2).
 */
const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=1$7S25v70Yh/9mQ5XgR6oA4w$20O6uH3iV5/V0f9rE6W8aB1yN7M2zK4pL8tQ3uV5wY0';

module.exports = {
  ARGON2_CONFIG,
  DUMMY_HASH,
  hashPassword,
  verifyPassword,
};
