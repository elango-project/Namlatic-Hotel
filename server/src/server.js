const app = require('./app');
const env = require('./config/env');
const { pool } = require('./config/db');

const PORT = env.port;
const HOST = env.host; // Binds to 0.0.0.0 for Render cloud web services

const server = app.listen(PORT, HOST, () => {
  console.log(`\n🏨  Namlatic Hotel API running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`   Host        : ${HOST} (listening on all network interfaces)`);
  console.log(`   Port        : ${PORT}`);
  console.log(`   Environment : ${env.nodeEnv}`);
  console.log(
    `   Database    : ${
      env.isUsingDatabaseUrl
        ? 'DATABASE_URL (Encrypted Cloud PostgreSQL)'
        : `Discrete Local (host: ${env.db.host}, db: ${env.db.database})`
    }`
  );
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
  console.log(`   Ready check : http://localhost:${PORT}/api/ready\n`);
});

// Process-level safety guards
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err.message);
  process.exit(1);
});

// Graceful shutdown handling for container platforms (Render, Docker, Kubernetes)
let isShuttingDown = false;

function handleShutdown(signal) {
  if (isShuttingDown) {
    console.log(`\n[SHUTDOWN] Already shutting down. Ignoring duplicate signal ${signal}.`);
    return;
  }
  isShuttingDown = true;

  console.log(`\n[SHUTDOWN] Received ${signal}. Closing HTTP server and database pool...`);
  server.close(async () => {
    try {
      await pool.end();
      console.log('[SHUTDOWN] Database pool closed successfully. Exiting process.');
      process.exit(0);
    } catch (err) {
      console.error('[SHUTDOWN] Error closing database pool:', err.message);
      process.exit(1);
    }
  });

  // Force shutdown if cleanup takes longer than 10 seconds
  setTimeout(() => {
    console.error('[SHUTDOWN] Forced shutdown due to timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

module.exports = server;
