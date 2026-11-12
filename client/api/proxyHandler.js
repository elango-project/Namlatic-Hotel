import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

/**
 * Hop-by-hop headers that must NOT be forwarded by proxies according to RFC 7230 / RFC 2616.
 */
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
]);

/**
 * Validates and normalizes the backend origin URL.
 * Fails closed if the origin is missing, invalid, contains embedded credentials,
 * or fails to use HTTPS in production.
 *
 * @param {string} [rawOrigin=process.env.BACKEND_ORIGIN]
 * @param {string} [nodeEnv=process.env.NODE_ENV]
 * @returns {string} Normalized origin (e.g. 'https://namlatic-hotel-backend.onrender.com')
 */
export function validateBackendOrigin(
  rawOrigin,
  nodeEnv = process.env.NODE_ENV || 'development'
) {
  const candidate = rawOrigin !== undefined ? rawOrigin : process.env.BACKEND_ORIGIN;

  if (!candidate || typeof candidate !== 'string' || !candidate.trim()) {
    throw new Error('BACKEND_ORIGIN environment variable is required and cannot be empty.');
  }

  let parsed;
  try {
    parsed = new URL(candidate.trim());
  } catch (_err) {
    throw new Error('BACKEND_ORIGIN must be a valid absolute URL.');
  }

  const isProduction = nodeEnv === 'production';
  if (isProduction && parsed.protocol !== 'https:') {
    throw new Error('In production, BACKEND_ORIGIN must use the "https:" protocol.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('BACKEND_ORIGIN protocol must be "http:" or "https:".');
  }

  if (!parsed.hostname || !parsed.hostname.trim()) {
    throw new Error('BACKEND_ORIGIN must contain a valid hostname.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('BACKEND_ORIGIN must not contain embedded credentials (username or password).');
  }

  return parsed.origin;
}

/**
 * Normalizes incoming request paths to ensure they target the backend /api prefix.
 * Handles path reconstruction whether routed directly, via catch-all rewrites (__path query),
 * or dynamic router conventions.
 * Preserves query parameters and subpaths reliably.
 *
 * @param {string} [reqUrl='/api']
 * @param {object} [reqQuery={}]
 * @returns {string} Normalized path with query (e.g. '/api/hotels?minPrice=100')
 */
export function resolveTargetPath(reqUrl = '/api', reqQuery = {}) {
  let rawUrl = (reqUrl || '').trim();
  if (!rawUrl) rawUrl = '/api';
  if (!rawUrl.startsWith('/')) rawUrl = '/' + rawUrl;

  const dummyOrigin = 'http://localhost';
  let parsed;
  try {
    parsed = new URL(rawUrl, dummyOrigin);
  } catch (_e) {
    parsed = new URL('/api', dummyOrigin);
  }

  const searchParams = new URLSearchParams(parsed.search);

  // Extract subpath from __path or path query parameters (from Vercel rewrites or Next-style query)
  let subPath = '';
  if (searchParams.has('__path')) {
    subPath = searchParams.get('__path') || '';
    searchParams.delete('__path');
  } else if (reqQuery && reqQuery.__path) {
    subPath = reqQuery.__path;
  } else if (reqQuery && reqQuery.path) {
    if (Array.isArray(reqQuery.path)) {
      subPath = reqQuery.path.join('/');
    } else if (typeof reqQuery.path === 'string') {
      subPath = reqQuery.path;
    }
  }

  const basePath = parsed.pathname;
  let targetPath;

  if (subPath) {
    const cleanSubPath = subPath.startsWith('/') ? subPath : `/${subPath}`;
    targetPath = `/api${cleanSubPath}`;
  } else if (basePath === '/api/index.js' || basePath === '/api/index') {
    targetPath = '/api';
  } else if (basePath.startsWith('/api/') || basePath === '/api') {
    targetPath = basePath;
  } else {
    targetPath = basePath === '/' ? '/api' : `/api${basePath}`;
  }

  const qs = searchParams.toString();
  return qs ? `${targetPath}?${qs}` : targetPath;
}

/**
 * Builds safe forward request headers, dropping hop-by-hop headers,
 * overriding the Host header to match the backend origin, and injecting
 * the authentic server-side proxy secret.
 *
 * @param {Record<string, string|string[]>} incomingHeaders
 * @param {URL} targetUrl
 * @param {string} proxySecret
 * @returns {Record<string, string|string[]>}
 */
export function buildForwardHeaders(incomingHeaders = {}, targetUrl, proxySecret) {
  const headers = {};

  for (const [key, value] of Object.entries(incomingHeaders)) {
    const lowerKey = key.toLowerCase();

    // Drop hop-by-hop headers
    if (HOP_BY_HOP_HEADERS.has(lowerKey)) {
      continue;
    }

    // Drop client-supplied proxy secrets (prevent spoofing)
    if (lowerKey === 'x-vercel-proxy-secret') {
      continue;
    }

    headers[lowerKey] = value;
  }

  // Overwrite host with the actual target host
  headers['host'] = targetUrl.host;

  // Inject the server-side proxy secret
  if (proxySecret) {
    headers['x-vercel-proxy-secret'] = proxySecret;
  }

  // Preserve or establish forwarding metadata
  if (!headers['x-forwarded-proto']) {
    headers['x-forwarded-proto'] = 'https';
  }

  if (incomingHeaders['host'] && !headers['x-forwarded-host']) {
    headers['x-forwarded-host'] = incomingHeaders['host'];
  }

  return headers;
}

/**
 * Vercel Serverless Function configuration.
 * - Disables default body parsing so multipart uploads and JSON bodies stream unbuffered.
 * - Configures maximum execution duration for Render cold-starts.
 */
export const config = {
  maxDuration: 60,
  api: {
    bodyParser: false,
  },
};

/**
 * Main Vercel Serverless API Proxy Handler.
 * Transparently proxies /api/* requests to the Render backend while injecting
 * BACKEND_PROXY_SECRET and maintaining full cookie, streaming, and error integrity.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @returns {Promise<void>}
 */
export function proxyHandler(req, res) {
  return new Promise((resolve) => {
    // 1. Verify proxy secret is configured on the server
    const proxySecret = process.env.BACKEND_PROXY_SECRET
      ? process.env.BACKEND_PROXY_SECRET.trim()
      : '';

    if (!proxySecret) {
      res.writeHead(500, {
        'content-type': 'application/json',
        'cache-control': 'private, no-store, no-cache, max-age=0, must-revalidate',
      });
      res.end(
        JSON.stringify({
          status: 'error',
          statusCode: 500,
          message: 'Server proxy configuration error: BACKEND_PROXY_SECRET is not configured.',
        })
      );
      resolve();
      return;
    }

    // 2. Validate backend origin URL
    let backendOrigin;
    try {
      backendOrigin = validateBackendOrigin(
        process.env.BACKEND_ORIGIN,
        process.env.NODE_ENV || 'development'
      );
    } catch (err) {
      res.writeHead(500, {
        'content-type': 'application/json',
        'cache-control': 'private, no-store, no-cache, max-age=0, must-revalidate',
      });
      res.end(
        JSON.stringify({
          status: 'error',
          statusCode: 500,
          message: `Server proxy configuration error: ${err.message}`,
        })
      );
      resolve();
      return;
    }

    // 3. Resolve target URL
    const targetPath = resolveTargetPath(req.url, req.query);
    const targetUrl = new URL(targetPath, backendOrigin);

    // 4. Select HTTP or HTTPS client based on target protocol
    const httpModule = targetUrl.protocol === 'http:' ? http : https;
    const forwardHeaders = buildForwardHeaders(req.headers, targetUrl, proxySecret);

    const requestOptions = {
      method: req.method || 'GET',
      headers: forwardHeaders,
      timeout: 55000, // 55s timeout to handle Render cold-start wakeups
    };

    const upstreamReq = httpModule.request(targetUrl, requestOptions, (upstreamRes) => {
      const responseHeaders = {};

      for (const [key, value] of Object.entries(upstreamRes.headers)) {
        const lowerKey = key.toLowerCase();
        if (HOP_BY_HOP_HEADERS.has(lowerKey)) {
          continue;
        }
        responseHeaders[key] = value;
      }

      // Guarantee no-store caching on all API responses
      responseHeaders['cache-control'] =
        'private, no-store, no-cache, max-age=0, must-revalidate';

      res.writeHead(upstreamRes.statusCode || 200, responseHeaders);

      upstreamRes.pipe(res);

      upstreamRes.on('end', () => {
        resolve();
      });

      upstreamRes.on('error', (streamErr) => {
        if (!res.headersSent) {
          res.writeHead(502, {
            'content-type': 'application/json',
            'cache-control': 'private, no-store, no-cache, max-age=0, must-revalidate',
          });
          res.end(
            JSON.stringify({
              status: 'error',
              statusCode: 502,
              message: `Upstream response stream error: ${streamErr.message}`,
            })
          );
        }
        resolve();
      });
    });

    upstreamReq.on('timeout', () => {
      upstreamReq.destroy(new Error('Gateway Timeout'));
      if (!res.headersSent) {
        res.writeHead(504, {
          'content-type': 'application/json',
          'cache-control': 'private, no-store, no-cache, max-age=0, must-revalidate',
        });
        res.end(
          JSON.stringify({
            status: 'error',
            statusCode: 504,
            message: 'Backend request timed out.',
          })
        );
      }
      resolve();
    });

    upstreamReq.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502, {
          'content-type': 'application/json',
          'cache-control': 'private, no-store, no-cache, max-age=0, must-revalidate',
        });
        res.end(
          JSON.stringify({
            status: 'error',
            statusCode: 502,
            message: `Backend service unavailable: ${err.message}`,
          })
        );
      }
      resolve();
    });

    // Handle client disconnect or abort
    req.on('close', () => {
      if (!upstreamReq.destroyed && !upstreamReq.writableEnded) {
        upstreamReq.destroy();
      }
      resolve();
    });

    // 5. Forward request body: pipe unparsed stream, or write existing buffered body
    if (req.readable && !req.readableEnded) {
      req.pipe(upstreamReq);
    } else if (req.body !== undefined && req.body !== null) {
      if (Buffer.isBuffer(req.body) || typeof req.body === 'string') {
        upstreamReq.end(req.body);
      } else {
        upstreamReq.end(JSON.stringify(req.body));
      }
    } else {
      upstreamReq.end();
    }
  });
}

export default proxyHandler;
