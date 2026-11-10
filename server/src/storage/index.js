const { LocalStorageAdapter } = require('./localStorage');
const { R2StorageAdapter } = require('./r2Storage');
const env = require('../config/env');

/**
 * Unified Media Storage Service.
 * Abstract interface coordinating local filesystem and Cloudflare R2 storage adapters.
 */
class StorageService {
  /**
   * @param {object} [options]
   * @param {'local'|'r2'} [options.driver]
   * @param {object} [options.localConfig]
   * @param {object} [options.r2Config]
   * @param {import('@aws-sdk/client-s3').S3Client} [options.s3Client]
   */
  constructor(options = {}) {
    this.driver = options.driver || 'local';
    this.localAdapter = new LocalStorageAdapter(options.localConfig);

    if (this.driver === 'r2' && options.r2Config) {
      this.r2Adapter = new R2StorageAdapter({
        ...options.r2Config,
        s3Client: options.s3Client,
      });
    } else {
      this.r2Adapter = null;
    }
  }

  /**
   * Returns the active storage adapter for new file uploads.
   *
   * @returns {LocalStorageAdapter | R2StorageAdapter}
   */
  getActiveAdapter() {
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
   * - r2: references -> R2 adapter
   * - /uploads/ references -> Local adapter
   * Strictly guarantees local filesystem helpers never receive an r2: reference!
   *
   * @param {string} storageReference
   * @returns {Promise<boolean>}
   */
  async delete(storageReference) {
    if (!storageReference || typeof storageReference !== 'string') {
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
   * Checks whether a storage reference is managed by either adapter.
   *
   * @param {string} storageReference
   * @returns {boolean}
   */
  isManagedReference(storageReference) {
    if (!storageReference || typeof storageReference !== 'string') return false;
    return (
      storageReference.startsWith('r2:') ||
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
 * Overrides the active storage service instance (e.g. for testing with mock S3).
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
};

module.exports = storage;
