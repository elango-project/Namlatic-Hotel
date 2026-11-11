const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');

// Disable Sharp internal file caching to prevent locked file handles on Windows
sharp.cache(false);

const UPLOAD_DIR = path.resolve(__dirname, '../uploads/hotels');

// Ensure directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Allowed MIME types and extensions
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const rawExt = path.extname(file.originalname).toLowerCase();
    const ext = ALLOWED_EXTENSIONS.has(rawExt) ? rawExt : '.tmp';
    const uniqueName = `${crypto.randomUUID()}${ext}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (_req, file, cb) => {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    const err = new Error(
      'Invalid image format. Only JPEG, PNG, and WebP images are accepted.'
    );
    err.statusCode = 400;
    cb(err, false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

/**
 * Inspects the first 12 binary bytes directly from the file on disk.
 * Returns verified validity, MIME type, and safe extension.
 * Prevents disguised files (e.g., PHP/HTML scripts named .png or .jpg).
 *
 * @param {string} filePath - Absolute path to the saved file
 * @returns {Promise<{ isValid: boolean, mimeType: string|null, extension: string|null }>}
 */
async function detectImageSignature(filePath) {
  let fd;
  try {
    fd = await fs.promises.open(filePath, 'r');
    const buffer = Buffer.alloc(12);
    const { bytesRead } = await fd.read(buffer, 0, 12, 0);

    if (bytesRead < 4) return { isValid: false, mimeType: null, extension: null };

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { isValid: true, mimeType: 'image/jpeg', extension: '.jpg' };
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      bytesRead >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return { isValid: true, mimeType: 'image/png', extension: '.png' };
    }

    // WebP: RIFF (bytes 0-3) + WEBP (bytes 8-11)
    if (
      bytesRead >= 12 &&
      buffer[0] === 0x52 && // R
      buffer[1] === 0x49 && // I
      buffer[2] === 0x46 && // F
      buffer[3] === 0x46 && // F
      buffer[8] === 0x57 && // W
      buffer[9] === 0x45 && // E
      buffer[10] === 0x42 && // B
      buffer[11] === 0x50 // P
    ) {
      return { isValid: true, mimeType: 'image/webp', extension: '.webp' };
    }

    return { isValid: false, mimeType: null, extension: null };
  } catch (_err) {
    return { isValid: false, mimeType: null, extension: null };
  } finally {
    if (fd) await fd.close();
  }
}

/**
 * Validates actual binary signature (magic bytes) from the file on disk.
 * Preserves backwards compatibility for existing tests.
 *
 * @param {string} filePath - Absolute path to the saved file
 * @returns {Promise<boolean>} - True if signature is valid JPEG, PNG, or WebP
 */
async function verifyMagicBytes(filePath) {
  const result = await detectImageSignature(filePath);
  return result.isValid;
}

/**
 * Strips EXIF, GPS, camera metadata, and personal data from an image file,
 * auto-orients the image based on EXIF orientation if present,
 * and overwrites the file on disk with the clean, sanitized version.
 *
 * @param {string} filePath - Absolute path to the saved file on disk
 * @param {string} mimeType - Verified MIME type ('image/jpeg', 'image/png', 'image/webp')
 * @returns {Promise<{ size: number, format: string, isSanitized: boolean }>}
 */
async function sanitizeImage(filePath, mimeType) {
  const tempPath = `${filePath}.clean.tmp`;
  try {
    const inputBuffer = await fs.promises.readFile(filePath);
    let pipeline = sharp(inputBuffer, { failOnError: true }).rotate();

    if (mimeType === 'image/jpeg') {
      pipeline = pipeline.jpeg({ quality: 85, mozjpeg: true });
    } else if (mimeType === 'image/png') {
      pipeline = pipeline.png({ compressionLevel: 8 });
    } else if (mimeType === 'image/webp') {
      pipeline = pipeline.webp({ quality: 85 });
    }

    const outputBuffer = await pipeline.toBuffer();
    await fs.promises.writeFile(tempPath, outputBuffer);
    await fs.promises.rename(tempPath, filePath);

    const metadata = await sharp(outputBuffer).metadata();
    return {
      size: outputBuffer.length,
      format: metadata.format,
      isSanitized: true,
    };
  } catch (err) {
    await fs.promises.unlink(tempPath).catch(() => {});
    throw err;
  }
}

/**
 * Express middleware to handle single image upload and verify binary signature.
 */
const uploadHotelImage = (req, res, next) => {
  const singleUpload = upload.single('image');

  singleUpload(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            status: 'error',
            statusCode: 400,
            message: 'Image size exceeds maximum allowed limit of 5 MB.',
          });
        }
        return res.status(400).json({
          status: 'error',
          statusCode: 400,
          message: `Upload error: ${err.message}`,
        });
      }

      return res.status(err.statusCode || 400).json({
        status: 'error',
        statusCode: err.statusCode || 400,
        message: err.message || 'File upload failed.',
      });
    }

    // If a file was uploaded, verify its magic bytes signature and strip EXIF metadata
    if (req.file) {
      const signature = await detectImageSignature(req.file.path);
      if (!signature.isValid) {
        // Unlink the fraudulent file immediately
        await fs.promises.unlink(req.file.path).catch(() => {});
        return res.status(400).json({
          status: 'error',
          statusCode: 400,
          message:
            'Invalid file content. File signature does not match JPEG, PNG, or WebP.',
        });
      }

      // Sanitize image: strip EXIF / GPS / device metadata and auto-orient
      try {
        const sanitized = await sanitizeImage(req.file.path, signature.mimeType);
        req.file.size = sanitized.size;
        req.file.isMetadataStripped = true;
      } catch (_sanitizeErr) {
        await fs.promises.unlink(req.file.path).catch(() => {});
        return res.status(400).json({
          status: 'error',
          statusCode: 400,
          message:
            'Invalid or corrupt image content. The image file could not be processed.',
        });
      }

      // Attach verified metadata and safe relative URL for backward compatibility
      req.file.verifiedMimeType = signature.mimeType;
      req.file.verifiedExtension = signature.extension;
      req.file.relativeUrl = `/uploads/hotels/${req.file.filename}`;
    }

    next();
  });
};

module.exports = {
  uploadHotelImage,
  verifyMagicBytes,
  detectImageSignature,
  sanitizeImage,
  UPLOAD_DIR,
};
