const fs = require('fs');
const path = require('path');

const DEFAULT_UPLOADS_DIR = path.resolve(__dirname, '../uploads/hotels');

/**
 * Local filesystem storage adapter.
 * Retains existing development and local testing behavior.
 */
class LocalStorageAdapter {
  /**
   * @param {object} [options]
   * @param {string} [options.uploadsDir]
   */
  constructor(options = {}) {
    this.uploadsDir = options.uploadsDir || DEFAULT_UPLOADS_DIR;
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  /**
   * Stores a file in local storage.
   * In standard Express + Multer flow, Multer has already staged the file in uploadsDir.
   * If staged elsewhere, copies/moves the file to uploadsDir.
   *
   * @param {Express.Multer.File} file
   * @param {object} [options]
   * @returns {Promise<{ storageReference: string, publicUrl: string, key: string }>}
   */
  async upload(file, options = {}) {
    if (!file || !file.path) {
      throw new Error('Local storage upload error: file is required.');
    }

    const filename = file.filename || path.basename(file.path);
    const targetPath = path.resolve(this.uploadsDir, filename);

    // If file was staged in a temporary location outside uploadsDir, move it
    if (path.resolve(file.path) !== targetPath) {
      await fs.promises.copyFile(file.path, targetPath);
      await fs.promises.unlink(file.path).catch(() => {});
    }

    const storageReference = `/uploads/hotels/${filename}`;
    const publicUrl = `/uploads/hotels/${filename}`;
    const key = `hotels/${filename}`;

    return {
      storageReference,
      publicUrl,
      key,
    };
  }

  /**
   * Safely deletes a file from local storage given its storage reference.
   * Strictly prevents directory traversal and protects .gitkeep.
   *
   * @param {string} storageReference - e.g. /uploads/hotels/uuid.jpg
   * @returns {Promise<boolean>} True if deleted or already missing, false otherwise
   */
  async delete(storageReference) {
    if (!storageReference || typeof storageReference !== 'string') {
      return false;
    }

    // Must never attempt to delete cloud references via local filesystem
    if (storageReference.startsWith('r2:') || storageReference.startsWith('cloudinary:')) {
      return false;
    }

    // Reject path traversal patterns immediately
    if (storageReference.includes('..')) {
      console.warn(`[SECURITY] Blocked path traversal attempt on local file deletion: ${storageReference}`);
      return false;
    }

    const filename = path.basename(storageReference);
    if (!filename || filename === '.' || filename === '..' || filename === '.gitkeep') {
      return false;
    }

    const targetPath = path.resolve(this.uploadsDir, filename);
    const relative = path.relative(this.uploadsDir, targetPath);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      console.warn(`[SECURITY] Blocked path traversal attempt on local file deletion: ${storageReference}`);
      return false;
    }

    try {
      await fs.promises.unlink(targetPath);
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') {
        // File was already missing on disk - return false safely
        return false;
      }
      console.error(`[LOCAL STORAGE ERROR] Failed to unlink ${targetPath}:`, err.message);
      return false;
    }
  }

  /**
   * Resolves the public URL for a given storage reference.
   *
   * @param {string|null} storageReference
   * @returns {string|null}
   */
  getPublicUrl(storageReference) {
    if (!storageReference || typeof storageReference !== 'string') {
      return null;
    }
    return storageReference;
  }

  /**
   * Checks whether this reference is managed by the local storage adapter.
   *
   * @param {string} storageReference
   * @returns {boolean}
   */
  isManagedReference(storageReference) {
    if (!storageReference || typeof storageReference !== 'string') return false;
    if (storageReference.startsWith('r2:') || storageReference.startsWith('cloudinary:')) return false;
    return storageReference.startsWith('/uploads/hotels/') || !storageReference.includes(':');
  }
}

module.exports = {
  LocalStorageAdapter,
  DEFAULT_UPLOADS_DIR,
};
