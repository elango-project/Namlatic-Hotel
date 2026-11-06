/**
 * Global error-handling middleware.
 * Must be registered AFTER all routes.
 */
const errorHandler = (err, _req, res, _next) => {
  console.error('[ERROR]', err.stack || err.message);

  const statusCode = err.statusCode || 500;
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
