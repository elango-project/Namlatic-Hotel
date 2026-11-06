const express = require('express');
const cors = require('cors');
const path = require('path');
const env = require('./config/env');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

/* ─── Global middleware ─── */
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* ─── API routes ─── */
app.use('/api', routes);

/* ─── 404 catch-all ─── */
app.use((_req, res) => {
  res.status(404).json({ status: 'error', message: 'Route not found' });
});

/* ─── Error handler (must be last) ─── */
app.use(errorHandler);

module.exports = app;
