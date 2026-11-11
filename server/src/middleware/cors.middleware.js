/**
 * CORS configuration for Namlatic Hotel API.
 * Enforces an explicit allowlist of authorized origins.
 * Rejects wildcards in production and handles OPTIONS preflight.
 */

/**
 * Creates CORS configuration options based on an allowed origins list.
 *
 * @param {string[]} allowedOrigins - List of permitted origin URLs
 * @returns {import('cors').CorsOptions}
 */
function createCorsOptions(allowedOrigins = []) {
  return {
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. same-origin, curl, server-to-server, Render health check)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Explicitly reject unauthorized origins with a 403 error
      const corsError = new Error(`CORS policy violation: Origin "${origin}" is not allowed.`);
      corsError.statusCode = 403;
      return callback(corsError, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'x-vercel-proxy-secret'],
    credentials: true, // Enables transmitting session cookies (__Host-namlatic_session)
    maxAge: 86400, // 24 hours preflight cache
    optionsSuccessStatus: 204,
  };
}

module.exports = {
  createCorsOptions,
};
