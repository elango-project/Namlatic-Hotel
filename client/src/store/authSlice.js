import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { authApi } from '../services/api';

/**
 * Initial state for authentication.
 */
export const initialState = {
  user: null,
  status: 'idle', // 'idle' | 'loading' | 'succeeded' | 'failed'
  isAuthenticated: false,
  error: null,
  initialized: false,
  sessionExpired: false,
  connectionError: false,
};

/**
 * Async thunk to authenticate the hotel owner.
 * Sends credentials to POST /api/auth/login and receives safe owner profile.
 */
export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const response = await authApi.login({ email, password });
      return response.user || response.data?.user;
    } catch (err) {
      const message = err.message || 'Invalid email or password.';
      return rejectWithValue({
        message,
        status: err.status,
        retryAfter: err.retryAfter,
      });
    }
  }
);

/**
 * Async thunk to restore the current session from HttpOnly session cookie.
 * Sends GET /api/auth/me on application initialization.
 */
export const fetchCurrentUser = createAsyncThunk(
  'auth/fetchCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      const response = await authApi.getMe();
      return response.user || response.data?.user;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw err;
      }
      if (err.status === 401) {
        return rejectWithValue({
          unauthenticated: true,
          message: 'No active session.',
        });
      }
      return rejectWithValue({
        unauthenticated: false,
        message: err.message || 'Unable to connect to authentication service.',
      });
    }
  },
  {
    condition: (_, { getState }) => {
      const { auth } = getState();
      // Prevent unnecessary duplicate session-bootstrap requests if already in flight
      if (auth && auth.status === 'loading' && auth.initialized === false) {
        return false;
      }
      return true;
    },
  }
);

/**
 * Async thunk to revoke the active session in PostgreSQL and clear the session cookie.
 */
export const logoutUser = createAsyncThunk(
  'auth/logoutUser',
  async (_, { rejectWithValue }) => {
    try {
      await authApi.logout();
      return true;
    } catch (err) {
      return rejectWithValue(err.message || 'Failed to logout.');
    }
  }
);

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionExpired: (state, action) => {
      state.user = null;
      state.isAuthenticated = false;
      state.status = 'idle';
      state.sessionExpired = true;
      state.error = action.payload || 'Your session has expired. Please log in again.';
    },
    clearAuthError: (state) => {
      state.error = null;
      state.sessionExpired = false;
    },
    resetAuth: (state) => {
      state.user = null;
      state.isAuthenticated = false;
      state.status = 'idle';
      state.error = null;
      state.sessionExpired = false;
      state.connectionError = false;
    },
  },
  extraReducers: (builder) => {
    builder
      // --- fetchCurrentUser ---
      .addCase(fetchCurrentUser.pending, (state) => {
        state.status = 'loading';
        state.error = null;
        state.connectionError = false;
      })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.isAuthenticated = Boolean(action.payload);
        state.status = 'succeeded';
        state.initialized = true;
        state.error = null;
        state.sessionExpired = false;
        state.connectionError = false;
      })
      .addCase(fetchCurrentUser.rejected, (state, action) => {
        state.initialized = true;
        state.user = null;
        state.isAuthenticated = false;
        if (action.payload?.unauthenticated) {
          // Standard unauthenticated state on application startup
          state.status = 'idle';
          state.error = null;
          state.connectionError = false;
        } else {
          // Network or server outage during background session restoration
          state.status = 'idle';
          state.connectionError = true;
          state.connectionErrorMessage = action.payload?.message || 'Unable to connect to authentication server.';
        }
      })

      // --- loginUser ---
      .addCase(loginUser.pending, (state) => {
        state.status = 'loading';
        state.error = null;
        state.sessionExpired = false;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.isAuthenticated = true;
        state.status = 'succeeded';
        state.error = null;
        state.sessionExpired = false;
        state.connectionError = false;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.status = 'failed';
        state.user = null;
        state.isAuthenticated = false;
        state.error = action.payload?.message || 'Invalid email or password.';
      })

      // --- logoutUser ---
      .addCase(logoutUser.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.isAuthenticated = false;
        state.status = 'idle';
        state.error = null;
        state.sessionExpired = false;
        state.connectionError = false;
      })
      .addCase(logoutUser.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload || 'Failed to logout.';
      });
  },
});

export const { sessionExpired, clearAuthError, resetAuth } = authSlice.actions;

// Selectors
export const selectAuth = (state) => state.auth;
export const selectCurrentUser = (state) => state.auth?.user;
export const selectIsAuthenticated = (state) => state.auth?.isAuthenticated;
export const selectAuthStatus = (state) => state.auth?.status;
export const selectAuthError = (state) => state.auth?.error;
export const selectIsInitialized = (state) => state.auth?.initialized;

export default authSlice.reducer;
