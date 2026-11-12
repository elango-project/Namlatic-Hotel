import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Vite Dev Proxy & Proxy Secret Injection (Local Development)', () => {
  const clientDir = path.resolve(__dirname, '../..');
  const viteConfigPath = path.resolve(clientDir, 'vite.config.js');
  const envExamplePath = path.resolve(clientDir, '.env.example');

  it('1. client/vite.config.js exists and exports a configuration function', () => {
    expect(fs.existsSync(viteConfigPath)).toBe(true);
    const content = fs.readFileSync(viteConfigPath, 'utf8');

    expect(content).toContain('export default defineConfig(');
    expect(content).toMatch(/defineConfig\(\s*\(\s*\{\s*mode\s*\}\s*\)/);
  });

  it('2. proxies /api and /uploads to backend at http://localhost:5000 with changeOrigin', () => {
    const content = fs.readFileSync(viteConfigPath, 'utf8');

    expect(content).toMatch(/['"]\/api['"]:\s*\{/);
    expect(content).toMatch(/target:\s*['"]http:\/\/localhost:5000['"]/);
    expect(content).toMatch(/changeOrigin:\s*true/);

    expect(content).toMatch(/['"]\/uploads['"]:\s*\{/);
  });

  it('3. configures header injection hook for x-vercel-proxy-secret', () => {
    const content = fs.readFileSync(viteConfigPath, 'utf8');

    expect(content).toContain('x-vercel-proxy-secret');
    expect(content).toMatch(/proxyReq\.setHeader\(\s*['"]x-vercel-proxy-secret['"]/);
  });

  it('4. reads proxy secret from process.env, client env, or server/.env server-side', () => {
    const content = fs.readFileSync(viteConfigPath, 'utf8');

    expect(content).toContain('resolveDevProxySecret');
    expect(content).toContain('BACKEND_PROXY_SECRET');
    expect(content).toContain('../server/.env');
  });

  it('5. client/.env.example strictly avoids any VITE_ proxy secret variables', () => {
    const content = fs.readFileSync(envExamplePath, 'utf8');
    expect(content).not.toMatch(/^VITE_.*PROXY_SECRET/m);
  });

  it('6. client/.env.example documents local development routing through Vite dev proxy', () => {
    const content = fs.readFileSync(envExamplePath, 'utf8');
    expect(content).toContain('VITE_API_URL=http://localhost:5173/api');
    expect(content).toContain('VITE_API_ORIGIN=http://localhost:5173');
  });
});
