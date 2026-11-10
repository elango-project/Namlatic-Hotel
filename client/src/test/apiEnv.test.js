import { describe, it, expect } from 'vitest';
import { resolveApiConfig, getImageUrl } from '../services/api';

describe('Frontend API Environment & URL Resolution (Phase 5E.1)', () => {
  describe('1. Production API URL Validation', () => {
    it('rejects missing VITE_API_URL in production', () => {
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

    it('accepts valid HTTPS production API URL and normalizes trailing slash', () => {
      const config1 = resolveApiConfig({
        PROD: true,
        VITE_API_URL: 'https://api.namlatic.com/api',
      });
      expect(config1.API_BASE_URL).toBe('https://api.namlatic.com/api');
      expect(config1.API_ORIGIN).toBe('https://api.namlatic.com');

      const config2 = resolveApiConfig({
        PROD: true,
        VITE_API_URL: 'https://api.namlatic.com/api/',
      });
      expect(config2.API_BASE_URL).toBe('https://api.namlatic.com/api');
      expect(config2.API_ORIGIN).toBe('https://api.namlatic.com');
    });

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

    it('preserves legacy VITE_API_BASE_URL compatibility while enforcing production HTTPS', () => {
      // Legacy variable succeeds when valid HTTPS
      const legacyProd = resolveApiConfig({
        PROD: true,
        VITE_API_BASE_URL: 'https://legacy-api.namlatic.com/api',
      });
      expect(legacyProd.API_BASE_URL).toBe('https://legacy-api.namlatic.com/api');
      expect(legacyProd.API_ORIGIN).toBe('https://legacy-api.namlatic.com');

      // Legacy variable cannot bypass HTTPS requirement in production
      expect(() =>
        resolveApiConfig({
          PROD: true,
          VITE_API_BASE_URL: 'http://legacy-api.namlatic.com/api',
        })
      ).toThrowError(/VITE_API_BASE_URL must use the HTTPS protocol in production/i);

      // Primary VITE_API_URL takes precedence over legacy VITE_API_BASE_URL
      const precedenceConfig = resolveApiConfig({
        PROD: true,
        VITE_API_URL: 'https://primary-api.namlatic.com/api',
        VITE_API_BASE_URL: 'https://legacy-api.namlatic.com/api',
      });
      expect(precedenceConfig.API_BASE_URL).toBe('https://primary-api.namlatic.com/api');
    });
  });

  describe('2. API Origin Derivation and Override', () => {
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

    it('rejects malformed explicit VITE_API_ORIGIN in production', () => {
      expect(() =>
        resolveApiConfig({
          PROD: true,
          VITE_API_URL: 'https://api.namlatic.com/api',
          VITE_API_ORIGIN: 'invalid-url',
        })
      ).toThrowError(/VITE_API_ORIGIN must be a valid, absolute URL/i);
    });
  });

  describe('3. getImageUrl Media URL Resolution', () => {
    const origin = 'https://backend.namlatic.com';

    it('resolves legacy relative image path with leading slash without appending /api', () => {
      const url = getImageUrl('/uploads/hotels/room-101.jpg', origin);
      expect(url).toBe('https://backend.namlatic.com/uploads/hotels/room-101.jpg');
      expect(url).not.toContain('/api');
    });

    it('resolves relative image path without leading slash', () => {
      const url = getImageUrl('uploads/hotels/room-102.jpg', origin);
      expect(url).toBe('https://backend.namlatic.com/uploads/hotels/room-102.jpg');
    });

    it('preserves absolute HTTPS image URLs without rewriting', () => {
      const absoluteUrl = 'https://images.example.com/suites/ocean-view.jpg';
      expect(getImageUrl(absoluteUrl, origin)).toBe(absoluteUrl);
    });

    it('preserves absolute Cloudflare R2 CDN URLs without rewriting', () => {
      const r2Url = 'https://pub-abc123xyz.r2.dev/hotels/4f2d-881a.jpg';
      expect(getImageUrl(r2Url, origin)).toBe(r2Url);
    });

    it('preserves data: and blob: preview URLs without rewriting', () => {
      const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
      expect(getImageUrl(dataUri, origin)).toBe(dataUri);

      const blobUri = 'blob:http://localhost:5173/7a8b-9c0d-1e2f';
      expect(getImageUrl(blobUri, origin)).toBe(blobUri);
    });

    it('returns null for null, undefined, empty, or whitespace-only paths', () => {
      expect(getImageUrl(null, origin)).toBeNull();
      expect(getImageUrl(undefined, origin)).toBeNull();
      expect(getImageUrl('', origin)).toBeNull();
      expect(getImageUrl('   ', origin)).toBeNull();
    });
  });
});
