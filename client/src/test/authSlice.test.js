import { describe, it, expect, vi, beforeEach } from 'vitest';
import authReducer, {
  initialState,
  loginUser,
  fetchCurrentUser,
  logoutUser,
  sessionExpired,
  clearAuthError,
  resetAuth,
  selectAuth,
  selectCurrentUser,
  selectIsAuthenticated,
  selectAuthStatus,
  selectAuthError,
  selectIsInitialized,
} from '../store/authSlice';
import { authApi } from '../services/api';

vi.mock('../services/api', () => ({
  authApi: {
    login: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
  },
}));

describe('Redux authSlice (Phase 5F-A3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial State & Selectors', () => {
    it('returns exact initial authentication state', () => {
      const state = authReducer(undefined, { type: '@@INIT' });
      expect(state).toEqual({
        user: null,
        status: 'idle',
        isAuthenticated: false,
        error: null,
        initialized: false,
        sessionExpired: false,
        connectionError: false,
      });
    });

    it('selectors retrieve accurate slice properties', () => {
      const rootState = {
        auth: {
          user: { id: 1, email: 'owner@namlatic.com', role: 'owner' },
          status: 'succeeded',
          isAuthenticated: true,
          error: null,
          initialized: true,
          sessionExpired: false,
          connectionError: false,
        },
      };

      expect(selectAuth(rootState)).toEqual(rootState.auth);
      expect(selectCurrentUser(rootState)).toEqual({ id: 1, email: 'owner@namlatic.com', role: 'owner' });
      expect(selectIsAuthenticated(rootState)).toBe(true);
      expect(selectAuthStatus(rootState)).toBe('succeeded');
      expect(selectAuthError(rootState)).toBeNull();
      expect(selectIsInitialized(rootState)).toBe(true);
    });
  });

  describe('Synchronous Reducer Actions', () => {
    it('sessionExpired action clears user and sets sessionExpired with custom message', () => {
      const activeState = {
        user: { id: 1, email: 'owner@namlatic.com', role: 'owner' },
        status: 'succeeded',
        isAuthenticated: true,
        error: null,
        initialized: true,
        sessionExpired: false,
        connectionError: false,
      };

      const nextState = authReducer(activeState, sessionExpired('Your session has ended.'));
      expect(nextState.isAuthenticated).toBe(false);
      expect(nextState.user).toBeNull();
      expect(nextState.sessionExpired).toBe(true);
      expect(nextState.error).toBe('Your session has ended.');
      expect(nextState.status).toBe('idle');
    });

    it('clearAuthError clears error and sessionExpired flags', () => {
      const errorState = {
        ...initialState,
        error: 'Some error',
        sessionExpired: true,
      };

      const nextState = authReducer(errorState, clearAuthError());
      expect(nextState.error).toBeNull();
      expect(nextState.sessionExpired).toBe(false);
    });

    it('resetAuth restores state to unauthenticated defaults', () => {
      const dirtyState = {
        user: { id: 5, email: 'temp@namlatic.com', role: 'owner' },
        status: 'succeeded',
        isAuthenticated: true,
        error: 'Stale error',
        initialized: true,
        sessionExpired: true,
        connectionError: true,
      };

      const nextState = authReducer(dirtyState, resetAuth());
      expect(nextState.user).toBeNull();
      expect(nextState.isAuthenticated).toBe(false);
      expect(nextState.status).toBe('idle');
      expect(nextState.error).toBeNull();
      expect(nextState.sessionExpired).toBe(false);
      expect(nextState.connectionError).toBe(false);
    });
  });

  describe('loginUser Thunk Lifecycle', () => {
    it('sets loading status and clears error on pending', () => {
      const stateWithError = { ...initialState, error: 'Previous error', sessionExpired: true };
      const nextState = authReducer(stateWithError, { type: loginUser.pending.type });

      expect(nextState.status).toBe('loading');
      expect(nextState.error).toBeNull();
      expect(nextState.sessionExpired).toBe(false);
    });

    it('populates safe user profile and sets isAuthenticated=true on fulfilled', () => {
      const safeUser = { id: 10, email: 'owner@namlatic.com', role: 'owner' };
      const nextState = authReducer(initialState, {
        type: loginUser.fulfilled.type,
        payload: safeUser,
      });

      expect(nextState.status).toBe('succeeded');
      expect(nextState.isAuthenticated).toBe(true);
      expect(nextState.user).toEqual(safeUser);
      expect(nextState.error).toBeNull();
      expect(nextState.sessionExpired).toBe(false);
    });

    it('clears user and records error message on rejected', () => {
      const nextState = authReducer(initialState, {
        type: loginUser.rejected.type,
        payload: { message: 'Invalid email or password.', status: 401 },
      });

      expect(nextState.status).toBe('failed');
      expect(nextState.isAuthenticated).toBe(false);
      expect(nextState.user).toBeNull();
      expect(nextState.error).toBe('Invalid email or password.');
    });

    it('dispatches loginUser thunk and handles successful API response', async () => {
      const safeUser = { id: 1, email: 'owner@namlatic.com', role: 'owner' };
      authApi.login.mockResolvedValueOnce({
        status: 'success',
        data: { user: safeUser },
        user: safeUser,
      });

      const dispatch = vi.fn();
      const thunk = loginUser({ email: 'owner@namlatic.com', password: 'ValidPassword123!' });
      const result = await thunk(dispatch, () => ({ auth: initialState }), undefined);

      expect(authApi.login).toHaveBeenCalledWith({
        email: 'owner@namlatic.com',
        password: 'ValidPassword123!',
      });
      expect(result.payload).toEqual(safeUser);
    });

    it('dispatches loginUser thunk and handles rejection with error payload', async () => {
      const errorObj = new Error('Invalid email or password.');
      errorObj.status = 401;
      authApi.login.mockRejectedValueOnce(errorObj);

      const dispatch = vi.fn();
      const thunk = loginUser({ email: 'owner@namlatic.com', password: 'WrongPassword' });
      const result = await thunk(dispatch, () => ({ auth: initialState }), undefined);

      expect(result.payload).toEqual({
        message: 'Invalid email or password.',
        status: 401,
        retryAfter: undefined,
      });
    });
  });

  describe('fetchCurrentUser Thunk Lifecycle', () => {
    it('sets status to loading on pending', () => {
      const nextState = authReducer(initialState, { type: fetchCurrentUser.pending.type });
      expect(nextState.status).toBe('loading');
      expect(nextState.error).toBeNull();
      expect(nextState.connectionError).toBe(false);
    });

    it('populates user and sets initialized=true on fulfilled', () => {
      const user = { id: 1, email: 'owner@namlatic.com', role: 'owner' };
      const nextState = authReducer(initialState, {
        type: fetchCurrentUser.fulfilled.type,
        payload: user,
      });

      expect(nextState.initialized).toBe(true);
      expect(nextState.isAuthenticated).toBe(true);
      expect(nextState.user).toEqual(user);
      expect(nextState.status).toBe('succeeded');
      expect(nextState.connectionError).toBe(false);
    });

    it('handles unauthenticated 401 cleanly without error banner', () => {
      const nextState = authReducer(initialState, {
        type: fetchCurrentUser.rejected.type,
        payload: { unauthenticated: true, message: 'No active session.' },
      });

      expect(nextState.initialized).toBe(true);
      expect(nextState.isAuthenticated).toBe(false);
      expect(nextState.user).toBeNull();
      expect(nextState.status).toBe('idle');
      expect(nextState.error).toBeNull();
      expect(nextState.connectionError).toBe(false);
    });

    it('handles server or network failure by setting connectionError=true', () => {
      const nextState = authReducer(initialState, {
        type: fetchCurrentUser.rejected.type,
        payload: { unauthenticated: false, message: 'Unable to connect to authentication server.' },
      });

      expect(nextState.initialized).toBe(true);
      expect(nextState.isAuthenticated).toBe(false);
      expect(nextState.user).toBeNull();
      expect(nextState.status).toBe('idle');
      expect(nextState.connectionErrorMessage).toBe('Unable to connect to authentication server.');
      expect(nextState.connectionError).toBe(true);
    });

    it('executes fetchCurrentUser and returns user data on active session', async () => {
      const safeUser = { id: 2, email: 'owner@namlatic.com', role: 'owner' };
      authApi.getMe.mockResolvedValueOnce({
        status: 'success',
        user: safeUser,
      });

      const dispatch = vi.fn();
      const thunk = fetchCurrentUser();
      const result = await thunk(dispatch, () => ({ auth: initialState }), undefined);

      expect(authApi.getMe).toHaveBeenCalled();
      expect(result.payload).toEqual(safeUser);
    });

    it('handles 401 rejection by rejecting with unauthenticated=true', async () => {
      const err = new Error('Authentication required.');
      err.status = 401;
      authApi.getMe.mockRejectedValueOnce(err);

      const dispatch = vi.fn();
      const thunk = fetchCurrentUser();
      const result = await thunk(dispatch, () => ({ auth: initialState }), undefined);

      expect(result.payload).toEqual({
        unauthenticated: true,
        message: 'No active session.',
      });
    });
  });

  describe('logoutUser Thunk Lifecycle', () => {
    it('sets loading on pending', () => {
      const activeState = { ...initialState, isAuthenticated: true, user: { id: 1 } };
      const nextState = authReducer(activeState, { type: logoutUser.pending.type });
      expect(nextState.status).toBe('loading');
    });

    it('clears user and sets isAuthenticated=false on fulfilled', () => {
      const activeState = {
        ...initialState,
        isAuthenticated: true,
        user: { id: 1, email: 'owner@namlatic.com' },
        status: 'loading',
      };
      const nextState = authReducer(activeState, { type: logoutUser.fulfilled.type });

      expect(nextState.user).toBeNull();
      expect(nextState.isAuthenticated).toBe(false);
      expect(nextState.status).toBe('idle');
      expect(nextState.error).toBeNull();
    });

    it('sets status=failed and error message on rejected', () => {
      const activeState = { ...initialState, isAuthenticated: true };
      const nextState = authReducer(activeState, {
        type: logoutUser.rejected.type,
        payload: 'Network timeout during logout.',
      });

      expect(nextState.status).toBe('failed');
      expect(nextState.error).toBe('Network timeout during logout.');
    });

    it('executes logout API call when thunk is dispatched', async () => {
      authApi.logout.mockResolvedValueOnce({ status: 'success' });

      const dispatch = vi.fn();
      const thunk = logoutUser();
      const result = await thunk(dispatch, () => ({ auth: initialState }), undefined);

      expect(authApi.logout).toHaveBeenCalled();
      expect(result.payload).toBe(true);
    });
  });
});
