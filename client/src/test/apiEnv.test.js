import { describe, it, expect } from 'vitest';
import { resolveApiConfig, getImageUrl } from '../services/api';

describe('Frontend API Environment & URL Resolution (Phase 5E.2)', () => {
  describe('1. Production API URL Requirement & Validation', () => {
    it('accepts a valid HTTPS VITE_API_URL in production', () => {
      const config = resolveApiConfig({
        PROD: true,
        VITE_API_URL: 'https://api.namlatic.com/api',
      });
      expect(config.API_BASE_URL).toBe('https://api.namlatic.com/api');
      expect(config.API_ORIGIN).toBe('https://api.namlatic.com');

      // Normalizes trailing slashes cleanly
      const configTrailing = resolveApiConfig({
        PROD: true,
        VITE_API_URL: 'https://api.namlatic.com/api/',
      });
      expect(configTrailing.API_BASE_URL).toBe('https://api.namlatic.com/api');
      expect(configTrailing.API_ORIGIN).toBe('https://api.namlatic.com');
    });

    it('rejects a missing, empty, or whitespace-only VITE_API_URL in production', () => {
      expect(() => resolveApiConfig({ PROD: true })).toThrowError(
        /VITE_API_URL is required in production/i
      );
      expect(() => resolveApiConfig({ PROD: true, VITE_API_URL: '' })).toThrowError(
        /VITE_API_URL is required in production/i
      );
      expect(() => resolveApiConfig({ PROD: true, VITE_API_URL: '   ' })).toThrowError(
        /VITE_API_URL is required in production/i
      );
    });

    it('rejects a legacy-only VITE_API_BASE_URL in production', () => {
      expect(() =>
        resolveApiConfig({
          PROD: true,
          VITE_API_BASE_URL: 'https://legacy-api.namlatic.com/api',
        })
      ).toThrowError(/VITE_API_URL is required in production/i);
    });

    it('rejects malformed or relative URLs in production', () => {
      expect(() =>
        resolveApiConfig({ PROD: true, VITE_API_URL: 'not-a-url' })
      ).toThrowError(/VITE_API_URL must be a valid, absolute URL/i);

      expect(() =>
        resolveApiConfig({ PROD: true, VITE_API_URL: '/api' })
      ).toThrowError(/VITE_API_URL must be a valid, absolute URL/i);

      expect(() =>
        resolveApiConfig({ PROD: true, VITE_API_URL: 'api/hotels' })
      ).toThrowError(/VITE_API_URL must be a valid, absolute URL/i);
    });

    it('rejects non-HTTPS HTTP URLs in production', () => {
      expect(() =>
        resolveApiConfig({
          PROD: true,
          VITE_API_URL: 'http://api.namlatic.com/api',
        })
      ).toThrowError(/VITE_API_URL must use the HTTPS protocol in production/i);
    });

    it('rejects URLs that violate the documented /api path convention', () => {
      expect(() =>
        resolveApiConfig({
          PROD: true,
          VITE_API_URL: 'https://api.namlatic.com',
        })
      ).toThrowError(/VITE_API_URL must include the documented '\/api' path convention/i);

      expect(() =>
        resolveApiConfig({
          PROD: true,
          VITE_API_URL: 'https://api.namlatic.com/hotels',
        })
      ).toThrowError(/VITE_API_URL must include the documented '\/api' path convention/i);
    });

    it('rejects embedded credentials in VITE_API_URL', () => {
      expect(() =>
        resolveApiConfig({
          PROD: true,
          VITE_API_URL: 'https://admin:secret@api.namlatic.com/api',
        })
      ).toThrowError(/VITE_API_URL must not contain embedded credentials/i);
    });

    it('rejects query strings in VITE_API_URL', () => {
      expect(() =>
        resolveApiConfig({
          PROD: true,
          VITE_API_URL: 'https://api.namlatic.com/api?debug=true',
        })
      ).toThrowError(/VITE_API_URL must not contain query parameters/i);
    });

    it('rejects URL fragments in VITE_API_URL', () => {
      expect(() =>
        resolveApiConfig({
          PROD: true,
          VITE_API_URL: 'https://api.namlatic.com/api#section',
        })
      ).toThrowError(/VITE_API_URL must not contain URL fragments/i);
    });

    it('rejects localhost and loopback hostnames in production', () => {
      expect(() =>
        resolveApiConfig({
          PROD: true,
          VITE_API_URL: 'https://localhost/api',
        })
      ).toThrowError(/VITE_API_URL must not point to localhost in production/i);

      expect(() =>
        resolveApiConfig({
          PROD: true,
          VITE_API_URL: 'https://127.0.0.1/api',
        })
      ).toThrowError(/VITE_API_URL must not point to localhost in production/i);
    });
  });

  describe('2. Development Environment & Legacy Fallbacks', () => {
    it('falls back to localhost default in development and test environments', () => {
      const devConfig = resolveApiConfig({ MODE: 'development', PROD: false });
      expect(devConfig.API_BASE_URL).toBe('http://localhost:5000/api');
      expect(devConfig.API_ORIGIN).toBe('http://localhost:5000');

      const testConfig = resolveApiConfig({ MODE: 'test', PROD: false });
      expect(testConfig.API_BASE_URL).toBe('http://localhost:5000/api');
      expect(testConfig.API_ORIGIN).toBe('http://localhost:5000');

      const emptyConfig = resolveApiConfig({});
      expect(emptyConfig.API_BASE_URL).toBe('http://localhost:5000/api');
      expect(emptyConfig.API_ORIGIN).toBe('http://localhost:5000');
    });

    it('supports legacy VITE_API_BASE_URL in development when VITE_API_URL is unset', () => {
      const devLegacy = resolveApiConfig({
        MODE: 'development',
        PROD: false,
        VITE_API_BASE_URL: 'http://localhost:8000/api',
      });
      expect(devLegacy.API_BASE_URL).toBe('http://localhost:8000/api');
      expect(devLegacy.API_ORIGIN).toBe('http://localhost:8000');
    });

    it('prefers VITE_API_URL over legacy VITE_API_BASE_URL in development', () => {
      const devPrecedence = resolveApiConfig({
        MODE: 'development',
        PROD: false,
        VITE_API_URL: 'http://localhost:9000/api',
        VITE_API_BASE_URL: 'http://localhost:8000/api',
      });
      expect(devPrecedence.API_BASE_URL).toBe('http://localhost:9000/api');
      expect(devPrecedence.API_ORIGIN).toBe('http://localhost:9000');
    });
  });

  describe('3. API Origin Derivation and Override', () => {
    it('derives origin from an API URL ending in /api when VITE_API_ORIGIN is omitted', () => {
      const config = resolveApiConfig({
        PROD: true,
        VITE_API_URL: 'https://hotel-backend.onrender.com/api',
      });
      expect(config.API_ORIGIN).toBe('https://hotel-backend.onrender.com');
      expect(new URL(config.API_ORIGIN).pathname).toBe('/');
    });

    it('respects explicit VITE_API_ORIGIN override in production when HTTPS', () => {
      const config = resolveApiConfig({
        PROD: true,
        VITE_API_URL: 'https://api.namlatic.com/api',
        VITE_API_ORIGIN: 'https://media-proxy.namlatic.com',
      });
      expect(config.API_BASE_URL).toBe('https://api.namlatic.com/api');
      expect(config.API_ORIGIN).toBe('https://media-proxy.namlatic.com');
    });

    it('rejects non-HTTPS explicit VITE_API_ORIGIN in production', () => {
      expect(() =>
        resolveApiConfig({
          PROD: true,
          VITE_API_URL: 'https://api.namlatic.com/api',
          VITE_API_ORIGIN: 'http://insecure-media.namlatic.com',
        })
      ).toThrowError(/VITE_API_ORIGIN must use the HTTPS protocol in production/i);
    });

    it('rejects embedded credentials, queries, fragments, and localhost on origin in production', () => {
      expect(() =>
        resolveApiConfig({
          PROD: true,
          VITE_API_URL: 'https://api.namlatic.com/api',
          VITE_API_ORIGIN: 'https://user:pass@media.namlatic.com',
        })
      ).toThrowError(/VITE_API_ORIGIN must not contain embedded credentials/i);

      expect(() =>
        resolveApiConfig({
          PROD: true,
          VITE_API_URL: 'https://api.namlatic.com/api',
          VITE_API_ORIGIN: 'https://media.namlatic.com?token=123',
        })
      ).toThrowError(/VITE_API_ORIGIN must not contain query parameters/i);

      expect(() =>
        resolveApiConfig({
          PROD: true,
          VITE_API_URL: 'https://api.namlatic.com/api',
          VITE_API_ORIGIN: 'https://localhost',
        })
      ).toThrowError(/VITE_API_ORIGIN must not point to localhost in production/i);
    });
  });

  describe('4. Safe Image URL Handling (getImageUrl)', () => {
    const prodOrigin = 'https://backend.namlatic.com';
    const devOrigin = 'http://localhost:5000';

    it('preserves absolute HTTPS image URLs', () => {
      const httpsUrl = 'https://images.example.com/suites/ocean-view.jpg';
      expect(getImageUrl(httpsUrl, prodOrigin, { PROD: true })).toBe(httpsUrl);
      expect(getImageUrl(httpsUrl, devOrigin, { PROD: false })).toBe(httpsUrl);
    });

    it('rejects HTTP image URLs in production by returning null', () => {
      const httpUrl = 'http://insecure.example.com/photos/pool.jpg';
      expect(getImageUrl(httpUrl, prodOrigin, { PROD: true })).toBeNull();
    });

    it('permits HTTP image URLs in development for local testing', () => {
      const httpUrl = 'http://localhost:5000/uploads/hotels/pool.jpg';
      expect(getImageUrl(httpUrl, devOrigin, { PROD: false })).toBe(httpUrl);
    });

    it('preserves Cloudflare R2 HTTPS CDN URLs without rewriting', () => {
      const r2Url = 'https://pub-abc123xyz.r2.dev/hotels/4f2d-881a.jpg';
      expect(getImageUrl(r2Url, prodOrigin, { PROD: true })).toBe(r2Url);
    });

    it('preserves data: URLs used for SVG placeholders and previews', () => {
      const dataUri =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
      expect(getImageUrl(dataUri, prodOrigin, { PROD: true })).toBe(dataUri);
    });

    it('preserves blob: URLs used for client-side upload previews', () => {
      const blobUri = 'blob:http://localhost:5173/7a8b-9c0d-1e2f';
      expect(getImageUrl(blobUri, prodOrigin, { PROD: true })).toBe(blobUri);
    });

    it('resolves legacy relative path with leading slash without appending /api', () => {
      const url = getImageUrl('/uploads/hotels/room-101.jpg', prodOrigin, { PROD: true });
      expect(url).toBe('https://backend.namlatic.com/uploads/hotels/room-101.jpg');
      expect(url).not.toContain('/api');
    });

    it('resolves legacy relative path without leading slash', () => {
      const url = getImageUrl('uploads/hotels/room-102.jpg', prodOrigin, { PROD: true });
      expect(url).toBe('https://backend.namlatic.com/uploads/hotels/room-102.jpg');
    });

    it('safely returns null for null, undefined, empty, or whitespace-only paths', () => {
      expect(getImageUrl(null, prodOrigin)).toBeNull();
      expect(getImageUrl(undefined, prodOrigin)).toBeNull();
      expect(getImageUrl('', prodOrigin)).toBeNull();
      expect(getImageUrl('   ', prodOrigin)).toBeNull();
    });
  });
});
