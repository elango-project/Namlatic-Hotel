import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import hotelApi from '../../services/api';

/**
 * Async thunk to retrieve paginated hotels with backend filtering.
 * Automatically supports AbortSignal cancellation for fast-typing search.
 */
export const fetchHotels = createAsyncThunk(
  'hotels/fetchHotels',
  async (overrideParams, { getState, signal, rejectWithValue }) => {
    try {
      const state = getState().hotels;
      const params = {
        title: state.filters.title,
        minPrice: state.filters.minPrice,
        maxPrice: state.filters.maxPrice,
        limit: state.pagination.limit,
        offset: state.pagination.offset,
        ...overrideParams,
      };

      const response = await hotelApi.getHotels(params, signal);
      return response;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw err;
      }
      return rejectWithValue(err.message || 'Failed to fetch hotels.');
    }
  }
);

/**
 * Async thunk to delete a hotel property from backend and disk.
 */
export const deleteHotel = createAsyncThunk(
  'hotels/deleteHotel',
  async (hotelId, { rejectWithValue }) => {
    try {
      await hotelApi.deleteHotel(hotelId);
      return hotelId;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to delete hotel.');
    }
  }
);

/**
 * Async thunk to retrieve portfolio-wide hotel statistics from PostgreSQL server-side aggregation.
 */
export const fetchHotelStats = createAsyncThunk(
  'hotels/fetchHotelStats',
  async (_, { signal, rejectWithValue }) => {
    try {
      const response = await hotelApi.getHotelStats(signal);
      return response.data;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw err;
      }
      return rejectWithValue(err.message || 'Failed to fetch hotel statistics.');
    }
  }
);

/**
 * Async thunk to check PostgreSQL readiness probe.
 */
export const checkBackendReadiness = createAsyncThunk(
  'hotels/checkBackendReadiness',
  async (_, { rejectWithValue }) => {
    try {
      const response = await hotelApi.checkReadiness();
      return response.status === 'ready';
    } catch (err) {
      return rejectWithValue(false);
    }
  }
);

const initialState = {
  items: [],
  pagination: {
    total: 0,
    limit: 6, // 6 items per page (optimal for 1-col mobile, 2-col tablet, 3-col desktop)
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
  statsStatus: 'idle', // 'idle' | 'loading' | 'succeeded' | 'failed'
  statsError: null,
  status: 'idle', // 'idle' | 'loading' | 'succeeded' | 'failed'
  error: null,
  deleteStatus: 'idle', // 'idle' | 'loading' | 'succeeded' | 'failed'
  deleteError: null,
  backendOnline: null, // null | boolean
};

export const hotelsSlice = createSlice({
  name: 'hotels',
  initialState,
  reducers: {
    setTitleFilter: (state, action) => {
      state.filters.title = action.payload;
      state.pagination.offset = 0; // Reset to page 1 on search change
    },
    setPriceFilters: (state, action) => {
      const { minPrice, maxPrice } = action.payload;
      if (minPrice !== undefined) state.filters.minPrice = minPrice;
      if (maxPrice !== undefined) state.filters.maxPrice = maxPrice;
      state.pagination.offset = 0; // Reset to page 1 on filter change
    },
    setPageOffset: (state, action) => {
      state.pagination.offset = Math.max(0, action.payload);
    },
    resetFilters: (state) => {
      state.filters.title = '';
      state.filters.minPrice = '';
      state.filters.maxPrice = '';
      state.pagination.offset = 0;
    },
    clearError: (state) => {
      state.error = null;
      state.deleteError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchHotels
      .addCase(fetchHotels.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchHotels.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload.data || [];
        state.pagination = action.payload.pagination || {
          total: action.payload.data?.length || 0,
          limit: state.pagination.limit,
          offset: state.pagination.offset,
          hasMore: false,
        };
      })
      .addCase(fetchHotels.rejected, (state, action) => {
        if (action.error?.name !== 'AbortError') {
          state.status = 'failed';
          state.error = action.payload || action.error.message || 'An error occurred';
        }
      })

      // deleteHotel
      .addCase(deleteHotel.pending, (state) => {
        state.deleteStatus = 'loading';
        state.deleteError = null;
      })
      .addCase(deleteHotel.fulfilled, (state, action) => {
        state.deleteStatus = 'succeeded';
        const deletedId = String(action.payload);
        state.items = state.items.filter((h) => String(h.id) !== deletedId);
        state.pagination.total = Math.max(0, state.pagination.total - 1);
      })
      .addCase(deleteHotel.rejected, (state, action) => {
        state.deleteStatus = 'failed';
        state.deleteError = action.payload || 'Failed to delete property.';
      })

      // checkBackendReadiness
      .addCase(checkBackendReadiness.fulfilled, (state, action) => {
        state.backendOnline = action.payload;
      })
      .addCase(checkBackendReadiness.rejected, (state) => {
        state.backendOnline = false;
      })

      // fetchHotelStats (PostgreSQL aggregation)
      .addCase(fetchHotelStats.pending, (state) => {
        state.statsStatus = 'loading';
        state.statsError = null;
      })
      .addCase(fetchHotelStats.fulfilled, (state, action) => {
        state.statsStatus = 'succeeded';
        const p = action.payload || {};
        state.stats = {
          totalProperties: p.totalProperties ?? p.total_properties ?? 0,
          averagePrice: String(p.averagePrice ?? p.average_price ?? '0.00'),
          minPrice: String(p.minPrice ?? p.min_price ?? '0.00'),
          maxPrice: String(p.maxPrice ?? p.max_price ?? '0.00'),
          propertiesWithImages: p.propertiesWithImages ?? p.properties_with_images ?? 0,
        };
      })
      .addCase(fetchHotelStats.rejected, (state, action) => {
        if (action.error?.name !== 'AbortError') {
          state.statsStatus = 'failed';
          state.statsError = action.payload || action.error.message || 'Failed to fetch statistics';
        }
      });
  },
});

export const {
  setTitleFilter,
  setPriceFilters,
  setPageOffset,
  resetFilters,
  clearError,
} = hotelsSlice.actions;

export default hotelsSlice.reducer;
