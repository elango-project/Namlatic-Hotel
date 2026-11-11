import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authApi, hotelApi, onUnauthorized, notifyUnauthorized } from '../services/api';

describe('API Service Authentication & Tokenless CSRF Integration (Phase 5F-A3)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('authApi.login()', () => {
    it('sends POST to /auth/login with JSON body, X-Requested-With header, and credentials: include', async () => {
      let capturedUrl;
      let capturedOptions;

      global.fetch = vi.fn().mockImplementation((url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            status: 'success',
            data: { user: { id: 1, email: 'owner@namlatic.com', role: 'owner' } },
            user: { id: 1, email: 'owner@namlatic.com', role: 'owner' },
          }),
        });
      });

      const result = await authApi.login({
        email: 'owner@namlatic.com',
        password: 'ValidPassword123!',
      });

      expect(capturedUrl).toMatch(/\/api\/auth\/login$/);
      expect(capturedOptions.method).toBe('POST');
      expect(capturedOptions.credentials).toBe('include');
      expect(capturedOptions.headers['Content-Type']).toBe('application/json');
      expect(capturedOptions.headers['X-Requested-With']).toBe('XMLHttpRequest');
      expect(capturedOptions.headers['Accept']).toBe('application/json');
      expect(capturedOptions.headers['Cookie']).toBeUndefined();
      expect(capturedOptions.headers['x-vercel-proxy-secret']).toBeUndefined();

      expect(JSON.parse(capturedOptions.body)).toEqual({
        email: 'owner@namlatic.com',
        password: 'ValidPassword123!',
      });
      expect(result.user).toEqual({ id: 1, email: 'owner@namlatic.com', role: 'owner' });
    });

    it('rejects with error containing status and retryAfter on HTTP 429', async () => {
      global.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 429,
          headers: new Headers({ 'Retry-After': '900' }),
          json: () => Promise.resolve({
            status: 'error',
            statusCode: 429,
            message: 'Too many failed login attempts. Please try again later.',
          }),
        })
      );

      await expect(
        authApi.login({ email: 'owner@namlatic.com', password: 'bad' })
      ).rejects.toMatchObject({
        status: 429,
        statusCode: 429,
        message: 'Too many failed login attempts. Please try again later.',
        retryAfter: '900',
      });
    });

    it('does NOT trigger onUnauthorized callback on 401 login failure (invalid credentials)', async () => {
      const unauthorizedCallback = vi.fn();
      const unsubscribe = onUnauthorized(unauthorizedCallback);

      global.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({
            status: 'error',
            statusCode: 401,
            message: 'Invalid email or password.',
          }),
        })
      );

      await expect(
        authApi.login({ email: 'owner@namlatic.com', password: 'wrong' })
      ).rejects.toThrow('Invalid email or password.');

      expect(unauthorizedCallback).not.toHaveBeenCalled();
      unsubscribe();
    });
  });

  describe('authApi.logout()', () => {
    it('sends POST to /auth/logout with credentials: include and X-Requested-With header', async () => {
      let capturedUrl;
      let capturedOptions;

      global.fetch = vi.fn().mockImplementation((url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: 'success', message: 'Logged out successfully.' }),
        });
      });

      const response = await authApi.logout();

      expect(capturedUrl).toMatch(/\/api\/auth\/logout$/);
      expect(capturedOptions.method).toBe('POST');
      expect(capturedOptions.credentials).toBe('include');
      expect(capturedOptions.headers['X-Requested-With']).toBe('XMLHttpRequest');
      expect(response.status).toBe('success');
    });
  });

  describe('authApi.getMe()', () => {
    it('sends GET to /auth/me with credentials: include without Content-Type', async () => {
      let capturedUrl;
      let capturedOptions;

      global.fetch = vi.fn().mockImplementation((url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            status: 'success',
            user: { id: 1, email: 'owner@namlatic.com', role: 'owner' },
          }),
        });
      });

      const response = await authApi.getMe();

      expect(capturedUrl).toMatch(/\/api\/auth\/me$/);
      expect(capturedOptions.method).toBe('GET');
      expect(capturedOptions.credentials).toBe('include');
      expect(capturedOptions.headers['Content-Type']).toBeUndefined();
      expect(response.user.email).toBe('owner@namlatic.com');
    });

    it('does NOT trigger onUnauthorized callback on 401 getMe response during initial boot', async () => {
      const unauthorizedCallback = vi.fn();
      const unsubscribe = onUnauthorized(unauthorizedCallback);

      global.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({
            status: 'error',
            statusCode: 401,
            message: 'Authentication required. No session cookie provided.',
          }),
        })
      );

      await expect(authApi.getMe()).rejects.toThrow();
      expect(unauthorizedCallback).not.toHaveBeenCalled();
      unsubscribe();
    });
  });

  describe('Session Expiration & Unauthorized Callback on Protected Routes', () => {
    it('triggers registered onUnauthorized callback when a hotel endpoint returns HTTP 401', async () => {
      const unauthorizedCallback = vi.fn();
      const unsubscribe = onUnauthorized(unauthorizedCallback);

      global.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({
            status: 'error',
            statusCode: 401,
            message: 'Session expired or invalid.',
          }),
        })
      );

      await expect(hotelApi.getHotels()).rejects.toThrow('Session expired or invalid.');

      expect(unauthorizedCallback).toHaveBeenCalledTimes(1);
      expect(unauthorizedCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 401,
          endpoint: '/hotels',
        })
      );

      unsubscribe();
    });

    it('unsubscribing removes the callback cleanly', async () => {
      const callback = vi.fn();
      const unsubscribe = onUnauthorized(callback);
      unsubscribe();

      notifyUnauthorized({ endpoint: '/hotels', status: 401 });
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Multipart Form Data & Existing Requests Compatibility', () => {
    it('preserves FormData without overriding Content-Type while attaching X-Requested-With', async () => {
      let capturedOptions;
      global.fetch = vi.fn().mockImplementation((_url, options) => {
        capturedOptions = options;
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ status: 'success', data: { id: '99', title: 'New Hotel' } }),
        });
      });

      const formData = new FormData();
      formData.append('title', 'Seaside Hotel');
      formData.append('price', '150.00');

      await hotelApi.createHotel(formData);

      expect(capturedOptions.method).toBe('POST');
      expect(capturedOptions.body).toBe(formData);
      // Browser must generate multipart boundary, so Content-Type must NOT be set to application/json
      expect(capturedOptions.headers['Content-Type']).toBeUndefined();
      expect(capturedOptions.headers['X-Requested-With']).toBe('XMLHttpRequest');
      expect(capturedOptions.credentials).toBe('include');
    });
  });
});
