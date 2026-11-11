import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { HelmetProvider } from 'react-helmet-async';
import LoginPage from '../pages/LoginPage';
import authReducer from '../store/authSlice';
import { authApi } from '../services/api';

vi.mock('../services/api', () => ({
  authApi: {
    login: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
  },
  onUnauthorized: vi.fn().mockReturnValue(() => {}),
}));

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

const renderLoginPage = ({ store = createMockStore(), initialEntries = ['/login'] } = {}) => {
  return render(
    <Provider store={store}>
      <HelmetProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<div data-testid="dashboard-page">Dashboard</div>} />
            <Route path="/hotels/new" element={<div data-testid="new-hotel-page">New Hotel</div>} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </Provider>
  );
};

describe('LoginPage Component (Phase 5F-A3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('UI Rendering & Layout', () => {
    it('renders branding, heading, inputs, labels, and security footer', () => {
      renderLoginPage();

      expect(screen.getByText('Namlatic')).toBeInTheDocument();
      expect(screen.getByText('Owner Portal')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
      expect(
        screen.getByText(/sign in to manage your hotel properties/i)
      ).toBeInTheDocument();

      // Form controls
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /show password/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();

      // Security notice
      expect(
        screen.getByText(/protected by argon2id cryptography & secure httponly sessions/i)
      ).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('displays error messages when submitting empty fields', async () => {
      renderLoginPage();

      const submitButton = screen.getByRole('button', { name: /^sign in$/i });
      fireEvent.click(submitButton);

      expect(await screen.findByText('Email address is required.')).toBeInTheDocument();
      expect(screen.getByText('Password is required.')).toBeInTheDocument();
      expect(authApi.login).not.toHaveBeenCalled();
    });

    it('validates email format and displays error for invalid syntax', async () => {
      renderLoginPage();

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/^password/i);
      const submitButton = screen.getByRole('button', { name: /^sign in$/i });

      fireEvent.change(emailInput, { target: { value: 'not-an-email' } });
      fireEvent.change(passwordInput, { target: { value: 'SecretPassword123!' } });
      fireEvent.click(submitButton);

      expect(
        await screen.findByText(/please enter a valid email address/i)
      ).toBeInTheDocument();
      expect(authApi.login).not.toHaveBeenCalled();
    });

    it('trims whitespace from email but preserves exact password string without trimming', async () => {
      authApi.login.mockResolvedValueOnce({
        status: 'success',
        user: { id: 1, email: 'owner@namlatic.com', role: 'owner' },
      });

      renderLoginPage();

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/^password/i);
      const submitButton = screen.getByRole('button', { name: /^sign in$/i });

      // Password intentionally contains leading and trailing spaces
      fireEvent.change(emailInput, { target: { value: '   owner@namlatic.com   ' } });
      fireEvent.change(passwordInput, { target: { value: '  rawPasswordWithSpaces!  ' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(authApi.login).toHaveBeenCalledWith({
          email: 'owner@namlatic.com',
          password: '  rawPasswordWithSpaces!  ',
        });
      });
    });
  });

  describe('Password Visibility Toggle', () => {
    it('toggles password visibility and updates aria-label', () => {
      renderLoginPage();

      const passwordInput = screen.getByLabelText(/^password/i);
      const toggleButton = screen.getByRole('button', { name: /show password/i });

      expect(passwordInput).toHaveAttribute('type', 'password');
      expect(toggleButton).toHaveAttribute('aria-pressed', 'false');

      // Click to show password
      fireEvent.click(toggleButton);
      expect(passwordInput).toHaveAttribute('type', 'text');
      expect(screen.getByRole('button', { name: /hide password/i })).toBeInTheDocument();
      expect(toggleButton).toHaveAttribute('aria-pressed', 'true');

      // Click again to hide password
      fireEvent.click(toggleButton);
      expect(passwordInput).toHaveAttribute('type', 'password');
      expect(screen.getByRole('button', { name: /show password/i })).toBeInTheDocument();
      expect(toggleButton).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('Authentication Submission & Navigation', () => {
    it('successfully logs in and navigates to dashboard', async () => {
      const safeUser = { id: 1, email: 'owner@namlatic.com', role: 'owner' };
      authApi.login.mockResolvedValueOnce({
        status: 'success',
        user: safeUser,
      });

      renderLoginPage();

      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'owner@namlatic.com' },
      });
      fireEvent.change(screen.getByLabelText(/^password/i), {
        target: { value: 'ValidOwnerPassword123!' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
      });
    });

    it('navigates to original destination when location.state.from is supplied', async () => {
      const safeUser = { id: 1, email: 'owner@namlatic.com', role: 'owner' };
      authApi.login.mockResolvedValueOnce({
        status: 'success',
        user: safeUser,
      });

      const store = createMockStore();
      render(
        <Provider store={store}>
          <HelmetProvider>
            <MemoryRouter
              initialEntries={[
                { pathname: '/login', state: { from: { pathname: '/hotels/new' } } },
              ]}
            >
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/" element={<div data-testid="dashboard-page">Dashboard</div>} />
                <Route path="/hotels/new" element={<div data-testid="new-hotel-page">New Hotel</div>} />
              </Routes>
            </MemoryRouter>
          </HelmetProvider>
        </Provider>
      );

      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'owner@namlatic.com' },
      });
      fireEvent.change(screen.getByLabelText(/^password/i), {
        target: { value: 'ValidOwnerPassword123!' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

      await waitFor(() => {
        expect(screen.getByTestId('new-hotel-page')).toBeInTheDocument();
      });
    });

    it('displays error alert on invalid credentials (401)', async () => {
      const errorObj = new Error('Invalid email or password.');
      errorObj.status = 401;
      authApi.login.mockRejectedValueOnce(errorObj);

      renderLoginPage();

      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'owner@namlatic.com' },
      });
      fireEvent.change(screen.getByLabelText(/^password/i), {
        target: { value: 'WrongPassword' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

      expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
    });

    it('displays error alert on rate limiting (429)', async () => {
      const errorObj = new Error('Too many failed login attempts. Please try again later.');
      errorObj.status = 429;
      errorObj.retryAfter = '900';
      authApi.login.mockRejectedValueOnce(errorObj);

      renderLoginPage();

      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'owner@namlatic.com' },
      });
      fireEvent.change(screen.getByLabelText(/^password/i), {
        target: { value: 'WrongPassword' },
      });
      fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

      expect(
        await screen.findByText('Too many failed login attempts. Please try again later.')
      ).toBeInTheDocument();
    });

    it('displays session expired warning alert when sessionExpired is true', () => {
      const store = createMockStore({
        sessionExpired: true,
        error: 'Your session has expired. Please log in again.',
      });

      renderLoginPage({ store });

      expect(
        screen.getByText('Your session has expired. Please log in again.')
      ).toBeInTheDocument();
    });

    it('disables submit button and shows loading state during active login request', () => {
      const store = createMockStore({
        status: 'loading',
      });

      renderLoginPage({ store });

      const submitButton = screen.getByRole('button', { name: /signing in\.\.\./i });
      expect(submitButton).toBeDisabled();
      expect(submitButton).toHaveAttribute('aria-busy', 'true');
    });

    it('redirects immediately if user is already authenticated', () => {
      const store = createMockStore({
        isAuthenticated: true,
        user: { id: 1, email: 'owner@namlatic.com' },
      });

      renderLoginPage({ store });

      expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
    });
  });
});
