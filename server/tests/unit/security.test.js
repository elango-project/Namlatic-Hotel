const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { verifyMagicBytes, UPLOAD_DIR } = require('../../src/middleware/upload.middleware');
const { safeDeleteHotelImage, safeUnlinkFile } = require('../../src/services/hotel.service');
const { mapDbConstraintError } = require('../../src/controllers/hotel.controller');

describe('Unit Tests: security & utilities', () => {
  // --------------------------------------------------------------------------
  // verifyMagicBytes
  // --------------------------------------------------------------------------
  describe('verifyMagicBytes()', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-unit-test-'));

    it('identifies valid JPEG magic bytes (FF D8 FF)', async () => {
      const jpegFile = path.join(tmpDir, 'valid.jpg');
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
      fs.writeFileSync(jpegFile, jpegHeader);

      const isValid = await verifyMagicBytes(jpegFile);
      assert.equal(isValid, true);
    });

    it('identifies valid PNG magic bytes (89 50 4E 47 0D 0A 1A 0A)', async () => {
      const pngFile = path.join(tmpDir, 'valid.png');
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
      fs.writeFileSync(pngFile, pngHeader);

      const isValid = await verifyMagicBytes(pngFile);
      assert.equal(isValid, true);
    });

    it('identifies valid WebP magic bytes (RIFF....WEBP)', async () => {
      const webpFile = path.join(tmpDir, 'valid.webp');
      const webpHeader = Buffer.from([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x24, 0x00, 0x00, 0x00, // size
        0x57, 0x45, 0x42, 0x50, // WEBP
      ]);
      fs.writeFileSync(webpFile, webpHeader);

      const isValid = await verifyMagicBytes(webpFile);
      assert.equal(isValid, true);
    });

    it('rejects HTML/text file disguised as image', async () => {
      const textFile = path.join(tmpDir, 'disguised.html.jpg');
      fs.writeFileSync(
        textFile,
        Buffer.from('<!DOCTYPE html><html><body>Non-image text file disguised as jpg</body></html>')
      );

      const isValid = await verifyMagicBytes(textFile);
      assert.equal(isValid, false);
    });

    it('rejects truncated file smaller than 12 bytes', async () => {
      const tinyFile = path.join(tmpDir, 'tiny.jpg');
      fs.writeFileSync(tinyFile, Buffer.from([0xff, 0xd8])); // Only 2 bytes

      const isValid = await verifyMagicBytes(tinyFile);
      assert.equal(isValid, false);
    });

    it('returns false safely when file does not exist', async () => {
      const nonExistent = path.join(tmpDir, 'ghost.jpg');
      const isValid = await verifyMagicBytes(nonExistent);
      assert.equal(isValid, false);
    });
  });

  // --------------------------------------------------------------------------
  // safeDeleteHotelImage
  // --------------------------------------------------------------------------
  describe('safeDeleteHotelImage()', () => {
    it('blocks directory traversal attempts (..)', async () => {
      const traversalAttempts = [
        '../../package.json',
        '/uploads/hotels/../../package.json',
        '..\\..\\package.json',
        '/uploads/hotels/../../../etc/passwd',
      ];

      for (const attempt of traversalAttempts) {
        const deleted = await safeDeleteHotelImage(attempt);
        assert.equal(deleted, false);
      }
    });

    it('protects .gitkeep from deletion', async () => {
      const gitkeepPath = path.resolve(UPLOAD_DIR, '.gitkeep');
      assert.equal(fs.existsSync(gitkeepPath), true);

      const deleted = await safeDeleteHotelImage('/uploads/hotels/.gitkeep');
      assert.equal(deleted, false);
      assert.equal(fs.existsSync(gitkeepPath), true);
    });

    it('handles null, undefined, and non-string inputs safely without throwing', async () => {
      assert.equal(await safeDeleteHotelImage(null), false);
      assert.equal(await safeDeleteHotelImage(undefined), false);
      assert.equal(await safeDeleteHotelImage(12345), false);
      assert.equal(await safeDeleteHotelImage(''), false);
    });
  });

  // --------------------------------------------------------------------------
  // safeUnlinkFile
  // --------------------------------------------------------------------------
  describe('safeUnlinkFile()', () => {
    it('refuses to delete files located outside the hotel uploads directory', async () => {
      const outsideFile = path.resolve(__dirname, '../../package.json');
      const result = await safeUnlinkFile(outsideFile);
      assert.equal(result, false);
      assert.equal(fs.existsSync(outsideFile), true);
    });

    it('refuses to delete .gitkeep in the uploads directory', async () => {
      const gitkeepFile = path.resolve(UPLOAD_DIR, '.gitkeep');
      const result = await safeUnlinkFile(gitkeepFile);
      assert.equal(result, false);
      assert.equal(fs.existsSync(gitkeepFile), true);
    });
  });

  // --------------------------------------------------------------------------
  // mapDbConstraintError
  // --------------------------------------------------------------------------
  describe('mapDbConstraintError()', () => {
    it('maps known check constraints to clean human-readable messages', () => {
      assert.equal(
        mapDbConstraintError({ constraint: 'chk_hotels_price_positive' }),
        'Price must be a valid positive number greater than zero.'
      );
      assert.equal(
        mapDbConstraintError({ constraint: 'chk_hotels_latitude_range' }),
        'Latitude must be between -90.0 and 90.0 degrees.'
      );
      assert.equal(
        mapDbConstraintError({ constraint: 'chk_hotels_longitude_range' }),
        'Longitude must be between -180.0 and 180.0 degrees.'
      );
      assert.equal(
        mapDbConstraintError({ constraint: 'chk_hotels_title_not_empty' }),
        'Hotel title cannot be blank.'
      );
      assert.equal(
        mapDbConstraintError({ constraint: 'chk_hotels_description_not_empty' }),
        'Hotel description cannot be blank.'
      );
    });

    it('returns null for unknown constraints to prevent schema leaks', () => {
      assert.equal(mapDbConstraintError({ constraint: 'unknown_constraint' }), null);
      assert.equal(mapDbConstraintError(new Error('general error')), null);
      assert.equal(mapDbConstraintError(null), null);
    });
  });
});
