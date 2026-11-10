const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

/**
 * Cloudflare R2 Durable Object Storage Adapter.
 * Uses official S3-compatible API with bucket-scoped credentials.
 */
class R2StorageAdapter {
  /**
   * @param {object} config
   * @param {string} config.accountId
   * @param {string} config.accessKeyId
   * @param {string} config.secretAccessKey
   * @param {string} config.bucketName
   * @param {string} config.publicBaseUrl
   * @param {string} [config.endpoint]
   * @param {string} [config.region]
   * @param {S3Client} [config.s3Client] - Optional injected S3Client for unit testing
   */
  constructor(config = {}) {
    this.bucketName = config.bucketName;
    this.publicBaseUrl = (config.publicBaseUrl || '').replace(/\/+$/, '');
    this.accountId = config.accountId;

    if (config.s3Client) {
      this.s3Client = config.s3Client;
    } else {
      const endpoint = config.endpoint || `https://${config.accountId}.r2.cloudflarestorage.com`;
      this.s3Client = new S3Client({
        region: config.region || 'auto',
        endpoint,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
    }
  }

  /**
   * Generates a stable, server-generated object key.
   * Format: hotels/<uuid>.<extension>
   * Never incorporates user-supplied filenames.
   *
   * @param {string} [extension] - e.g. .jpg, .png, .webp
   * @returns {string}
   */
  generateObjectKey(extension = '.jpg') {
    const ext = extension.startsWith('.') ? extension : `.${extension}`;
    return `hotels/${crypto.randomUUID()}${ext.toLowerCase()}`;
  }

  /**
   * Uploads a staged local file to the Cloudflare R2 bucket.
   * Uses verified MIME type and immutable cache control.
   * Cleans up the local staged file after upload (or failure).
   *
   * @param {Express.Multer.File} file - Staged Multer file
   * @param {object} [options]
   * @param {string} [options.contentType] - Verified MIME type
   * @param {string} [options.key] - Custom object key override (for testing)
   * @returns {Promise<{ storageReference: string, publicUrl: string, key: string }>}
   */
  async upload(file, options = {}) {
    if (!file || !file.path) {
      throw new Error('R2 upload error: file with a valid local path is required.');
    }

    const ext = options.extension || file.verifiedExtension || path.extname(file.path) || '.jpg';
    const key = options.key || this.generateObjectKey(ext);
    const contentType =
      options.contentType || file.verifiedMimeType || file.mimetype || 'application/octet-stream';

    let fileBuffer;
    try {
      fileBuffer = await fs.promises.readFile(file.path);
    } catch (readErr) {
      // Ensure best-effort cleanup of staged Multer file on read failure
      await fs.promises.unlink(file.path).catch((cleanupErr) => {
        if (cleanupErr.code !== 'ENOENT') {
          console.warn('[STORAGE WARNING] Failed to clean up staged file after read failure:', cleanupErr.message);
        }
      });
      throw new Error(`R2 upload error: Failed to read local staged file: ${readErr.message}`);
    }

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      });

      await this.s3Client.send(command);

      // Clean up the local staged file after successful cloud upload
      // Do not fail upload or delete R2 object if local file cleanup fails
      await fs.promises.unlink(file.path).catch((cleanupErr) => {
        if (cleanupErr.code !== 'ENOENT') {
          console.warn('[STORAGE WARNING] Failed to clean up local staged file after upload:', cleanupErr.message);
        }
      });

      const storageReference = `r2:${key}`;
      const publicUrl = `${this.publicBaseUrl}/${key}`;

      return {
        storageReference,
        publicUrl,
        key,
      };
    } catch (s3Err) {
      // Clean up local staged file on failure to prevent disk leakage
      await fs.promises.unlink(file.path).catch((cleanupErr) => {
        if (cleanupErr.code !== 'ENOENT') {
          console.warn('[STORAGE WARNING] Failed to clean up local staged file after upload failure:', cleanupErr.message);
        }
      });
      console.error('[R2 STORAGE ERROR] PutObject failed:', s3Err.message);
      throw new Error(`Failed to upload media to Cloudflare R2: ${s3Err.message}`);
    }
  }

  /**
   * Deletes an object from Cloudflare R2 given its storage reference.
   *
   * @param {string} storageReference - e.g. r2:hotels/uuid.webp
   * @returns {Promise<boolean>}
   */
  async delete(storageReference) {
    if (!this.isManagedReference(storageReference)) {
      return false;
    }

    // Strip "r2:" prefix to obtain the S3 object key
    const key = storageReference.slice(3);

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      return true;
    } catch (err) {
      console.error('[R2 STORAGE ERROR] DeleteObject failed for key', key, ':', err.message);
      throw err;
    }
  }

  /**
   * Resolves the fully-qualified public CDN URL for an R2 storage reference.
   *
   * @param {string|null} storageReference - e.g. r2:hotels/uuid.webp
   * @returns {string|null}
   */
  getPublicUrl(storageReference) {
    if (!storageReference || typeof storageReference !== 'string') {
      return null;
    }

    if (storageReference.startsWith('r2:')) {
      const key = storageReference.slice(3);
      return `${this.publicBaseUrl}/${key}`;
    }

    // If it's a legacy local reference or already a full URL, return as-is
    return storageReference;
  }

  /**
   * Checks whether this reference is managed by the R2 storage adapter.
   *
   * @param {string} storageReference
   * @returns {boolean}
   */
  isManagedReference(storageReference) {
    return typeof storageReference === 'string' && storageReference.startsWith('r2:');
  }
}

module.exports = {
  R2StorageAdapter,
};
