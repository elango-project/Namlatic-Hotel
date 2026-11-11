const { Router } = require('express');
const authRoutes = require('./auth.routes');
const hotelRoutes = require('./hotel.routes');

const router = Router();

// Authentication endpoints (/api/auth/login, /api/auth/logout, /api/auth/me)
router.use('/auth', authRoutes);

// Hotel inventory management (protected with requireAuth)
router.use('/hotels', hotelRoutes);

module.exports = router;
