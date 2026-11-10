const dotenv = require('dotenv');
const path = require('path');

// Load .env from the server directory if present (fails silently in cloud environments where variables are in process.env)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Validates and parses a PostgreSQL connection string into structured metadata.
 * Never leaks raw credentials or connection strings in thrown errors.
 *
 * @param {string} urlStr
 * @returns {{ protocol: string, hostname: string, port: number, database: string, username: string, password: string, sslmode: string|null }}
 */
function parseDatabaseUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string' || urlStr.trim() === '') {
    throw new Error('DATABASE_URL must be a non-empty string.');
  }

  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch (_e) {
    throw new Error('DATABASE_URL must be a valid connection URL.');
  }

  const validProtocols = ['postgres:', 'postgresql:'];
  if (!validProtocols.includes(parsed.protocol)) {
    throw new Error('DATABASE_URL protocol must be "postgres:" or "postgresql:".');
  }

  if (!parsed.hostname) {
    throw new Error('DATABASE_URL must contain a valid hostname.');
  }

  const database = parsed.pathname.replace(/^\//, '').trim();
  if (!database) {
    throw new Error('DATABASE_URL must specify a target database name in its path.');
  }

  const channelBinding = parsed.searchParams.get('channel_binding');
  const rawSsl = parsed.searchParams.get('ssl');

  return {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port ? parseInt(parsed.port, 10) : 5432,
    database,
    username: decodeURIComponent(parsed.username || ''),
    password: decodeURIComponent(parsed.password || ''),
    sslmode: parsed.searchParams.get('sslmode'),
    channelBinding: channelBinding ? channelBinding.toLowerCase() : null,
    rawSsl: rawSsl ? rawSsl.toLowerCase() : null,
  };
}

/**
 * Validates database environment configuration based on NODE_ENV.
 * Fails fast with clear, sanitized error messages if requirements are violated.
 *
 * @param {Record<string, string|undefined>} rawEnv - Environment variables map (defaults to process.env)
 * @returns {{ isUsingDatabaseUrl: boolean, databaseUrl: string|null, db: object, dbPoolConfig: object }}
 */
