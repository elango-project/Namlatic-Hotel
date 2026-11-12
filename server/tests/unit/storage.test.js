const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { LocalStorageAdapter } = require('../../src/storage/localStorage');
const { R2StorageAdapter } = require('../../src/storage/r2Storage');
const { CloudinaryStorageAdapter } = require('../../src/storage/cloudinaryStorage');
const { createStorageService } = require('../../src/storage');
const {
  parseMediaStorageDriver,
  parseR2Config,
  parseCloudinaryConfig,
  parseAndValidateEnv,
} = require('../../src/config/env');

describe('Unit Tests: Cloudflare R2 & Media Storage Abstraction (Phase 5D)', () => {
  // --------------------------------------------------------------------------
  // 1. Environment & Driver Configuration
  // --------------------------------------------------------------------------
  describe('Environment & Driver Configuration', () => {
    it('defaults to "local" in development/test when MEDIA_STORAGE_DRIVER is unset', () => {
      const driver = parseMediaStorageDriver({}, 'development');
      assert.equal(driver, 'local');

      const testDriver = parseMediaStorageDriver({}, 'test');
      assert.equal(testDriver, 'local');
    });

    it('parses valid "local", "r2", and "cloudinary" drivers in development', () => {
      assert.equal(parseMediaStorageDriver({ MEDIA_STORAGE_DRIVER: 'local' }, 'development'), 'local');
      assert.equal(parseMediaStorageDriver({ MEDIA_STORAGE_DRIVER: 'LOCAL' }, 'development'), 'local');
      assert.equal(parseMediaStorageDriver({ MEDIA_STORAGE_DRIVER: 'r2' }, 'development'), 'r2');
      assert.equal(parseMediaStorageDriver({ MEDIA_STORAGE_DRIVER: 'R2 ' }, 'development'), 'r2');
      assert.equal(parseMediaStorageDriver({ MEDIA_STORAGE_DRIVER: 'cloudinary' }, 'development'), 'cloudinary');
      assert.equal(parseMediaStorageDriver({ MEDIA_STORAGE_DRIVER: 'CLOUDINARY ' }, 'development'), 'cloudinary');
    });

    it('strictly forbids silent fallback in production when MEDIA_STORAGE_DRIVER is omitted', () => {
      assert.throws(
        () => parseMediaStorageDriver({}, 'production'),
        /Missing MEDIA_STORAGE_DRIVER in production/
      );
      assert.throws(
        () => parseMediaStorageDriver({ MEDIA_STORAGE_DRIVER: '   ' }, 'production'),
        /Missing MEDIA_STORAGE_DRIVER in production/
      );
    });

    it('strictly rejects MEDIA_STORAGE_DRIVER="local" in production', () => {
      assert.throws(
        () => parseMediaStorageDriver({ MEDIA_STORAGE_DRIVER: 'local' }, 'production'),
        /In production, MEDIA_STORAGE_DRIVER cannot be "local"/
      );
      assert.throws(
        () => parseMediaStorageDriver({ MEDIA_STORAGE_DRIVER: 'LOCAL' }, 'production'),
        /In production, MEDIA_STORAGE_DRIVER cannot be "local"/
      );
    });

    it('rejects unknown storage drivers with a descriptive error', () => {
      assert.throws(
        () => parseMediaStorageDriver({ MEDIA_STORAGE_DRIVER: 's3' }),
        /Invalid MEDIA_STORAGE_DRIVER: "s3"/
      );
      assert.throws(
        () => parseMediaStorageDriver({ MEDIA_STORAGE_DRIVER: 'azure_blob' }),
        /Invalid MEDIA_STORAGE_DRIVER: "azure_blob"/
      );
    });

    it('rejects production with "r2" when R2 credentials are missing', () => {
      assert.throws(
        () =>
          parseAndValidateEnv({
            NODE_ENV: 'production',
            MEDIA_STORAGE_DRIVER: 'r2',
            DATABASE_URL: 'postgresql://user:pass@ep-host.aws.neon.tech/neondb?sslmode=require&channel_binding=prefer',
          }),
        /R2 configuration error: Missing required environment variable\(s\)/
      );
    });

    it('accepts valid production R2 configuration', () => {
      const config = parseAndValidateEnv({
        NODE_ENV: 'production',
        MEDIA_STORAGE_DRIVER: 'r2',
        R2_ACCOUNT_ID: 'acc1234567890def',
        R2_ACCESS_KEY_ID: 'key_id_xyz',
        R2_SECRET_ACCESS_KEY: 'secret_key_super_secret',
        R2_BUCKET_NAME: 'namlatic-hotel-media',
        R2_PUBLIC_BASE_URL: 'https://cdn.namlatic.com',
        DATABASE_URL: 'postgresql://user:pass@ep-host.aws.neon.tech/neondb?sslmode=require&channel_binding=prefer',
        BACKEND_PROXY_SECRET: 'test_proxy_secret_at_least_32_chars_long_12345',
      });

      assert.equal(config.mediaStorageDriver, 'r2');
      assert.equal(config.r2Config.bucketName, 'namlatic-hotel-media');
      assert.equal(config.r2Config.publicBaseUrl, 'https://cdn.namlatic.com');
      assert.equal(config.r2Config.endpoint, 'https://acc1234567890def.r2.cloudflarestorage.com');
      assert.equal(config.r2Config.region, 'auto');
      assert.equal(config.cloudinaryConfig, null);
    });

    it('rejects production with "cloudinary" when Cloudinary credentials are missing', () => {
      assert.throws(
        () =>
          parseAndValidateEnv({
            NODE_ENV: 'production',
            MEDIA_STORAGE_DRIVER: 'cloudinary',
            DATABASE_URL: 'postgresql://user:pass@ep-host.aws.neon.tech/neondb?sslmode=require&channel_binding=prefer',
            BACKEND_PROXY_SECRET: 'test_proxy_secret_at_least_32_chars_long_12345',
          }),
        /Cloudinary configuration error: Missing required environment variable\(s\)/
      );
    });

    it('accepts valid production Cloudinary configuration without requiring R2 variables', () => {
      const config = parseAndValidateEnv({
        NODE_ENV: 'production',
        MEDIA_STORAGE_DRIVER: 'cloudinary',
        CLOUDINARY_CLOUD_NAME: 'namlatic-cloud',
        CLOUDINARY_API_KEY: '123456789012345',
        CLOUDINARY_API_SECRET: 'secret_key_super_secret',
        DATABASE_URL: 'postgresql://user:pass@ep-host.aws.neon.tech/neondb?sslmode=require&channel_binding=prefer',
        BACKEND_PROXY_SECRET: 'test_proxy_secret_at_least_32_chars_long_12345',
      });

      assert.equal(config.mediaStorageDriver, 'cloudinary');
      assert.equal(config.cloudinaryConfig.cloudName, 'namlatic-cloud');
      assert.equal(config.cloudinaryConfig.apiKey, '123456789012345');
      assert.equal(config.cloudinaryConfig.apiSecret, 'secret_key_super_secret');
      assert.equal(config.cloudinaryConfig.folder, 'namlatic-hotel/hotels');
      assert.equal(config.r2Config, null); // R2 credentials are NOT required
    });

    it('parses valid R2 configuration and normalizes endpoint and base URL', () => {
      const config = parseR2Config({
        R2_ACCOUNT_ID: 'abc1234567890def',
        R2_ACCESS_KEY_ID: 'key_id_xyz',
        R2_SECRET_ACCESS_KEY: 'secret_key_super_secret',
        R2_BUCKET_NAME: 'namlatic-hotel-media',
        R2_PUBLIC_BASE_URL: 'https://cdn.namlatic.com/',
      });

      assert.equal(config.accountId, 'abc1234567890def');
      assert.equal(config.accessKeyId, 'key_id_xyz');
      assert.equal(config.secretAccessKey, 'secret_key_super_secret');
      assert.equal(config.bucketName, 'namlatic-hotel-media');
      assert.equal(config.publicBaseUrl, 'https://cdn.namlatic.com'); // Trailing slash stripped
      assert.equal(config.endpoint, 'https://abc1234567890def.r2.cloudflarestorage.com');
      assert.equal(config.region, 'auto');
    });

    it('fails fast when required R2 variables are missing', () => {
      assert.throws(
        () => parseR2Config({}),
        /R2 configuration error: Missing required environment variable\(s\): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL/
      );

      assert.throws(
        () =>
          parseR2Config({
            R2_ACCOUNT_ID: 'acc',
            R2_ACCESS_KEY_ID: 'key',
            // Missing secret, bucket, url
          }),
        /R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL/
      );
    });

    it('validates public base URL protocol and rejects invalid formats', () => {
      assert.throws(
        () =>
          parseR2Config({
            R2_ACCOUNT_ID: 'acc',
            R2_ACCESS_KEY_ID: 'key',
            R2_SECRET_ACCESS_KEY: 'sec',
            R2_BUCKET_NAME: 'bucket',
            R2_PUBLIC_BASE_URL: 'not-a-url',
          }),
        /R2_PUBLIC_BASE_URL must be a valid HTTP or HTTPS URL/
      );

      assert.throws(
        () =>
          parseR2Config({
            R2_ACCOUNT_ID: 'acc',
            R2_ACCESS_KEY_ID: 'key',
            R2_SECRET_ACCESS_KEY: 'sec',
            R2_BUCKET_NAME: 'bucket',
            R2_PUBLIC_BASE_URL: 'ftp://cdn.namlatic.com',
          }),
        /R2_PUBLIC_BASE_URL protocol must be "http:" or "https:"/
      );
    });

    it('rejects HTTP protocol in production for R2_PUBLIC_BASE_URL', () => {
      assert.throws(
        () =>
          parseR2Config(
            {
              R2_ACCOUNT_ID: 'acc',
              R2_ACCESS_KEY_ID: 'key',
              R2_SECRET_ACCESS_KEY: 'sec',
              R2_BUCKET_NAME: 'bucket',
              R2_PUBLIC_BASE_URL: 'http://cdn.namlatic.com',
            },
            'production'
          ),
        /In production, R2_PUBLIC_BASE_URL must use the "https:" protocol/
      );
    });

    it('permits HTTP protocol in development and test environments', () => {
      const devConf = parseR2Config(
        {
          R2_ACCOUNT_ID: 'acc',
          R2_ACCESS_KEY_ID: 'key',
          R2_SECRET_ACCESS_KEY: 'sec',
          R2_BUCKET_NAME: 'bucket',
          R2_PUBLIC_BASE_URL: 'http://localhost:9000',
        },
        'development'
      );
      assert.equal(devConf.publicBaseUrl, 'http://localhost:9000');

      const testConf = parseR2Config(
        {
          R2_ACCOUNT_ID: 'acc',
          R2_ACCESS_KEY_ID: 'key',
          R2_SECRET_ACCESS_KEY: 'sec',
          R2_BUCKET_NAME: 'bucket',
          R2_PUBLIC_BASE_URL: 'http://127.0.0.1:9000',
        },
        'test'
      );
      assert.equal(testConf.publicBaseUrl, 'http://127.0.0.1:9000');
    });

    it('rejects embedded credentials in R2_PUBLIC_BASE_URL', () => {
      assert.throws(
        () =>
          parseR2Config({
            R2_ACCOUNT_ID: 'acc',
            R2_ACCESS_KEY_ID: 'key',
            R2_SECRET_ACCESS_KEY: 'sec',
            R2_BUCKET_NAME: 'bucket',
            R2_PUBLIC_BASE_URL: 'https://user:password123@cdn.namlatic.com',
          }),
        /R2_PUBLIC_BASE_URL cannot contain embedded credentials \(username or password\)/
      );
    });

    it('rejects query parameters in R2_PUBLIC_BASE_URL', () => {
      assert.throws(
        () =>
          parseR2Config({
            R2_ACCOUNT_ID: 'acc',
            R2_ACCESS_KEY_ID: 'key',
            R2_SECRET_ACCESS_KEY: 'sec',
            R2_BUCKET_NAME: 'bucket',
            R2_PUBLIC_BASE_URL: 'https://cdn.namlatic.com?token=xyz',
          }),
        /R2_PUBLIC_BASE_URL must not contain query parameters/
      );
    });

    it('rejects URL hash / fragments in R2_PUBLIC_BASE_URL', () => {
      assert.throws(
        () =>
          parseR2Config({
            R2_ACCOUNT_ID: 'acc',
            R2_ACCESS_KEY_ID: 'key',
            R2_SECRET_ACCESS_KEY: 'sec',
            R2_BUCKET_NAME: 'bucket',
            R2_PUBLIC_BASE_URL: 'https://cdn.namlatic.com#top',
          }),
        /R2_PUBLIC_BASE_URL must not contain a URL hash\/fragment/
      );
    });

    it('rejects malformed URLs without a valid hostname in R2_PUBLIC_BASE_URL', () => {
      assert.throws(
        () =>
          parseR2Config({
            R2_ACCOUNT_ID: 'acc',
            R2_ACCESS_KEY_ID: 'key',
            R2_SECRET_ACCESS_KEY: 'sec',
            R2_BUCKET_NAME: 'bucket',
            R2_PUBLIC_BASE_URL: 'https://',
          }),
        /R2_PUBLIC_BASE_URL must be a valid HTTP or HTTPS URL/
      );
    });

    it('normalizes multiple trailing slashes consistently', () => {
      const conf = parseR2Config({
        R2_ACCOUNT_ID: 'acc',
        R2_ACCESS_KEY_ID: 'key',
        R2_SECRET_ACCESS_KEY: 'sec',
        R2_BUCKET_NAME: 'bucket',
        R2_PUBLIC_BASE_URL: 'https://cdn.namlatic.com///',
      });
      assert.equal(conf.publicBaseUrl, 'https://cdn.namlatic.com');
    });

    it('supports valid custom Cloudflare domains', () => {
      const conf = parseR2Config({
        R2_ACCOUNT_ID: 'acc',
        R2_ACCESS_KEY_ID: 'key',
        R2_SECRET_ACCESS_KEY: 'sec',
        R2_BUCKET_NAME: 'bucket',
        R2_PUBLIC_BASE_URL: 'https://media.namlatic.com',
      });
      assert.equal(conf.publicBaseUrl, 'https://media.namlatic.com');
    });

    it('never leaks secret keys or access keys in error messages', () => {
      try {
        parseR2Config({
          R2_ACCOUNT_ID: 'acc',
          R2_ACCESS_KEY_ID: 'sensitive-key-12345',
          R2_SECRET_ACCESS_KEY: 'top-secret-password-xyz',
          R2_BUCKET_NAME: 'bucket',
          R2_PUBLIC_BASE_URL: 'invalid-url',
        });
        assert.fail('Should have thrown an error');
      } catch (err) {
        assert.equal(err.message.includes('sensitive-key-12345'), false);
        assert.equal(err.message.includes('top-secret-password-xyz'), false);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Cloudinary Configuration Validation (Phase 5G-A)
  // --------------------------------------------------------------------------
  describe('Cloudinary Configuration Validation', () => {
    it('parses valid Cloudinary configuration with default folder', () => {
      const config = parseCloudinaryConfig({
        CLOUDINARY_CLOUD_NAME: 'namlatic-cloud',
        CLOUDINARY_API_KEY: '123456789012345',
        CLOUDINARY_API_SECRET: 'super-secret-key-xyz',
      });

      assert.equal(config.cloudName, 'namlatic-cloud');
      assert.equal(config.apiKey, '123456789012345');
      assert.equal(config.apiSecret, 'super-secret-key-xyz');
      assert.equal(config.folder, 'namlatic-hotel/hotels');
    });

    it('parses valid Cloudinary configuration with custom folder', () => {
      const config = parseCloudinaryConfig({
        CLOUDINARY_CLOUD_NAME: 'namlatic-cloud',
        CLOUDINARY_API_KEY: '123456789012345',
        CLOUDINARY_API_SECRET: 'super-secret-key-xyz',
        CLOUDINARY_FOLDER: 'custom-portfolio/hotel-assets',
      });

      assert.equal(config.folder, 'custom-portfolio/hotel-assets');
    });

    it('fails fast when required Cloudinary variables are missing', () => {
      assert.throws(
        () => parseCloudinaryConfig({}),
        /Cloudinary configuration error: Missing required environment variable\(s\): CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET/
      );

      assert.throws(
        () =>
          parseCloudinaryConfig({
            CLOUDINARY_CLOUD_NAME: 'namlatic-cloud',
            // Missing API key and secret
          }),
        /CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET/
      );
    });

    it('rejects invalid characters in CLOUDINARY_CLOUD_NAME', () => {
      assert.throws(
        () =>
          parseCloudinaryConfig({
            CLOUDINARY_CLOUD_NAME: 'invalid cloud name with spaces!',
            CLOUDINARY_API_KEY: '123',
            CLOUDINARY_API_SECRET: 'sec',
          }),
        /CLOUDINARY_CLOUD_NAME contains invalid characters/
      );
    });

    it('rejects relative traversal in CLOUDINARY_FOLDER', () => {
      assert.throws(
        () =>
          parseCloudinaryConfig({
            CLOUDINARY_CLOUD_NAME: 'namlatic-cloud',
            CLOUDINARY_API_KEY: '123',
            CLOUDINARY_API_SECRET: 'sec',
            CLOUDINARY_FOLDER: '../escape-folder',
          }),
        /CLOUDINARY_FOLDER cannot contain relative parent paths or leading\/trailing slashes/
      );

      assert.throws(
        () =>
          parseCloudinaryConfig({
            CLOUDINARY_CLOUD_NAME: 'namlatic-cloud',
            CLOUDINARY_API_KEY: '123',
            CLOUDINARY_API_SECRET: 'sec',
            CLOUDINARY_FOLDER: '/leading-slash',
          }),
        /CLOUDINARY_FOLDER cannot contain relative parent paths or leading\/trailing slashes/
      );
    });

    it('never leaks secret keys in Cloudinary error messages', () => {
      try {
        parseCloudinaryConfig({
          CLOUDINARY_CLOUD_NAME: 'bad cloud name!',
          CLOUDINARY_API_KEY: 'sensitive-api-key-999',
          CLOUDINARY_API_SECRET: 'super-sensitive-secret-token-888',
        });
        assert.fail('Should have thrown an error');
      } catch (err) {
        assert.equal(err.message.includes('sensitive-api-key-999'), false);
        assert.equal(err.message.includes('super-sensitive-secret-token-888'), false);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 2. Local Storage Adapter
  // --------------------------------------------------------------------------
  describe('LocalStorageAdapter', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-storage-test-'));
    const adapter = new LocalStorageAdapter({ uploadsDir: tmpDir });

    it('uploads a file and returns local storage reference and public URL', async () => {
      const sampleFile = path.join(tmpDir, 'sample-123.jpg');
      fs.writeFileSync(sampleFile, Buffer.from([0xff, 0xd8, 0xff]));

      const result = await adapter.upload({
        path: sampleFile,
        filename: 'sample-123.jpg',
      });

      assert.equal(result.storageReference, '/uploads/hotels/sample-123.jpg');
      assert.equal(result.publicUrl, '/uploads/hotels/sample-123.jpg');
      assert.equal(result.key, 'hotels/sample-123.jpg');
    });

    it('deletes an existing file from local storage', async () => {
      const fileToDelete = path.join(tmpDir, 'to-delete.jpg');
      fs.writeFileSync(fileToDelete, Buffer.from('hello'));

      assert.equal(fs.existsSync(fileToDelete), true);
      const deleted = await adapter.delete('/uploads/hotels/to-delete.jpg');
      assert.equal(deleted, true);
      assert.equal(fs.existsSync(fileToDelete), false);
    });

    it('handles already-missing file safely without throwing (returns false)', async () => {
      const deleted = await adapter.delete('/uploads/hotels/ghost.jpg');
      assert.equal(deleted, false);
    });

    it('blocks directory traversal attempts in delete()', async () => {
      const deleted1 = await adapter.delete('../../package.json');
      assert.equal(deleted1, false);

      const deleted2 = await adapter.delete('/uploads/hotels/../../secret.txt');
      assert.equal(deleted2, false);
    });

    it('protects .gitkeep from deletion', async () => {
      const gitkeep = path.join(tmpDir, '.gitkeep');
      fs.writeFileSync(gitkeep, '');

      const deleted = await adapter.delete('/uploads/hotels/.gitkeep');
      assert.equal(deleted, false);
      assert.equal(fs.existsSync(gitkeep), true);
    });

    it('isManagedReference correctly identifies local references and rejects r2: references', () => {
      assert.equal(adapter.isManagedReference('/uploads/hotels/123.jpg'), true);
      assert.equal(adapter.isManagedReference('123.jpg'), true);
      assert.equal(adapter.isManagedReference('r2:hotels/123.jpg'), false);
      assert.equal(adapter.isManagedReference(null), false);
    });

    it('getPublicUrl returns relative path as-is', () => {
      assert.equal(adapter.getPublicUrl('/uploads/hotels/abc.jpg'), '/uploads/hotels/abc.jpg');
      assert.equal(adapter.getPublicUrl(null), null);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Cloudflare R2 Storage Adapter (with Mock S3 Client)
  // --------------------------------------------------------------------------
  describe('R2StorageAdapter', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r2-storage-test-'));

    it('generates random UUID-based object keys without user input', () => {
      const adapter = new R2StorageAdapter({
        accountId: 'acc',
        accessKeyId: 'key',
        secretAccessKey: 'sec',
        bucketName: 'hotels',
        publicBaseUrl: 'https://cdn.example.com',
        s3Client: { send: async () => {} },
      });

      const key1 = adapter.generateObjectKey('.jpg');
      const key2 = adapter.generateObjectKey('png');
      const key3 = adapter.generateObjectKey('.WEBP');

      assert.match(key1, /^hotels\/[0-9a-f-]{36}\.jpg$/);
      assert.match(key2, /^hotels\/[0-9a-f-]{36}\.png$/);
      assert.match(key3, /^hotels\/[0-9a-f-]{36}\.webp$/);
      assert.notEqual(key1, key2);
    });

    it('uploads a file to R2 via S3 PutObjectCommand and cleans up staged file', async () => {
      const sentCommands = [];
      const mockS3 = {
        send: async (cmd) => {
          sentCommands.push(cmd);
          return {};
        },
      };

      const adapter = new R2StorageAdapter({
        accountId: 'acc',
        accessKeyId: 'key',
        secretAccessKey: 'sec',
        bucketName: 'hotel-media-bucket',
        publicBaseUrl: 'https://pub-media.r2.dev',
        s3Client: mockS3,
      });

      const stagedPath = path.join(tmpDir, 'staged-upload.jpg');
      fs.writeFileSync(stagedPath, Buffer.from([0xff, 0xd8, 0xff]));

      const result = await adapter.upload(
        {
          path: stagedPath,
          verifiedMimeType: 'image/jpeg',
          verifiedExtension: '.jpg',
        },
        { key: 'hotels/custom-test-uuid.jpg' }
      );

      assert.equal(result.storageReference, 'r2:hotels/custom-test-uuid.jpg');
      assert.equal(result.publicUrl, 'https://pub-media.r2.dev/hotels/custom-test-uuid.jpg');
      assert.equal(result.key, 'hotels/custom-test-uuid.jpg');

      // Verify S3 command parameters
      assert.equal(sentCommands.length, 1);
      const putInput = sentCommands[0].input;
      assert.equal(putInput.Bucket, 'hotel-media-bucket');
      assert.equal(putInput.Key, 'hotels/custom-test-uuid.jpg');
      assert.equal(putInput.ContentType, 'image/jpeg');
      assert.equal(putInput.CacheControl, 'public, max-age=31536000, immutable');
      assert.deepEqual(putInput.Body, Buffer.from([0xff, 0xd8, 0xff]));

      // Verify local staged file was unlinked
      assert.equal(fs.existsSync(stagedPath), false);
    });

    it('unlinks staged local file even if S3 upload fails', async () => {
      const mockS3 = {
        send: async () => {
          throw new Error('S3 Connection Timeout');
        },
      };

      const adapter = new R2StorageAdapter({
        accountId: 'acc',
        accessKeyId: 'key',
        secretAccessKey: 'sec',
        bucketName: 'bucket',
        publicBaseUrl: 'https://cdn.example.com',
        s3Client: mockS3,
      });

      const failedStagedPath = path.join(tmpDir, 'failed-staged.jpg');
      fs.writeFileSync(failedStagedPath, Buffer.from('data'));

      await assert.rejects(
        () =>
          adapter.upload({
            path: failedStagedPath,
            verifiedMimeType: 'image/jpeg',
          }),
        /Failed to upload media to Cloudflare R2: S3 Connection Timeout/
      );

      // Verify staged file was cleaned up on failure
      assert.equal(fs.existsSync(failedStagedPath), false);
    });

    it('unlinks staged local file if fs.promises.readFile fails', async () => {
      const adapter = new R2StorageAdapter({
        accountId: 'acc',
        accessKeyId: 'key',
        secretAccessKey: 'sec',
        bucketName: 'bucket',
        publicBaseUrl: 'https://cdn.example.com',
        s3Client: { send: async () => {} },
      });

      const failedReadPath = path.join(tmpDir, 'failed-read.jpg');
      fs.writeFileSync(failedReadPath, Buffer.from('data'));
      assert.equal(fs.existsSync(failedReadPath), true);

      const origReadFile = fs.promises.readFile;
      fs.promises.readFile = async () => {
        throw new Error('EACCES: permission denied');
      };

      try {
        await assert.rejects(
          () =>
            adapter.upload({
              path: failedReadPath,
              verifiedMimeType: 'image/jpeg',
            }),
          /R2 upload error: Failed to read local staged file: EACCES: permission denied/
        );
      } finally {
        fs.promises.readFile = origReadFile;
      }

      // Verify staged file was unlinked on read failure
      assert.equal(fs.existsSync(failedReadPath), false);
    });

    it('does not fail upload or delete R2 object if local staged file unlink fails', async () => {
      const sentCommands = [];
      const adapter = new R2StorageAdapter({
        accountId: 'acc',
        accessKeyId: 'key',
        secretAccessKey: 'sec',
        bucketName: 'bucket',
        publicBaseUrl: 'https://cdn.example.com',
        s3Client: {
          send: async (cmd) => {
            sentCommands.push(cmd);
            return {};
          },
        },
      });

      const stagedPath = path.join(tmpDir, 'unlink-fail.jpg');
      fs.writeFileSync(stagedPath, Buffer.from([0xff, 0xd8, 0xff]));

      const origUnlink = fs.promises.unlink;
      fs.promises.unlink = async () => {
        const err = new Error('EBUSY: resource locked');
        err.code = 'EBUSY';
        throw err;
      };

      try {
        const result = await adapter.upload({
          path: stagedPath,
          verifiedMimeType: 'image/jpeg',
        });
        assert.equal(result.storageReference.startsWith('r2:'), true);
        assert.equal(sentCommands.length, 1); // PutObject sent, NOT DeleteObject
      } finally {
        fs.promises.unlink = origUnlink;
        if (fs.existsSync(stagedPath)) {
          fs.unlinkSync(stagedPath);
        }
      }
    });

    it('sends DeleteObjectCommand with correct bucket and key for r2: references', async () => {
      const deleteCommands = [];
      const mockS3 = {
        send: async (cmd) => {
          deleteCommands.push(cmd);
          return {};
        },
      };

      const adapter = new R2StorageAdapter({
        accountId: 'acc',
        accessKeyId: 'key',
        secretAccessKey: 'sec',
        bucketName: 'hotel-media-bucket',
        publicBaseUrl: 'https://cdn.example.com',
        s3Client: mockS3,
      });

      const deleted = await adapter.delete('r2:hotels/target-uuid.webp');
      assert.equal(deleted, true);

      assert.equal(deleteCommands.length, 1);
      const delInput = deleteCommands[0].input;
      assert.equal(delInput.Bucket, 'hotel-media-bucket');
      assert.equal(delInput.Key, 'hotels/target-uuid.webp');
    });

    it('ignores non-R2 references in delete() and returns false', async () => {
      const adapter = new R2StorageAdapter({
        bucketName: 'bucket',
        publicBaseUrl: 'https://cdn.example.com',
        s3Client: { send: async () => {} },
      });

      assert.equal(await adapter.delete('/uploads/hotels/local.jpg'), false);
      assert.equal(await adapter.delete(null), false);
    });

    it('getPublicUrl generates fully qualified CDN URLs for r2: references', () => {
      const adapter = new R2StorageAdapter({
        bucketName: 'bucket',
        publicBaseUrl: 'https://media.namlatic.com',
        s3Client: { send: async () => {} },
      });

      assert.equal(
        adapter.getPublicUrl('r2:hotels/abc-123.jpg'),
        'https://media.namlatic.com/hotels/abc-123.jpg'
      );
    });

    it('getPublicUrl preserves legacy local references unchanged', () => {
      const adapter = new R2StorageAdapter({
        bucketName: 'bucket',
        publicBaseUrl: 'https://media.namlatic.com',
        s3Client: { send: async () => {} },
      });

      assert.equal(
        adapter.getPublicUrl('/uploads/hotels/legacy.jpg'),
        '/uploads/hotels/legacy.jpg'
      );
    });

    it('isManagedReference identifies r2: prefix correctly', () => {
      const adapter = new R2StorageAdapter({
        bucketName: 'bucket',
        publicBaseUrl: 'https://cdn.example.com',
        s3Client: { send: async () => {} },
      });

      assert.equal(adapter.isManagedReference('r2:hotels/123.jpg'), true);
      assert.equal(adapter.isManagedReference('r2:123.jpg'), true);
      assert.equal(adapter.isManagedReference('/uploads/hotels/123.jpg'), false);
      assert.equal(adapter.isManagedReference(null), false);
    });
  });

  // --------------------------------------------------------------------------
  // Cloudinary Storage Adapter Unit Tests (Phase 5G-A)
  // --------------------------------------------------------------------------
  describe('CloudinaryStorageAdapter Unit Tests (Mocked Cloudinary SDK)', () => {
    it('generates predictable, secure server-side public IDs with configured folder', () => {
      const adapter = new CloudinaryStorageAdapter({
        cloudName: 'namlatic-cloud',
        apiKey: '123',
        apiSecret: 'sec',
        folder: 'namlatic-hotel/hotels',
        cloudinaryClient: { uploader: {}, url: () => '' },
      });

      const publicId1 = adapter.generatePublicId();
      const publicId2 = adapter.generatePublicId();

      assert.match(publicId1, /^namlatic-hotel\/hotels\/[0-9a-f-]{36}$/);
      assert.match(publicId2, /^namlatic-hotel\/hotels\/[0-9a-f-]{36}$/);
      assert.notEqual(publicId1, publicId2);
    });

    it('identifies managed Cloudinary references and rejects invalid or traversal references', () => {
      const adapter = new CloudinaryStorageAdapter({
        cloudName: 'namlatic-cloud',
        apiKey: '123',
        apiSecret: 'sec',
        cloudinaryClient: { uploader: {}, url: () => '' },
      });

      assert.equal(adapter.isManagedReference('cloudinary:namlatic-hotel/hotels/12345'), true);
      assert.equal(adapter.isManagedReference('cloudinary:namlatic-hotel/hotels/12345.jpg'), true);
      assert.equal(adapter.isManagedReference('cloudinary:'), false);
      assert.equal(adapter.isManagedReference('cloudinary:   '), false);
      assert.equal(adapter.isManagedReference('cloudinary:../traversal/path'), false);
      assert.equal(adapter.isManagedReference('cloudinary:/root/path'), false);
      assert.equal(adapter.isManagedReference('r2:hotels/12345.jpg'), false);
      assert.equal(adapter.isManagedReference('/uploads/hotels/12345.jpg'), false);
      assert.equal(adapter.isManagedReference(null), false);
      assert.equal(adapter.isManagedReference(undefined), false);
      assert.equal(adapter.isManagedReference(''), false);
      assert.equal(adapter.isManagedReference(123), false);
    });

    it('safely extracts public ID and blocks directory traversal', () => {
      const adapter = new CloudinaryStorageAdapter({
        cloudName: 'namlatic-cloud',
        apiKey: '123',
        apiSecret: 'sec',
        cloudinaryClient: { uploader: {}, url: () => '' },
      });

      assert.equal(
        adapter.extractPublicId('cloudinary:namlatic-hotel/hotels/sample-id'),
        'namlatic-hotel/hotels/sample-id'
      );
      assert.equal(adapter.extractPublicId('cloudinary:'), null);
      assert.equal(adapter.extractPublicId('cloudinary:../traversal'), null);
      assert.equal(adapter.extractPublicId('cloudinary:/leading-slash'), null);
      assert.equal(adapter.extractPublicId('not-a-cloudinary-ref'), null);
    });

    it('uploads staged file via signed upload and unlinks staged local file on success', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudinary-test-'));
      const stagedFilePath = path.join(tmpDir, 'staged-image.jpg');
      fs.writeFileSync(stagedFilePath, Buffer.from([0xff, 0xd8, 0xff]));

      const uploadCalls = [];
      const mockCloudinary = {
        uploader: {
          upload: async (filePath, options) => {
            uploadCalls.push({ filePath, options });
            return {
              public_id: options.public_id,
              secure_url: `https://res.cloudinary.com/namlatic-cloud/image/upload/${options.public_id}.jpg`,
              format: 'jpg',
              resource_type: 'image',
            };
          },
        },
        url: (publicId) => `https://res.cloudinary.com/namlatic-cloud/image/upload/${publicId}`,
      };

      const adapter = new CloudinaryStorageAdapter({
        cloudName: 'namlatic-cloud',
        apiKey: '123',
        apiSecret: 'sec',
        cloudinaryClient: mockCloudinary,
      });

      const result = await adapter.upload({
        path: stagedFilePath,
        mimetype: 'image/jpeg',
      });

      assert.equal(uploadCalls.length, 1);
      assert.equal(uploadCalls[0].filePath, stagedFilePath);
      assert.equal(uploadCalls[0].options.resource_type, 'image');
      assert.equal(uploadCalls[0].options.overwrite, false);
      assert.match(result.storageReference, /^cloudinary:namlatic-hotel\/hotels\/[0-9a-f-]{36}$/);
      assert.match(
        result.publicUrl,
        /^https:\/\/res\.cloudinary\.com\/namlatic-cloud\/image\/upload\/namlatic-hotel\/hotels\/[0-9a-f-]{36}\.jpg$/
      );
      assert.equal(result.key, uploadCalls[0].options.public_id);

      // Verify staged local file is unlinked on upload success
      assert.equal(fs.existsSync(stagedFilePath), false);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('cleans up staged local file on upload failure and propagates error safely without leaking secrets', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudinary-fail-test-'));
      const stagedFilePath = path.join(tmpDir, 'staged-image-fail.jpg');
      fs.writeFileSync(stagedFilePath, Buffer.from([0xff, 0xd8, 0xff]));

      const mockCloudinary = {
        uploader: {
          upload: async () => {
            throw new Error('Simulated Cloudinary API 500 network timeout');
          },
        },
        url: () => '',
      };

      const adapter = new CloudinaryStorageAdapter({
        cloudName: 'namlatic-cloud',
        apiKey: '123',
        apiSecret: 'sec',
        cloudinaryClient: mockCloudinary,
      });

      await assert.rejects(
        async () => {
          await adapter.upload({ path: stagedFilePath });
        },
        /Failed to upload media to Cloudinary: Simulated Cloudinary API 500 network timeout/
      );

      // Verify staged local file was unlinked despite upload failure
      assert.equal(fs.existsSync(stagedFilePath), false);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('rejects upload when file or file.path is missing', async () => {
      const adapter = new CloudinaryStorageAdapter({
        cloudName: 'namlatic-cloud',
        apiKey: '123',
        apiSecret: 'sec',
        cloudinaryClient: { uploader: {}, url: () => '' },
      });

      await assert.rejects(
        () => adapter.upload(null),
        /Cloudinary upload error: file with a valid local path is required/
      );

      await assert.rejects(
        () => adapter.upload({}),
        /Cloudinary upload error: file with a valid local path is required/
      );
    });

    it('deletes asset via uploader.destroy with resource_type: image and invalidate: true', async () => {
      const destroyCalls = [];
      const mockCloudinary = {
        uploader: {
          destroy: async (publicId, options) => {
            destroyCalls.push({ publicId, options });
            return { result: 'ok' };
          },
        },
        url: () => '',
      };

      const adapter = new CloudinaryStorageAdapter({
        cloudName: 'namlatic-cloud',
        apiKey: '123',
        apiSecret: 'sec',
        cloudinaryClient: mockCloudinary,
      });

      const deleted = await adapter.delete('cloudinary:namlatic-hotel/hotels/photo-12345');
      assert.equal(deleted, true);
      assert.equal(destroyCalls.length, 1);
      assert.equal(destroyCalls[0].publicId, 'namlatic-hotel/hotels/photo-12345');
      assert.equal(destroyCalls[0].options.resource_type, 'image');
      assert.equal(destroyCalls[0].options.invalidate, true);
    });

    it('treats result: "not found" as successful deletion (idempotent delete)', async () => {
      const mockCloudinary = {
        uploader: {
          destroy: async () => ({ result: 'not found' }),
        },
        url: () => '',
      };

      const adapter = new CloudinaryStorageAdapter({
        cloudName: 'namlatic-cloud',
        apiKey: '123',
        apiSecret: 'sec',
        cloudinaryClient: mockCloudinary,
      });

      const deleted = await adapter.delete('cloudinary:namlatic-hotel/hotels/missing-asset');
      assert.equal(deleted, true);
    });

    it('throws error when uploader.destroy returns result: "error"', async () => {
      const mockCloudinary = {
        uploader: {
          destroy: async () => ({ result: 'error', message: 'Asset locked' }),
        },
        url: () => '',
      };

      const adapter = new CloudinaryStorageAdapter({
        cloudName: 'namlatic-cloud',
        apiKey: '123',
        apiSecret: 'sec',
        cloudinaryClient: mockCloudinary,
      });

      await assert.rejects(
        () => adapter.delete('cloudinary:namlatic-hotel/hotels/locked-asset'),
        /Cloudinary asset deletion failed: Asset locked/
      );
    });

    it('returns false when delete() is called with unmanaged references', async () => {
      const adapter = new CloudinaryStorageAdapter({
        cloudName: 'namlatic-cloud',
        apiKey: '123',
        apiSecret: 'sec',
        cloudinaryClient: { uploader: {}, url: () => '' },
      });

      assert.equal(await adapter.delete('/uploads/hotels/legacy.jpg'), false);
      assert.equal(await adapter.delete('r2:hotels/r2-file.png'), false);
      assert.equal(await adapter.delete(null), false);
      assert.equal(await adapter.delete(''), false);
    });

    it('resolves secure public URL using cloudinary.url()', () => {
      const adapter = new CloudinaryStorageAdapter({
        cloudName: 'namlatic-cloud',
        apiKey: '123',
        apiSecret: 'sec',
        cloudinaryClient: {
          uploader: {},
          url: (publicId) => `https://res.cloudinary.com/namlatic-cloud/image/upload/${publicId}`,
        },
      });

      const url = adapter.getPublicUrl('cloudinary:namlatic-hotel/hotels/sample-asset');
      assert.equal(
        url,
        'https://res.cloudinary.com/namlatic-cloud/image/upload/namlatic-hotel/hotels/sample-asset'
      );
    });

    it('returns null for invalid or falsy storage references in getPublicUrl', () => {
      const adapter = new CloudinaryStorageAdapter({
        cloudName: 'namlatic-cloud',
        apiKey: '123',
        apiSecret: 'sec',
        cloudinaryClient: { uploader: {}, url: () => '' },
      });

      assert.equal(adapter.getPublicUrl(null), null);
      assert.equal(adapter.getPublicUrl(''), null);
      assert.equal(adapter.getPublicUrl('cloudinary:'), null);
      assert.equal(adapter.getPublicUrl('cloudinary:../traversal'), null);
      // Non-cloudinary references returned as-is
      assert.equal(adapter.getPublicUrl('/uploads/hotels/pic.jpg'), '/uploads/hotels/pic.jpg');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Unified StorageService Router
  // --------------------------------------------------------------------------
  describe('Unified StorageService Routing & Reference Isolation', () => {
    it('routes uploads to Cloudinary when active driver is cloudinary', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudinary-router-test-'));
      const stagedFilePath = path.join(tmpDir, 'router-test.jpg');
      fs.writeFileSync(stagedFilePath, Buffer.from([0xff, 0xd8, 0xff]));

      const uploadCalls = [];
      const mockCloudinary = {
        uploader: {
          upload: async (filePath, options) => {
            uploadCalls.push({ filePath, options });
            return {
              public_id: options.public_id,
              secure_url: `https://res.cloudinary.com/namlatic-cloud/image/upload/${options.public_id}.jpg`,
            };
          },
        },
        url: (publicId) => `https://res.cloudinary.com/namlatic-cloud/image/upload/${publicId}`,
      };

      const storageService = createStorageService({
        driver: 'cloudinary',
        cloudinaryConfig: {
          cloudName: 'namlatic-cloud',
          apiKey: 'key',
          apiSecret: 'sec',
          folder: 'namlatic-hotel/hotels',
        },
        cloudinaryClient: mockCloudinary,
      });

      assert.equal(storageService.getActiveAdapter() instanceof CloudinaryStorageAdapter, true);

      const result = await storageService.upload({ path: stagedFilePath });
      assert.equal(uploadCalls.length, 1);
      assert.match(result.storageReference, /^cloudinary:namlatic-hotel\/hotels\/[0-9a-f-]{36}$/);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('intelligently routes deletes so local filesystem and S3 never receive cloudinary: references', async () => {
      const cloudinaryDeletes = [];
      const mockCloudinary = {
        uploader: {
          destroy: async (publicId) => {
            cloudinaryDeletes.push(publicId);
            return { result: 'ok' };
          },
        },
        url: () => '',
      };

      const s3Calls = [];
      const mockS3 = {
        send: async (cmd) => {
          s3Calls.push(cmd);
          return {};
        },
      };

      const storageService = createStorageService({
        driver: 'cloudinary',
        cloudinaryConfig: {
          cloudName: 'namlatic-cloud',
          apiKey: 'key',
          apiSecret: 'sec',
        },
        cloudinaryClient: mockCloudinary,
        r2Config: {
          accountId: 'acc',
          accessKeyId: 'k',
          secretAccessKey: 's',
          bucketName: 'test-bucket',
          publicBaseUrl: 'https://cdn.example.com',
        },
        s3Client: mockS3,
      });

      // 1. Delete a Cloudinary reference -> routes to Cloudinary (not S3 or local disk)
      const deletedCloudinary = await storageService.delete('cloudinary:namlatic-hotel/hotels/asset-999');
      assert.equal(deletedCloudinary, true);
      assert.equal(cloudinaryDeletes.length, 1);
      assert.equal(cloudinaryDeletes[0], 'namlatic-hotel/hotels/asset-999');
      assert.equal(s3Calls.length, 0); // Zero S3 calls!

      // 2. Delete an R2 reference -> routes to R2 (not Cloudinary or local disk)
      const deletedR2 = await storageService.delete('r2:hotels/r2-file.png');
      assert.equal(deletedR2, true);
      assert.equal(s3Calls.length, 1);
      assert.equal(cloudinaryDeletes.length, 1); // No new Cloudinary calls!

      // 3. Delete a local reference -> routes to local adapter (not Cloudinary or S3)
      const deletedLocal = await storageService.delete('/uploads/hotels/non-existent.jpg');
      assert.equal(deletedLocal, false);
      assert.equal(cloudinaryDeletes.length, 1);
      assert.equal(s3Calls.length, 1);
    });

    it('resolves public URLs transparently across local, R2, and Cloudinary references', () => {
      const storageService = createStorageService({
        driver: 'cloudinary',
        cloudinaryConfig: {
          cloudName: 'namlatic-cloud',
          apiKey: 'key',
          apiSecret: 'sec',
        },
        cloudinaryClient: {
          uploader: {},
          url: (publicId) => `https://res.cloudinary.com/namlatic-cloud/image/upload/${publicId}`,
        },
        r2Config: {
          accountId: 'acc',
          accessKeyId: 'k',
          secretAccessKey: 's',
          bucketName: 'b',
          publicBaseUrl: 'https://cdn.example.com',
        },
        s3Client: { send: async () => {} },
      });

      // Cloudinary reference resolves to Cloudinary URL
      assert.equal(
        storageService.getPublicUrl('cloudinary:namlatic-hotel/hotels/hero-123'),
        'https://res.cloudinary.com/namlatic-cloud/image/upload/namlatic-hotel/hotels/hero-123'
      );

      // R2 reference resolves to CDN URL
      assert.equal(
        storageService.getPublicUrl('r2:hotels/photo.webp'),
        'https://cdn.example.com/hotels/photo.webp'
      );

      // Legacy local reference remains local path
      assert.equal(
        storageService.getPublicUrl('/uploads/hotels/old.jpg'),
        '/uploads/hotels/old.jpg'
      );

      // Falsy reference returns null
      assert.equal(storageService.getPublicUrl(null), null);
    });

    it('isManagedReference identifies local, R2, and Cloudinary references correctly', () => {
      const storageService = createStorageService({
        driver: 'cloudinary',
        cloudinaryConfig: {
          cloudName: 'namlatic-cloud',
          apiKey: 'key',
          apiSecret: 'sec',
        },
        cloudinaryClient: { uploader: {}, url: () => '' },
        r2Config: {
          accountId: 'acc',
          accessKeyId: 'k',
          secretAccessKey: 's',
          bucketName: 'b',
          publicBaseUrl: 'https://cdn.example.com',
        },
        s3Client: { send: async () => {} },
      });

      assert.equal(storageService.isManagedReference('cloudinary:namlatic-hotel/hotels/123'), true);
      assert.equal(storageService.isManagedReference('r2:hotels/123.jpg'), true);
      assert.equal(storageService.isManagedReference('/uploads/hotels/123.jpg'), true);
      assert.equal(storageService.isManagedReference('unknown-driver:asset-123'), false);
      assert.equal(storageService.isManagedReference(null), false);
    });
    it('intelligently routes deletes so local filesystem never receives r2: references', async () => {
      const r2Calls = [];
      const mockS3 = {
        send: async (cmd) => {
          r2Calls.push(cmd);
          return {};
        },
      };

      const storageService = createStorageService({
        driver: 'r2',
        r2Config: {
          accountId: 'acc',
          accessKeyId: 'k',
          secretAccessKey: 's',
          bucketName: 'test-bucket',
          publicBaseUrl: 'https://cdn.example.com',
        },
        s3Client: mockS3,
      });

      // 1. Delete an R2 reference -> sent to mock S3
      const deletedR2 = await storageService.delete('r2:hotels/r2-file.png');
      assert.equal(deletedR2, true);
      assert.equal(r2Calls.length, 1);
      assert.equal(r2Calls[0].input.Key, 'hotels/r2-file.png');

      // 2. Delete a local reference -> routes to local adapter (not S3)
      const deletedLocal = await storageService.delete('/uploads/hotels/non-existent.jpg');
      assert.equal(deletedLocal, false);
      assert.equal(r2Calls.length, 1); // No new S3 command
    });

    it('resolves public URLs transparently across both local and R2 references', () => {
      const storageService = createStorageService({
        driver: 'r2',
        r2Config: {
          accountId: 'acc',
          accessKeyId: 'k',
          secretAccessKey: 's',
          bucketName: 'b',
          publicBaseUrl: 'https://cdn.example.com',
        },
        s3Client: { send: async () => {} },
      });

      // R2 reference resolves to CDN URL
      assert.equal(
        storageService.getPublicUrl('r2:hotels/photo.webp'),
        'https://cdn.example.com/hotels/photo.webp'
      );

      // Legacy local reference remains local path
      assert.equal(
        storageService.getPublicUrl('/uploads/hotels/old.jpg'),
        '/uploads/hotels/old.jpg'
      );

      // Falsy reference returns null
      assert.equal(storageService.getPublicUrl(null), null);
    });
  });
});
