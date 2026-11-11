const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');

// Disable Sharp file cache in tests for Windows file locking safety
sharp.cache(false);

const {
  detectImageSignature,
  verifyMagicBytes,
  sanitizeImage,
} = require('../../src/middleware/upload.middleware');

describe('Unit Tests: Image Metadata Stripping & EXIF Sanitization (Phase 5F-B)', () => {
  function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'namlatic-image-test-'));
  }

  // --------------------------------------------------------------------------
  // 1. JPEG EXIF & GPS Metadata Stripping
  // --------------------------------------------------------------------------
  describe('JPEG Metadata Stripping', () => {
    it('strips EXIF, camera, and GPS metadata from JPEG files', async () => {
      const tempDir = createTempDir();
      const testFile = path.join(tempDir, 'test-with-exif.jpg');

      try {
        // Create a 50x50 JPEG image containing camera model and EXIF data
        const rawWithExif = await sharp({
          create: {
            width: 50,
            height: 50,
            channels: 3,
            background: { r: 200, g: 100, b: 50 },
          },
        })
          .withExif({
            IFD0: {
              Make: 'AntigravityCamera',
              Model: 'Model-X99',
              Software: 'AntigravityOS',
            },
          })
          .jpeg()
          .toBuffer();

        await fs.promises.writeFile(testFile, rawWithExif);

        // Verify that input file initially HAS EXIF metadata
        const beforeMeta = await sharp(await fs.promises.readFile(testFile)).metadata();
        assert.ok(beforeMeta.exif, 'Input image should have EXIF metadata');

        // Sanitize the image using the middleware function
        const result = await sanitizeImage(testFile, 'image/jpeg');
        assert.equal(result.isSanitized, true);
        assert.ok(result.size > 0);

        // Verify that output file NO LONGER has EXIF metadata
        const afterMeta = await sharp(await fs.promises.readFile(testFile)).metadata();
        assert.equal(afterMeta.exif, undefined, 'Sanitized image must not contain EXIF metadata');
        assert.equal(afterMeta.format, 'jpeg');
        assert.equal(afterMeta.width, 50);
        assert.equal(afterMeta.height, 50);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('strips orientation tags and ensures clean metadata output', async () => {
      const tempDir = createTempDir();
      const testFile = path.join(tempDir, 'test-oriented.jpg');

      try {
        const orientedBuffer = await sharp({
          create: {
            width: 60,
            height: 40,
            channels: 3,
            background: { r: 50, g: 150, b: 250 },
          },
        })
          .withExif({
            IFD0: {
              Make: 'PhotoCorp',
            },
          })
          .jpeg()
          .toBuffer();

        await fs.promises.writeFile(testFile, orientedBuffer);

        const beforeMeta = await sharp(await fs.promises.readFile(testFile)).metadata();
        assert.ok(beforeMeta.exif);

        // Sanitize
        await sanitizeImage(testFile, 'image/jpeg');

        const afterMeta = await sharp(await fs.promises.readFile(testFile)).metadata();
        // After sanitization, all EXIF tags including orientation are stripped
        assert.equal(afterMeta.exif, undefined);
        assert.equal(afterMeta.orientation, undefined);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  // --------------------------------------------------------------------------
  // 2. PNG Metadata Stripping
  // --------------------------------------------------------------------------
  describe('PNG Metadata Stripping', () => {
    it('strips metadata from PNG files while preserving image dimensions', async () => {
      const tempDir = createTempDir();
      const testFile = path.join(tempDir, 'test.png');

      try {
        const pngBuffer = await sharp({
          create: {
            width: 32,
            height: 32,
            channels: 4,
            background: { r: 0, g: 255, b: 0, alpha: 0.8 },
          },
        })
          .png()
          .toBuffer();

        await fs.promises.writeFile(testFile, pngBuffer);

        const result = await sanitizeImage(testFile, 'image/png');
        assert.equal(result.isSanitized, true);
        assert.ok(result.size > 0);

        const afterMeta = await sharp(await fs.promises.readFile(testFile)).metadata();
        assert.equal(afterMeta.format, 'png');
        assert.equal(afterMeta.width, 32);
        assert.equal(afterMeta.height, 32);
        assert.equal(afterMeta.exif, undefined);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  // --------------------------------------------------------------------------
  // 3. WebP Metadata Stripping
  // --------------------------------------------------------------------------
  describe('WebP Metadata Stripping', () => {
    it('strips metadata from WebP files while preserving image dimensions', async () => {
      const tempDir = createTempDir();
      const testFile = path.join(tempDir, 'test.webp');

      try {
        const webpBuffer = await sharp({
          create: {
            width: 48,
            height: 48,
            channels: 3,
            background: { r: 120, g: 80, b: 200 },
          },
        })
          .webp()
          .toBuffer();

        await fs.promises.writeFile(testFile, webpBuffer);

        const result = await sanitizeImage(testFile, 'image/webp');
        assert.equal(result.isSanitized, true);
        assert.ok(result.size > 0);

        const afterMeta = await sharp(await fs.promises.readFile(testFile)).metadata();
        assert.equal(afterMeta.format, 'webp');
        assert.equal(afterMeta.width, 48);
        assert.equal(afterMeta.height, 48);
        assert.equal(afterMeta.exif, undefined);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  // --------------------------------------------------------------------------
  // 4. Corrupt and Malformed File Handling
  // --------------------------------------------------------------------------
  describe('Corrupt and Malformed File Rejection', () => {
    it('rejects corrupt image files and cleans up temporary files', async () => {
      const tempDir = createTempDir();
      const corruptFile = path.join(tempDir, 'corrupt.jpg');

      try {
        // File with JPEG magic bytes FF D8 FF followed by garbage data
        const corruptBuffer = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x12, 0x34, 0x56, 0x78]);
        await fs.promises.writeFile(corruptFile, corruptBuffer);

        // Magic bytes detection recognizes JPEG signature prefix
        const sig = await detectImageSignature(corruptFile);
        assert.equal(sig.isValid, true);
        assert.equal(sig.mimeType, 'image/jpeg');

        // But sanitizeImage fails during decode
        await assert.rejects(
          async () => {
            await sanitizeImage(corruptFile, 'image/jpeg');
          },
          /Input file contains unsupported image format|premature end|corrupt|error/i
        );

        // Verify no leftover .tmp files
        const remainingFiles = fs.readdirSync(tempDir);
        const tmpFiles = remainingFiles.filter((f) => f.endsWith('.tmp'));
        assert.equal(tmpFiles.length, 0, 'Must clean up temporary files on error');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('rejects non-image files with invalid magic bytes', async () => {
      const tempDir = createTempDir();
      const fakeFile = path.join(tempDir, 'fake.jpg');

      try {
        await fs.promises.writeFile(fakeFile, Buffer.from('<?php phpinfo(); ?>'));

        const sig = await detectImageSignature(fakeFile);
        assert.equal(sig.isValid, false);
        assert.equal(sig.mimeType, null);

        const isValid = await verifyMagicBytes(fakeFile);
        assert.equal(isValid, false);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
