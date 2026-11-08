import { describe, it, expect } from 'vitest';
import hotelsReducer, {
  setTitleFilter,
  setPriceFilters,
  setPageOffset,
  resetFilters,
  fetchHotels,
  deleteHotel,
  fetchHotelStats,
  createHotel,
  updateHotel,
} from '../features/hotels/hotelsSlice';

describe('Redux: hotelsSlice', () => {
  const initialState = {
    items: [],
    pagination: {
      total: 0,
      limit: 6,
      offset: 0,
      hasMore: false,
    },
    filters: {
      title: '',
      minPrice: '',
      maxPrice: '',
    },
    stats: {
      totalProperties: 0,
      averagePrice: '0.00',
      minPrice: '0.00',
      maxPrice: '0.00',
      propertiesWithImages: 0,
    },
    statsStatus: 'idle',
    statsError: null,
    status: 'idle',
    error: null,
    deleteStatus: 'idle',
    deleteError: null,
    backendOnline: null,
  };

  it('handles setTitleFilter and resets offset to 0', () => {
    const prevState = {
      ...initialState,
      pagination: { ...initialState.pagination, offset: 18 },
    };
    const nextState = hotelsReducer(prevState, setTitleFilter('resort'));

    expect(nextState.filters.title).toBe('resort');
    expect(nextState.pagination.offset).toBe(0);
  });

  it('handles setPriceFilters and resets offset to 0', () => {
    const prevState = {
      ...initialState,
      pagination: { ...initialState.pagination, offset: 9 },
    };
    const nextState = hotelsReducer(
      prevState,
      setPriceFilters({ minPrice: 100, maxPrice: 500 })
    );

    expect(nextState.filters.minPrice).toBe(100);
    expect(nextState.filters.maxPrice).toBe(500);
    expect(nextState.pagination.offset).toBe(0);
  });

  it('handles setPageOffset correctly', () => {
    const nextState = hotelsReducer(initialState, setPageOffset(18));
    expect(nextState.pagination.offset).toBe(18);

    // Negative offset is clamped to 0
    const clampedState = hotelsReducer(initialState, setPageOffset(-5));
    expect(clampedState.pagination.offset).toBe(0);
  });

  it('handles resetFilters correctly', () => {
    const modifiedState = {
      ...initialState,
      filters: { title: 'sea', minPrice: 100, maxPrice: 300 },
      pagination: { ...initialState.pagination, offset: 9 },
    };
    const nextState = hotelsReducer(modifiedState, resetFilters());

    expect(nextState.filters.title).toBe('');
    expect(nextState.filters.minPrice).toBe('');
    expect(nextState.filters.maxPrice).toBe('');
    expect(nextState.pagination.offset).toBe(0);
  });

  it('updates state on fetchHotels.pending', () => {
    const nextState = hotelsReducer(initialState, {
      type: fetchHotels.pending.type,
    });
    expect(nextState.status).toBe('loading');
    expect(nextState.error).toBeNull();
  });

  it('populates items and pagination on fetchHotels.fulfilled', () => {
    const mockPayload = {
      data: [{ id: '1', title: 'Hotel Grand' }],
      pagination: { total: 1, limit: 9, offset: 0, hasMore: false },
    };
    const nextState = hotelsReducer(initialState, {
      type: fetchHotels.fulfilled.type,
      payload: mockPayload,
    });

    expect(nextState.status).toBe('succeeded');
    expect(nextState.items).toEqual(mockPayload.data);
    expect(nextState.pagination.total).toBe(1);
  });

  it('stores error message on fetchHotels.rejected', () => {
    const nextState = hotelsReducer(initialState, {
      type: fetchHotels.rejected.type,
      payload: 'Database connection failed',
      error: { message: 'Network Error' },
    });

    expect(nextState.status).toBe('failed');
    expect(nextState.error).toBe('Database connection failed');
  });

  it('removes hotel from items and decrements total on deleteHotel.fulfilled', () => {
    const populatedState = {
      ...initialState,
      items: [
        { id: '1', title: 'Hotel A' },
        { id: '2', title: 'Hotel B' },
      ],
      pagination: { ...initialState.pagination, total: 2 },
    };

    const nextState = hotelsReducer(populatedState, {
      type: deleteHotel.fulfilled.type,
      payload: '1',
    });

    expect(nextState.items.length).toBe(1);
    expect(nextState.items[0].id).toBe('2');
    expect(nextState.pagination.total).toBe(1);
  });

  it('updates state on fetchHotelStats.pending', () => {
    const nextState = hotelsReducer(initialState, {
      type: fetchHotelStats.pending.type,
    });
    expect(nextState.statsStatus).toBe('loading');
    expect(nextState.statsError).toBeNull();
  });

  it('stores statistics correctly on fetchHotelStats.fulfilled', () => {
    const mockStatsPayload = {
      totalProperties: 8,
      averagePrice: '275.50',
      minPrice: '150.00',
      maxPrice: '450.00',
      propertiesWithImages: 5,
    };
    const nextState = hotelsReducer(initialState, {
      type: fetchHotelStats.fulfilled.type,
      payload: mockStatsPayload,
    });

    expect(nextState.statsStatus).toBe('succeeded');
    expect(nextState.stats.totalProperties).toBe(8);
    expect(nextState.stats.averagePrice).toBe('275.50');
    expect(nextState.stats.minPrice).toBe('150.00');
    expect(nextState.stats.maxPrice).toBe('450.00');
    expect(nextState.stats.propertiesWithImages).toBe(5);
  });

  it('stores error message on fetchHotelStats.rejected', () => {
    const nextState = hotelsReducer(initialState, {
      type: fetchHotelStats.rejected.type,
      payload: 'Database aggregation error',
      error: { message: 'Failed' },
    });

    expect(nextState.statsStatus).toBe('failed');
    expect(nextState.statsError).toBe('Database aggregation error');
  });

  it('updates hotel in items array immediately upon updateHotel.fulfilled without full reload', () => {
    const stateWithHotels = {
      ...initialState,
      items: [
        { id: '1', title: 'Old Title', price: '200.00', latitude: 20, longitude: 50 },
        { id: '2', title: 'Other Hotel', price: '300.00', latitude: 21, longitude: 51 },
      ],
      pagination: { ...initialState.pagination, total: 2 },
    };

    const updatedHotel = {
      id: '1',
      title: 'Updated Grand Title',
      price: '275.50',
      latitude: 20,
      longitude: 50,
      description: 'Newly renovated luxury suites',
    };

    const nextState = hotelsReducer(stateWithHotels, {
      type: updateHotel.fulfilled.type,
      payload: updatedHotel,
    });

    expect(nextState.saveStatus).toBe('succeeded');
    expect(nextState.currentHotel).toEqual(updatedHotel);
    // Verified: in-memory list item updated in place
    expect(nextState.items[0].title).toBe('Updated Grand Title');
    expect(nextState.items[0].price).toBe('275.50');
    expect(nextState.items[1].title).toBe('Other Hotel');
  });

  it('prepends new hotel to items and increments total upon createHotel.fulfilled without full reload', () => {
    const stateWithHotels = {
      ...initialState,
      items: [
        { id: '1', title: 'Existing Hotel', price: '200.00' },
      ],
      pagination: { ...initialState.pagination, total: 1, offset: 0, limit: 6 },
    };

    const newHotel = {
      id: '2',
      title: 'Brand New Hotel',
      price: '350.00',
      latitude: -33.8688,
      longitude: 151.2093,
    };

    const nextState = hotelsReducer(stateWithHotels, {
      type: createHotel.fulfilled.type,
      payload: newHotel,
    });

    expect(nextState.saveStatus).toBe('succeeded');
    expect(nextState.pagination.total).toBe(2);
    // Verified: newly created hotel is prepended to the top of the list
    expect(nextState.items[0]).toEqual(newHotel);
    expect(nextState.items[1].id).toBe('1');
  });
});
