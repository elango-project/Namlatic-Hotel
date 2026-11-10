const { Router } = require('express');
const hotelController = require('../controllers/hotel.controller');
const { uploadHotelImage } = require('../middleware/upload.middleware');
const { writeLimiter } = require('../middleware/rateLimiter.middleware');

const router = Router();

// POST /api/hotels - Create hotel with multipart/form-data support (rate-limited writes)
router.post('/', writeLimiter, uploadHotelImage, hotelController.create);

// GET /api/hotels - List hotels with search, filter, and pagination
router.get('/', hotelController.list);

// GET /api/hotels/stats - Retrieve portfolio-wide aggregated statistics (MUST be before /:id)
router.get('/stats', hotelController.getStats);

// GET /api/hotels/:id - Retrieve hotel by ID
router.get('/:id', hotelController.getById);

// PUT /api/hotels/:id - Update hotel with multipart/form-data support (rate-limited writes)
router.put('/:id', writeLimiter, uploadHotelImage, hotelController.update);

// DELETE /api/hotels/:id - Delete hotel and associated image (rate-limited writes)
router.delete('/:id', writeLimiter, hotelController.remove);

module.exports = router;