function validateDatabaseConfig(rawEnv = process.env) {
  const nodeEnv = rawEnv.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const rawDatabaseUrl = rawEnv.DATABASE_URL ? rawEnv.DATABASE_URL.trim() : null;

  const poolOptions = {
    max: parseInt(rawEnv.DB_POOL_MAX, 10) || 10,
    min: 0,
    idleTimeoutMillis: parseInt(rawEnv.DB_POOL_IDLE_TIMEOUT, 10) || 30000,
    connectionTimeoutMillis: parseInt(rawEnv.DB_POOL_CONN_TIMEOUT, 10) || 5000,
  };

  // Case 1: DATABASE_URL is provided (mandatory in production, optional in development)
  if (rawDatabaseUrl) {
    const parsed = parseDatabaseUrl(rawDatabaseUrl);

    if (isProduction) {
      if (!parsed.password) {
        throw new Error('In production, DATABASE_URL must include a non-empty database password.');
      }
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        throw new Error('In production, DATABASE_URL cannot point to localhost or loopback addresses.');
      }
      if (
        parsed.sslmode === 'disable' ||
        parsed.sslmode === 'no-verify' ||
        parsed.rawSsl === '0' ||
        parsed.rawSsl === 'false'
      ) {
        throw new Error('In production, unencrypted database connections are not permitted. DATABASE_URL cannot disable SSL.');
      }
      if (!parsed.sslmode || (parsed.sslmode !== 'require' && parsed.sslmode !== 'verify-full')) {
        throw new Error('In production, DATABASE_URL must explicitly specify an encrypted SSL mode (e.g. ?sslmode=require).');
      }
    }

    // Channel binding resolution and validation (SCRAM-SHA-256-PLUS)
    const validChannelBindingValues = ['require', 'prefer', 'disable'];
    const rawCb = (parsed.channelBinding || rawEnv.PGCHANNELBINDING || rawEnv.DB_CHANNEL_BINDING || '')
      .trim()
      .toLowerCase();

    let enableChannelBinding = undefined;

    if (rawCb) {
      if (!validChannelBindingValues.includes(rawCb)) {
        throw new Error(
          parsed.channelBinding
            ? 'DATABASE_URL channel_binding parameter must be "require", "prefer", or "disable".'
            : 'Database channel binding setting must be "require", "prefer", or "disable".'
        );
      }

      if (rawCb === 'require') {
        throw new Error(
          parsed.channelBinding
            ? 'DATABASE_URL specifies "channel_binding=require", but the installed PostgreSQL driver (pg 8.23.1) does not support strict channel binding enforcement without fallback. Use "channel_binding=prefer" or "channel_binding=disable", or omit the parameter.'
            : 'Database channel binding setting "require" is not supported by the installed PostgreSQL driver (pg 8.23.1) because strict enforcement without fallback cannot be guaranteed. Use "prefer" or "disable".'
        );
      }

      if (rawCb === 'prefer') {
        enableChannelBinding = true;
      } else if (rawCb === 'disable') {
        enableChannelBinding = false;
      }
    }

    const poolConfig = {
      connectionString: rawDatabaseUrl,
      ...poolOptions,
    };

    if (typeof enableChannelBinding === 'boolean') {
      poolConfig.enableChannelBinding = enableChannelBinding;
    }

    return {
      isUsingDatabaseUrl: true,
      databaseUrl: rawDatabaseUrl,
      db: {
        host: parsed.hostname,
        port: parsed.port,
        database: parsed.database,
        user: parsed.username,
        channelBinding: rawCb || null,
      },
      dbPoolConfig: poolConfig,
    };
  }

  // Case 2: Production without DATABASE_URL -> FAIL FAST
  if (isProduction) {
    throw new Error('In production, DATABASE_URL environment variable is required.');
  }

  // Case 3: Local development using discrete variables
  const host = rawEnv.DB_HOST || 'localhost';
  const port = parseInt(rawEnv.DB_PORT, 10) || 5432;
  const database = rawEnv.DB_NAME || 'namlatic_hotel';
  const user = rawEnv.DB_USER || '';
  const password = rawEnv.DB_PASSWORD || '';

  // Discrete channel binding setting (optional)
  const validChannelBindingValues = ['require', 'prefer', 'disable'];
  const discreteCb = (rawEnv.PGCHANNELBINDING || rawEnv.DB_CHANNEL_BINDING || '')
    .trim()
    .toLowerCase();

  let discreteEnableChannelBinding = undefined;

  if (discreteCb) {
    if (!validChannelBindingValues.includes(discreteCb)) {
      throw new Error('Database channel binding setting must be "require", "prefer", or "disable".');
    }

    if (discreteCb === 'require') {
      throw new Error(
        'Database channel binding setting "require" is not supported by the installed PostgreSQL driver (pg 8.23.1) because strict enforcement without fallback cannot be guaranteed. Use "prefer" or "disable".'
      );
    }

    if (discreteCb === 'prefer') {
      discreteEnableChannelBinding = true;
    } else if (discreteCb === 'disable') {
      discreteEnableChannelBinding = false;
    }
  }

  const discretePoolConfig = {
    host,
    port,
    database,
    user,
    password,
    ssl: false,
    ...poolOptions,
  };

  if (typeof discreteEnableChannelBinding === 'boolean') {
    discretePoolConfig.enableChannelBinding = discreteEnableChannelBinding;
  }

  return {
    isUsingDatabaseUrl: false,
    databaseUrl: null,
    db: { host, port, database, user, password, channelBinding: discreteCb || null },
    dbPoolConfig: discretePoolConfig,
  };
}

/**
 * Parses and validates CORS origins into a list of exact allowed URLs.
 * In production, wildcards (*) are forbidden and all entries must be valid http/https URLs.
 * In development, standard localhost development ports are supported by default.
 *
 * @param {string|undefined} rawOriginStr - Comma-separated list of origins
 * @param {string} nodeEnv - Environment mode
 * @returns {string[]} Normalized list of allowed origins
 */
function parseCorsOrigins(rawOriginStr, nodeEnv = 'development') {
  const defaultLocalOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
  ];

  if (!rawOriginStr || typeof rawOriginStr !== 'string' || rawOriginStr.trim() === '') {
    return defaultLocalOrigins;
  }

  const origins = rawOriginStr
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    return defaultLocalOrigins;
  }

  for (const origin of origins) {
    if (origin === '*') {
      if (nodeEnv === 'production') {
        throw new Error('Wildcard CORS origin (*) is forbidden in production.');
      }
      return ['*'];
    }

    try {
      const parsed = new URL(origin);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error(`Invalid CORS origin protocol in "${origin}". Only http and https are allowed.`);
      }
      if (parsed.pathname !== '' && parsed.pathname !== '/') {
        throw new Error(`CORS origin "${origin}" must not contain a path component.`);
      }
    } catch (err) {
      throw new Error(`Invalid CORS origin "${origin}": ${err.message}`);
    }
  }

  // In development, preserve standard localhost origins alongside custom configured ones
  if (nodeEnv === 'development') {
    for (const localOrigin of defaultLocalOrigins) {
      if (!origins.includes(localOrigin)) {
        origins.push(localOrigin);
      }
    }
  }

  return origins;
}

