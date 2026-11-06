const hotelService = require('../services/hotel.service');
const {
  validateCreateHotel,
  validateListHotels,
  validateHotelId,
} = require('../validators/hotel.validator');

/**
 * Maps known PostgreSQL check constraint violations to clean user-facing error messages.
 * Prevents leaking raw SQL statements or schema internals.
 *
 * @param {Error & { constraint?: string }} err
 * @returns {string|null}
 */
const mapDbConstraintError = (err) => {
  if (!err || !err.constraint) return null;

  switch (err.constraint) {
    case 'chk_hotels_price_positive':
      return 'Price must be a valid positive number greater than zero.';
    case 'chk_hotels_latitude_range':
      return 'Latitude must be between -90.0 and 90.0 degrees.';
    case 'chk_hotels_longitude_range':
      return 'Longitude must be between -180.0 and 180.0 degrees.';
    case 'chk_hotels_title_not_empty':
      return 'Hotel title cannot be blank.';
    case 'chk_hotels_description_not_empty':
      return 'Hotel description cannot be blank.';
    default:
      return null;
  }
};

/**
 * POST /api/hotels
 * Creates a new hotel record with optional uploaded photo.
 */
const create = async (req, res, next) => {
  const { isValid, errors, value } = validateCreateHotel(req.body);

  if (!isValid) {
    // If input validation fails after multer saved a file, delete the uploaded file safely
    if (req.file && req.file.path) {
      await hotelService.safeUnlinkFile(req.file.path);
    }
    return res.status(400).json({
      status: 'error',
      statusCode: 400,
      message: 'Validation failed.',
      errors,
    });
  }

  try {
    const hotel = await hotelService.createHotel(value, req.file);
    return res.status(201).json({
      status: 'success',
      data: hotel,
    });
  } catch (err) {
    const constraintMsg = mapDbConstraintError(err);
    if (constraintMsg) {
      return res.status(400).json({
        status: 'error',
        statusCode: 400,
        message: constraintMsg,
      });
    }

    // Do not leak internal database errors or credentials
    next(err);
  }
};

/**
 * GET /api/hotels
 * Retrieves a paginated list of hotels supporting search by title and price range filtering.
 */
const list = async (req, res, next) => {
  const { isValid, errors, value } = validateListHotels(req.query);

  if (!isValid) {
    return res.status(400).json({
      status: 'error',
      statusCode: 400,
      message: 'Validation failed.',
      errors,
    });
  }

  try {
    const result = await hotelService.listHotels(value);
    return res.status(200).json({
      status: 'success',
      data: result.data,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/hotels/:id
 * Retrieves a single hotel by primary key ID.
 */
const getById = async (req, res, next) => {
  const idValidation = validateHotelId(req.params.id);
  if (!idValidation.isValid) {
    return res.status(400).json({
      status: 'error',
      statusCode: 400,
      message: idValidation.error,
    });
  }

  try {
    const hotel = await hotelService.getHotelById(idValidation.value);
    if (!hotel) {
      return res.status(404).json({
        status: 'error',
        statusCode: 404,
        message: 'Hotel not found.',
      });
    }

    return res.status(200).json({
      status: 'success',
      data: hotel,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/hotels/:id
 * Updates an existing hotel record with optional new image replacement.
 */
const update = async (req, res, next) => {
  // 1. Validate route param ID
  const idValidation = validateHotelId(req.params.id);
  if (!idValidation.isValid) {
    if (req.file && req.file.path) {
      await hotelService.safeUnlinkFile(req.file.path);
    }
    return res.status(400).json({
      status: 'error',
      statusCode: 400,
      message: idValidation.error,
    });
  }

  // 2. Validate body fields
  const { isValid, errors, value } = validateCreateHotel(req.body);
  if (!isValid) {
    if (req.file && req.file.path) {
      await hotelService.safeUnlinkFile(req.file.path);
    }
    return res.status(400).json({
      status: 'error',
      statusCode: 400,
      message: 'Validation failed.',
      errors,
    });
  }

  // 3. Perform update in database and handle file lifecycle
  try {
    const updatedHotel = await hotelService.updateHotel(
      idValidation.value,
      value,
      req.file
    );

    if (!updatedHotel) {
      return res.status(404).json({
        status: 'error',
        statusCode: 404,
        message: 'Hotel not found.',
      });
    }

    return res.status(200).json({
      status: 'success',
      data: updatedHotel,
    });
  } catch (err) {
    const constraintMsg = mapDbConstraintError(err);
    if (constraintMsg) {
      return res.status(400).json({
        status: 'error',
        statusCode: 400,
        message: constraintMsg,
      });
    }
    next(err);
  }
};

/**
 * DELETE /api/hotels/:id
 * Deletes an existing hotel record and removes its associated image file from disk.
 */
const remove = async (req, res, next) => {
  const idValidation = validateHotelId(req.params.id);
  if (!idValidation.isValid) {
    return res.status(400).json({
      status: 'error',
      statusCode: 400,
      message: idValidation.error,
    });
  }

  try {
    const deleted = await hotelService.deleteHotel(idValidation.value);
    if (!deleted) {
      return res.status(404).json({
        status: 'error',
        statusCode: 404,
        message: 'Hotel not found.',
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Hotel deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/hotels/stats
 * Retrieves global portfolio hotel statistics computed via PostgreSQL aggregation.
 */
const getStats = async (req, res, next) => {
  try {
    const stats = await hotelService.getHotelStats();
    return res.status(200).json({
      status: 'success',
      data: stats,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  create,
  list,
  getById,
  update,
  remove,
  getStats,
  mapDbConstraintError,
};
