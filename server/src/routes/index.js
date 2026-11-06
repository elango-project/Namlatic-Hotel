const { Router } = require('express');
const healthRoutes = require('./health.routes');
const hotelRoutes = require('./hotel.routes');

const router = Router();

// Hotel inventory management
router.use('/hotels', hotelRoutes);

// Liveness and readiness probes (/api/health, /api/ready)
router.use('/', healthRoutes);

module.exports = router;
