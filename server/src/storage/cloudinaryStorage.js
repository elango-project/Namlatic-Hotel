const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const defaultCloudinary = require('cloudinary').v2;

/**
 * Cloudinary Media Storage Adapter.
 * Uses official Cloudinary Node.js SDK (cloudinary.v2) for signed backend uploads,
 * asset deletion, and secure public URL generation.
 */
class CloudinaryStorageAdapter {
  /**
   * @param {object} config
   * @param {string} config.cloudName - Cloudinary cloud name
   * @param {string} config.apiKey - Cloudinary API key
   * @param {string} config.apiSecret - Cloudinary API secret
   * @param {string} [config.folder] - Organized folder path (defaults to 'namlatic-hotel/hotels')
   * @param {object} [config.cloudinaryClient] - Injected mock or custom Cloudinary v2 instance for testing
   */
  constructor(config = {}) {
    this.cloudName = config.cloudName;
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.folder = (config.folder || 'namlatic-hotel/hotels').replace(/^\/+|\/+$/g, '');

    if (config.cloudinaryClient) {
      this.cloudinary = config.cloudinaryClient;
    } else {
      defaultCloudinary.config({
        cloud_name: this.cloudName,
        api_key: this.apiKey,
        api_secret: this.apiSecret,
        secure: true,
      });
      this.cloudinary = defaultCloudinary;
    }
  }

  /**
   * Generates a stable, server-generated Cloudinary public ID.
   * Format: namlatic-hotel/hotels/<uuid>
   * Unpredictable and never incorporates user-supplied filenames.
   *
   * @returns {string}
   */
  generatePublicId() {
    return `${this.folder}/${crypto.randomUUID()}`;
  }

  /**
   * Extracts the Cloudinary public ID from a managed storage reference.
   * Strips the 'cloudinary:' prefix and ensures path safety.
   *
   * @param {string} storageReference - e.g. 'cloudinary:namlatic-hotel/hotels/uuid'
   * @returns {string|null}
   */
  extractPublicId(storageReference) {
    if (!this.isManagedReference(storageReference)) {
      return null;
    }
    const publicId = storageReference.slice('cloudinary:'.length).trim();
    if (!publicId || publicId.includes('..') || publicId.startsWith('/')) {
      return null;
    }
    return publicId;
  }

  /**
   * Uploads a staged, already-sanitized local file to Cloudinary.
   * Uses signed backend upload with resource_type: 'image'.
   * Ensures the staged local file is deleted on both success and failure.
   *
   * @param {Express.Multer.File} file - Staged Multer file
   * @param {object} [options]
   * @param {string} [options.publicId] - Custom public ID override (for testing)
   * @param {string} [options.key] - Alias for publicId override
   * @returns {Promise<{ storageReference: string, publicUrl: string, key: string }>}
   */
  async upload(file, options = {}) {
    if (!file || !file.path) {
      throw new Error('Cloudinary upload error: file with a valid local path is required.');
    }

    const publicId = options.publicId || options.key || this.generatePublicId();

    try {
      const uploadOptions = {
        public_id: publicId,
        resource_type: 'image',
        overwrite: false,
        use_filename: false,
        unique_filename: false,
      };

      const result = await this.cloudinary.uploader.upload(file.path, uploadOptions);

      // Clean up the local staged file after successful upload
      await fs.promises.unlink(file.path).catch((cleanupErr) => {
        if (cleanupErr.code !== 'ENOENT') {
          console.warn(
            '[STORAGE WARNING] Failed to clean up local staged file after Cloudinary upload:',
            cleanupErr.message
          );
        }
      });

      const actualPublicId = result && result.public_id ? result.public_id : publicId;
      const storageReference = `cloudinary:${actualPublicId}`;
      const publicUrl =
        result && result.secure_url
          ? result.secure_url
          : this.getPublicUrl(storageReference);

      return {
        storageReference,
        publicUrl,
        key: actualPublicId,
      };
    } catch (uploadErr) {
      // Clean up local staged file on failure to prevent disk leakage
      await fs.promises.unlink(file.path).catch((cleanupErr) => {
        if (cleanupErr.code !== 'ENOENT') {
          console.warn(
            '[STORAGE WARNING] Failed to clean up local staged file after Cloudinary upload failure:',
            cleanupErr.message
          );
        }
      });

      console.error('[CLOUDINARY STORAGE ERROR] Upload failed:', uploadErr.message);
      throw new Error(`Failed to upload media to Cloudinary: ${uploadErr.message}`);
    }
  }

  /**
   * Deletes an asset from Cloudinary given its storage reference.
   *
   * @param {string} storageReference - e.g. 'cloudinary:namlatic-hotel/hotels/uuid'
   * @returns {Promise<boolean>}
   */
  async delete(storageReference) {
    if (!this.isManagedReference(storageReference)) {
      return false;
    }

    const publicId = this.extractPublicId(storageReference);
    if (!publicId) {
      return false;
    }

    // Strip file extension if present so destroy targets the exact public_id
    const basePublicId = publicId.replace(/\.(jpg|jpeg|png|webp)$/i, '');

    try {
      const result = await this.cloudinary.uploader.destroy(basePublicId, {
        resource_type: 'image',
        invalidate: true,
      });

      if (result && result.result === 'error') {
        throw new Error(
          `Cloudinary asset deletion failed: ${result.message || 'unknown error'}`
        );
      }

      return Boolean(result && (result.result === 'ok' || result.result === 'not found'));
    } catch (err) {
      console.error(
        '[CLOUDINARY STORAGE ERROR] Destroy failed for publicId:',
        basePublicId,
        ':',
        err.message
      );
      throw err;
    }
  }

  /**
   * Resolves the fully-qualified HTTPS delivery URL for a Cloudinary storage reference.
   *
   * @param {string|null} storageReference - e.g. 'cloudinary:namlatic-hotel/hotels/uuid'
   * @returns {string|null}
   */
  getPublicUrl(storageReference) {
    if (!storageReference || typeof storageReference !== 'string') {
      return null;
    }

    if (storageReference.startsWith('cloudinary:')) {
      const publicId = this.extractPublicId(storageReference);
      if (!publicId) {
        return null;
      }

      if (this.cloudinary && typeof this.cloudinary.url === 'function') {
        return this.cloudinary.url(publicId, {
          secure: true,
          analytics: false,
        });
      }

      return `https://res.cloudinary.com/${this.cloudName}/image/upload/${publicId}`;
    }

    // If it's a legacy local or R2 reference or raw URL, return as-is
    return storageReference;
  }

  /**
   * Checks whether this reference is managed by the Cloudinary storage adapter.
   *
   * @param {string} storageReference
   * @returns {boolean}
   */
  isManagedReference(storageReference) {
    if (typeof storageReference !== 'string') return false;
    if (!storageReference.startsWith('cloudinary:')) return false;
    const publicId = storageReference.slice('cloudinary:'.length).trim();
    return publicId.length > 0 && !publicId.includes('..') && !publicId.startsWith('/');
  }
}

module.exports = {
  CloudinaryStorageAdapter,
};
