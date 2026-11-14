import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { HelmetProvider } from 'react-helmet-async';
import HotelDetailsPage, { formatDateTime, isValidRouteId, PG_BIGINT_MAX } from '../pages/HotelDetailsPage';
import hotelsReducer from '../features/hotels/hotelsSlice';
import hotelApi from '../services/api';

vi.mock('../services/api', () => ({
  default: {
    getHotels: vi.fn().mockResolvedValue({ data: [], pagination: { total: 0, limit: 6, offset: 0, hasMore: false } }),
    getHotelById: vi.fn(),
    createHotel: vi.fn(),
    updateHotel: vi.fn(),
    getHotelStats: vi.fn().mockResolvedValue({ data: {} }),
  },
  getImageUrl: (path) => (path ? `http://localhost:5000${path}` : null),
}));

// Mock HotelLocationMap for details page tests
vi.mock('../components/HotelLocationMap', () => ({
  default: ({ latitude, longitude, title }) => (
    <div
      data-testid="mock-hotel-location-map"
      data-lat={latitude}
      data-lng={longitude}
      data-title={title}
    >
      Map for {title} ({latitude}, {longitude})
    </div>
  ),
  parseCoordinate: (val) => {
    if (val === null || val === undefined) return NaN;
    if (typeof val === 'string' && val.trim() === '') return NaN;
    const num = typeof val === 'number' ? val : Number(val);
    return Number.isFinite(num) ? num : NaN;
  },
  isValidCoordinate: (lat, lng) => typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180,
}));

const createMockStore = (initialCustomState = {}) => {
  return configureStore({
    reducer: {
      hotels: hotelsReducer,
    },
    preloadedState: {
      hotels: {
        items: [],
        pagination: { total: 0, limit: 6, offset: 0, hasMore: false },
        filters: { title: '', minPrice: '', maxPrice: '' },
        stats: { totalProperties: 0, averagePrice: '0.00', minPrice: '0.00', maxPrice: '0.00', propertiesWithImages: 0 },
        statsStatus: 'idle',
        statsError: null,
        status: 'idle',
        error: null,
        deleteStatus: 'idle',
        deleteError: null,
        currentHotel: null,
        currentHotelStatus: 'idle',
        currentHotelError: null,
        saveStatus: 'idle',
        saveError: null,
        notification: null,
        backendOnline: true,
        ...initialCustomState,
      },
    },
  });
};

const mockHotelData = {
  id: 71,
  title: 'Luxury Marina Resort',
  description: 'An exquisite 5-star beachfront retreat offering panoramic marina views, fine dining, and private beach access.',
  price: '850.00',
  latitude: '24.453884',
  longitude: '54.377344',
  image_path: '/uploads/marina-resort.webp',
  created_at: '2026-11-06T10:30:00.000Z',
  updated_at: '2026-11-08T14:45:00.000Z',
};

const renderDetailsPage = (route = '/hotels/71', store = createMockStore()) => {
  return render(
    <Provider store={store}>
      <HelmetProvider>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path="/hotels/:id" element={<HotelDetailsPage />} />
            <Route path="/hotels" element={<div data-testid="hotels-list-page">Hotels List</div>} />
            <Route path="/hotels/:id/edit" element={<div data-testid="hotel-edit-page">Hotel Edit</div>} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </Provider>
  );
};

