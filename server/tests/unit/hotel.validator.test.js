const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  validateHotelId,
  validateCreateHotel,
  validateListHotels,
} = require('../../src/validators/hotel.validator');

describe('Unit Tests: hotel.validator.js', () => {
  // --------------------------------------------------------------------------
  // validateHotelId
  // --------------------------------------------------------------------------
  describe('validateHotelId()', () => {
    it('accepts valid positive integer strings up to PostgreSQL BIGINT maximum', () => {
      const validCases = ['1', '42', '1000', '9999999999', '9223372036854775807'];
      for (const id of validCases) {
        const res = validateHotelId(id);
        assert.equal(res.isValid, true, `Expected ${id} to be valid`);
        assert.equal(res.value, id);
      }
    });

    it('rejects numbers exceeding PostgreSQL BIGINT maximum (9223372036854775808)', () => {
      const res = validateHotelId('9223372036854775808');
      assert.equal(res.isValid, false);
      assert.match(res.error, /exceeds maximum PostgreSQL BIGINT limit/i);
    });

    it('accepts numeric positive safe integers and converts to string', () => {
      const res = validateHotelId(15);
      assert.equal(res.isValid, true);
      assert.equal(res.value, '15');

      const maxSafeRes = validateHotelId(Number.MAX_SAFE_INTEGER); // 9007199254740991
      assert.equal(maxSafeRes.isValid, true);
      assert.equal(maxSafeRes.value, '9007199254740991');
    });

    it('rejects unsafe JavaScript integers when passed as numeric types', () => {
      // Numbers exceeding Number.MAX_SAFE_INTEGER lose precision in standard JS Number
      const unsafeInt = Number.MAX_SAFE_INTEGER + 1; // 9007199254740992
      const res = validateHotelId(unsafeInt);
      assert.equal(res.isValid, false);
      assert.match(res.error, /positive integer greater than zero/);

      const hugeNumber = 1e25;
      assert.equal(validateHotelId(hugeNumber).isValid, false);
    });

    it('rejects zero ("0" and 0)', () => {
      assert.equal(validateHotelId('0').isValid, false);
      assert.equal(validateHotelId(0).isValid, false);
      assert.match(validateHotelId('0').error, /greater than zero/);
    });

    it('rejects negative numbers ("-1", -5)', () => {
      assert.equal(validateHotelId('-1').isValid, false);
      assert.equal(validateHotelId(-5).isValid, false);
      assert.match(validateHotelId('-1').error, /positive integer/);
    });

    it('rejects decimal floats ("1.5", 3.14)', () => {
      assert.equal(validateHotelId('1.5').isValid, false);
      assert.equal(validateHotelId(3.14).isValid, false);
    });

    it('rejects non-numeric alphabetic strings ("abc", "hotel123")', () => {
      assert.equal(validateHotelId('abc').isValid, false);
      assert.equal(validateHotelId('hotel123').isValid, false);
      assert.equal(validateHotelId('123abc').isValid, false);
    });

    it('rejects null, undefined, empty, and whitespace strings', () => {
      assert.equal(validateHotelId(null).isValid, false);
      assert.equal(validateHotelId(undefined).isValid, false);
      assert.equal(validateHotelId('').isValid, false);
      assert.equal(validateHotelId('   ').isValid, false);
    });

    it('rejects leading, trailing, and surrounding whitespace without trimming (whitespace regression)', () => {
      assert.equal(validateHotelId('123').isValid, true);
      assert.equal(validateHotelId(' 123').isValid, false);
      assert.equal(validateHotelId('123 ').isValid, false);
      assert.equal(validateHotelId(' 123 ').isValid, false);
    });

    it('verifies exact regression suite required for BIGINT route ID validation', () => {
      // "123" — valid
      const v123 = validateHotelId('123');
      assert.equal(v123.isValid, true);
      assert.equal(v123.value, '123');

      // " 123" — invalid (leading whitespace)
      assert.equal(validateHotelId(' 123').isValid, false);

      // "123 " — invalid (trailing whitespace)
      assert.equal(validateHotelId('123 ').isValid, false);

      // " 123 " — invalid (surrounding whitespace)
      assert.equal(validateHotelId(' 123 ').isValid, false);

      // "0" — invalid (zero is not a positive ID)
      assert.equal(validateHotelId('0').isValid, false);

      // Maximum PostgreSQL BIGINT — valid (9223372036854775807)
      const vMax = validateHotelId('9223372036854775807');
      assert.equal(vMax.isValid, true);
      assert.equal(vMax.value, '9223372036854775807');

      // Maximum PostgreSQL BIGINT + 1 — invalid (9223372036854775808)
      assert.equal(validateHotelId('9223372036854775808').isValid, false);

      // "12abc" — invalid (alphanumeric letters)
      assert.equal(validateHotelId('12abc').isValid, false);

      // "-123" — invalid (negative integer)
      assert.equal(validateHotelId('-123').isValid, false);

      // "12.5" — invalid (decimal float)
      assert.equal(validateHotelId('12.5').isValid, false);
    });
  });

  // --------------------------------------------------------------------------
  // validateCreateHotel
  // --------------------------------------------------------------------------
  describe('validateCreateHotel()', () => {
    const validPayload = {
      title: 'Grand Azure Resort',
      description: 'A five-star luxury hotel on the beachfront.',
      latitude: '24.453884',
      longitude: '54.377344',
      price: '299.99',
    };

    it('accepts a fully valid hotel payload', () => {
      const res = validateCreateHotel(validPayload);
      assert.equal(res.isValid, true);
      assert.equal(res.errors.length, 0);
      assert.equal(res.value.title, 'Grand Azure Resort');
      assert.equal(res.value.description, 'A five-star luxury hotel on the beachfront.');
      assert.equal(res.value.latitude, 24.453884);
      assert.equal(res.value.longitude, 54.377344);
      assert.equal(res.value.price, 299.99);
    });

    it('rejects missing or non-string title', () => {
      const resMissing = validateCreateHotel({ ...validPayload, title: undefined });
      assert.equal(resMissing.isValid, false);
      assert.ok(resMissing.errors.some((e) => e.includes('title is required')));

      const resNonString = validateCreateHotel({ ...validPayload, title: 12345 });
      assert.equal(resNonString.isValid, false);
      assert.ok(resNonString.errors.some((e) => e.includes('must be a string')));
    });

    it('rejects blank or whitespace-only title', () => {
      const resBlank = validateCreateHotel({ ...validPayload, title: '   ' });
      assert.equal(resBlank.isValid, false);
      assert.ok(resBlank.errors.some((e) => e.includes('cannot be blank')));
    });

    it('rejects title longer than 255 characters', () => {
      const longTitle = 'A'.repeat(256);
      const resLong = validateCreateHotel({ ...validPayload, title: longTitle });
      assert.equal(resLong.isValid, false);
      assert.ok(resLong.errors.some((e) => e.includes('cannot exceed 255 characters')));
    });

    it('rejects missing or blank description', () => {
      const resMissing = validateCreateHotel({ ...validPayload, description: '' });
      assert.equal(resMissing.isValid, false);
      assert.ok(resMissing.errors.some((e) => e.includes('description cannot be blank')));

      const resNull = validateCreateHotel({ ...validPayload, description: null });
      assert.equal(resNull.isValid, false);
      assert.ok(resNull.errors.some((e) => e.includes('description is required')));
    });

    it('validates latitude boundaries (-90 to +90) and precision', () => {
      // Required valid latitude test cases
      assert.equal(validateCreateHotel({ ...validPayload, latitude: '-33.8688' }).isValid, true);
      assert.equal(validateCreateHotel({ ...validPayload, latitude: '-90' }).isValid, true);
      assert.equal(validateCreateHotel({ ...validPayload, latitude: '90' }).isValid, true);
      assert.equal(validateCreateHotel({ ...validPayload, latitude: '90.0' }).isValid, true);
      assert.equal(validateCreateHotel({ ...validPayload, latitude: '-90.0' }).isValid, true);

      // Required boundary violation test cases
      const resLowBound = validateCreateHotel({ ...validPayload, latitude: '-90.000001' });
      assert.equal(resLowBound.isValid, false);
      assert.ok(resLowBound.errors.some((e) => e.includes('between -90.0 and 90.0')));

      const resHighBound = validateCreateHotel({ ...validPayload, latitude: '90.000001' });
      assert.equal(resHighBound.isValid, false);
      assert.ok(resHighBound.errors.some((e) => e.includes('between -90.0 and 90.0')));

      // Exceeds 6 decimal places (excessive decimal precision)
      const resPrecision = validateCreateHotel({ ...validPayload, latitude: '-33.8688123' });
      assert.equal(resPrecision.isValid, false);
      assert.ok(resPrecision.errors.some((e) => e.includes('cannot exceed 6 decimal places')));

      // Malformed numeric inputs (12abc, --5, Infinity, scientific notation 1e2)
      for (const malformed of ['12abc', '--5', 'Infinity', '-Infinity', '1e2', '1.5e-3']) {
        const res = validateCreateHotel({ ...validPayload, latitude: malformed });
        assert.equal(res.isValid, false, `Expected ${malformed} to be rejected`);
        assert.ok(res.errors.some((e) => e.includes('valid finite number')));
      }
    });

    it('validates longitude boundaries (-180 to +180) and precision', () => {
      // Required valid longitude test cases
      assert.equal(validateCreateHotel({ ...validPayload, longitude: '-70.6693' }).isValid, true);
      assert.equal(validateCreateHotel({ ...validPayload, longitude: '-180' }).isValid, true);
      assert.equal(validateCreateHotel({ ...validPayload, longitude: '180' }).isValid, true);
      assert.equal(validateCreateHotel({ ...validPayload, longitude: '180.0' }).isValid, true);
      assert.equal(validateCreateHotel({ ...validPayload, longitude: '-180.0' }).isValid, true);

      // Required boundary violation test cases
      const resLowBound = validateCreateHotel({ ...validPayload, longitude: '-180.000001' });
      assert.equal(resLowBound.isValid, false);
      assert.ok(resLowBound.errors.some((e) => e.includes('between -180.0 and 180.0')));

      const resHighBound = validateCreateHotel({ ...validPayload, longitude: '180.000001' });
      assert.equal(resHighBound.isValid, false);
      assert.ok(resHighBound.errors.some((e) => e.includes('between -180.0 and 180.0')));

      // Exceeds 6 decimal places (excessive decimal precision)
      const resPrecision = validateCreateHotel({ ...validPayload, longitude: '-70.6693123' });
      assert.equal(resPrecision.isValid, false);
      assert.ok(resPrecision.errors.some((e) => e.includes('cannot exceed 6 decimal places')));

      // Malformed numeric inputs (12abc, --5, Infinity, scientific notation 1e2)
      for (const malformed of ['12abc', '--5', 'Infinity', '-Infinity', '1e2', '1.5e-3']) {
        const res = validateCreateHotel({ ...validPayload, longitude: malformed });
        assert.equal(res.isValid, false, `Expected ${malformed} to be rejected`);
        assert.ok(res.errors.some((e) => e.includes('valid finite number')));
      }
    });

    it('validates price constraints (positive, non-zero, max 2 decimals, finite)', () => {
      // Valid cases
      assert.equal(validateCreateHotel({ ...validPayload, price: '0.01' }).isValid, true);
      assert.equal(validateCreateHotel({ ...validPayload, price: '150' }).isValid, true);
      assert.equal(validateCreateHotel({ ...validPayload, price: 250.5 }).isValid, true);

      // Zero is rejected
      const resZero = validateCreateHotel({ ...validPayload, price: '0.00' });
      assert.equal(resZero.isValid, false);
      assert.ok(resZero.errors.some((e) => e.includes('greater than zero')));

      // Negative is rejected
      const resNeg = validateCreateHotel({ ...validPayload, price: '-10.50' });
      assert.equal(resNeg.isValid, false);
      assert.ok(resNeg.errors.some((e) => e.includes('greater than zero')));

      // Exceeding 2 decimal places is rejected
      const resDecimals = validateCreateHotel({ ...validPayload, price: '99.999' });
      assert.equal(resDecimals.isValid, false);
      assert.ok(resDecimals.errors.some((e) => e.includes('more than 2 decimal places')));

      // NaN or Infinity
      const resNan = validateCreateHotel({ ...validPayload, price: 'NaN' });
      assert.equal(resNan.isValid, false);
      assert.ok(resNan.errors.some((e) => e.includes('finite number')));
    });
  });

  // --------------------------------------------------------------------------
  // validateListHotels
  // --------------------------------------------------------------------------
  describe('validateListHotels()', () => {
    it('provides sensible defaults for empty query', () => {
      const res = validateListHotels({});
      assert.equal(res.isValid, true);
      assert.equal(res.value.limit, 10);
      assert.equal(res.value.offset, 0);
      assert.equal(res.value.title, undefined);
    });

    it('trims title search query', () => {
      const res = validateListHotels({ title: '  Seaside   ' });
      assert.equal(res.isValid, true);
      assert.equal(res.value.title, 'Seaside');
    });

    it('accepts valid price range filters', () => {
      const res = validateListHotels({ minPrice: '100.00', maxPrice: '500.00' });
      assert.equal(res.isValid, true);
      assert.equal(res.value.minPrice, 100);
      assert.equal(res.value.maxPrice, 500);
    });

    it('rejects minPrice > maxPrice', () => {
      const res = validateListHotels({ minPrice: '500', maxPrice: '100' });
      assert.equal(res.isValid, false);
      assert.ok(res.errors.some((e) => e.includes('minPrice cannot be greater than maxPrice')));
    });

    it('rejects negative minPrice or maxPrice', () => {
      const res = validateListHotels({ minPrice: '-10' });
      assert.equal(res.isValid, false);
      assert.ok(res.errors.some((e) => e.includes('cannot be negative')));
    });

    it('validates limit bounds (1 to 100, integer)', () => {
      assert.equal(validateListHotels({ limit: '1' }).value.limit, 1);
      assert.equal(validateListHotels({ limit: '100' }).value.limit, 100);

      // Exceeds 100
      const resOver = validateListHotels({ limit: '101' });
      assert.equal(resOver.isValid, false);
      assert.ok(resOver.errors.some((e) => e.includes('between 1 and 100')));

      // Zero or negative
      const resZero = validateListHotels({ limit: '0' });
      assert.equal(resZero.isValid, false);

      // Non-integer
      const resFloat = validateListHotels({ limit: '10.5' });
      assert.equal(resFloat.isValid, false);
      assert.ok(resFloat.errors.some((e) => e.includes('must be an integer')));
    });

    it('validates offset (non-negative integer)', () => {
      assert.equal(validateListHotels({ offset: '0' }).value.offset, 0);
      assert.equal(validateListHotels({ offset: '50' }).value.offset, 50);

      const resNeg = validateListHotels({ offset: '-5' });
      assert.equal(resNeg.isValid, false);
      assert.ok(resNeg.errors.some((e) => e.includes('cannot be negative')));
    });
  });
});
