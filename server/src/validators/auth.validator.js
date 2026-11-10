/**
 * Authentication Input Validation Rules
 * Enforces strict Unicode code-point password policy and email normalization.
 */

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Validates and normalizes an email address.
 * Email addresses are trimmed and converted to lowercase.
 *
 * @param {any} email
 * @returns {string} Normalized email string
 * @throws {Error} If email is invalid
 */
function validateEmail(email) {
  if (typeof email !== 'string') {
    throw new Error('Email must be a valid string.');
  }

  const normalized = email.trim().toLowerCase();

  if (normalized.length === 0) {
    throw new Error('Email address cannot be empty.');
  }

  if (normalized.length > 255) {
    throw new Error('Email address must not exceed 255 characters.');
  }

  if (!EMAIL_REGEX.test(normalized)) {
    throw new Error('Invalid email address format.');
  }

  return normalized;
}

/**
 * Validates password strength and boundary limits.
 *
 * CRITICAL REQUIREMENTS:
 * - Minimum length: 12 Unicode code points (Array.from(password).length >= 12).
 * - Maximum size: 128 UTF-8 bytes (Buffer.byteLength(password, 'utf8') <= 128).
 * - Passwords are NEVER trimmed, normalized, lowercased, or mutated in any form.
 * - Leading, trailing, and internal whitespace characters are valid entropy.
 *
 * @param {any} password
 * @returns {string} The original, unaltered password
 * @throws {Error} If password fails validation
 */
function validatePassword(password) {
  if (typeof password !== 'string') {
    throw new Error('Password must be a valid string.');
  }

  // Measure distinct Unicode code points (handles surrogate pairs and emojis accurately)
  const codePoints = Array.from(password).length;
  if (codePoints < 12) {
    throw new Error('Password must be at least 12 characters long.');
  }

  // Measure raw UTF-8 byte length to protect against algorithmic complexity / memory DoS
  const byteLength = Buffer.byteLength(password, 'utf8');
  if (byteLength > 128) {
    throw new Error('Password must not exceed 128 UTF-8 bytes.');
  }

  // Return the original password string completely unmodified
  return password;
}

module.exports = {
  validateEmail,
  validatePassword,
};
