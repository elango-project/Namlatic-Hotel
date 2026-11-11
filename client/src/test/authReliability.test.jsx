import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { HelmetProvider } from 'react-helmet-async';
import ProtectedRoute from '../components/ProtectedRoute';
import LoginPage from '../pages/LoginPage';
import authReducer, { fetchCurrentUser, loginUser } from '../store/authSlice';
import { authApi } from '../services/api';

vi.mock('../services/api', () => ({
  authApi: {
    login: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
  },
  onUnauthorized: vi.fn().mockReturnValue(() => {}),
}));

const LocationDisplay = () => {
  const location = useLocation();
  return (
    <div>
      <div data-testid="current-path">{location.pathname}</div>
      <div data-testid="from-path">{location.state?.from?.pathname || 'none'}</div>
    </div>
  );
};

const createMockStore = (initialAuthState = {}) => {
  return configureStore({
    reducer: {
      auth: authReducer,
    },
    preloadedState: {
      auth: {
        user: null,
        status: 'idle',
        isAuthenticated: false,
        error: null,
        errorType: null,
        initialized: false,
        sessionExpired: false,
        connectionError: false,
        connectionErrorMessage: null,
        retryAfter: null,
        ...initialAuthState,
      },
    },
  });
};

const renderApp = ({ store, initialPath = '/hotels' } = {}) => {
  return render(
    <Provider store={store}>
      <HelmetProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/location-check" element={<LocationDisplay />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<div data-testid="dashboard">Dashboard Content</div>} />
              <Route path="/hotels" element={<div data-testid="hotels-list">Private Hotels Inventory</div>} />
              <Route path="/hotels/new" element={<div data-testid="new-hotel">Register Property</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </Provider>
  );
};

describe('Frontend Authentication Reliability (Phase 5F-A3.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial Authentication & Route Protection Resilience', () => {
    it('network unavailable on startup renders connection error and never exposes protected content', async () => {
      // Mock network failure (Failed to fetch)
      const networkError = new TypeError('Failed to fetch');
      authApi.getMe.mockRejectedValueOnce(networkError);

      const store = createMockStore();
      renderApp({ store, initialPath: '/hotels' });

      // Before resolution, shows loading spinner
      expect(screen.getByText('Verifying authentication session...')).toBeInTheDocument();
      expect(screen.queryByTestId('hotels-list')).not.toBeInTheDocument();

      // Dispatch fetchCurrentUser
      await act(async () => {
        await store.dispatch(fetchCurrentUser());
      });

      // Verify connection error screen is rendered
      expect(screen.getByText('Authentication Service Unavailable')).toBeInTheDocument();
      expect(
        screen.getByText(/unable to connect to the authentication server/i)
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /retry session verification/i })
      ).toBeInTheDocument();

      // Protected content MUST NOT be rendered
      expect(screen.queryByTestId('hotels-list')).not.toBeInTheDocument();
      expect(screen.queryByText('Private Hotels Inventory')).not.toBeInTheDocument();
    });

    it('HTTP 500 during session restoration displays server error and blocks protected content', async () => {
      const serverError = new Error('Request failed with status 500');
      serverError.status = 500;
      authApi.getMe.mockRejectedValueOnce(serverError);

      const store = createMockStore();
      renderApp({ store, initialPath: '/hotels' });

      await act(async () => {
        await store.dispatch(fetchCurrentUser());
      });

      expect(screen.getByText('Authentication Service Unavailable')).toBeInTheDocument();
      expect(
        screen.getByText('Authentication server error. Please try again later.')
      ).toBeInTheDocument();
      expect(screen.queryByTestId('hotels-list')).not.toBeInTheDocument();
    });

    it('HTTP 401 during session restoration cleanly redirects to /login without error banners', async () => {
      const unauthError = new Error('Authentication required.');
      unauthError.status = 401;
      authApi.getMe.mockRejectedValueOnce(unauthError);

      const store = createMockStore();
      renderApp({ store, initialPath: '/hotels' });

      await act(async () => {
        await store.dispatch(fetchCurrentUser());
      });

      // Redirected to login page
      expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
      // Should NOT show connection error or session expired on normal initial unauthenticated 401
      expect(screen.queryByText(/authentication service unavailable/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/your session has expired/i)).not.toBeInTheDocument();
      expect(screen.queryByTestId('hotels-list')).not.toBeInTheDocument();
    });

    it('retry after network failure successfully restores session and displays protected route', async () => {
      // Step 1: initial network failure
      const networkError = new TypeError('Failed to fetch');
      authApi.getMe.mockRejectedValueOnce(networkError);

      const store = createMockStore();
      renderApp({ store, initialPath: '/hotels' });

      await act(async () => {
        await store.dispatch(fetchCurrentUser());
      });

      expect(screen.getByText('Authentication Service Unavailable')).toBeInTheDocument();
      const retryButton = screen.getByRole('button', { name: /retry session verification/i });

      // Step 2: Backend becomes available, returns valid owner profile on retry
      const ownerUser = { id: 1, email: 'owner@namlatic.com', role: 'owner' };
      authApi.getMe.mockResolvedValueOnce({
        status: 'success',
        user: ownerUser,
      });

      // Click retry button
      await act(async () => {
        fireEvent.click(retryButton);
      });

      // Protected content is now safely rendered
      await waitFor(() => {
        expect(screen.getByTestId('hotels-list')).toBeInTheDocument();
        expect(screen.getByText('Private Hotels Inventory')).toBeInTheDocument();
      });

      expect(screen.queryByText('Authentication Service Unavailable')).not.toBeInTheDocument();
      expect(store.getState().auth.isAuthenticated).toBe(true);
      expect(store.getState().auth.connectionError).toBe(false);
    });
  });

  describe('Login Page Outage Feedback & Error Differentiation', () => {
    it('displays visible connection error banner on login page when startup session probe fails', () => {
      const store = createMockStore({
        initialized: true,
        connectionError: true,
        connectionErrorMessage: 'Unable to connect to the authentication server. Please check your network connection.',
        errorType: 'network',
      });

      render(
        <Provider store={store}>
          <HelmetProvider>
            <MemoryRouter initialEntries={['/login']}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
              </Routes>
            </MemoryRouter>
          </HelmetProvider>
        </Provider>
      );

      expect(
        screen.getByText(/unable to connect to the authentication server/i)
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry session check/i })).toBeInTheDocument();
    });

    it('clicking retry on login page connection banner dispatches fetchCurrentUser', async () => {
      const store = createMockStore({
        initialized: true,
        connectionError: true,
        connectionErrorMessage: 'Unable to connect to the authentication server.',
      });

      const dispatchSpy = vi.spyOn(store, 'dispatch');

      render(
        <Provider store={store}>
          <HelmetProvider>
            <MemoryRouter initialEntries={['/login']}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
              </Routes>
            </MemoryRouter>
          </HelmetProvider>
        </Provider>
      );

      const retryBtn = screen.getByRole('button', { name: /retry session check/i });
      await act(async () => {
        fireEvent.click(retryBtn);
      });

      expect(dispatchSpy).toHaveBeenCalled();
    });

    it('submitting login credentials during network failure shows connection error, not invalid password', async () => {
      authApi.login.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const store = createMockStore({ initialized: true });
      render(
        <Provider store={store}>
          <HelmetProvider>
            <MemoryRouter initialEntries={['/login']}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
              </Routes>
            </MemoryRouter>
          </HelmetProvider>
        </Provider>
      );

      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'owner@namlatic.com' },
      });
      fireEvent.change(screen.getByLabelText(/^password/i), {
        target: { value: 'MySecretPassword123!' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

      expect(
        await screen.findByText('Unable to connect to the authentication server. Please check your network connection.')
      ).toBeInTheDocument();

      // Must NOT display "Invalid email or password."
      expect(screen.queryByText('Invalid email or password.')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /check server status/i })).toBeInTheDocument();
    });

    it('submitting login credentials during HTTP 500 shows server error, not invalid password', async () => {
      const server500 = new Error('Internal Server Error');
      server500.status = 500;
      authApi.login.mockRejectedValueOnce(server500);

      const store = createMockStore({ initialized: true });
      render(
        <Provider store={store}>
          <HelmetProvider>
            <MemoryRouter initialEntries={['/login']}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
              </Routes>
            </MemoryRouter>
          </HelmetProvider>
        </Provider>
      );

      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'owner@namlatic.com' },
      });
      fireEvent.change(screen.getByLabelText(/^password/i), {
        target: { value: 'MySecretPassword123!' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

      expect(
        await screen.findByText('Authentication server error. Please try again later.')
      ).toBeInTheDocument();

      // Must NOT display "Invalid email or password."
      expect(screen.queryByText('Invalid email or password.')).not.toBeInTheDocument();
    });

    it('submitting login credentials with invalid password (401) shows credential error', async () => {
      const credError = new Error('Invalid email or password.');
      credError.status = 401;
      authApi.login.mockRejectedValueOnce(credError);

      const store = createMockStore({ initialized: true });
      render(
        <Provider store={store}>
          <HelmetProvider>
            <MemoryRouter initialEntries={['/login']}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
              </Routes>
            </MemoryRouter>
          </HelmetProvider>
        </Provider>
      );

      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'owner@namlatic.com' },
      });
      fireEvent.change(screen.getByLabelText(/^password/i), {
        target: { value: 'WrongPassword123' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

      expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /check server status/i })).not.toBeInTheDocument();
    });

    it('submitting login credentials when rate limited (429) shows rate limit warning', async () => {
      const rateLimitError = new Error('Too many login attempts. Please try again later.');
      rateLimitError.status = 429;
      rateLimitError.retryAfter = '900';
      authApi.login.mockRejectedValueOnce(rateLimitError);

      const store = createMockStore({ initialized: true });
      render(
        <Provider store={store}>
          <HelmetProvider>
            <MemoryRouter initialEntries={['/login']}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
              </Routes>
            </MemoryRouter>
          </HelmetProvider>
        </Provider>
      );

      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'owner@namlatic.com' },
      });
      fireEvent.change(screen.getByLabelText(/^password/i), {
        target: { value: 'AnyPassword' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

      expect(
        await screen.findByText('Too many login attempts. Please try again later.')
      ).toBeInTheDocument();
    });

    it('successful authentication recovery after backend becomes available redirects to target page', async () => {
      const store = createMockStore({
        initialized: true,
        connectionError: true,
        connectionErrorMessage: 'Unable to connect to the authentication server.',
      });

      authApi.login.mockResolvedValueOnce({
        status: 'success',
        user: { id: 1, email: 'owner@namlatic.com', role: 'owner' },
      });

      render(
        <Provider store={store}>
          <HelmetProvider>
            <MemoryRouter initialEntries={['/login']}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/" element={<div data-testid="dashboard-page">Dashboard Page</div>} />
              </Routes>
            </MemoryRouter>
          </HelmetProvider>
        </Provider>
      );

      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'owner@namlatic.com' },
      });
      fireEvent.change(screen.getByLabelText(/^password/i), {
        target: { value: 'ValidPassword123!' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
      });

      expect(store.getState().auth.isAuthenticated).toBe(true);
      expect(store.getState().auth.connectionError).toBe(false);
    });
  });
});
