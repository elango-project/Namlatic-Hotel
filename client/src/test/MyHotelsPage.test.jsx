import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { HelmetProvider } from 'react-helmet-async';
import MyHotelsPage from '../pages/MyHotelsPage';
import hotelsReducer from '../features/hotels/hotelsSlice';
import hotelApi from '../services/api';

vi.mock('../services/api', () => ({
  default: {
    getHotels: vi.fn(),
    deleteHotel: vi.fn(),
    getHotelStats: vi.fn().mockResolvedValue({ data: {} }),
  },
  getImageUrl: (path) => (path ? `http://localhost:5000${path}` : null),
}));

const mockHotelsList = [
  {
    id: '1',
    title: 'Grand Palace Resort',
    description: 'Luxury beachfront property.',
    latitude: '24.453884',
    longitude: '54.377344',
    price: '349.00',
    image_path: '/uploads/hotels/resort.jpg',
  },
  {
    id: '2',
    title: 'Azure Marina Hotel',
    description: 'Modern waterfront suites.',
    latitude: '25.080512',
    longitude: '55.140321',
    price: '220.00',
    image_path: null,
  },
];

const createMockStore = (initialCustomState = {}) => {
  return configureStore({
    reducer: {
      hotels: hotelsReducer,
    },
    preloadedState: {
      hotels: {
        items: mockHotelsList,
        pagination: { total: 2, limit: 6, offset: 0, hasMore: false },
        filters: { title: '', minPrice: '', maxPrice: '' },
        stats: { totalProperties: 2, averagePrice: '284.50', minPrice: '220.00', maxPrice: '349.00', propertiesWithImages: 1 },
        statsStatus: 'idle',
        statsError: null,
        status: 'succeeded',
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

describe('MyHotelsPage Component – Delete Confirmation & Success Feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hotelApi.getHotels.mockResolvedValue({
      data: mockHotelsList,
      pagination: { total: 2, limit: 6, offset: 0, hasMore: false },
    });
    hotelApi.deleteHotel.mockResolvedValue({ message: 'Hotel deleted successfully' });
  });

  it('renders hotel cards and total count badge', () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <HelmetProvider>
          <MemoryRouter>
            <MyHotelsPage />
          </MemoryRouter>
        </HelmetProvider>
      </Provider>
    );

    expect(screen.getByText('Grand Palace Resort')).toBeInTheDocument();
    expect(screen.getByText('Azure Marina Hotel')).toBeInTheDocument();
    expect(screen.getByText('Total Properties')).toBeInTheDocument();
  });

  it('opens confirmation modal when delete button on hotel card is clicked', () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <HelmetProvider>
          <MemoryRouter>
            <MyHotelsPage />
          </MemoryRouter>
        </HelmetProvider>
      </Provider>
    );

    const deleteButtons = screen.getAllByRole('button', { name: /^Delete /i });
    fireEvent.click(deleteButtons[0]);

    // Modal dialog appears
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete/i)).toBeInTheDocument();
    expect(screen.getByText('Grand Palace Resort', { selector: 'strong' })).toBeInTheDocument();
  });

  it('closes confirmation modal when cancel button is clicked without deleting', () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <HelmetProvider>
          <MemoryRouter>
            <MyHotelsPage />
          </MemoryRouter>
        </HelmetProvider>
      </Provider>
    );

    const deleteButtons = screen.getAllByRole('button', { name: /^Delete /i });
    fireEvent.click(deleteButtons[0]);

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelButton);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(hotelApi.deleteHotel).not.toHaveBeenCalled();
  });

  it('dispatches deletion and displays success toast feedback upon confirmation', async () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <HelmetProvider>
          <MemoryRouter>
            <MyHotelsPage />
          </MemoryRouter>
        </HelmetProvider>
      </Provider>
    );

    const deleteButtons = screen.getAllByRole('button', { name: /^Delete /i });
    fireEvent.click(deleteButtons[0]);

    const confirmButton = screen.getByRole('button', { name: 'Delete Property' });
    fireEvent.click(confirmButton);

    // Modal closes
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Success toast notification appears
    expect(screen.getByTestId('flash-notification')).toBeInTheDocument();
    expect(
      screen.getByText('Property "Grand Palace Resort" was deleted successfully.')
    ).toBeInTheDocument();
  });
});