describe('HotelDetailsPage Component (Phase 4C)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('formatDateTime Helper', () => {
    it('formats a valid ISO timestamp correctly', () => {
      const formatted = formatDateTime('2026-11-06T10:30:00.000Z');
      expect(formatted).toBeTruthy();
      expect(typeof formatted).toBe('string');
      expect(formatted).toMatch(/Nov/i);
    });

    it('returns null for null, undefined or empty timestamps', () => {
      expect(formatDateTime(null)).toBeNull();
      expect(formatDateTime(undefined)).toBeNull();
      expect(formatDateTime('')).toBeNull();
    });

    it('returns null for invalid date strings', () => {
      expect(formatDateTime('not-a-date')).toBeNull();
      expect(formatDateTime('2026-99-99T99:99:99')).toBeNull();
    });
  });

  describe('isValidRouteId Helper (PostgreSQL BIGINT)', () => {
    it('accepts valid small and large BIGINT strings up to 9223372036854775807', () => {
      expect(isValidRouteId('1')).toBe(true);
      expect(isValidRouteId('42')).toBe(true);
      expect(isValidRouteId('9007199254740991')).toBe(true); // MAX_SAFE_INTEGER
      expect(isValidRouteId('9007199254740992')).toBe(true); // Beyond MAX_SAFE_INTEGER, valid BIGINT
      expect(isValidRouteId('9223372036854775807')).toBe(true); // PG_BIGINT_MAX
      expect(PG_BIGINT_MAX).toBe(9223372036854775807n);
    });

    it('rejects numbers exceeding PostgreSQL BIGINT maximum (overflow)', () => {
      expect(isValidRouteId('9223372036854775808')).toBe(false); // PG_BIGINT_MAX + 1
      expect(isValidRouteId('999999999999999999999999')).toBe(false);
    });

    it('rejects zero, negative numbers, decimals, and malformed strings', () => {
      expect(isValidRouteId('0')).toBe(false);
      expect(isValidRouteId('-1')).toBe(false);
      expect(isValidRouteId('-10')).toBe(false);
      expect(isValidRouteId('12.34')).toBe(false);
      expect(isValidRouteId('12abc')).toBe(false);
      expect(isValidRouteId('abc')).toBe(false);
      expect(isValidRouteId('')).toBe(false);
      expect(isValidRouteId(null)).toBe(false);
      expect(isValidRouteId(undefined)).toBe(false);
    });

    it('rejects leading, trailing, and surrounding whitespace without trimming', () => {
      expect(isValidRouteId('123')).toBe(true);
      expect(isValidRouteId(' 123')).toBe(false);
      expect(isValidRouteId('123 ')).toBe(false);
      expect(isValidRouteId(' 123 ')).toBe(false);
    });

    it('verifies exact regression suite required for BIGINT route ID validation', () => {
      // "123" — valid.
      expect(isValidRouteId('123')).toBe(true);
      // " 123" — invalid.
      expect(isValidRouteId(' 123')).toBe(false);
      // "123 " — invalid.
      expect(isValidRouteId('123 ')).toBe(false);
      // " 123 " — invalid.
      expect(isValidRouteId(' 123 ')).toBe(false);
      // "0" — invalid.
      expect(isValidRouteId('0')).toBe(false);
      // Maximum PostgreSQL BIGINT — valid.
      expect(isValidRouteId('9223372036854775807')).toBe(true);
      // Maximum PostgreSQL BIGINT + 1 — invalid.
      expect(isValidRouteId('9223372036854775808')).toBe(false);
      // "12abc" — invalid.
      expect(isValidRouteId('12abc')).toBe(false);
      // "-123" — invalid.
      expect(isValidRouteId('-123')).toBe(false);
      // "12.5" — invalid.
      expect(isValidRouteId('12.5')).toBe(false);
    });
  });

  describe('Route Parameter Validation', () => {
    it('rejects route parameter with whitespace (e.g. " 123") without calling API', () => {
      renderDetailsPage('/hotels/ 123');

      expect(screen.getByTestId('invalid-id-error')).toBeInTheDocument();
      expect(hotelApi.getHotelById).not.toHaveBeenCalled();
    });
    it('accepts valid large PostgreSQL BIGINT ID (9223372036854775807) and fetches hotel', () => {
      hotelApi.getHotelById.mockReturnValueOnce(new Promise(() => {}));
      renderDetailsPage('/hotels/9223372036854775807');

      expect(screen.queryByTestId('invalid-id-error')).not.toBeInTheDocument();
      expect(hotelApi.getHotelById).toHaveBeenCalledWith('9223372036854775807', expect.anything());
    });

    it('rejects non-numeric hotel ID (e.g. "abc") and displays error alert', () => {
      renderDetailsPage('/hotels/abc');

      expect(screen.getByTestId('invalid-id-error')).toBeInTheDocument();
      expect(
        screen.getByText(/Invalid hotel ID parameter/i)
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Return to My Hotels/i })).toBeInTheDocument();
      expect(hotelApi.getHotelById).not.toHaveBeenCalled();
    });

    it('rejects negative ID (e.g. "-10") and displays error alert', () => {
      renderDetailsPage('/hotels/-10');

      expect(screen.getByTestId('invalid-id-error')).toBeInTheDocument();
      expect(hotelApi.getHotelById).not.toHaveBeenCalled();
    });

    it('rejects zero ID ("0") and displays error alert', () => {
      renderDetailsPage('/hotels/0');

      expect(screen.getByTestId('invalid-id-error')).toBeInTheDocument();
      expect(hotelApi.getHotelById).not.toHaveBeenCalled();
    });

    it('rejects decimal numbers (e.g. "12.34")', () => {
      renderDetailsPage('/hotels/12.34');

      expect(screen.getByTestId('invalid-id-error')).toBeInTheDocument();
      expect(hotelApi.getHotelById).not.toHaveBeenCalled();
    });

    it('rejects malformed alphabetic strings (e.g. "12abc")', () => {
      renderDetailsPage('/hotels/12abc');

      expect(screen.getByTestId('invalid-id-error')).toBeInTheDocument();
      expect(hotelApi.getHotelById).not.toHaveBeenCalled();
    });

    it('rejects IDs that exceed PostgreSQL BIGINT maximum (e.g. 9223372036854775808)', () => {
      renderDetailsPage('/hotels/9223372036854775808');

      expect(screen.getByTestId('invalid-id-error')).toBeInTheDocument();
      expect(hotelApi.getHotelById).not.toHaveBeenCalled();
    });
  });

  describe('Loading and Error States', () => {
    it('renders loading spinner and message while fetching hotel details', () => {
      hotelApi.getHotelById.mockReturnValueOnce(new Promise(() => {}));
      const store = createMockStore({
        currentHotelStatus: 'loading',
      });
      renderDetailsPage('/hotels/71', store);

      expect(screen.getByTestId('hotel-details-loading')).toBeInTheDocument();
      expect(screen.getByText('Retrieving Hotel Details')).toBeInTheDocument();
    });

    it('renders 404 Not Found state when backend returns 404 or Hotel not found', async () => {
      hotelApi.getHotelById.mockRejectedValueOnce(new Error('Hotel not found with ID 999'));

      renderDetailsPage('/hotels/999');

      await waitFor(() => {
        expect(screen.getByTestId('hotel-not-found')).toBeInTheDocument();
      });

      expect(screen.getByText(/Hotel Property Not Found/i)).toBeInTheDocument();
      expect(screen.getByText(/The property with ID/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Return to My Hotels/i })).toBeInTheDocument();
    });

    it('renders general error alert with retry button on network failure', async () => {
      hotelApi.getHotelById.mockRejectedValueOnce(new Error('Network Connection Refused'));

      renderDetailsPage('/hotels/71');

      await waitFor(() => {
        expect(screen.getByTestId('hotel-details-error')).toBeInTheDocument();
      });

      expect(screen.getByText(/Network Connection Refused/i)).toBeInTheDocument();

      // Retry button triggers another fetch
      const retryBtn = screen.getByRole('button', { name: /try again/i });
      expect(retryBtn).toBeInTheDocument();
      hotelApi.getHotelById.mockResolvedValueOnce({ data: mockHotelData });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(hotelApi.getHotelById).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Successful Details Rendering', () => {
    it('renders all property details, price, coordinates, and description', async () => {
      hotelApi.getHotelById.mockResolvedValueOnce({ data: mockHotelData });

      renderDetailsPage('/hotels/71');

      await waitFor(() => {
        expect(screen.getByTestId('hotel-details-content')).toBeInTheDocument();
      });

      // Title
      expect(screen.getByRole('heading', { level: 1, name: 'Luxury Marina Resort' })).toBeInTheDocument();

      // Coordinates pill and facts card (24.453884 rounded to 4 decimals is 24.4539)
      expect(screen.getAllByText(/24\.4539°, 54\.3773°/)[0]).toBeInTheDocument();

      // Price
      expect(screen.getByText('Price', { selector: '.fact-label' })).toBeInTheDocument();
      expect(screen.getByText(/850\.00/i)).toBeInTheDocument();

      // Description
      expect(screen.getByText(/About this Property/i)).toBeInTheDocument();
      expect(screen.getByText(mockHotelData.description)).toBeInTheDocument();

      // Map component rendered with props
      const map = screen.getByTestId('mock-hotel-location-map');
      expect(map).toBeInTheDocument();
      expect(map).toHaveAttribute('data-lat', '24.453884');
      expect(map).toHaveAttribute('data-lng', '54.377344');
      expect(map).toHaveAttribute('data-title', 'Luxury Marina Resort');
    });

    it('renders hero image when image_path is present', async () => {
      hotelApi.getHotelById.mockResolvedValueOnce({ data: mockHotelData });

      renderDetailsPage('/hotels/71');

      await waitFor(() => {
        expect(screen.getByTestId('hotel-details-content')).toBeInTheDocument();
      });

      const img = screen.getByRole('img', { name: /Exterior view of Luxury Marina Resort/i });
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'http://localhost:5000/uploads/marina-resort.webp');
    });

    it('renders clean fallback placeholder when image_path is null (no fake stock photo)', async () => {
      const hotelWithoutImage = { ...mockHotelData, image_path: null };
      hotelApi.getHotelById.mockResolvedValueOnce({ data: hotelWithoutImage });

      renderDetailsPage('/hotels/71');

      await waitFor(() => {
        expect(screen.getByTestId('hotel-details-content')).toBeInTheDocument();
      });

      expect(screen.getByTestId('details-no-image')).toBeInTheDocument();
      expect(screen.getByText('No Image Available')).toBeInTheDocument();
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('falls back to placeholder if image fails to load (onError triggered)', async () => {
      hotelApi.getHotelById.mockResolvedValueOnce({ data: mockHotelData });

      renderDetailsPage('/hotels/71');

      await waitFor(() => {
        expect(screen.getByTestId('hotel-details-content')).toBeInTheDocument();
      });

      const img = screen.getByRole('img', { name: /Exterior view of Luxury Marina Resort/i });
      fireEvent.error(img);

      expect(screen.getByTestId('details-no-image')).toBeInTheDocument();
      expect(screen.getByText('No Image Available')).toBeInTheDocument();
    });

    it('renders audit history timestamps when created_at and updated_at are returned', async () => {
      hotelApi.getHotelById.mockResolvedValueOnce({ data: mockHotelData });

      renderDetailsPage('/hotels/71');

      await waitFor(() => {
        expect(screen.getByTestId('hotel-details-content')).toBeInTheDocument();
      });

      expect(screen.getByText('Audit History')).toBeInTheDocument();
      expect(screen.getByText('Created:')).toBeInTheDocument();
      expect(screen.getByText('Updated:')).toBeInTheDocument();
    });

    it('omits audit history section when timestamps are null', async () => {
      const hotelWithoutDates = { ...mockHotelData, created_at: null, updated_at: null };
      hotelApi.getHotelById.mockResolvedValueOnce({ data: hotelWithoutDates });

      renderDetailsPage('/hotels/71');

      await waitFor(() => {
        expect(screen.getByTestId('hotel-details-content')).toBeInTheDocument();
      });

      expect(screen.queryByText('Audit History')).not.toBeInTheDocument();
    });

    it('renders navigation links: Edit Hotel points to /hotels/:id/edit and Back to /hotels', async () => {
      hotelApi.getHotelById.mockResolvedValueOnce({ data: mockHotelData });

      renderDetailsPage('/hotels/71');

      await waitFor(() => {
        expect(screen.getByTestId('hotel-details-content')).toBeInTheDocument();
      });

      const editLink = screen.getByRole('link', { name: /Edit Luxury Marina Resort/i });
      expect(editLink).toHaveAttribute('href', '/hotels/71/edit');

      const backLink = screen.getByRole('link', { name: /Back to hotel listing/i });
      expect(backLink).toHaveAttribute('href', '/hotels');

      // Breadcrumb link
      const breadcrumbLink = screen.getByRole('link', { name: 'My Hotels' });
      expect(breadcrumbLink).toHaveAttribute('href', '/hotels');
    });

    it('handles dynamic route ID change while component stays mounted (/hotels/71 to /hotels/72)', async () => {
      const hotel1 = { ...mockHotelData, id: 71, title: 'Marina Resort 71' };
      const hotel2 = {
        ...mockHotelData,
        id: 72,
        title: 'Alpine Lodge 72',
        latitude: '46.519962',
        longitude: '6.633597',
      };

      hotelApi.getHotelById.mockImplementation((id) => {
        if (id === '71') return Promise.resolve({ data: hotel1 });
        if (id === '72') return Promise.resolve({ data: hotel2 });
        return Promise.reject(new Error('Not found'));
      });

      const store = createMockStore();

      function SwitchButton() {
        const navigate = useNavigate();
        return (
          <button data-testid="switch-btn" onClick={() => navigate('/hotels/72')}>
            Go to 72
          </button>
        );
      }

      render(
        <Provider store={store}>
          <HelmetProvider>
            <MemoryRouter initialEntries={['/hotels/71']}>
              <SwitchButton />
              <Routes>
                <Route path="/hotels/:id" element={<HotelDetailsPage />} />
              </Routes>
            </MemoryRouter>
          </HelmetProvider>
        </Provider>
      );

      // Verify hotel 1 loaded
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'Marina Resort 71' })).toBeInTheDocument();
      });
      const map1 = screen.getByTestId('mock-hotel-location-map');
      expect(map1).toHaveAttribute('data-title', 'Marina Resort 71');

      // Click button to navigate to /hotels/72 without page reload
      fireEvent.click(screen.getByTestId('switch-btn'));

      // Verify hotel 2 loaded and map updated
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'Alpine Lodge 72' })).toBeInTheDocument();
      });

      // Verifies map props update to Hotel 2's exact coordinates
      const map2 = screen.getByTestId('mock-hotel-location-map');
      expect(map2).toHaveAttribute('data-lat', '46.519962');
      expect(map2).toHaveAttribute('data-lng', '6.633597');
      expect(map2).toHaveAttribute('data-title', 'Alpine Lodge 72');
    });

    it('handles zero coordinates ("0", "0") as valid coordinates and displays 0.0000°, 0.0000°', async () => {
      const zeroCoordHotel = {
        ...mockHotelData,
        latitude: '0',
        longitude: '0',
      };
      hotelApi.getHotelById.mockResolvedValueOnce({ data: zeroCoordHotel });

      renderDetailsPage('/hotels/71');

      await waitFor(() => {
        expect(screen.getByTestId('hotel-details-content')).toBeInTheDocument();
      });

      expect(screen.getAllByText(/0\.0000°, 0\.0000°/)[0]).toBeInTheDocument();
      const map = screen.getByTestId('mock-hotel-location-map');
      expect(map).toHaveAttribute('data-lat', '0');
      expect(map).toHaveAttribute('data-lng', '0');
    });

    it('displays "Coordinates unavailable" when latitude and longitude are null or empty', async () => {
      const nullCoordHotel = {
        ...mockHotelData,
        latitude: null,
        longitude: null,
      };
      hotelApi.getHotelById.mockResolvedValueOnce({ data: nullCoordHotel });

      renderDetailsPage('/hotels/71');

      await waitFor(() => {
        expect(screen.getByTestId('hotel-details-content')).toBeInTheDocument();
      });

      expect(screen.getByText('Coordinates unavailable')).toBeInTheDocument();
      expect(screen.getByText('No geographic coordinates provided')).toBeInTheDocument();
      // Pill should not be rendered
      expect(screen.queryByTitle('Geographic WGS 84 Coordinates')).not.toBeInTheDocument();
    });

    it('displays "Coordinates unavailable" when coordinates exceed valid bounds (e.g. 120, 250)', async () => {
      const outOfBoundsHotel = {
        ...mockHotelData,
        latitude: '120.0000',
        longitude: '250.0000',
      };
      hotelApi.getHotelById.mockResolvedValueOnce({ data: outOfBoundsHotel });

      renderDetailsPage('/hotels/71');

      await waitFor(() => {
        expect(screen.getByTestId('hotel-details-content')).toBeInTheDocument();
      });

      expect(screen.getByText('Coordinates unavailable')).toBeInTheDocument();
      expect(screen.getByText('No geographic coordinates provided')).toBeInTheDocument();
    });

    it('resets image error state when navigating to a new hotel ID', async () => {
      const hotel1 = { ...mockHotelData, id: 71, title: 'Hotel Broken Image', image_path: '/uploads/broken.webp' };
      const hotel2 = { ...mockHotelData, id: 72, title: 'Hotel Working Image', image_path: '/uploads/working.webp' };

      hotelApi.getHotelById.mockImplementation((id) => {
        if (id === '71') return Promise.resolve({ data: hotel1 });
        if (id === '72') return Promise.resolve({ data: hotel2 });
        return Promise.reject(new Error('Not found'));
      });

      const store = createMockStore();

      function SwitchButton() {
        const navigate = useNavigate();
        return (
          <button data-testid="switch-btn" onClick={() => navigate('/hotels/72')}>
            Go to 72
          </button>
        );
      }

      render(
        <Provider store={store}>
          <HelmetProvider>
            <MemoryRouter initialEntries={['/hotels/71']}>
              <SwitchButton />
              <Routes>
                <Route path="/hotels/:id" element={<HotelDetailsPage />} />
              </Routes>
            </MemoryRouter>
          </HelmetProvider>
        </Provider>
      );

      // Verify hotel 1 loaded
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'Hotel Broken Image' })).toBeInTheDocument();
      });

      // Simulate broken image
      const img1 = screen.getByRole('img', { name: /Exterior view of Hotel Broken Image/i });
      fireEvent.error(img1);
      expect(screen.getByTestId('details-no-image')).toBeInTheDocument();

      // Navigate to hotel 2
      fireEvent.click(screen.getByTestId('switch-btn'));

      // Hotel 2 loads and imageError is reset, displaying hotel 2 image
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'Hotel Working Image' })).toBeInTheDocument();
      });

      const img2 = screen.getByRole('img', { name: /Exterior view of Hotel Working Image/i });
      expect(img2).toBeInTheDocument();
      expect(img2).toHaveAttribute('src', 'http://localhost:5000/uploads/working.webp');
      expect(screen.queryByTestId('details-no-image')).not.toBeInTheDocument();
    });
  });

  describe('Cleanup on Unmount', () => {
    it('dispatches clearCurrentHotel and aborts promise when component unmounts', async () => {
      hotelApi.getHotelById.mockResolvedValueOnce({ data: mockHotelData });

      const store = createMockStore();
      const dispatchSpy = vi.spyOn(store, 'dispatch');

      const { unmount } = render(
        <Provider store={store}>
          <HelmetProvider>
            <MemoryRouter initialEntries={['/hotels/71']}>
              <Routes>
                <Route path="/hotels/:id" element={<HotelDetailsPage />} />
              </Routes>
            </MemoryRouter>
          </HelmetProvider>
        </Provider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('hotel-details-content')).toBeInTheDocument();
      });

      unmount();

      // Check that clearCurrentHotel was dispatched upon unmount
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'hotels/clearCurrentHotel' })
      );
    });
  });
});
