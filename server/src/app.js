const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const env = require('./config/env');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const { createCorsOptions } = require('./middleware/cors.middleware');
const { generalLimiter } = require('./middleware/rateLimiter.middleware');

const app = express();

/* ─── Reverse Proxy Trust Configuration (Render) ─── */
// When behind Render's reverse proxy, trust the immediate proxy (1 hop)
// so req.ip correctly reflects the client IP without allowing spoofed X-Forwarded-For headers
if (env.trustProxy !== false) {
  app.set('trust proxy', env.trustProxy);
}

/* ─── Security Headers (Helmet) ─── */
app.use(
  helmet({
    // Enable cross-origin resource policy so frontend clients can load uploaded images and Leaflet tiles
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org', 'https:'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", 'https:'],
        frameAncestors: ["'none'"],
      },
    },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts:
      env.nodeEnv === 'production'
        ? { maxAge: 15552000, includeSubDomains: true }
        : false,
  })
);

/* ─── CORS Allowlist ─── */
app.use(cors(createCorsOptions(env.corsOrigins)));

/* ─── Rate Limiting (General API) ─── */
if (env.rateLimit.enabled) {
  app.use('/api', generalLimiter);
}

/* ─── Request Body Parsers with Explicit Size Limits ─── */
app.use(express.json({ limit: env.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: env.bodyLimit }));

/* ─── Static Uploads ─── */
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* ─── API Routes ─── */
app.use('/api', routes);

/* ─── 404 Catch-All ─── */
app.use((_req, res) => {
  res.status(404).json({ status: 'error', message: 'Route not found' });
});

/* ─── Error Handler (must be last) ─── */
app.use(errorHandler);

module.exports = app;