/**
 * Parses reverse proxy trust configuration.
 * For Render, trusting 1 hop enables accurate client IP resolution from X-Forwarded-For
 * while preventing client IP spoofing attacks.
 *
 * @param {string|undefined} rawTrust - Configured TRUST_PROXY value
 * @param {string} nodeEnv - Environment mode
 * @returns {number|boolean} Trust proxy setting for Express
 */
function parseTrustProxy(rawTrust, nodeEnv = 'development') {
  if (rawTrust !== undefined && rawTrust !== '') {
    const trimmed = rawTrust.toString().trim().toLowerCase();
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    const hops = parseInt(trimmed, 10);
    if (!isNaN(hops) && hops >= 0) {
      return hops;
    }
  }

  // Render operates with 1 reverse proxy hop in front of the container
  return nodeEnv === 'production' ? 1 : false;
}

/**
 * Parses rate limit options for write and read endpoints.
 *
 * @param {Record<string, string|undefined>} rawEnv
 * @param {string} nodeEnv
 * @returns {object} Rate limit settings
 */
function parseRateLimitConfig(rawEnv, nodeEnv) {
  const enabled = rawEnv.RATE_LIMIT_ENABLED !== 'false';
  const writeMax = parseInt(rawEnv.RATE_LIMIT_WRITE_MAX, 10) || (nodeEnv === 'test' ? 1000 : 60);
  const writeWindowMs = parseInt(rawEnv.RATE_LIMIT_WRITE_WINDOW_MS, 10) || 15 * 60 * 1000;
  const generalMax = parseInt(rawEnv.RATE_LIMIT_GENERAL_MAX, 10) || (nodeEnv === 'test' ? 5000 : 300);
  const generalWindowMs = parseInt(rawEnv.RATE_LIMIT_GENERAL_WINDOW_MS, 10) || 15 * 60 * 1000;

  return {
    enabled,
    writeMax,
    writeWindowMs,
    generalMax,
    generalWindowMs,
  };
}

/**
 * Parses and validates the media storage driver.
 * Supported values: 'local' | 'r2'
 * In development and test, defaults to 'local'.
 * In production, strictly requires 'r2' and rejects missing driver or 'local'.
 *
 * @param {Record<string, string|undefined>} rawEnv
 * @param {string} nodeEnv
 * @returns {'local' | 'r2'}
 */
function parseMediaStorageDriver(rawEnv = process.env, nodeEnv = 'development') {
  const rawDriver = rawEnv.MEDIA_STORAGE_DRIVER;
  const isProduction = nodeEnv === 'production';

  if (!rawDriver || rawDriver.trim() === '') {
    if (isProduction) {
      throw new Error(
        'Missing MEDIA_STORAGE_DRIVER in production. Production requires "MEDIA_STORAGE_DRIVER=r2". Local disk storage is prohibited in production.'
      );
    }
    return 'local';
  }

  const normalized = rawDriver.trim().toLowerCase();
  if (normalized === 'local') {
    if (isProduction) {
      throw new Error(
        'In production, MEDIA_STORAGE_DRIVER cannot be "local". Production requires durable cloud storage ("MEDIA_STORAGE_DRIVER=r2") because local container storage is ephemeral.'
      );
    }
    return 'local';
  }
  if (normalized === 'r2') {
    return 'r2';
  }

  throw new Error(
    `Invalid MEDIA_STORAGE_DRIVER: "${rawDriver}". Supported drivers are "local" and "r2".`
  );
}

/**
 * Validates and normalizes Cloudflare R2 object storage credentials and configuration.
 * Fails fast with descriptive errors if any required variables are missing or invalid.
 * Never leaks secret keys or access keys in error messages.
 *
 * @param {Record<string, string|undefined>} rawEnv
 * @param {string} [nodeEnv]
 * @returns {{ accountId: string, accessKeyId: string, secretAccessKey: string, bucketName: string, publicBaseUrl: string, endpoint: string, region: string }}
 */
