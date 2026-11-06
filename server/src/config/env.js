const dotenv = require('dotenv');
const path = require('path');

// Load .env from the server directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const env = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME || 'namlatic_hotel',
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
  },

  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
};

module.exports = env;
