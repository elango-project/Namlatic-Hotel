import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolves the backend proxy secret for local development reverse proxying.
 * Checked in order:
 * 1. Process environment (process.env.BACKEND_PROXY_SECRET)
 * 2. Client environment files (.env.local, .env.development.local, etc.)
 * 3. Server environment file (../server/.env)
 *
 * NOTE: The secret is read strictly on the Vite dev server (Node.js runtime)
 * and is NEVER prefixed with VITE_ or exposed to client-side browser bundles.
 *
 * @param {string} mode - Vite mode ('development' | 'production' | 'test')
 * @returns {string} The proxy secret or empty string if not configured
 */
function resolveDevProxySecret(mode) {
  if (process.env.BACKEND_PROXY_SECRET && process.env.BACKEND_PROXY_SECRET.trim()) {
    return process.env.BACKEND_PROXY_SECRET.trim();
  }

  const clientEnv = loadEnv(mode, process.cwd(), '');
  if (clientEnv.BACKEND_PROXY_SECRET && clientEnv.BACKEND_PROXY_SECRET.trim()) {
    return clientEnv.BACKEND_PROXY_SECRET.trim();
  }

  const serverEnvPath = path.resolve(__dirname, '../server/.env');
  if (fs.existsSync(serverEnvPath)) {
    try {
      const serverEnvContent = fs.readFileSync(serverEnvPath, 'utf8');
      for (const line of serverEnvContent.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const [key, ...rest] = trimmed.split('=');
        if (key.trim() === 'BACKEND_PROXY_SECRET') {
          let val = rest.join('=').trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (val) return val;
        }
      }
    } catch (_err) {
      // Ignore read errors gracefully
    }
  }

  return '';
}

export default defineConfig(({ mode }) => {
  const proxySecret = resolveDevProxySecret(mode);

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
          headers: proxySecret ? { 'x-vercel-proxy-secret': proxySecret } : {},
          configure: (proxy) => {
            if (proxySecret) {
              proxy.on('proxyReq', (proxyReq) => {
                proxyReq.setHeader('x-vercel-proxy-secret', proxySecret);
              });
            }
          },
        },
        '/uploads': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.js',
    },
  };
});
