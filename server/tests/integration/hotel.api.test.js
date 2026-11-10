const fs = require('fs');
const path = require('path');
const { pool } = require('../../src/config/db');
const app = require('../../src/app');
const hotelService = require('../../src/services/hotel.service');
const { safeDeleteHotelImage } = hotelService;
const {
  setStorageService,
  resetStorageService,
  createStorageService,
} = require('../../src/storage');

const PORT = 5001; // Separate port for test isolation
let server;

const SRC_DIR = path.resolve(__dirname, '../../src');
const UPLOAD_HOTELS_DIR = path.resolve(SRC_DIR, 'uploads/hotels');

// Valid image binary buffers for testing
const VALID_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00,
  0x60, 0x00, 0x60, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06,
  0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b,
  0x0c, 0x19, 0x12, 0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
  0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31,
  0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff,
  0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00,
  0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b,
  0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xbf, 0x00, 0xff, 0xd9,
]);

const VALID_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
  0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
  0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
  0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const INVALID_FAKE_IMAGE = Buffer.from(
  '<?php echo "Hacked"; ?> This is a script disguised as image'
);

const OVERSIZED_IMAGE = Buffer.alloc(5.5 * 1024 * 1024); // 5.5 MB (exceeds 5MB limit)

const BASE_URL = `http://localhost:${PORT}/api`;

