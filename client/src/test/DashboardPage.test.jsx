import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { HelmetProvider } from 'react-helmet-async';
import DashboardPage from '../pages/DashboardPage';
import MainLayout from '../layouts/MainLayout';
import hotelsReducer from '../features/hotels/hotelsSlice';
import authReducer from '../store/authSlice';
import hotelApi from '../services/api';

vi.mock('../services/api', () => ({
  default: {
    getHotels: vi.fn(),
    getHotelStats: vi.fn(),
    checkReadiness: vi.fn().mockResolvedValue({ status: 'ready' }),
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

const createMockStore = (initialCustomState = {}, initialAuthState = {}) => {
  return configureStore({
    reducer: {
      hotels: hotelsReducer,
      auth: authReducer,
    },
    preloadedState: {
      hotels: {
        items: mockHotelsList,
        pagination: { total: 2, limit: 6, offset: 0, hasMore: false },
        filters: { title: '', minPrice: '', maxPrice: '' },
        stats: {
          totalProperties: 2,
          averagePrice: '284.50',
          minPrice: '220.00',
          maxPrice: '349.00',
          propertiesWithImages: 1,
        },
        statsStatus: 'succeeded',
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
      auth: {
        user: { id: 1, email: 'owner@namlatic.com', role: 'owner' },
        isAuthenticated: true,
        status: 'succeeded',
        ...initialAuthState,
      },
    },
  });
};

const renderWithProviders = async (ui, store = createMockStore()) => {
  let rendered;
  await act(async () => {
    rendered = render(
      <Provider store={store}>
        <HelmetProvider>
          <MemoryRouter>{ui}</MemoryRouter>
        </HelmetProvider>
      </Provider>
    );
  });
  return rendered;
};

describe('Phase 1: Dashboard Metrics & Currency Formatting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hotelApi.getHotels.mockResolvedValue({
      data: mockHotelsList,
      pagination: { total: 2, limit: 6, offset: 0, hasMore: false },
    });
    hotelApi.getHotelStats.mockResolvedValue({
      data: {
        totalProperties: 2,
        averagePrice: '284.50',
        minPrice: '220.00',
        maxPrice: '349.00',
        propertiesWithImages: 1,
      },
    });
    hotelApi.checkReadiness.mockResolvedValue({ status: 'ready' });
  });

  it('renders Total Properties, Average Price, Price Range, and Properties with Images correctly', async () => {
    await renderWithProviders(<DashboardPage />);

    expect(screen.getAllByText('Total Properties').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Average Price')).toBeInTheDocument();
    expect(screen.getByText('Price Range')).toBeInTheDocument();
    expect(screen.getByText('Properties with Images')).toBeInTheDocument();

    expect(screen.getByText('$284.50')).toBeInTheDocument();
    expect(screen.getByText('$220.00 – $349.00')).toBeInTheDocument();
    expect(screen.getByText('Portfolio price bounds (MIN – MAX)')).toBeInTheDocument();
  });

  it('handles single-property dataset correctly with accurate subtext (e.g. 72.74)', async () => {
    hotelApi.getHotels.mockResolvedValueOnce({
      data: [
        {
          id: '1',
          title: 'Single Budget Inn',
          description: 'A cozy boutique hotel.',
          latitude: '24.12',
          longitude: '55.74',
          price: '72.74',
          image_path: '/uploads/hotels/single.jpg',
        },
      ],
      pagination: { total: 1, limit: 6, offset: 0, hasMore: false },
    });
    hotelApi.getHotelStats.mockResolvedValueOnce({
      data: {
        totalProperties: 1,
        averagePrice: '72.74',
        minPrice: '72.74',
        maxPrice: '72.74',
        propertiesWithImages: 1,
      },
    });

    const singlePropertyStore = createMockStore({
      stats: {
        totalProperties: 1,
        averagePrice: '72.74',
        minPrice: '72.74',
        maxPrice: '72.74',
        propertiesWithImages: 1,
      },
      items: [
        {
          id: '1',
          title: 'Single Budget Inn',
          description: 'A cozy boutique hotel.',
          latitude: '24.12',
          longitude: '55.74',
          price: '72.74',
          image_path: '/uploads/hotels/single.jpg',
        },
      ],
    });

    await renderWithProviders(<DashboardPage />, singlePropertyStore);

    // Both Average Price and Price Range display $72.74 because mathematically AVG = MIN = MAX = $72.74
    const values = screen.getAllByText('$72.74');
    expect(values.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('All properties have the same rate')).toBeInTheDocument();
  });

  it('handles multiple properties with identical rates correctly (e.g. all 72.74)', async () => {
    const uniformItems = [
      { id: '1', title: 'Hotel A', description: 'Desc A', latitude: '24.1', longitude: '55.7', price: '72.74' },
      { id: '2', title: 'Hotel B', description: 'Desc B', latitude: '24.2', longitude: '55.8', price: '72.74' },
      { id: '3', title: 'Hotel C', description: 'Desc C', latitude: '24.3', longitude: '55.9', price: '72.74' },
    ];
    hotelApi.getHotels.mockResolvedValueOnce({
      data: uniformItems,
      pagination: { total: 3, limit: 6, offset: 0, hasMore: false },
    });
    hotelApi.getHotelStats.mockResolvedValueOnce({
      data: {
        totalProperties: 3,
        averagePrice: '72.74',
        minPrice: '72.74',
        maxPrice: '72.74',
        propertiesWithImages: 2,
      },
    });

    const uniformPropertiesStore = createMockStore({
      stats: {
        totalProperties: 3,
        averagePrice: '72.74',
        minPrice: '72.74',
        maxPrice: '72.74',
        propertiesWithImages: 2,
      },
      items: uniformItems,
    });

    await renderWithProviders(<DashboardPage />, uniformPropertiesStore);

    const values = screen.getAllByText('$72.74');
    expect(values.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('All properties have the same rate')).toBeInTheDocument();
  });

  it('handles completely empty dataset safely without NaN or division by zero', async () => {
    hotelApi.getHotels.mockResolvedValueOnce({
      data: [],
      pagination: { total: 0, limit: 6, offset: 0, hasMore: false },
    });
    hotelApi.getHotelStats.mockResolvedValueOnce({
      data: {
        totalProperties: 0,
        averagePrice: '0.00',
        minPrice: '0.00',
        maxPrice: '0.00',
        propertiesWithImages: 0,
      },
    });

    const emptyStore = createMockStore({
      status: 'succeeded',
      stats: {
        totalProperties: 0,
        averagePrice: '0.00',
        minPrice: '0.00',
        maxPrice: '0.00',
        propertiesWithImages: 0,
      },
      items: [],
    });

    await renderWithProviders(<DashboardPage />, emptyStore);

    const zeroes = screen.getAllByText('$0.00');
    expect(zeroes.length).toBeGreaterThanOrEqual(2);
    await screen.findByText('No hotel properties found');
    expect(screen.getByText('No hotel properties found')).toBeInTheDocument();
  });
});

describe('Phase 1: Recent Properties Horizontal Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hotelApi.getHotels.mockResolvedValue({
      data: mockHotelsList,
      pagination: { total: 2, limit: 6, offset: 0, hasMore: false },
    });
    hotelApi.getHotelStats.mockResolvedValue({
      data: {
        totalProperties: 2,
        averagePrice: '284.50',
        minPrice: '220.00',
        maxPrice: '349.00',
        propertiesWithImages: 1,
      },
    });
    hotelApi.checkReadiness.mockResolvedValue({ status: 'ready' });
  });

  it('preserves exact heading and subtitle', async () => {
    await renderWithProviders(<DashboardPage />);

    expect(screen.getByRole('heading', { name: 'Recent Properties' })).toBeInTheDocument();
    expect(
      screen.getByText('Latest hotel additions to your management system')
    ).toBeInTheDocument();
  });

  it('renders horizontal scroll track and property items with dedicated wrapper classes', async () => {
    const { container } = await renderWithProviders(<DashboardPage />);

    const scrollContainer = container.querySelector('.recent-properties-container');
    expect(scrollContainer).toBeInTheDocument();

    const scrollTrack = container.querySelector('.recent-properties-track');
    expect(scrollTrack).toBeInTheDocument();
    expect(scrollTrack).toHaveAttribute('role', 'region');

    const cardItems = container.querySelectorAll('.recent-property-card-item');
    expect(cardItems.length).toBe(mockHotelsList.length);
  });

  it('toggles .has-overflow-right dynamically when scrolling', async () => {
    const { container } = await renderWithProviders(<DashboardPage />);
    const scrollContainer = container.querySelector('.recent-properties-container');
    const scrollTrack = container.querySelector('.recent-properties-track');
    expect(scrollContainer).toBeInTheDocument();
    expect(scrollTrack).toBeInTheDocument();

    // Mock layout dimensions: 1200px content width in a 600px visible window at scrollLeft 0
    Object.defineProperty(scrollTrack, 'scrollWidth', { configurable: true, value: 1200 });
    Object.defineProperty(scrollTrack, 'clientWidth', { configurable: true, value: 600 });
    Object.defineProperty(scrollTrack, 'scrollLeft', { configurable: true, writable: true, value: 0 });

    // Trigger scroll event
    await act(async () => {
      scrollTrack.dispatchEvent(new Event('scroll'));
    });
    expect(scrollContainer).toHaveClass('has-overflow-right');

    // Scroll to the end: scrollWidth (1200) - clientWidth (600) - scrollLeft (600) = 0 <= 2
    scrollTrack.scrollLeft = 600;
    await act(async () => {
      scrollTrack.dispatchEvent(new Event('scroll'));
    });
    expect(scrollContainer).not.toHaveClass('has-overflow-right');
  });
});

describe('Phase 1: Duplicate Logout Cleanup in MainLayout', () => {
  it('renders strictly ONE Sign Out action in the sidebar and zero in the top header', async () => {
    const { container } = await renderWithProviders(<MainLayout />);

    const logoutButtons = screen.getAllByRole('button', { name: /sign out|log out/i });
    expect(logoutButtons.length).toBe(1);

    const sidebarLogout = container.querySelector('.owner-logout-btn');
    expect(sidebarLogout).toBeInTheDocument();

    const headerLogout = container.querySelector('.header-logout-btn');
    expect(headerLogout).toBeNull();
  });
});
