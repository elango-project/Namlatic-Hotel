import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import ProtectedRoute from '../components/ProtectedRoute';
import authReducer, { fetchCurrentUser } from '../store/authSlice';
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
        initialized: true,
        sessionExpired: false,
        connectionError: false,
        ...initialAuthState,
      },
    },
  });
};

const renderWithRouter = (store, initialPath = '/hotels') => {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<LocationDisplay />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div data-testid="dashboard">Dashboard</div>} />
            <Route path="/hotels" element={<div data-testid="hotels-list">Hotels List</div>} />
            <Route path="/hotels/new" element={<div data-testid="new-hotel">New Hotel</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </Provider>
  );
};

describe('ProtectedRoute Component (Phase 5F-A3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Session Verification & Loading States', () => {
    it('displays loading screen while initial session verification is in flight', () => {
      const store = createMockStore({
        initialized: false,
        status: 'loading',
      });

      renderWithRouter(store, '/hotels');

      expect(
        screen.getByText('Verifying authentication session...')
      ).toBeInTheDocument();
      expect(screen.queryByTestId('hotels-list')).not.toBeInTheDocument();
      expect(screen.queryByTestId('current-path')).not.toBeInTheDocument();
    });

    it('displays recoverable connection error screen when session verification suffers network outage', () => {
      const store = createMockStore({
        initialized: false,
        connectionError: true,
        error: 'Unable to connect to the authentication server.',
      });

      renderWithRouter(store, '/hotels');

      expect(
        screen.getByText('Authentication Service Unavailable')
      ).toBeInTheDocument();
      expect(
        screen.getByText('Unable to connect to the authentication server.')
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /retry session verification/i })
      ).toBeInTheDocument();
      expect(screen.queryByTestId('hotels-list')).not.toBeInTheDocument();
    });

    it('clicking retry button on connection error screen dispatches fetchCurrentUser', async () => {
      const store = createMockStore({
        initialized: false,
        connectionError: true,
        error: 'Backend outage',
      });

      const dispatchSpy = vi.spyOn(store, 'dispatch');
      renderWithRouter(store, '/hotels');

      const retryBtn = screen.getByRole('button', { name: /retry session verification/i });
      await act(async () => {
        fireEvent.click(retryBtn);
      });

      expect(dispatchSpy).toHaveBeenCalled();
    });
  });

  describe('Route Access Control', () => {
    it('permits access and renders protected route when authenticated', () => {
      const store = createMockStore({
        initialized: true,
        isAuthenticated: true,
        user: { id: 1, email: 'owner@namlatic.com', role: 'owner' },
      });

      renderWithRouter(store, '/hotels');

      expect(screen.getByTestId('hotels-list')).toBeInTheDocument();
      expect(screen.queryByText('Verifying authentication session...')).not.toBeInTheDocument();
    });

    it('redirects unauthenticated user to /login and preserves requested URL in state.from', () => {
      const store = createMockStore({
        initialized: true,
        isAuthenticated: false,
        user: null,
      });

      renderWithRouter(store, '/hotels/new');

      expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
      expect(screen.getByTestId('from-path')).toHaveTextContent('/hotels/new');
      expect(screen.queryByTestId('new-hotel')).not.toBeInTheDocument();
    });

    it('renders custom children element when passed directly to ProtectedRoute', () => {
      const store = createMockStore({
        initialized: true,
        isAuthenticated: true,
        user: { id: 1 },
      });

      render(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/custom']}>
            <Routes>
              <Route path="/login" element={<div>Login</div>} />
              <Route
                path="/custom"
                element={
                  <ProtectedRoute>
                    <div data-testid="custom-child">Custom Protected Child</div>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </MemoryRouter>
        </Provider>
      );

      expect(screen.getByTestId('custom-child')).toBeInTheDocument();
    });
  });
});
