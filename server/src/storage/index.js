const { LocalStorageAdapter } = require('./localStorage');
const { R2StorageAdapter } = require('./r2Storage');
const { CloudinaryStorageAdapter } = require('./cloudinaryStorage');
const env = require('../config/env');

/**
 * Unified Media Storage Service.
 * Abstract interface coordinating local filesystem, Cloudflare R2, and Cloudinary storage adapters.
 */
class StorageService {
  /**
   * @param {object} [options]
   * @param {'local'|'r2'|'cloudinary'} [options.driver]
   * @param {object} [options.localConfig]
   * @param {object} [options.r2Config]
   * @param {object} [options.cloudinaryConfig]
   * @param {import('@aws-sdk/client-s3').S3Client} [options.s3Client]
   * @param {object} [options.cloudinaryClient]
   * @param {LocalStorageAdapter} [options.localAdapter]
   * @param {R2StorageAdapter} [options.r2Adapter]
   * @param {CloudinaryStorageAdapter} [options.cloudinaryAdapter]
   */
  constructor(options = {}) {
    this.driver = options.driver || 'local';
    this.localAdapter = options.localAdapter || new LocalStorageAdapter(options.localConfig);

    if (options.r2Adapter) {
      this.r2Adapter = options.r2Adapter;
    } else if (options.r2Config) {
      this.r2Adapter = new R2StorageAdapter({
        ...options.r2Config,
        s3Client: options.s3Client,
      });
    } else {
      this.r2Adapter = null;
    }

    if (options.cloudinaryAdapter) {
      this.cloudinaryAdapter = options.cloudinaryAdapter;
    } else if (options.cloudinaryConfig) {
      this.cloudinaryAdapter = new CloudinaryStorageAdapter({
        ...options.cloudinaryConfig,
        cloudinaryClient: options.cloudinaryClient,
      });
    } else {
      this.cloudinaryAdapter = null;
    }
  }

  /**
   * Returns the active storage adapter for new file uploads.
   *
   * @returns {LocalStorageAdapter | R2StorageAdapter | CloudinaryStorageAdapter}
   */
  getActiveAdapter() {
    if (this.driver === 'cloudinary' && this.cloudinaryAdapter) {
      return this.cloudinaryAdapter;
    }
    if (this.driver === 'r2' && this.r2Adapter) {
      return this.r2Adapter;
    }
    return this.localAdapter;
  }

  /**
   * Uploads a file using the active storage provider.
   *
   * @param {Express.Multer.File} file - Staged Multer file
   * @param {object} [options]
   * @returns {Promise<{ storageReference: string, publicUrl: string, key: string }>}
   */
  async upload(file, options = {}) {
    return this.getActiveAdapter().upload(file, options);
  }

  /**
   * Deletes a media object given its storage reference.
   * Dynamically routes:
   * - cloudinary: references -> Cloudinary adapter
   * - r2: references -> R2 adapter
   * - /uploads/ references -> Local adapter
   * Strictly guarantees local filesystem helpers never receive a cloud storage reference!
   *
   * @param {string} storageReference
   * @returns {Promise<boolean>}
   */
  async delete(storageReference) {
    if (!storageReference || typeof storageReference !== 'string') {
      return false;
    }

    if (storageReference.startsWith('cloudinary:')) {
      if (this.cloudinaryAdapter) {
        return this.cloudinaryAdapter.delete(storageReference);
      }
      console.warn(
        `[STORAGE WARNING] Received Cloudinary reference for deletion but Cloudinary adapter is not active: ${storageReference}`
      );
      return false;
    }

    if (storageReference.startsWith('r2:')) {
      if (this.r2Adapter) {
        return this.r2Adapter.delete(storageReference);
      }
      console.warn(
        `[STORAGE WARNING] Received R2 reference for deletion but R2 driver is not active: ${storageReference}`
      );
      return false;
    }

    return this.localAdapter.delete(storageReference);
  }

