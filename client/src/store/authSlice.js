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
  errorType: null, // 'credentials' | 'rate_limit' | 'server' | 'network' | 'session_expired' | null
  initialized: false,
  sessionExpired: false,
  connectionError: false,
  connectionErrorMessage: null,
  retryAfter: null,
};

/**
 * Async thunk to authenticate the hotel owner.
 * Sends credentials to POST /api/auth/login and receives safe owner profile.
 * Distinguishes invalid credentials, rate limiting, server errors, and network outages.
 */
export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const response = await authApi.login({ email, password });
      return response.user || response.data?.user;
    } catch (err) {
      const status = err.status || err.statusCode;
      let errorType = 'unknown';
      let message = err.message;

      if (!status || err.name === 'TypeError') {
        errorType = 'network';
        message = 'Unable to connect to the authentication server. Please check your network connection.';
      } else if (status === 429) {
        errorType = 'rate_limit';
        message = err.message || 'Too many login attempts. Please try again later.';
      } else if (status === 401) {
        errorType = 'credentials';
        message = 'Invalid email or password.';
      } else if (status >= 500) {
        errorType = 'server';
        message = 'Authentication server error. Please try again later.';
      }

      return rejectWithValue({
        message,
        status,
        errorType,
        retryAfter: err.retryAfter,
      });
    }
  }
);

/**
 * Async thunk to restore the current session from HttpOnly session cookie.
 * Sends GET /api/auth/me on application initialization.
 * Distinguishes unauthenticated 401, server 500+, and network connection failures.
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
      const status = err.status || err.statusCode;
      if (status === 401) {
        return rejectWithValue({
          unauthenticated: true,
          status: 401,
          message: 'No active session.',
        });
      }

      let errorType = 'network';
      let message = err.message || 'Unable to connect to authentication server.';

      if (status >= 500) {
        errorType = 'server';
        message = 'Authentication server error. Please try again later.';
      } else if (!status || err.name === 'TypeError') {
        errorType = 'network';
        message = 'Unable to connect to the authentication server. Please check your network connection.';
      }

      return rejectWithValue({
        unauthenticated: false,
        status,
        errorType,
        message,
      });
    }
  },
  {
    condition: (_, { getState }) => {
      const { auth } = getState();
      // Prevent duplicate in-flight session restoration requests
      if (auth && auth.status === 'loading') {
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
      state.errorType = 'session_expired';
    },
    clearAuthError: (state) => {
      state.error = null;
      state.errorType = null;
      state.sessionExpired = false;
      state.connectionError = false;
      state.connectionErrorMessage = null;
    },
    resetAuth: (state) => {
      state.user = null;
      state.isAuthenticated = false;
      state.status = 'idle';
      state.error = null;
      state.errorType = null;
      state.sessionExpired = false;
      state.connectionError = false;
      state.connectionErrorMessage = null;
      state.retryAfter = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // --- fetchCurrentUser ---
      .addCase(fetchCurrentUser.pending, (state) => {
        state.status = 'loading';
        state.error = null;
        state.errorType = null;
        state.connectionError = false;
        state.connectionErrorMessage = null;
      })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.isAuthenticated = Boolean(action.payload);
        state.status = 'succeeded';
        state.initialized = true;
        state.error = null;
        state.errorType = null;
        state.sessionExpired = false;
        state.connectionError = false;
        state.connectionErrorMessage = null;
      })
      .addCase(fetchCurrentUser.rejected, (state, action) => {
        state.initialized = true;
        state.user = null;
        state.isAuthenticated = false;
        state.status = 'idle';
        if (action.payload?.unauthenticated) {
          // Standard unauthenticated state on application startup
          state.error = null;
          state.errorType = null;
          state.connectionError = false;
          state.connectionErrorMessage = null;
        } else {
          // Network or server outage during background session restoration
          state.connectionError = true;
          state.connectionErrorMessage = action.payload?.message || 'Unable to connect to authentication server.';
          state.errorType = action.payload?.errorType || 'network';
        }
      })

      // --- loginUser ---
      .addCase(loginUser.pending, (state) => {
        state.status = 'loading';
        state.error = null;
        state.errorType = null;
        state.sessionExpired = false;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.isAuthenticated = true;
        state.status = 'succeeded';
        state.error = null;
        state.errorType = null;
        state.sessionExpired = false;
        state.connectionError = false;
        state.connectionErrorMessage = null;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.status = 'failed';
        state.user = null;
        state.isAuthenticated = false;
        state.error = action.payload?.message || 'Invalid email or password.';
        state.errorType = action.payload?.errorType || 'unknown';
        state.retryAfter = action.payload?.retryAfter || null;
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
        state.errorType = null;
        state.sessionExpired = false;
        state.connectionError = false;
        state.connectionErrorMessage = null;
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
export const selectAuthErrorType = (state) => state.auth?.errorType;
export const selectIsInitialized = (state) => state.auth?.initialized;
export const selectConnectionError = (state) => state.auth?.connectionError;
export const selectConnectionErrorMessage = (state) => state.auth?.connectionErrorMessage;
export const selectSessionExpired = (state) => state.auth?.sessionExpired;

export default authSlice.reducer;
