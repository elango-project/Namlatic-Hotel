import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Helmet } from 'react-helmet-async';
import {
  loginUser,
  fetchCurrentUser,
  clearAuthError,
  selectIsAuthenticated,
  selectAuthStatus,
  selectAuthError,
  selectAuthErrorType,
  selectConnectionError,
  selectConnectionErrorMessage,
  selectSessionExpired,
  selectAuth,
} from '../store/authSlice';

/**
 * Validates basic email format RFC 5322 compliance.
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function LoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const isAuthenticated = useSelector(selectIsAuthenticated);
  const status = useSelector(selectAuthStatus);
  const serverError = useSelector(selectAuthError);
  const errorType = useSelector(selectAuthErrorType);
  const connectionError = useSelector(selectConnectionError);
  const connectionErrorMessage = useSelector(selectConnectionErrorMessage);
  const sessionExpired = useSelector(selectSessionExpired);
  const auth = useSelector(selectAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  // Target destination after successful login
  const from = location.state?.from?.pathname || '/';

  // If already authenticated, redirect to destination immediately
  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  // Clear stale server errors only when user edits inputs after mount
  const isFirstRender = React.useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (serverError || connectionError) {
      dispatch(clearAuthError());
    }
  }, [email, password]);

  const validate = () => {
    const errors = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      errors.email = 'Email address is required.';
    } else if (!isValidEmail(trimmedEmail)) {
      errors.email = 'Please enter a valid email address (e.g. owner@namlatic.com).';
    }

    if (!password) {
      errors.password = 'Password is required.';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitted(true);

    if (status === 'loading') return;

    if (!validate()) return;

    // Email is trimmed; password is kept strictly intact
    const trimmedEmail = email.trim();

    const result = await dispatch(
      loginUser({
        email: trimmedEmail,
        password,
      })
    );

    if (loginUser.fulfilled.match(result)) {
      navigate(from, { replace: true });
    }
  };

  const isLoading = status === 'loading';

  return (
    <>
      <Helmet>
        <title>Owner Login | Namlatic Hotel Portal</title>
        <meta name="description" content="Secure login for Namlatic Hotel owners." />
      </Helmet>

      <div className="login-page-container">
        <div className="login-card" role="region" aria-labelledby="login-heading">
          {/* Brand Header */}
          <div className="login-brand-header">
            <div className="brand-logo-container" style={{ justifyContent: 'center' }}>
              <div className="brand-icon-box">
                <span className="brand-letter">N</span>
              </div>
              <div style={{ textAlign: 'left' }}>
                <h1 className="brand-name">Namlatic</h1>
                <span className="brand-subtext">Owner Portal</span>
              </div>
            </div>
            <h2 id="login-heading" className="login-title">
              Welcome Back
            </h2>
            <p className="login-subtitle">
              Sign in to manage your hotel properties, inventory, and portfolio analytics.
            </p>
          </div>

          {/* 1. Session Expiration Notice */}
          {sessionExpired && (
            <div className="login-alert login-alert-warning" role="alert">
              <svg className="login-alert-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{serverError || 'Your session has expired. Please log in again.'}</span>
            </div>
          )}

          {/* 2. Startup Session Verification Outage Notice */}
          {connectionError && !sessionExpired && (
            <div className="login-alert login-alert-danger" role="alert">
              <svg className="login-alert-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                <span>{connectionErrorMessage || 'Authentication service is currently unavailable. Please check your network connection.'}</span>
                <button
                  type="button"
                  className="login-retry-action-btn"
                  onClick={() => dispatch(fetchCurrentUser())}
                  style={{
                    alignSelf: 'flex-start',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'inherit',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                  }}
                >
                  Retry Session Check
                </button>
              </div>
            </div>
          )}

          {/* 3. Form Submission Errors (Rate Limiting vs Server/Network vs Invalid Credentials) */}
          {serverError && !sessionExpired && (
            <div
              className={`login-alert ${errorType === 'rate_limit' ? 'login-alert-warning' : 'login-alert-danger'}`}
              role="alert"
            >
              <svg className="login-alert-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {errorType === 'rate_limit' ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                )}
              </svg>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                <span>{serverError}</span>
                {(errorType === 'network' || errorType === 'server') && (
                  <button
                    type="button"
                    className="login-retry-action-btn"
                    onClick={() => dispatch(fetchCurrentUser())}
                    style={{
                      alignSelf: 'flex-start',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'inherit',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                    }}
                  >
                    Check Server Status
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Login Form */}
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {/* Email Field */}
            <div className="form-group">
              <label htmlFor="login-email" className="form-label">
                Email Address <span className="required-star">*</span>
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="username"
                className={`form-input ${submitted && validationErrors.email ? 'is-invalid' : ''}`}
                placeholder="owner@namlatic.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                aria-required="true"
                aria-invalid={submitted && Boolean(validationErrors.email)}
                aria-describedby={submitted && validationErrors.email ? 'login-email-error' : undefined}
              />
              {submitted && validationErrors.email && (
                <span id="login-email-error" className="form-error" role="alert">
                  {validationErrors.email}
                </span>
              )}
            </div>

            {/* Password Field with Show/Hide Toggle */}
            <div className="form-group">
              <label htmlFor="login-password" className="form-label">
                Password <span className="required-star">*</span>
              </label>
              <div className="password-input-wrapper">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className={`form-input ${submitted && validationErrors.password ? 'is-invalid' : ''}`}
                  placeholder="Enter your owner password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  aria-required="true"
                  aria-invalid={submitted && Boolean(validationErrors.password)}
                  aria-describedby={submitted && validationErrors.password ? 'login-password-error' : undefined}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  disabled={isLoading}
                  tabIndex={0}
                >
                  {showPassword ? (
                    // Eye slash icon (hide)
                    <svg className="toggle-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                    </svg>
                  ) : (
                    // Eye icon (show)
                    <svg className="toggle-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {submitted && validationErrors.password && (
                <span id="login-password-error" className="form-error" role="alert">
                  {validationErrors.password}
                </span>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="btn btn-primary btn-block login-submit-btn"
              disabled={isLoading}
              aria-busy={isLoading}
            >
              {isLoading ? (
                <span className="btn-loading-content">
                  <span className="btn-spinner" aria-hidden="true" />
                  <span>Signing in...</span>
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Security Assurance Footer */}
          <div className="login-security-notice">
            <svg className="shield-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>Protected by Argon2id Cryptography & Secure HttpOnly Sessions</span>
          </div>
        </div>
      </div>
    </>
  );
}

export default LoginPage;
