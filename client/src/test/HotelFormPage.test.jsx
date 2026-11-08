import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { HelmetProvider } from 'react-helmet-async';
import HotelFormPage from '../pages/HotelFormPage';
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

describe('HotelFormPage Component (Phase 4B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders create mode header and breadcrumbs for /hotels/new', () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <HelmetProvider>
          <MemoryRouter initialEntries={['/hotels/new']}>
            <Routes>
              <Route path="/hotels/new" element={<HotelFormPage />} />
            </Routes>
          </MemoryRouter>
        </HelmetProvider>
      </Provider>
    );

    expect(screen.getByRole('heading', { level: 2, name: /register new hotel property/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /register hotel property/i })).toBeInTheDocument();
  });

  it('rejects invalid hotel ID route param (e.g. non-numeric "abc") and shows error', () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <HelmetProvider>
          <MemoryRouter initialEntries={['/hotels/abc/edit']}>
            <Routes>
              <Route path="/hotels/:id/edit" element={<HotelFormPage />} />
            </Routes>
          </MemoryRouter>
        </HelmetProvider>
      </Provider>
    );

    expect(screen.getByTestId('invalid-id-error')).toBeInTheDocument();
    expect(screen.getByText(/invalid hotel id parameter/i)).toBeInTheDocument();
  });

  it('handles 404 / Hotel Not Found gracefully and displays ErrorAlert with Return button', async () => {
    hotelApi.getHotelById.mockRejectedValueOnce(new Error('Hotel not found.'));

    const store = createMockStore();
    render(
      <Provider store={store}>
        <HelmetProvider>
          <MemoryRouter initialEntries={['/hotels/999/edit']}>
            <Routes>
              <Route path="/hotels/:id/edit" element={<HotelFormPage />} />
            </Routes>
          </MemoryRouter>
        </HelmetProvider>
      </Provider>
    );

    expect(await screen.findByTestId('hotel-fetch-error')).toBeInTheDocument();
    expect(screen.getByText(/hotel not found/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /return to my hotels/i })).toBeInTheDocument();
  });

  it('fetches existing hotel and populates form in edit mode', async () => {
    const mockHotel = {
      id: '15',
      title: 'Azure Bay Hotel',
      description: 'Stunning cliffside boutique hotel with panoramic ocean views.',
      latitude: '24.123456',
      longitude: '54.654321',
      price: '210.00',
      image_path: '/uploads/hotels/azure.jpg',
    };

    hotelApi.getHotelById.mockResolvedValueOnce({
      status: 'success',
      data: mockHotel,
    });

    const store = createMockStore();
    render(
      <Provider store={store}>
        <HelmetProvider>
          <MemoryRouter initialEntries={['/hotels/15/edit']}>
            <Routes>
              <Route path="/hotels/:id/edit" element={<HotelFormPage />} />
            </Routes>
          </MemoryRouter>
        </HelmetProvider>
      </Provider>
    );

    expect(await screen.findByDisplayValue('Azure Bay Hotel')).toBeInTheDocument();
    expect(screen.getByDisplayValue('210.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('dispatches createHotel and redirects to /hotels upon successful creation', async () => {
    hotelApi.createHotel.mockResolvedValueOnce({
      status: 'success',
      data: {
        id: '99',
        title: 'New Oasis Hotel',
        description: 'Serene desert oasis resort.',
        latitude: '24.0',
        longitude: '54.0',
        price: '150.00',
      },
    });

    const store = createMockStore();
    render(
      <Provider store={store}>
        <HelmetProvider>
          <MemoryRouter initialEntries={['/hotels/new']}>
            <Routes>
              <Route path="/hotels/new" element={<HotelFormPage />} />
              <Route path="/hotels" element={<div>Hotels Inventory Page</div>} />
            </Routes>
          </MemoryRouter>
        </HelmetProvider>
      </Provider>
    );

    fireEvent.change(screen.getByLabelText(/hotel property title/i), { target: { value: 'New Oasis Hotel' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Serene desert oasis resort.' } });
    fireEvent.change(screen.getByLabelText(/latitude/i), { target: { value: '24.0' } });
    fireEvent.change(screen.getByLabelText(/longitude/i), { target: { value: '54.0' } });
    fireEvent.change(screen.getByLabelText(/^price/i), { target: { value: '150.00' } });

    fireEvent.click(screen.getByRole('button', { name: /register hotel property/i }));

    await waitFor(() => {
      expect(hotelApi.createHotel).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Hotels Inventory Page')).toBeInTheDocument();
    });

    // Verify Redux state updated with newly created hotel
    const state = store.getState().hotels;
    expect(state.items.some((h) => h.id === '99')).toBe(true);
    expect(state.pagination.total).toBe(1);
  });

  it('completes edit flow: updates hotel title/price, updates Redux items, triggers list refresh, and navigates back', async () => {
    const existingHotel = {
      id: '42',
      title: 'Original Grand Hotel',
      description: 'Historic city center landmark.',
      latitude: '25.2048',
      longitude: '55.2708',
      price: '300.00',
      image_path: null,
    };

    hotelApi.getHotelById.mockResolvedValueOnce({
      status: 'success',
      data: existingHotel,
    });

    const updatedHotel = {
      ...existingHotel,
      title: 'Renovated Luxury Grand Hotel',
      price: '420.00',
    };

    hotelApi.updateHotel.mockResolvedValueOnce({
      status: 'success',
      data: updatedHotel,
    });

    // Initial store containing the existing hotel in items list
    const store = createMockStore({
      items: [existingHotel],
      pagination: { total: 1, limit: 6, offset: 0, hasMore: false },
    });

    render(
      <Provider store={store}>
        <HelmetProvider>
          <MemoryRouter initialEntries={['/hotels/42/edit']}>
            <Routes>
              <Route path="/hotels/:id/edit" element={<HotelFormPage />} />
              <Route path="/hotels" element={<div>Hotels Inventory Page</div>} />
            </Routes>
          </MemoryRouter>
        </HelmetProvider>
      </Provider>
    );

    // Wait for existing hotel details to populate
    expect(await screen.findByDisplayValue('Original Grand Hotel')).toBeInTheDocument();

    // Edit title and price
    fireEvent.change(screen.getByLabelText(/hotel property title/i), {
      target: { value: 'Renovated Luxury Grand Hotel' },
    });
    fireEvent.change(screen.getByLabelText(/^price/i), {
      target: { value: '420.00' },
    });

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(hotelApi.updateHotel).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Hotels Inventory Page')).toBeInTheDocument();
    });

    // Verify that the Redux state reflects the updated hotel title and price without page reload
    const state = store.getState().hotels;
    const hotelInState = state.items.find((h) => String(h.id) === '42');
    expect(hotelInState).toBeDefined();
    expect(hotelInState.title).toBe('Renovated Luxury Grand Hotel');
    expect(hotelInState.price).toBe('420.00');
  });
});
