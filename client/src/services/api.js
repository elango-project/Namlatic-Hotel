/**
 * API Service Client for Namlatic Hotel Owner Portal.
 * Wraps native fetch() with environment-driven base URLs and query serialization.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
export const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || 'http://localhost:5000';

/**
 * Resolves relative image paths (e.g. /uploads/hotels/uuid.jpg) to fully qualified URLs.
 * Returns null if no image is present.
 *
 * @param {string|null} imagePath
 * @returns {string|null}
 */
export const getImageUrl = (imagePath) => {
  if (!imagePath) return null;
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('data:')) {
    return imagePath;
  }
  return `${API_ORIGIN}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
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
