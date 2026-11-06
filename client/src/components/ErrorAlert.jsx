import React from 'react';

/**
 * Reusable error alert with optional retry action.
 */
function ErrorAlert({ message, onRetry }) {
  return (
    <div className="error-alert" role="alert" data-testid="error-alert">
      <div className="error-alert-content">
        <svg
          className="error-alert-icon"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div>
          <h4 className="error-alert-title">Unable to load properties</h4>
          <p className="error-alert-text">{message || 'An unexpected error occurred while communicating with the server.'}</p>
        </div>
      </div>
      {onRetry && (
        <button type="button" className="btn btn-outline btn-sm btn-retry" onClick={onRetry}>
          Try Again
        </button>
      )}
    </div>
  );
}

export default ErrorAlert;
