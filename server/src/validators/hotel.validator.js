/**
 * Helper to check whether a string has valid decimal precision
 * @param {string|number} val
 * @param {number} maxDecimals
 * @returns {boolean}
 */
const hasValidDecimals = (val, maxDecimals) => {
  const str = String(val).trim();
  const decimalIdx = str.indexOf('.');
  if (decimalIdx === -1) return true;
  return str.length - decimalIdx - 1 <= maxDecimals;
};

/**
 * Validates payload for creating a new hotel (POST /api/hotels).
 *
 * @param {Record<string, any>} body - The parsed request body (from multipart/form-data)
 * @returns {{ isValid: boolean, errors: string[], value?: { title: string, description: string, latitude: number, longitude: number, price: number } }}
 */
const validateCreateHotel = (body) => {
  const errors = [];

  // 1. Title validation
  const rawTitle = body.title;
  let title = '';
  if (rawTitle === undefined || rawTitle === null) {
    errors.push('Hotel title is required.');
  } else if (typeof rawTitle !== 'string') {
    errors.push('Hotel title must be a string.');
  } else {
    title = rawTitle.trim();
    if (title.length === 0) {
      errors.push('Hotel title cannot be blank or whitespace-only.');
    } else if (title.length > 255) {
      errors.push('Hotel title cannot exceed 255 characters.');
    }
  }

  // 2. Description validation
  const rawDesc = body.description;
  let description = '';
  if (rawDesc === undefined || rawDesc === null) {
    errors.push('Hotel description is required.');
  } else if (typeof rawDesc !== 'string') {
    errors.push('Hotel description must be a string.');
  } else {
    description = rawDesc.trim();
    if (description.length === 0) {
      errors.push('Hotel description cannot be blank or whitespace-only.');
    }
  }

  // 3. Latitude validation (-90 to +90, max 6 decimal places)
  const rawLat = body.latitude;
  let latitude = NaN;
  if (rawLat === undefined || rawLat === null || String(rawLat).trim() === '') {
    errors.push('Latitude is required.');
  } else {
    const latStr = String(rawLat).trim();
    const latNum = Number(latStr);
    if (!Number.isFinite(latNum) || isNaN(latNum)) {
      errors.push('Latitude must be a valid finite number.');
    } else if (latNum < -90.0 || latNum > 90.0) {
      errors.push('Latitude must be between -90.0 and 90.0 degrees.');
    } else if (!hasValidDecimals(latStr, 6)) {
      errors.push('Latitude cannot exceed 6 decimal places.');
    } else {
      latitude = latNum;
    }
  }

  // 4. Longitude validation (-180 to +180, max 6 decimal places)
  const rawLong = body.longitude;
  let longitude = NaN;
  if (rawLong === undefined || rawLong === null || String(rawLong).trim() === '') {
    errors.push('Longitude is required.');
  } else {
    const longStr = String(rawLong).trim();
    const longNum = Number(longStr);
    if (!Number.isFinite(longNum) || isNaN(longNum)) {
      errors.push('Longitude must be a valid finite number.');
    } else if (longNum < -180.0 || longNum > 180.0) {
      errors.push('Longitude must be between -180.0 and 180.0 degrees.');
    } else if (!hasValidDecimals(longStr, 6)) {
      errors.push('Longitude cannot exceed 6 decimal places.');
    } else {
      longitude = longNum;
    }
  }

  // 5. Price validation (> 0, max 2 decimal places)
  const rawPrice = body.price;
  let price = NaN;
  if (rawPrice === undefined || rawPrice === null || String(rawPrice).trim() === '') {
    errors.push('Price is required.');
  } else {
    const priceStr = String(rawPrice).trim();
    const priceNum = Number(priceStr);
    if (!Number.isFinite(priceNum) || isNaN(priceNum)) {
      errors.push('Price must be a valid finite number.');
    } else if (priceNum <= 0) {
      errors.push('Price must be greater than zero.');
    } else if (!hasValidDecimals(priceStr, 2)) {
      errors.push('Price cannot have more than 2 decimal places.');
    } else {
      price = priceNum;
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    value: { title, description, latitude, longitude, price },
  };
};

/**
 * Validates query parameters for listing hotels (GET /api/hotels).
 *
 * @param {Record<string, any>} query
 * @returns {{ isValid: boolean, errors: string[], value?: { title?: string, minPrice?: number, maxPrice?: number, limit: number, offset: number } }}
 */
const validateListHotels = (query) => {
  const errors = [];
  const value = { limit: 10, offset: 0 };

  // 1. Optional Title
  if (query.title !== undefined) {
    if (typeof query.title !== 'string') {
      errors.push('Title search filter must be a string.');
    } else {
      value.title = query.title.trim();
    }
  }

  // 2. Optional minPrice
  if (query.minPrice !== undefined && query.minPrice !== '') {
    const minPriceStr = String(query.minPrice).trim();
    const minPriceNum = Number(minPriceStr);
    if (!Number.isFinite(minPriceNum) || isNaN(minPriceNum)) {
      errors.push('minPrice must be a valid finite number.');
    } else if (minPriceNum < 0) {
      errors.push('minPrice cannot be negative.');
    } else if (!hasValidDecimals(minPriceStr, 2)) {
      errors.push('minPrice cannot exceed 2 decimal places.');
    } else {
      value.minPrice = minPriceNum;
    }
  }

  // 3. Optional maxPrice
  if (query.maxPrice !== undefined && query.maxPrice !== '') {
    const maxPriceStr = String(query.maxPrice).trim();
    const maxPriceNum = Number(maxPriceStr);
    if (!Number.isFinite(maxPriceNum) || isNaN(maxPriceNum)) {
      errors.push('maxPrice must be a valid finite number.');
    } else if (maxPriceNum < 0) {
      errors.push('maxPrice cannot be negative.');
    } else if (!hasValidDecimals(maxPriceStr, 2)) {
      errors.push('maxPrice cannot exceed 2 decimal places.');
    } else {
      value.maxPrice = maxPriceNum;
    }
  }

  // Check minPrice <= maxPrice if both present
  if (value.minPrice !== undefined && value.maxPrice !== undefined) {
    if (value.minPrice > value.maxPrice) {
      errors.push('minPrice cannot be greater than maxPrice.');
    }
  }

  // 4. Limit (default 10, max 100, integer)
  if (query.limit !== undefined && query.limit !== '') {
    const limitNum = Number(query.limit);
    if (!Number.isInteger(limitNum)) {
      errors.push('limit must be an integer.');
    } else if (limitNum < 1 || limitNum > 100) {
      errors.push('limit must be between 1 and 100.');
    } else {
      value.limit = limitNum;
    }
  }

  // 5. Offset (default 0, min 0, integer)
  if (query.offset !== undefined && query.offset !== '') {
    const offsetNum = Number(query.offset);
    if (!Number.isInteger(offsetNum)) {
      errors.push('offset must be an integer.');
    } else if (offsetNum < 0) {
      errors.push('offset cannot be negative.');
    } else {
      value.offset = offsetNum;
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return { isValid: true, errors: [], value };
};

/**
 * Validates a hotel ID from route parameters (GET, PUT, DELETE /api/hotels/:id).
 * Rejects non-integer, zero, negative, or malformed IDs.
 *
 * @param {any} rawId - The route param ID
 * @returns {{ isValid: boolean, error?: string, value?: string }}
 */
const validateHotelId = (rawId) => {
  if (rawId === undefined || rawId === null || String(rawId).trim() === '') {
    return { isValid: false, error: 'Hotel ID is required.' };
  }

  const idStr = String(rawId).trim();

  // Reject anything that is not strictly positive digits (no negatives, decimals, zero, letters)
  if (!/^[1-9]\d*$/.test(idStr)) {
    return {
      isValid: false,
      error: 'Hotel ID must be a valid positive integer greater than zero.',
    };
  }

  // Ensure it can be parsed as a valid BigInt without overflow issues
  try {
    const bigIntVal = BigInt(idStr);
    if (bigIntVal <= 0n) {
      return {
        isValid: false,
        error: 'Hotel ID must be a valid positive integer greater than zero.',
      };
    }
  } catch (_e) {
    return {
      isValid: false,
      error: 'Hotel ID is invalid or out of range.',
    };
  }

  return { isValid: true, value: idStr };
};

module.exports = {
  validateCreateHotel,
  validateListHotels,
  validateHotelId,
};