function parseR2Config(rawEnv = process.env, nodeEnv = rawEnv.NODE_ENV || 'development') {
  const accountId = rawEnv.R2_ACCOUNT_ID ? rawEnv.R2_ACCOUNT_ID.trim() : '';
  const accessKeyId = rawEnv.R2_ACCESS_KEY_ID ? rawEnv.R2_ACCESS_KEY_ID.trim() : '';
  const secretAccessKey = rawEnv.R2_SECRET_ACCESS_KEY ? rawEnv.R2_SECRET_ACCESS_KEY.trim() : '';
  const bucketName = rawEnv.R2_BUCKET_NAME ? rawEnv.R2_BUCKET_NAME.trim() : '';
  const rawPublicUrl = rawEnv.R2_PUBLIC_BASE_URL ? rawEnv.R2_PUBLIC_BASE_URL.trim() : '';

  const missing = [];
  if (!accountId) missing.push('R2_ACCOUNT_ID');
  if (!accessKeyId) missing.push('R2_ACCESS_KEY_ID');
  if (!secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
  if (!bucketName) missing.push('R2_BUCKET_NAME');
  if (!rawPublicUrl) missing.push('R2_PUBLIC_BASE_URL');

  if (missing.length > 0) {
    throw new Error(
      `R2 configuration error: Missing required environment variable(s): ${missing.join(', ')}.`
    );
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawPublicUrl);
  } catch (_e) {
    throw new Error('R2 configuration error: R2_PUBLIC_BASE_URL must be a valid HTTP or HTTPS URL.');
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('R2 configuration error: R2_PUBLIC_BASE_URL protocol must be "http:" or "https:".');
  }

  if (nodeEnv === 'production' && parsedUrl.protocol !== 'https:') {
    throw new Error('R2 configuration error: In production, R2_PUBLIC_BASE_URL must use the "https:" protocol.');
  }

  if (!parsedUrl.hostname || parsedUrl.hostname.trim() === '') {
    throw new Error('R2 configuration error: R2_PUBLIC_BASE_URL must contain a valid hostname.');
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('R2 configuration error: R2_PUBLIC_BASE_URL cannot contain embedded credentials (username or password).');
  }

  if (parsedUrl.search && parsedUrl.search !== '') {
    throw new Error('R2 configuration error: R2_PUBLIC_BASE_URL must not contain query parameters.');
  }

  if (parsedUrl.hash && parsedUrl.hash !== '') {
    throw new Error('R2 configuration error: R2_PUBLIC_BASE_URL must not contain a URL hash/fragment.');
  }

  // Strip trailing slashes to guarantee clean concatenation: ${publicBaseUrl}/${key}
  const publicBaseUrl = rawPublicUrl.replace(/\/+$/, '');
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const region = 'auto';

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicBaseUrl,
    endpoint,
    region,
  };
}

/**
 * Parses and validates the complete environment configuration.
 *
 * @param {Record<string, string|undefined>} rawEnv - Environment variables map (defaults to process.env)
 * @returns {object} Normalized, validated environment configuration
 */
function parseAndValidateEnv(rawEnv = process.env) {
  const nodeEnv = rawEnv.NODE_ENV || 'development';
  const port = parseInt(rawEnv.PORT, 10) || 5000;
  const host = rawEnv.HOST || '0.0.0.0';
  const corsOrigin = rawEnv.CORS_ORIGIN || 'http://localhost:5173';
  const corsOrigins = parseCorsOrigins(rawEnv.CORS_ORIGIN, nodeEnv);
  const trustProxy = parseTrustProxy(rawEnv.TRUST_PROXY, nodeEnv);
  const rateLimit = parseRateLimitConfig(rawEnv, nodeEnv);
  const bodyLimit = rawEnv.BODY_LIMIT || '10kb';

  const dbConfig = validateDatabaseConfig(rawEnv);

  const mediaStorageDriver = parseMediaStorageDriver(rawEnv, nodeEnv);
  const r2Config = mediaStorageDriver === 'r2' ? parseR2Config(rawEnv, nodeEnv) : null;

  return {
    port,
    host,
    nodeEnv,
    corsOrigin,
    corsOrigins,
    trustProxy,
    rateLimit,
    bodyLimit,
    mediaStorageDriver,
    r2Config,
    ...dbConfig,
    parseDatabaseUrl,
    validateDatabaseConfig,
    parseCorsOrigins,
    parseTrustProxy,
    parseRateLimitConfig,
    parseMediaStorageDriver,
    parseR2Config,
    parseAndValidateEnv,
  };
}

// Evaluate runtime environment
const env = parseAndValidateEnv(process.env);

module.exports = env;
