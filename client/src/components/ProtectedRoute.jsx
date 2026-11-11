import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
  selectIsAuthenticated,
  selectIsInitialized,
  selectAuthStatus,
  selectAuth,
  fetchCurrentUser,
} from '../store/authSlice';

/**
 * Route protection wrapper for owner-only pages.
 *
 * Requirements:
 * 1. Waits until initial authentication verification (fetchCurrentUser) finishes.
 * 2. Prevents any flash of protected content during startup.
 * 3. Renders children or Outlet if authenticated.
 * 4. Redirects to /login preserving the requested location in state if unauthenticated.
 * 5. Provides a retry button if the initial verification fails due to connection/server error.
 *
 * @param {{ children?: React.ReactNode }} [props]
 */
export function ProtectedRoute({ children }) {
  const location = useLocation();
  const dispatch = useDispatch();
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const initialized = useSelector(selectIsInitialized);
  const status = useSelector(selectAuthStatus);
  const auth = useSelector(selectAuth);

  // 1. App initialization: Wait until initial session check resolves
  if (!initialized) {
    // If backend connection failed on initial startup, show recoverable error screen
    if (auth?.connectionError) {
      return (
        <div className="auth-loading-screen" role="alert">
          <div className="auth-loading-card auth-error-card">
            <div className="brand-icon-box" style={{ background: 'var(--color-danger)' }}>
              <span className="brand-letter">!</span>
            </div>
            <h3 style={{ marginTop: '1rem', fontSize: '1.1rem', color: 'var(--color-text-main)' }}>
              Authentication Service Unavailable
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', margin: '0.5rem 0 1.25rem' }}>
              {auth.connectionErrorMessage || auth.error || 'Unable to connect to the authentication server. Please check your network.'}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => dispatch(fetchCurrentUser())}
            >
              Retry Session Verification
            </button>
          </div>
        </div>
      );
    }

    // Otherwise show loading spinner during session bootstrap
    return (
      <div className="auth-loading-screen" role="status" aria-live="polite">
        <div className="auth-loading-card">
          <div className="brand-icon-box">
            <span className="brand-letter">N</span>
          </div>
          <div className="auth-loading-spinner" aria-hidden="true" />
          <p className="auth-loading-text">Verifying authentication session...</p>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated: Redirect to /login and preserve attempted URL
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 3. Authenticated: Render protected route content
  return children ? children : <Outlet />;
}

export default ProtectedRoute;
