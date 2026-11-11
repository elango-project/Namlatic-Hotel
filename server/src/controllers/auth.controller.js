/**
 * Authentication Controller
 *
 * Handles owner login, logout, and current-session inspection (me).
 *
 * Security Controls:
 * - Argon2id verification with dummy hash timing equalization.
 * - Login throttler for progressive delays and IP rate limiting (no global lockout).
 * - Bounded concurrency semaphore for Argon2 operations (503 on overload).
 * - HttpOnly, SameSite=Lax, Secure session cookie management.
 * - Private, no-store Cache-Control header injection.
 */

const { pool } = require('../config/db');
const env = require('../config/env');
const sessionService = require('../services/session.service');
const { verifyPassword, DUMMY_HASH } = require('../services/password.service');
const { validateEmail } = require('../validators/auth.validator');
const { defaultLoginThrottler } = require('../services/loginThrottler.service');
const {
  parseCookies,
  buildSessionCookie,
  buildClearSessionCookie,
  COOKIE_NAME,
} = require('../utils/cookieHelper');
const { NO_CACHE_VALUE } = require('../middleware/auth.middleware');

/**
 * POST /api/auth/login
 * Authenticates the hotel owner and establishes a PostgreSQL-backed session.
 */
async function login(req, res, next) {
  res.setHeader('Cache-Control', NO_CACHE_VALUE);

  const { email, password } = req.body || {};

  // 1. Basic structural input validation
  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return res.status(400).json({
      status: 'error',
      statusCode: 400,
      message: 'Email and password are required.',
    });
  }

  // Validate email format
  let normalizedEmail;
  try {
    normalizedEmail = validateEmail(email);
  } catch (_err) {
    return res.status(400).json({
      status: 'error',
      statusCode: 400,
      message: 'Invalid email address format.',
    });
  }

  // Validate raw password byte length (prevent DoS before Argon2)
  if (Buffer.byteLength(password, 'utf8') > 128) {
    return res.status(400).json({
      status: 'error',
      statusCode: 400,
      message: 'Password must not exceed 128 UTF-8 bytes.',
    });
  }

  // 2. Check login abuse throttler (IP rate limit & progressive delay)
  const throttleStatus = defaultLoginThrottler.check(req.ip, normalizedEmail);
  if (!throttleStatus.allowed) {
    res.setHeader('Retry-After', String(throttleStatus.retryAfter));
    return res.status(429).json({
      status: 'error',
      statusCode: 429,
      message: 'Too many failed login attempts. Please try again later.',
    });
  }

  if (throttleStatus.delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, throttleStatus.delayMs));
  }

  try {
    // 3. Query user by email
    const userResult = await pool.query(
      `SELECT id, email, password_hash, role, status
       FROM users
       WHERE email = $1`,
      [normalizedEmail]
    );

    const user = userResult.rows[0];

    // If user does not exist or is suspended/disabled, equalize timing with dummy Argon2id verification
    if (!user || user.status !== 'active') {
      await verifyPassword(DUMMY_HASH, password);
      defaultLoginThrottler.recordFailure(req.ip, normalizedEmail);
      return res.status(401).json({
        status: 'error',
        statusCode: 401,
        message: 'Invalid email or password.',
      });
    }

    // 4. Verify candidate password against stored Argon2id hash
    const passwordMatches = await verifyPassword(user.password_hash, password);
    if (!passwordMatches) {
      defaultLoginThrottler.recordFailure(req.ip, normalizedEmail);
      return res.status(401).json({
        status: 'error',
        statusCode: 401,
        message: 'Invalid email or password.',
      });
    }

    // 5. Successful authentication: reset throttler
    defaultLoginThrottler.recordSuccess(req.ip, normalizedEmail);

    // 6. Create active session in PostgreSQL
    const { rawToken } = await sessionService.createSession({
      userId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // 7. Set __Host-namlatic_session cookie
    const cookieHeader = buildSessionCookie(rawToken, {
      isProduction: env.nodeEnv === 'production',
    });
    res.setHeader('Set-Cookie', cookieHeader);

    const safeUser = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    return res.status(200).json({
      status: 'success',
      data: { user: safeUser },
      user: safeUser,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/logout
 * Idempotently revokes the caller's session in PostgreSQL and clears the cookie.
 */
async function logout(req, res, next) {
  res.setHeader('Cache-Control', NO_CACHE_VALUE);

  const cookies = parseCookies(req.headers.cookie);
  const rawToken = cookies[COOKIE_NAME];

  if (rawToken) {
    try {
      await sessionService.revokeSession(rawToken);
    } catch (_err) {
      // Best effort revocation; proceed to clear cookie
    }
  }

  // Always clear cookie in browser
  const clearCookieHeader = buildClearSessionCookie({
    isProduction: env.nodeEnv === 'production',
  });
  res.setHeader('Set-Cookie', clearCookieHeader);

  return res.status(200).json({
    status: 'success',
    message: 'Logged out successfully.',
  });
}

/**
 * GET /api/auth/me
 * Returns the currently authenticated owner profile.
 */
async function getMe(req, res) {
  res.setHeader('Cache-Control', NO_CACHE_VALUE);

  return res.status(200).json({
    status: 'success',
    data: { user: req.user },
    user: req.user,
  });
}

module.exports = {
  login,
  logout,
  getMe,
};
