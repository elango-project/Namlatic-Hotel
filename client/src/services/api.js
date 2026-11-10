/**
 * API Service Client for Namlatic Hotel Owner Portal.
 * Wraps native fetch() with environment-driven base URLs and query serialization.
 */

/**
 * Resolves and validates API client configuration from environment variables.
 * Enforces HTTPS and absolute URLs in production while preserving localhost fallbacks
 * for development and test environments.
 *
 * @param {object} [env=import.meta.env] - Environment variables object
 * @returns {{ API_BASE_URL: string, API_ORIGIN: string }}
 */
export function resolveApiConfig(env = import.meta.env) {
  const isProd = env?.PROD === true || env?.MODE === 'production';
  const hasApiUrl = typeof env?.VITE_API_URL === 'string' && env.VITE_API_URL.trim().length > 0;
  const hasLegacyUrl = typeof env?.VITE_API_BASE_URL === 'string' && env.VITE_API_BASE_URL.trim().length > 0;
  const hasOrigin = typeof env?.VITE_API_ORIGIN === 'string' && env.VITE_API_ORIGIN.trim().length > 0;

  const activeVarName = hasApiUrl ? 'VITE_API_URL' : (hasLegacyUrl ? 'VITE_API_BASE_URL' : 'VITE_API_URL');
  const rawApiUrl = hasApiUrl ? env.VITE_API_URL : (hasLegacyUrl ? env.VITE_API_BASE_URL : undefined);

  let apiUrl;

  if (!rawApiUrl) {
    if (isProd) {
      throw new Error('VITE_API_URL is required in production environment.');
    }
    apiUrl = 'http://localhost:5000/api';
  } else {
    const trimmedUrl = rawApiUrl.trim();
    let parsedUrl;
    try {
      parsedUrl = new URL(trimmedUrl);
    } catch {
      throw new Error(`${activeVarName} must be a valid, absolute URL.`);
    }

    if (isProd && parsedUrl.protocol !== 'https:') {
      throw new Error(`${activeVarName} must use the HTTPS protocol in production.`);
    }

    const cleanPath = parsedUrl.pathname.replace(/\/+$/, '');
    if (!cleanPath.endsWith('/api')) {
      throw new Error(`${activeVarName} must include the documented '/api' path convention (e.g. https://api.example.com/api).`);
    }

    apiUrl = `${parsedUrl.origin}${cleanPath}`;
  }

  let origin;
  if (hasOrigin) {
    const trimmedOrigin = env.VITE_API_ORIGIN.trim();
    let parsedOrigin;
    try {
      parsedOrigin = new URL(trimmedOrigin);
    } catch {
      throw new Error('VITE_API_ORIGIN must be a valid, absolute URL.');
    }

    if (isProd && parsedOrigin.protocol !== 'https:') {
      throw new Error('VITE_API_ORIGIN must use the HTTPS protocol in production.');
    }

    origin = parsedOrigin.origin;
  } else {
    // Derive origin directly from the validated API URL
    origin = new URL(apiUrl).origin;
  }

  return {
    API_BASE_URL: apiUrl,
    API_ORIGIN: origin,
  };
}

export const { API_BASE_URL, API_ORIGIN } = resolveApiConfig();

/**
 * Resolves relative image paths (e.g. /uploads/hotels/uuid.jpg) to fully qualified URLs.
 * Preserves absolute HTTPS, HTTP, data, and blob URLs (including Cloudflare R2 URLs) without rewriting.
 * Does not append /api to media URLs.
 * Returns null if no image is present.
 *
 * @param {string|null} imagePath
 * @param {string} [origin=API_ORIGIN]
 * @returns {string|null}
 */
export const getImageUrl = (imagePath, origin = API_ORIGIN) => {
  if (!imagePath || typeof imagePath !== 'string' || !imagePath.trim()) return null;
  const trimmed = imagePath.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }
  const cleanOrigin = (origin || '').replace(/\/+$/, '');
  const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${cleanOrigin}${cleanPath}`;
};

/**
 * Performs an HTTP request with error handling and query string serialization.
 *
 * @param {string} endpoint - Path relative to API_BASE_URL
 * @param {object} [options] - Fetch options
 * @param {object} [options.params] - Key-value query parameters
 * @param {AbortSignal} [options.signal] - AbortController signal
 * @returns {Promise<any>}
 */
async function request(endpoint, options = {}) {
  let url = `${API_BASE_URL}${endpoint}`;

  if (options.params) {
    const cleanParams = new URLSearchParams();
    for (const [key, val] of Object.entries(options.params)) {
      if (val !== undefined && val !== null && val !== '') {
        cleanParams.append(key, String(val));
      }
    }
    const qs = cleanParams.toString();
    if (qs) {
      url += (url.includes('?') ? '&' : '?') + qs;
    }
  }

  const headers = {
    'Accept': 'application/json',
    ...options.headers,
  };

  // Only attach JSON content-type if body is not FormData
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.message || data?.errors?.[0] || `Request failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    error.errors = data?.errors || [];
    throw error;
  }

  return data;
}

export const hotelApi = {
  /**
   * Retrieves a paginated and filtered list of hotels.
   * Maps search -> title if provided, guaranteeing backend parameter alignment.
   * @param {object} filters - { title, search, minPrice, maxPrice, limit, offset }
   * @param {AbortSignal} [signal]
   */
  getHotels: (filters = {}, signal = undefined) => {
    const { search, ...rest } = filters;
    const cleanFilters = { ...rest };
    if (search !== undefined && cleanFilters.title === undefined) {
      cleanFilters.title = search;
    }
    return request('/hotels', { method: 'GET', params: cleanFilters, signal });
  },

  /**
   * Retrieves portfolio-wide hotel statistics from PostgreSQL server-side aggregation.
   * @param {AbortSignal} [signal]
   */
  getHotelStats: (signal = undefined) =>
    request('/hotels/stats', { method: 'GET', signal }),

  /**
   * Retrieves a single hotel record by ID.
   * @param {string|number} id
   * @param {AbortSignal} [signal]
   */
  getHotelById: (id, signal = undefined) =>
    request(`/hotels/${id}`, { method: 'GET', signal }),

  /**
   * Creates a new hotel property with optional image.
   * Accepts FormData containing text fields and optional binary image.
   * @param {FormData} formData
   * @param {AbortSignal} [signal]
   */
  createHotel: (formData, signal = undefined) =>
    request('/hotels', { method: 'POST', body: formData, signal }),

  /**
   * Updates an existing hotel property by ID with optional image replacement.
   * Accepts FormData containing text fields and optional replacement image.
   * @param {string|number} id
   * @param {FormData} formData
   * @param {AbortSignal} [signal]
   */
  updateHotel: (id, formData, signal = undefined) =>
    request(`/hotels/${id}`, { method: 'PUT', body: formData, signal }),

  /**
   * Deletes a hotel record by ID.
   * @param {string|number} id
   */
  deleteHotel: (id) =>
    request(`/hotels/${id}`, { method: 'DELETE' }),

  /**
   * Readiness probe verifying PostgreSQL connectivity.
   */
  checkReadiness: () =>
    request('/ready', { method: 'GET' }),
};

export default hotelApi;
