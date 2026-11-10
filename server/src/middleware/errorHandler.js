/**
 * Global error-handling middleware.
 * Must be registered AFTER all routes.
 * Never leaks stack traces or sensitive internal schemas to client responses in production.
 */
const errorHandler = (err, _req, res, _next) => {
  // Only log stack trace if present and not a known client error
  if (err.statusCode && err.statusCode < 500) {
    console.warn(`[WARN] Client error (${err.statusCode}):`, err.message);
  } else {
    console.error('[ERROR]', err.stack || err.message);
  }

  // Handle body-parser entity too large (413)
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      status: 'error',
      statusCode: 413,
      message: 'Request payload too large. Maximum body size exceeded.',
    });
  }

  // Handle CORS policy rejection (403)
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({
      status: 'error',
      statusCode: 403,
      message: err.message,
    });
  }

  const statusCode = err.statusCode || err.status || 500;
  const message =
    process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'Internal server error'
      : err.message || 'Internal server error';

  const response = {
    status: 'error',
    statusCode,
    message,
  };

  if (err.errors && Array.isArray(err.errors)) {
    response.errors = err.errors;
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;