  /**
   * Resolves the public URL for any storage reference.
   * - cloudinary:namlatic-hotel/hotels/uuid -> https://res.cloudinary.com/.../namlatic-hotel/hotels/uuid
   * - r2:hotels/uuid.webp -> https://cdn.example.com/hotels/uuid.webp
   * - /uploads/hotels/uuid.jpg -> /uploads/hotels/uuid.jpg
   *
   * @param {string|null} storageReference
   * @returns {string|null}
   */
  getPublicUrl(storageReference) {
    if (!storageReference || typeof storageReference !== 'string') {
      return null;
    }

    if (storageReference.startsWith('cloudinary:')) {
      if (this.cloudinaryAdapter) {
        return this.cloudinaryAdapter.getPublicUrl(storageReference);
      }
      // Fallback if cloudinaryConfig exists in global env
      if (env.cloudinaryConfig && env.cloudinaryConfig.cloudName) {
        const publicId = storageReference.slice('cloudinary:'.length);
        return `https://res.cloudinary.com/${env.cloudinaryConfig.cloudName}/image/upload/${publicId}`;
      }
      return storageReference;
    }

    if (storageReference.startsWith('r2:')) {
      if (this.r2Adapter) {
        return this.r2Adapter.getPublicUrl(storageReference);
      }
      // Fallback if r2Config exists in global env
      if (env.r2Config && env.r2Config.publicBaseUrl) {
        const key = storageReference.slice(3);
        return `${env.r2Config.publicBaseUrl}/${key}`;
      }
      return storageReference;
    }

    return this.localAdapter.getPublicUrl(storageReference);
  }

  /**
   * Checks whether a storage reference is managed by any adapter.
   *
   * @param {string} storageReference
   * @returns {boolean}
   */
  isManagedReference(storageReference) {
    if (!storageReference || typeof storageReference !== 'string') return false;
    return (
      (this.cloudinaryAdapter
        ? this.cloudinaryAdapter.isManagedReference(storageReference)
        : storageReference.startsWith('cloudinary:')) ||
      (this.r2Adapter
        ? this.r2Adapter.isManagedReference(storageReference)
        : storageReference.startsWith('r2:')) ||
      this.localAdapter.isManagedReference(storageReference)
    );
  }
}

/**
 * Creates a new StorageService instance.
 *
 * @param {object} options
 * @returns {StorageService}
 */
function createStorageService(options = {}) {
  return new StorageService(options);
}

// Global active instance initialized from environment configuration
let activeStorageService = new StorageService({
  driver: env.mediaStorageDriver,
  r2Config: env.r2Config,
  cloudinaryConfig: env.cloudinaryConfig,
});

/**
 * Returns the currently active storage service instance.
 *
 * @returns {StorageService}
 */
function getStorageService() {
  return activeStorageService;
}

/**
 * Overrides the active storage service instance (e.g. for testing with mock S3 or mock Cloudinary).
 *
 * @param {StorageService} service
 */
function setStorageService(service) {
  activeStorageService = service;
}

/**
 * Resets the active storage service instance to the default environment configuration.
 */
function resetStorageService() {
  activeStorageService = new StorageService({
    driver: env.mediaStorageDriver,
    r2Config: env.r2Config,
    cloudinaryConfig: env.cloudinaryConfig,
  });
}

// Proxy wrapper delegating directly to activeStorageService
const storage = {
  upload: (...args) => activeStorageService.upload(...args),
  delete: (...args) => activeStorageService.delete(...args),
  getPublicUrl: (...args) => activeStorageService.getPublicUrl(...args),
  isManagedReference: (...args) => activeStorageService.isManagedReference(...args),
  getActiveAdapter: () => activeStorageService.getActiveAdapter(),
  getStorageService,
  setStorageService,
  resetStorageService,
  createStorageService,
  StorageService,
  LocalStorageAdapter,
  R2StorageAdapter,
  CloudinaryStorageAdapter,
};

module.exports = storage;
