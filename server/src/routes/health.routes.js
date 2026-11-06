const { Router } = require('express');
const { getHealth, getReadiness } = require('../controllers/health.controller');

const router = Router();

// Liveness probe (process up)
router.get('/health', getHealth);

// Readiness probe (database reachable)
router.get('/ready', getReadiness);

module.exports = router;