async function postHotel(fields, fileBuffer = null, fileName = null, mimeType = null) {
  const form = new FormData();
  for (const [key, val] of Object.entries(fields)) {
    form.append(key, String(val));
  }

  if (fileBuffer) {
    const blob = new Blob([fileBuffer], { type: mimeType || 'image/jpeg' });
    form.append('image', blob, fileName || 'test.jpg');
  }

  const res = await fetch(`${BASE_URL}/hotels`, {
    method: 'POST',
    body: form,
  });

  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function getHotels(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE_URL}/hotels${qs ? `?${qs}` : ''}`;
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function getHotelById(id) {
  const res = await fetch(`${BASE_URL}/hotels/${id}`);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function putHotel(id, fields, fileBuffer = null, fileName = null, mimeType = null) {
  const form = new FormData();
  for (const [key, val] of Object.entries(fields)) {
    form.append(key, String(val));
  }

  if (fileBuffer) {
    const blob = new Blob([fileBuffer], { type: mimeType || 'image/jpeg' });
    form.append('image', blob, fileName || 'test.jpg');
  }

  const res = await fetch(`${BASE_URL}/hotels/${id}`, {
    method: 'PUT',
    body: form,
  });

  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function deleteHotelReq(id) {
  const res = await fetch(`${BASE_URL}/hotels/${id}`, {
    method: 'DELETE',
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function getHotelStatsReq() {
  const res = await fetch(`${BASE_URL}/hotels/stats`);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function runIntegrationTests() {
  console.log('====================================================');
  console.log('   NAMLATIC HOTEL INTEGRATION SUITE (PHASE 3A & 3B) ');
  console.log('====================================================\n');

  // Start isolated test server
  await new Promise((resolve) => {
    server = app.listen(PORT, resolve);
  });
  console.log(`Test server running on port ${PORT}\n`);

  const results = [];
  const createdHotelIds = [];
  const initialUploadFiles = new Set(
    fs.readdirSync(UPLOAD_HOTELS_DIR).filter((f) => f !== '.gitkeep')
  );

  const assert = (name, condition, details = '') => {
    if (condition) {
      console.log(`✅ [PASS] ${name}`);
      results.push({ name, passed: true, details });
    } else {
      console.error(`❌ [FAIL] ${name} - Details: ${details}`);
      results.push({ name, passed: false, details });
    }
  };

  try {
    // -------------------------------------------------------------
    // PART 1: POST /api/hotels TESTS (PHASE 3A)
    // -------------------------------------------------------------
    console.log('--- PART 1: POST /api/hotels Tests ---');

    // Test 1: Valid hotel without image
    {
      const res = await postHotel({
        title: 'Seaside Paradise Resort',
        description: 'Luxury beachfront resort with private pool and ocean view.',
        latitude: 24.453884,
        longitude: 54.377344,
        price: 249.99,
      });

      assert(
        'POST: Valid hotel without image returns HTTP 201',
        res.status === 201 &&
          res.body?.status === 'success' &&
          res.body?.data?.title === 'Seaside Paradise Resort' &&
          res.body?.data?.image_path === null,
        JSON.stringify(res.body)
      );

      if (res.body?.data?.id) createdHotelIds.push(res.body.data.id);
    }

    // Test 2: Valid hotel with JPEG image
    {
      const res = await postHotel(
        {
          title: 'Alpine Mountain Lodge',
          description: 'Cozy ski-in ski-out lodge surrounded by snow-capped peaks.',
          latitude: 46.519962,
          longitude: 6.633597,
          price: 189.5,
        },
        VALID_JPEG,
        'mountain.jpg',
        'image/jpeg'
      );

      assert(
        'POST: Valid hotel with JPEG image returns HTTP 201 with image_path',
        res.status === 201 &&
          res.body?.status === 'success' &&
          res.body?.data?.image_path?.startsWith('/uploads/hotels/'),
        JSON.stringify(res.body)
      );

      if (res.body?.data?.id) createdHotelIds.push(res.body.data.id);
    }

    // Test 3: Valid hotel with PNG image
    {
      const res = await postHotel(
        {
          title: 'Urban Boutique Hotel',
          description: 'Contemporary downtown design hotel with rooftop bar.',
          latitude: 40.712776,
          longitude: -74.005974,
          price: 320.0,
        },
        VALID_PNG,
        'boutique.png',
        'image/png'
      );

      assert(
        'POST: Valid hotel with PNG image returns HTTP 201 with image_path',
        res.status === 201 &&
          res.body?.status === 'success' &&
          res.body?.data?.image_path?.endsWith('.png'),
        JSON.stringify(res.body)
      );

      if (res.body?.data?.id) createdHotelIds.push(res.body.data.id);
    }

    // Test 4: Blank title rejected
    {
      const res = await postHotel({
        title: '   ',
        description: 'Valid description',
        latitude: 10.0,
        longitude: 20.0,
        price: 100,
      });
      assert(
        'POST: Reject blank title returns HTTP 400',
        res.status === 400 && res.body?.errors?.some((e) => e.includes('title')),
        JSON.stringify(res.body)
      );
    }

    // Test 5: Blank description rejected
    {
      const res = await postHotel({
        title: 'Valid Title',
        description: '   ',
        latitude: 10.0,
        longitude: 20.0,
        price: 100,
      });
      assert(
        'POST: Reject blank description returns HTTP 400',
        res.status === 400 && res.body?.errors?.some((e) => e.includes('description')),
        JSON.stringify(res.body)
      );
    }

    // Test 6: Latitude > 90 rejected
    {
      const res = await postHotel({
        title: 'North Pole Beyond',
        description: 'Out of bounds latitude test.',
        latitude: 91.5,
        longitude: 0.0,
        price: 100,
      });
      assert(
        'POST: Reject latitude > 90 returns HTTP 400',
        res.status === 400 && res.body?.errors?.some((e) => e.includes('Latitude')),
        JSON.stringify(res.body)
      );
    }

    // Test 7: Longitude > 180 rejected
    {
      const res = await postHotel({
        title: 'Date Line Beyond',
        description: 'Out of bounds longitude test.',
        latitude: 0.0,
        longitude: 185.0,
        price: 100,
      });
      assert(
        'POST: Reject longitude > 180 returns HTTP 400',
        res.status === 400 && res.body?.errors?.some((e) => e.includes('Longitude')),
        JSON.stringify(res.body)
      );
    }

    // Test 8: Price <= 0 rejected
    {
      const res = await postHotel({
        title: 'Free Hotel',
        description: 'Cannot have zero or negative price.',
        latitude: 10.0,
        longitude: 20.0,
        price: 0,
      });
      assert(
        'POST: Reject price <= 0 returns HTTP 400',
        res.status === 400 && res.body?.errors?.some((e) => e.includes('Price')),
        JSON.stringify(res.body)
      );
    }

    // Test 9: Spoofed fake image rejected by magic bytes
    {
      const res = await postHotel(
        {
          title: 'Fake Image Hotel',
          description: 'Testing magic bytes security inspection.',
          latitude: 10.0,
          longitude: 20.0,
          price: 100,
        },
        INVALID_FAKE_IMAGE,
        'fake.jpg',
        'image/jpeg'
      );
      assert(
        'POST: Reject fake image file (magic bytes mismatch) returns HTTP 400',
        res.status === 400 && res.body?.message?.includes('File signature'),
        JSON.stringify(res.body)
      );
    }

    // Test 10: File > 5 MB rejected
    {
      const res = await postHotel(
        {
          title: 'Oversized Image Hotel',
          description: 'Testing file size limit enforcement.',
          latitude: 10.0,
          longitude: 20.0,
          price: 100,
        },
        OVERSIZED_IMAGE,
        'huge.jpg',
        'image/jpeg'
      );
      assert(
        'POST: Reject file > 5 MB returns HTTP 400',
        res.status === 400 && res.body?.message?.includes('5 MB'),
        JSON.stringify(res.body)
      );
    }

    // Test 11: File cleanup on body validation failure
    {
      const filesBefore = fs.readdirSync(UPLOAD_HOTELS_DIR).filter((f) => f !== '.gitkeep');
      const res = await postHotel(
        {
          title: '', // Invalid empty title
          description: 'Valid description',
          latitude: 10.0,
          longitude: 20.0,
          price: 100,
        },
        VALID_JPEG,
        'orphaned-check.jpg',
        'image/jpeg'
      );
      const filesAfter = fs.readdirSync(UPLOAD_HOTELS_DIR).filter((f) => f !== '.gitkeep');

      assert(
        'POST: Clean up uploaded image if validation fails (no orphaned files)',
        res.status === 400 && filesBefore.length === filesAfter.length,
        `Before: ${filesBefore.length}, After: ${filesAfter.length}`
      );
    }

    // -------------------------------------------------------------
    // PART 2: GET /api/hotels TESTS (PHASE 3A)
    // -------------------------------------------------------------
    console.log('\n--- PART 2: GET /api/hotels Tests ---');

    // Test 12: Retrieve all hotels
    {
      const res = await getHotels();
      assert(
        'GET: Retrieve all hotels returns HTTP 200 with data array and pagination metadata',
        res.status === 200 &&
          res.body?.status === 'success' &&
          Array.isArray(res.body?.data) &&
          res.body?.pagination?.total >= 3,
        JSON.stringify(res.body)
      );
    }

    // Test 13: Case-insensitive prefix search
    {
      const res = await getHotels({ title: 'sea' });
      assert(
        'GET: Title prefix search "sea" matches "Seaside Paradise Resort"',
        res.status === 200 &&
          res.body?.data?.length >= 1 &&
          res.body?.data?.some((h) => h.title.includes('Seaside')),
        JSON.stringify(res.body)
      );
    }

    // Test 14: minPrice filter
    {
      const res = await getHotels({ minPrice: 200 });
      assert(
        'GET: minPrice=200 returns only hotels with price >= 200',
        res.status === 200 &&
          res.body?.data?.length > 0 &&
          res.body?.data?.every((h) => parseFloat(h.price) >= 200.0),
        JSON.stringify(res.body)
      );
    }

    // Test 15: maxPrice filter
    {
      const res = await getHotels({ maxPrice: 200 });
      assert(
        'GET: maxPrice=200 returns only hotels with price <= 200',
        res.status === 200 &&
          res.body?.data?.length > 0 &&
          res.body?.data?.every((h) => parseFloat(h.price) <= 200.0),
        JSON.stringify(res.body)
      );
    }

    // Test 16: Combined price range
    {
      const res = await getHotels({ minPrice: 180, maxPrice: 260 });
      assert(
        'GET: Combined price filter 180..260 returns hotels in budget range',
        res.status === 200 &&
          res.body?.data?.every(
            (h) => parseFloat(h.price) >= 180.0 && parseFloat(h.price) <= 260.0
          ),
        JSON.stringify(res.body)
      );
    }

    // Test 17: Pagination limit and offset
    {
      const res = await getHotels({ limit: 1, offset: 1 });
      assert(
        'GET: Pagination limit=1, offset=1 returns exactly 1 item with pagination metadata',
        res.status === 200 &&
          res.body?.data?.length === 1 &&
          res.body?.pagination?.limit === 1 &&
          res.body?.pagination?.offset === 1,
        JSON.stringify(res.body)
      );
    }

    // Test 18: Search non-existent
    {
      const res = await getHotels({ title: 'NonexistentHotelTitle99999' });
      assert(
        'GET: Search for non-existent hotel returns empty array and total=0',
        res.status === 200 && res.body?.data?.length === 0 && res.body?.pagination?.total === 0,
        JSON.stringify(res.body)
      );
    }

    // Test 19: minPrice > maxPrice
    {
      const res = await getHotels({ minPrice: 500, maxPrice: 100 });
      assert(
        'GET: minPrice > maxPrice rejected with HTTP 400',
        res.status === 400 && res.body?.errors?.some((e) => e.includes('greater than')),
        JSON.stringify(res.body)
      );
    }

    // Test 20: Invalid limit (> 100)
    {
      const res = await getHotels({ limit: 150 });
      assert(
        'GET: limit > 100 rejected with HTTP 400',
        res.status === 400 && res.body?.errors?.some((e) => e.includes('limit')),
        JSON.stringify(res.body)
      );
    }

    // -------------------------------------------------------------
    // PART 3: GET /api/hotels/:id TESTS (PHASE 3B)
    // -------------------------------------------------------------
    console.log('\n--- PART 3: GET /api/hotels/:id Tests ---');

    // Create a target hotel with image for detail/update/delete testing
    const hotelWithImageRes = await postHotel(
      {
        title: 'Phase3B Test Resort',
        description: 'Hotel for Phase 3B lifecycle testing.',
        latitude: 25.123456,
        longitude: 55.654321,
        price: 320.0,
      },
      VALID_JPEG,
      'phase3b-init.jpg'
    );
    const targetHotel = hotelWithImageRes.body.data;
    createdHotelIds.push(targetHotel.id);

    // Test 21: GET existing hotel returns HTTP 200
    {
      const res = await getHotelById(targetHotel.id);
      assert(
        'GET /:id: Existing hotel returns HTTP 200 with all fields',
        res.status === 200 &&
          res.body?.status === 'success' &&
          res.body?.data?.id === targetHotel.id &&
          res.body?.data?.title === 'Phase3B Test Resort' &&
          Boolean(res.body?.data?.image_path),
        JSON.stringify(res.body)
      );
    }

    // Test 22: GET nonexistent hotel returns HTTP 404
    {
      const res = await getHotelById('99999999');
      assert(
        'GET /:id: Nonexistent hotel returns HTTP 404',
        res.status === 404 && res.body?.message === 'Hotel not found.',
        JSON.stringify(res.body)
      );
    }

    // Test 23: GET non-integer ID returns HTTP 400
    {
      const res = await getHotelById('abc');
      assert(
        'GET /:id: Non-integer ID "abc" rejected with HTTP 400',
        res.status === 400 && res.body?.message?.includes('positive integer'),
        JSON.stringify(res.body)
      );
    }

    // Test 24: GET zero ID returns HTTP 400
    {
      const res = await getHotelById('0');
      assert(
        'GET /:id: Zero ID "0" rejected with HTTP 400',
        res.status === 400 && res.body?.message?.includes('positive integer'),
        JSON.stringify(res.body)
      );
    }

    // Test 25: GET negative ID returns HTTP 400
    {
      const res = await getHotelById('-10');
      assert(
        'GET /:id: Negative ID "-10" rejected with HTTP 400',
        res.status === 400 && res.body?.message?.includes('positive integer'),
        JSON.stringify(res.body)
      );
    }

    // -------------------------------------------------------------
    // PART 4: PUT /api/hotels/:id TESTS (PHASE 3B)
    // -------------------------------------------------------------
    console.log('\n--- PART 4: PUT /api/hotels/:id Tests ---');

    let currentImagePath = targetHotel.image_path;
    let currentImageDisk = path.resolve(SRC_DIR, currentImagePath.replace(/^\//, ''));

    // Test 26: PUT update without new image preserves existing image_path
    {
      const res = await putHotel(targetHotel.id, {
        title: 'Phase3B Test Resort - Updated',
        description: 'Updated description without changing image.',
        latitude: 25.123456,
        longitude: 55.654321,
        price: 349.99,
      });

      assert(
        'PUT: Update without new image preserves existing image_path and returns HTTP 200',
        res.status === 200 &&
          res.body?.data?.title === 'Phase3B Test Resort - Updated' &&
          res.body?.data?.price === '349.99' &&
          res.body?.data?.image_path === currentImagePath &&
          fs.existsSync(currentImageDisk),
        JSON.stringify(res.body)
      );
    }

    // Test 27: PUT update with new JPEG replaces image and deletes old image
    let newImageDisk;
    {
      const oldImageDisk = currentImageDisk;
      const res = await putHotel(
        targetHotel.id,
        {
          title: 'Phase3B Test Resort - With New Image',
          description: 'Updated with a brand new photo.',
          latitude: 25.123456,
          longitude: 55.654321,
          price: 399.0,
        },
        VALID_JPEG,
        'phase3b-updated.jpg'
      );

      const newImagePath = res.body?.data?.image_path;
      newImageDisk = newImagePath
        ? path.resolve(SRC_DIR, newImagePath.replace(/^\//, ''))
        : null;

      const oldDeleted = !fs.existsSync(oldImageDisk);
      const newExists = newImageDisk ? fs.existsSync(newImageDisk) : false;

      assert(
        'PUT: Update with new image deletes old file, saves new file, and updates image_path',
        res.status === 200 &&
          newImagePath !== currentImagePath &&
          oldDeleted &&
          newExists,
        `oldDeleted=${oldDeleted}, newExists=${newExists}, res=${JSON.stringify(res.body)}`
      );

      // Advance current image pointers
      currentImagePath = newImagePath;
      currentImageDisk = newImageDisk;
    }

    // Test 28: PUT update with invalid payload rejects and preserves existing image
    {
      const res = await putHotel(
        targetHotel.id,
        {
          title: '', // Invalid empty title
          description: 'Valid description',
          latitude: 25.0,
          longitude: 55.0,
          price: 100,
        },
        VALID_JPEG,
        'should-be-cleaned.jpg'
      );

      const existingImageStillPresent = fs.existsSync(currentImageDisk);

      assert(
        'PUT: Invalid payload rejected (HTTP 400), existing image remains intact',
        res.status === 400 &&
          res.body?.errors?.some((e) => e.includes('title')) &&
          existingImageStillPresent,
        JSON.stringify(res.body)
      );
    }

    // Test 29: PUT update on nonexistent hotel rejects with HTTP 404
    {
      const res = await putHotel(
        '99999999',
        {
          title: 'Ghost Hotel',
          description: 'Does not exist.',
          latitude: 25.0,
          longitude: 55.0,
          price: 100,
        },
        VALID_JPEG,
        'ghost.jpg'
      );

      assert(
        'PUT: Nonexistent hotel returns HTTP 404 and cleans up uploaded file',
        res.status === 404 && res.body?.message === 'Hotel not found.',
        JSON.stringify(res.body)
      );
    }

    // Test 30: PUT update with invalid ID returns HTTP 400
    {
      const res = await putHotel(
        'abc',
        {
          title: 'Invalid ID Hotel',
          description: 'Testing invalid route parameter.',
          latitude: 25.0,
          longitude: 55.0,
          price: 100,
        },
        VALID_JPEG,
        'invalid-id.jpg'
      );

      assert(
        'PUT: Invalid ID "abc" returns HTTP 400 and cleans up uploaded file',
        res.status === 400 && res.body?.message?.includes('positive integer'),
        JSON.stringify(res.body)
      );
    }

    // Test 31: PUT update with fake image (invalid magic bytes) rejected with HTTP 400
    {
      const res = await putHotel(
        targetHotel.id,
        {
          title: 'Phase3B Test Resort - Fake Image',
          description: 'Attempting to upload malicious fake image.',
          latitude: 25.123456,
          longitude: 55.654321,
          price: 399.0,
        },
        INVALID_FAKE_IMAGE,
        'exploit.jpg'
      );

      const existingImagePreserved = fs.existsSync(currentImageDisk);

      assert(
        'PUT: Fake image rejected (HTTP 400), existing hotel image remains intact',
        res.status === 400 &&
          res.body?.message?.includes('File signature') &&
          existingImagePreserved,
        JSON.stringify(res.body)
      );
    }

    // Test 32: PUT update with invalid price (<= 0) rejected and file cleaned up
    {
      const filesBefore = fs.readdirSync(UPLOAD_HOTELS_DIR).filter((f) => f !== '.gitkeep');

      const res = await putHotel(
        targetHotel.id,
        {
          title: 'Phase3B Test Resort',
          description: 'Attempting zero price update.',
          latitude: 25.123456,
          longitude: 55.654321,
          price: 0,
        },
        VALID_JPEG,
        'zero-price.jpg'
      );

      const filesAfter = fs.readdirSync(UPLOAD_HOTELS_DIR).filter((f) => f !== '.gitkeep');
      const existingImagePreserved = fs.existsSync(currentImageDisk);
      const noNewFileOrphaned = filesBefore.length === filesAfter.length;

      assert(
        'PUT: Zero price rejected (HTTP 400), uploaded file unlinked, existing image intact',
        res.status === 400 &&
          res.body?.errors?.some((e) => e.includes('Price')) &&
          existingImagePreserved &&
          noNewFileOrphaned,
        `res=${JSON.stringify(res.body)}, existing=${existingImagePreserved}, noOrphans=${noNewFileOrphaned}`
      );
    }

    // Test 33: PUT update with invalid latitude (< -90) rejected and file cleaned up
    {
      const filesBefore = fs.readdirSync(UPLOAD_HOTELS_DIR).filter((f) => f !== '.gitkeep');

      const res = await putHotel(
        targetHotel.id,
        {
          title: 'Phase3B Test Resort',
          description: 'Attempting invalid latitude update.',
          latitude: -95.5,
          longitude: 55.654321,
          price: 250.0,
        },
        VALID_JPEG,
        'bad-lat.jpg'
      );

      const filesAfter = fs.readdirSync(UPLOAD_HOTELS_DIR).filter((f) => f !== '.gitkeep');
      const existingImagePreserved = fs.existsSync(currentImageDisk);
      const noNewFileOrphaned = filesBefore.length === filesAfter.length;

      assert(
        'PUT: Out-of-range latitude rejected (HTTP 400), uploaded file unlinked, existing image intact',
        res.status === 400 &&
          res.body?.errors?.some((e) => e.includes('Latitude')) &&
          existingImagePreserved &&
          noNewFileOrphaned,
        `res=${JSON.stringify(res.body)}, existing=${existingImagePreserved}, noOrphans=${noNewFileOrphaned}`
      );
    }

    // -------------------------------------------------------------
    // PART 5: DELETE /api/hotels/:id TESTS (PHASE 3B)
    // -------------------------------------------------------------
    console.log('\n--- PART 5: DELETE /api/hotels/:id Tests ---');

    // Test 34: DELETE hotel with image removes DB record and deletes image from disk
    {
      const res = await deleteHotelReq(targetHotel.id);
      const imageDeletedFromDisk = !fs.existsSync(currentImageDisk);
      const verifyDb = await getHotelById(targetHotel.id);

      assert(
        'DELETE: Hotel with image deleted from DB and image file removed from disk',
        res.status === 200 &&
          res.body?.message === 'Hotel deleted successfully.' &&
          imageDeletedFromDisk &&
          verifyDb.status === 404,
        `res=${JSON.stringify(res.body)}, imageDeleted=${imageDeletedFromDisk}, dbCheck=${verifyDb.status}`
      );
    }

    // Test 35: DELETE hotel without image succeeds cleanly
    {
      const noImageRes = await postHotel({
        title: 'Hotel Without Image',
        description: 'For testing delete without image.',
        latitude: 10.0,
        longitude: 20.0,
        price: 99.0,
      });
      const noImageId = noImageRes.body.data.id;

      const delRes = await deleteHotelReq(noImageId);
      const verifyDb = await getHotelById(noImageId);

      assert(
        'DELETE: Hotel without image returns HTTP 200 and removes DB record',
        delRes.status === 200 &&
          delRes.body?.message === 'Hotel deleted successfully.' &&
          verifyDb.status === 404,
        JSON.stringify(delRes.body)
      );
    }

    // Test 36: DELETE nonexistent hotel returns HTTP 404
    {
      const res = await deleteHotelReq('99999999');
      assert(
        'DELETE: Nonexistent hotel returns HTTP 404',
        res.status === 404 && res.body?.message === 'Hotel not found.',
        JSON.stringify(res.body)
      );
    }

    // Test 37: DELETE invalid ID returns HTTP 400
    {
      const res = await deleteHotelReq('bad-id');
      assert(
        'DELETE: Invalid ID "bad-id" returns HTTP 400',
        res.status === 400 && res.body?.message?.includes('positive integer'),
        JSON.stringify(res.body)
      );
    }

    // Test 38: DELETE handles already-missing image file safely
    {
      const tempHotelRes = await postHotel(
        {
          title: 'Missing Image Test Hotel',
          description: 'Testing missing file tolerance on delete.',
          latitude: 12.34,
          longitude: 56.78,
          price: 150.0,
        },
        VALID_JPEG,
        'temp-missing.jpg'
      );
      const tempHotelId = tempHotelRes.body.data.id;
      const tempImagePath = tempHotelRes.body.data.image_path;
      const tempDiskPath = path.resolve(SRC_DIR, tempImagePath.replace(/^\//, ''));

      // Delete file beforehand
      if (fs.existsSync(tempDiskPath)) {
        fs.unlinkSync(tempDiskPath);
      }

      // Call DELETE API
      const delRes = await deleteHotelReq(tempHotelId);
      const verifyDb = await getHotelById(tempHotelId);

      assert(
        'DELETE: Safely handles already-missing image file and removes DB record',
        delRes.status === 200 &&
          delRes.body?.message === 'Hotel deleted successfully.' &&
          verifyDb.status === 404,
        JSON.stringify(delRes.body)
      );
    }

    // -------------------------------------------------------------
    // PART 6: GET /api/hotels/stats TESTS (PHASE 4A CORRECTION)
    // -------------------------------------------------------------
    console.log('\n--- PART 6: GET /api/hotels/stats Tests ---');

    // Test 39: GET /api/hotels/stats returns HTTP 200 with all aggregate fields
    {
      const res = await getHotelStatsReq();
      const data = res.body?.data;

      assert(
        'STATS: GET /api/hotels/stats returns HTTP 200 with aggregate structure',
        res.status === 200 &&
          res.body?.status === 'success' &&
          typeof data?.total_properties === 'number' &&
          typeof data?.average_price === 'string' &&
          typeof data?.min_price === 'string' &&
          typeof data?.max_price === 'string' &&
          typeof data?.properties_with_images === 'number',
        JSON.stringify(res.body)
      );
    }

    // Test 40: Total properties accurately matches actual database count
    {
      const dbCountRes = await pool.query('SELECT COUNT(*)::bigint AS count FROM hotels;');
      const actualCount = parseInt(dbCountRes.rows[0].count, 10);
      const res = await getHotelStatsReq();

      assert(
        'STATS: total_properties matches exact PostgreSQL row count',
        res.status === 200 && res.body?.data?.total_properties === actualCount,
        `Expected ${actualCount}, received: ${res.body?.data?.total_properties}`
      );
    }

    // Test 41: Properties with images strictly reflects non-null image_path count
    {
      const dbWithImagesRes = await pool.query('SELECT COUNT(image_path)::bigint AS count FROM hotels;');
      const actualImages = parseInt(dbWithImagesRes.rows[0].count, 10);
      const res = await getHotelStatsReq();

      assert(
        'STATS: properties_with_images reflects non-null image_path count in DB',
        res.status === 200 && res.body?.data?.properties_with_images === actualImages,
        `Expected ${actualImages}, received: ${res.body?.data?.properties_with_images}`
      );
    }

    // -------------------------------------------------------------
    // PART 7: SECURITY & STORAGE INTEGRITY TESTS (PHASE 3B)
    // -------------------------------------------------------------
    console.log('\n--- PART 7: Security & Filesystem Boundary Tests ---');

    // Test 42: Path traversal protection on file deletion
    {
      const gitkeepPath = path.resolve(UPLOAD_HOTELS_DIR, '.gitkeep');

      const attempt1 = await safeDeleteHotelImage('/uploads/hotels/.gitkeep');
      const attempt2 = await safeDeleteHotelImage('../../package.json');
      const gitkeepStillExists = fs.existsSync(gitkeepPath);

      assert(
        'SECURITY: Path traversal & protected files (.gitkeep) deletion attempts blocked',
        attempt1 === false && attempt2 === false && gitkeepStillExists,
        `attempt1=${attempt1}, attempt2=${attempt2}, gitkeepExists=${gitkeepStillExists}`
      );
    }

    // Test 43: Uploads folder has zero orphaned files (only .gitkeep or pre-existing seed files)
    {
      const currentFiles = fs.readdirSync(UPLOAD_HOTELS_DIR).filter((f) => f !== '.gitkeep');
      const newlyCreatedFiles = currentFiles.filter((f) => !initialUploadFiles.has(f));
      assert(
        'STORAGE: Uploads directory has zero orphaned files during active operations',
        newlyCreatedFiles.length <= 2,
        `Newly created files: ${JSON.stringify(newlyCreatedFiles)}`
      );
    }

    // -------------------------------------------------------------
    // PART 8: INFRASTRUCTURE, HEALTH & READINESS PROBES (PHASE 5B)
    // -------------------------------------------------------------
    console.log('\n--- PART 8: Infrastructure, Health & Readiness Probes (Phase 5B) ---');

    // Test 44: GET /api/health - Liveness probe returns 200 with uptime and status: 'ok'
    {
      const res = await fetch(`http://localhost:${PORT}/api/health`);
      const body = await res.json().catch(() => null);

      assert(
        'HEALTH: GET /api/health returns HTTP 200 with liveness metadata',
        res.status === 200 &&
          body?.status === 'ok' &&
          typeof body?.uptime === 'string' &&
          typeof body?.timestamp === 'string',
        `status=${res.status}, body=${JSON.stringify(body)}`
      );
    }

    // Test 45: GET /api/ready - Readiness probe returns 200 when database connected
    {
      const res = await fetch(`http://localhost:${PORT}/api/ready`);
      const body = await res.json().catch(() => null);

      assert(
        'READINESS: GET /api/ready returns HTTP 200 when PostgreSQL is connected',
        res.status === 200 &&
          body?.status === 'ready' &&
          body?.database?.connected === true &&
          Boolean(body?.database?.serverTime),
        `status=${res.status}, body=${JSON.stringify(body)}`
      );
    }

    // Test 46: GET /api/ready - Database outage returns HTTP 503 with sanitized error while /health remains 200
    {
      const originalQuery = pool.query;
      pool.query = async (text, params) => {
        if (typeof text === 'string' && text.includes('NOW()')) {
          const outageErr = new Error('Connection terminated unexpectedly');
          outageErr.code = 'ECONNREFUSED';
          throw outageErr;
        }
        return originalQuery.apply(pool, [text, params]);
      };

      try {
        const readyRes = await fetch(`http://localhost:${PORT}/api/ready`);
        const readyBody = await readyRes.json().catch(() => null);

        const healthRes = await fetch(`http://localhost:${PORT}/api/health`);
        const healthBody = await healthRes.json().catch(() => null);

        assert(
          'READINESS: Outage returns HTTP 503 with sanitized error, liveness stays 200',
          readyRes.status === 503 &&
            readyBody?.status === 'unhealthy' &&
            readyBody?.database?.connected === false &&
            typeof readyBody?.database?.error === 'string' &&
            !readyBody.database.error.includes('stack') &&
            healthRes.status === 200 &&
            healthBody?.status === 'ok',
          `readyStatus=${readyRes.status}, healthStatus=${healthRes.status}`
        );
      } finally {
        pool.query = originalQuery;
      }
    }

    // -------------------------------------------------------------
    // PART 9: EXPRESS PRODUCTION HARDENING & SECURITY (PHASE 5C)
    // -------------------------------------------------------------
    console.log('\n--- PART 9: Express Production Hardening & Security (Phase 5C) ---');

    // Test 47: Security Headers (Helmet nosniff, frameguard, referrer, CORP, CSP)
    {
      const res = await fetch(`http://localhost:${PORT}/api/health`);
      const nosniff = res.headers.get('x-content-type-options');
      const frameOptions = res.headers.get('x-frame-options');
      const referrer = res.headers.get('referrer-policy');
      const corp = res.headers.get('cross-origin-resource-policy');
      const csp = res.headers.get('content-security-policy');

      assert(
        'SECURITY HEADERS: Helmet headers configured correctly (nosniff, frameguard, referrer, corp, csp)',
        nosniff === 'nosniff' &&
          frameOptions === 'DENY' &&
          referrer === 'strict-origin-when-cross-origin' &&
          corp === 'cross-origin' &&
          Boolean(csp),
        `nosniff=${nosniff}, frameOptions=${frameOptions}, corp=${corp}, csp=${csp}`
      );
    }

    // Test 48: CORS Allowlist: Allowed origin receives ACAO header
    {
      const res = await fetch(`http://localhost:${PORT}/api/health`, {
        headers: { Origin: 'http://localhost:5173' },
      });
      const acao = res.headers.get('access-control-allow-origin');

      assert(
        'CORS: Allowed origin receives Access-Control-Allow-Origin header',
        res.status === 200 && acao === 'http://localhost:5173',
        `status=${res.status}, acao=${acao}`
      );
    }

    // Test 49: CORS Allowlist: Disallowed origin is rejected with HTTP 403
    {
      const res = await fetch(`http://localhost:${PORT}/api/health`, {
        headers: { Origin: 'http://malicious-attacker.com' },
      });
      const body = await res.json().catch(() => null);

      assert(
        'CORS: Disallowed origin rejected with HTTP 403 and CORS error message',
        res.status === 403 &&
          body?.status === 'error' &&
          body?.statusCode === 403 &&
          typeof body?.message === 'string' &&
          body.message.includes('CORS policy violation'),
        `status=${res.status}, body=${JSON.stringify(body)}`
      );
    }

    // Test 50: CORS Preflight: OPTIONS request from allowed origin returns HTTP 204
    {
      const res = await fetch(`http://localhost:${PORT}/api/hotels`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type',
        },
      });
      const acao = res.headers.get('access-control-allow-origin');
      const allowMethods = res.headers.get('access-control-allow-methods');

      assert(
        'CORS: Preflight OPTIONS request returns HTTP 204 with allowed methods',
        res.status === 204 &&
          acao === 'http://localhost:5173' &&
          allowMethods?.includes('POST'),
        `status=${res.status}, acao=${acao}, allowMethods=${allowMethods}`
      );
    }

    // Test 51: Body Size Limits: JSON body exceeding 10kb returns HTTP 413
    {
      const largePayload = {
        title: 'Large Hotel',
        description: 'X'.repeat(15 * 1024), // 15 KB (exceeds 10kb limit)
      };

      const res = await fetch(`http://localhost:${PORT}/api/hotels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(largePayload),
      });
      const body = await res.json().catch(() => null);

      assert(
        'BODY LIMIT: JSON payload exceeding 10kb returns HTTP 413 Payload Too Large',
        res.status === 413 &&
          body?.status === 'error' &&
          body?.statusCode === 413 &&
          body?.message?.includes('Request payload too large'),
        `status=${res.status}, body=${JSON.stringify(body)}`
      );
    }

    // Test 52: Rate Limiting & Exemption: Health and ready probes are exempt from rate limiting
    {
      const healthRes = await fetch(`http://localhost:${PORT}/api/health`);
      const readyRes = await fetch(`http://localhost:${PORT}/api/ready`);

      assert(
        'RATE LIMIT: Health and ready probes remain HTTP 200 without rate-limit throttling',
        healthRes.status === 200 && readyRes.status === 200,
        `healthStatus=${healthRes.status}, readyStatus=${readyRes.status}`
      );
    }

    // -------------------------------------------------------------
    // PART 10: Cloudflare R2 Storage & Resilience Tests (Phase 5D)
    // -------------------------------------------------------------
    console.log('\n--- PART 10: Cloudflare R2 Storage & Resilience Tests (Phase 5D) ---');

    const s3Calls = [];
    let s3UploadShouldFail = false;
    let s3DeleteShouldFail = false;

    const mockS3Client = {
      send: async (command) => {
        s3Calls.push(command);
        if (command.input && command.input.Body) {
          if (s3UploadShouldFail) {
            throw new Error('Simulated Cloudflare R2 PutObject network timeout');
          }
        }
        if (command.input && command.input.Key && !command.input.Body) {
          if (s3DeleteShouldFail) {
            throw new Error('Simulated Cloudflare R2 DeleteObject 500 error');
          }
        }
        return { $metadata: { httpStatusCode: 200 } };
      },
    };

    const r2PublicBase = 'https://cdn.namlatic-test.com';
    const r2TestService = createStorageService({
      driver: 'r2',
      r2Config: {
        accountId: 'test-account-12345',
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
        bucketName: 'test-hotels-bucket',
        publicBaseUrl: r2PublicBase,
      },
      s3Client: mockS3Client,
    });

    setStorageService(r2TestService);

    let r2HotelId = null;

    // Test 53: R2 CREATE: Creating a hotel with an image uploads to R2 and returns CDN URL
    {
      s3Calls.length = 0;
      const res = await postHotel(
        {
          title: 'Cloudflare R2 Resort',
          description: 'A luxurious property hosted with durable cloud storage.',
          latitude: 25.204849,
          longitude: 55.270783,
          price: 450.0,
        },
        VALID_JPEG,
        'resort.jpg',
        'image/jpeg'
      );

      const dbCheck = res.body?.data?.id
        ? await pool.query('SELECT image_path FROM hotels WHERE id = $1;', [res.body.data.id])
        : { rows: [] };
      const rawDbPath = dbCheck.rows[0]?.image_path;

      assert(
        'R2 STORAGE: Create hotel with image stores r2: reference in DB and returns public CDN URL',
        res.status === 201 &&
          res.body?.data?.image_path?.startsWith(`${r2PublicBase}/hotels/`) &&
          rawDbPath?.startsWith('r2:hotels/') &&
          s3Calls.length === 1 &&
          s3Calls[0].input.Bucket === 'test-hotels-bucket' &&
          s3Calls[0].input.ContentType === 'image/jpeg',
        `status=${res.status}, image_path=${res.body?.data?.image_path}, rawDbPath=${rawDbPath}, s3Calls=${s3Calls.length}`
      );

      if (res.body?.data?.id) {
        r2HotelId = res.body.data.id;
        createdHotelIds.push(r2HotelId);
      }
    }

    // Test 54: R2 CREATE: Creating a hotel without an image leaves image_path null and makes no S3 calls
    {
      s3Calls.length = 0;
      const res = await postHotel({
        title: 'Cloudflare R2 No Image Hotel',
        description: 'Budget hotel without an exterior photo.',
        latitude: 25.197197,
        longitude: 55.274376,
        price: 120.0,
      });

      assert(
        'R2 STORAGE: Create hotel without image leaves image_path null without calling R2',
        res.status === 201 && res.body?.data?.image_path === null && s3Calls.length === 0,
        `status=${res.status}, image_path=${res.body?.data?.image_path}, s3Calls=${s3Calls.length}`
      );

      if (res.body?.data?.id) createdHotelIds.push(res.body.data.id);
    }

    // Test 55: R2 UPDATE: Replacing an existing image uploads new object and deletes old object after commit
    {
      s3Calls.length = 0;
      const initialDbCheck = await pool.query('SELECT image_path FROM hotels WHERE id = $1;', [r2HotelId]);
      const oldR2Ref = initialDbCheck.rows[0]?.image_path;

      const res = await putHotel(
        r2HotelId,
        {
          title: 'Cloudflare R2 Resort - Renovated',
          description: 'A newly renovated luxurious property with updated photos.',
          latitude: 25.204849,
          longitude: 55.270783,
          price: 495.0,
        },
        VALID_PNG,
        'renovated.png',
        'image/png'
      );

      const updatedDbCheck = await pool.query('SELECT image_path FROM hotels WHERE id = $1;', [r2HotelId]);
      const newR2Ref = updatedDbCheck.rows[0]?.image_path;

      const putCall = s3Calls.find((c) => c.input?.Body);
      const delCall = s3Calls.find((c) => c.input?.Key && !c.input?.Body);

      assert(
        'R2 STORAGE: Replace image uploads replacement and deletes old object only after commit',
        res.status === 200 &&
          res.body?.data?.image_path?.startsWith(`${r2PublicBase}/hotels/`) &&
          res.body?.data?.image_path?.endsWith('.png') &&
          newR2Ref?.startsWith('r2:hotels/') &&
          newR2Ref !== oldR2Ref &&
          putCall !== undefined &&
          delCall !== undefined &&
          delCall.input.Key === oldR2Ref.slice(3),
        `status=${res.status}, newRef=${newR2Ref}, oldRef=${oldR2Ref}, s3Calls=${s3Calls.length}`
      );
    }

    // Test 56: R2 UPDATE: Updating text fields without new image preserves existing R2 reference
    {
      s3Calls.length = 0;
      const beforeUpdate = await pool.query('SELECT image_path FROM hotels WHERE id = $1;', [r2HotelId]);
      const preservedRef = beforeUpdate.rows[0]?.image_path;

      const res = await putHotel(r2HotelId, {
        title: 'Cloudflare R2 Resort - Price Mutated',
        description: 'Updated description without changing the property photo.',
        latitude: 25.204849,
        longitude: 55.270783,
        price: 520.0,
      });

      const afterUpdate = await pool.query('SELECT image_path FROM hotels WHERE id = $1;', [r2HotelId]);

      assert(
        'R2 STORAGE: Update without image preserves existing R2 image and makes zero S3 deletion calls',
        res.status === 200 &&
          res.body?.data?.price === '520.00' &&
          afterUpdate.rows[0]?.image_path === preservedRef &&
          s3Calls.length === 0,
        `status=${res.status}, preservedRef=${preservedRef}, s3Calls=${s3Calls.length}`
      );
    }

    // Test 57: R2 DELETE: Deleting hotel removes database record and deletes associated R2 object
    {
      s3Calls.length = 0;
      const beforeDelete = await pool.query('SELECT image_path FROM hotels WHERE id = $1;', [r2HotelId]);
      const imageToDelete = beforeDelete.rows[0]?.image_path;

      const res = await deleteHotelReq(r2HotelId);

      const afterDelete = await pool.query('SELECT id FROM hotels WHERE id = $1;', [r2HotelId]);
      const delCall = s3Calls.find((c) => c.input?.Key === imageToDelete.slice(3));

      assert(
        'R2 STORAGE: Delete hotel removes DB record and deletes associated R2 object from bucket',
        res.status === 200 &&
          afterDelete.rows.length === 0 &&
          delCall !== undefined &&
          delCall.input.Bucket === 'test-hotels-bucket',
        `status=${res.status}, dbRows=${afterDelete.rows.length}, s3Calls=${s3Calls.length}`
      );

      // Remove from createdHotelIds since it's now deleted
      const idx = createdHotelIds.indexOf(r2HotelId);
      if (idx !== -1) createdHotelIds.splice(idx, 1);
    }

    // Test 58: R2 RESILIENCE: R2 upload failure stops request and creates zero database records
    {
      s3Calls.length = 0;
      s3UploadShouldFail = true;

      const countBefore = await pool.query('SELECT COUNT(*) FROM hotels;');
      const res = await postHotel(
        {
          title: 'Failed R2 Upload Hotel',
          description: 'This hotel creation must fail because R2 is unreachable.',
          latitude: 24.0,
          longitude: 54.0,
          price: 200.0,
        },
        VALID_JPEG,
        'failing.jpg',
        'image/jpeg'
      );
      s3UploadShouldFail = false;

      const countAfter = await pool.query('SELECT COUNT(*) FROM hotels;');

      assert(
        'R2 RESILIENCE: R2 upload failure aborts creation and leaves zero database records with broken references',
        res.status === 500 &&
          parseInt(countBefore.rows[0].count, 10) === parseInt(countAfter.rows[0].count, 10),
        `status=${res.status}, before=${countBefore.rows[0].count}, after=${countAfter.rows[0].count}`
      );
    }

    // Test 59: R2 RESILIENCE: Database failure after R2 upload triggers compensating DeleteObjectCommand
    {
      s3Calls.length = 0;
      const tmpFile = path.resolve(SRC_DIR, 'uploads/hotels', 'test-compensate.jpg');
      await fs.promises.writeFile(tmpFile, VALID_JPEG);

      let threwDbError = false;
      try {
        await hotelService.createHotel(
          {
            title: 'Compensating Hotel',
            description: 'Triggers DB constraint error after upload',
            latitude: 24.0,
            longitude: 54.0,
            price: -50.0, // Violates chk_hotels_price_positive in DB
          },
          {
            path: tmpFile,
            filename: 'test-compensate.jpg',
            verifiedMimeType: 'image/jpeg',
            verifiedExtension: '.jpg',
          }
        );
      } catch (_err) {
        threwDbError = true;
      }

      const putCommand = s3Calls.find((c) => c.input?.Body);
      const compensateCommand = s3Calls.find((c) => c.input?.Key && !c.input?.Body);

      assert(
        'R2 RESILIENCE: Database insert failure triggers best-effort compensating delete of uploaded R2 object',
        threwDbError &&
          putCommand !== undefined &&
          compensateCommand !== undefined &&
          compensateCommand.input.Key === putCommand.input.Key,
        `threw=${threwDbError}, s3Calls=${s3Calls.length}`
      );
    }

    // Test 60: R2 RESILIENCE: Database update failure cleans up new image and preserves original old image
    {
      s3Calls.length = 0;
      const baseTmpFile = path.resolve(SRC_DIR, 'uploads/hotels', 'base-tmp.jpg');
      await fs.promises.writeFile(baseTmpFile, VALID_JPEG);

      const baseHotel = await hotelService.createHotel(
        {
          title: 'Resilient Update Hotel',
          description: 'Testing update rollback resilience.',
          latitude: 25.0,
          longitude: 55.0,
          price: 300.0,
        },
        {
          path: baseTmpFile,
          filename: 'base-tmp.jpg',
          verifiedMimeType: 'image/jpeg',
          verifiedExtension: '.jpg',
        }
      );
      if (baseHotel?.id) createdHotelIds.push(baseHotel.id);

      const dbCheckBefore = await pool.query('SELECT image_path FROM hotels WHERE id = $1;', [baseHotel.id]);
      const originalImageRef = dbCheckBefore.rows[0].image_path;

      s3Calls.length = 0;
      const newTmpFile = path.resolve(SRC_DIR, 'uploads/hotels', 'replacement-tmp.png');
      await fs.promises.writeFile(newTmpFile, VALID_PNG);

      let threwUpdateError = false;
      try {
        await hotelService.updateHotel(
          baseHotel.id,
          {
            title: 'Resilient Update Hotel Mutated',
            description: 'New description',
            latitude: 199.0, // Violates chk_hotels_latitude_range in DB
            longitude: 55.0,
            price: 300.0,
          },
          {
            path: newTmpFile,
            filename: 'replacement-tmp.png',
            verifiedMimeType: 'image/png',
            verifiedExtension: '.png',
          }
        );
      } catch (_err) {
        threwUpdateError = true;
      }

      const dbCheckAfter = await pool.query('SELECT image_path FROM hotels WHERE id = $1;', [baseHotel.id]);
      const currentImageRef = dbCheckAfter.rows[0].image_path;

      const deletedKeys = s3Calls
        .filter((c) => c.input?.Key && !c.input?.Body)
        .map((c) => c.input.Key);

      assert(
        'R2 RESILIENCE: Failed database update deletes replacement image and leaves original image intact',
        threwUpdateError &&
          currentImageRef === originalImageRef &&
          deletedKeys.includes(originalImageRef.slice(3)) === false,
        `threw=${threwUpdateError}, currentRef=${currentImageRef}, deletedKeys=${JSON.stringify(deletedKeys)}`
      );
    }

    // Test 61: R2 RESILIENCE: R2 deletion failure after successful DB deletion logs warning and returns HTTP 200
    {
      const delTmpFile = path.resolve(SRC_DIR, 'uploads/hotels', 'del-tmp.jpg');
      await fs.promises.writeFile(delTmpFile, VALID_JPEG);

      const hotelToDelete = await hotelService.createHotel(
        {
          title: 'Hotel for Delete Failure Test',
          description: 'Tests tolerance when R2 delete encounters network issue.',
          latitude: 25.0,
          longitude: 55.0,
          price: 250.0,
        },
        {
          path: delTmpFile,
          filename: 'del-tmp.jpg',
          verifiedMimeType: 'image/jpeg',
          verifiedExtension: '.jpg',
        }
      );

      s3DeleteShouldFail = true;
      const res = await deleteHotelReq(hotelToDelete.id);
      s3DeleteShouldFail = false;

      const dbCheck = await pool.query('SELECT id FROM hotels WHERE id = $1;', [hotelToDelete.id]);

      assert(
        'R2 RESILIENCE: R2 deletion failure after successful DB deletion logs warning, maintains DB consistency, and returns HTTP 200',
        res.status === 200 && dbCheck.rows.length === 0,
        `status=${res.status}, dbRows=${dbCheck.rows.length}`
      );
    }

    // Test 62: LEGACY COMPATIBILITY: Existing local image references resolve properly and delete without touching R2
    {
      s3Calls.length = 0;
      const legacyInsert = await pool.query(`
        INSERT INTO hotels (title, description, latitude, longitude, price, image_path)
        VALUES ('Legacy Local Hotel', 'Created before Cloudflare R2 migration.', 24.5, 54.5, 180.0, '/uploads/hotels/legacy-sample.jpg')
        RETURNING id, image_path;
      `);
      const legacyId = legacyInsert.rows[0].id;
      createdHotelIds.push(legacyId);

      const getRes = await getHotelById(legacyId);
      const delRes = await deleteHotelReq(legacyId);
      const legIdx = createdHotelIds.indexOf(legacyId);
      if (legIdx !== -1) createdHotelIds.splice(legIdx, 1);

      assert(
        'LEGACY COMPATIBILITY: Legacy local image references resolve as relative paths and do not trigger S3 commands',
        getRes.status === 200 &&
          getRes.body?.data?.image_path === '/uploads/hotels/legacy-sample.jpg' &&
          delRes.status === 200 &&
          s3Calls.length === 0,
        `getStatus=${getRes.status}, image_path=${getRes.body?.data?.image_path}, s3Calls=${s3Calls.length}`
      );
    }

    // Reset storage service to default local driver
    resetStorageService();
  } finally {
    resetStorageService();
    // Clean up created test hotels from database
    if (createdHotelIds.length > 0) {
      console.log(`\nCleaning up ${createdHotelIds.length} test hotels from database...`);
      const cleanupQuery = `
        DELETE FROM hotels 
        WHERE id = ANY($1::bigint[]) 
        RETURNING image_path;
      `;
      const delResult = await pool.query(cleanupQuery, [createdHotelIds]);
      for (const row of delResult.rows) {
        if (row.image_path) {
          const fullPath = path.resolve(SRC_DIR, row.image_path.replace(/^\//, ''));
          await fs.promises.unlink(fullPath).catch(() => {});
        }
      }
      console.log('Cleanup complete.');
    }

    // Close server and database pool
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }

  const passedCount = results.filter((r) => r.passed).length;
  console.log('\n====================================================');
  console.log(`INTEGRATION TEST SUMMARY: ${passedCount} / ${results.length} PASSED`);
  console.log('====================================================');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runIntegrationTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
