/**
 * Authentication Routes
 * Mounted at /api/auth
 */

const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = Router();

// POST /api/auth/login - Authenticate owner and set session cookie
router.post('/login', authController.login);

// POST /api/auth/logout - Idempotent logout and clear session cookie
router.post('/logout', authController.logout);

// GET /api/auth/me - Retrieve authenticated owner profile
router.get('/me', requireAuth, authController.getMe);

module.exports = router;
