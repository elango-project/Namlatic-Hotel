import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Vercel Configuration & Frontend Deployment Readiness (Phase 5E)', () => {
  const clientDir = path.resolve(__dirname, '../..');
  const projectRootDir = path.resolve(clientDir, '..');
  const vercelJsonPath = path.resolve(clientDir, 'vercel.json');
  const rootVercelJsonPath = path.resolve(projectRootDir, 'vercel.json');
  const envExamplePath = path.resolve(clientDir, '.env.example');
  const gitignorePath = path.resolve(projectRootDir, '.gitignore');

  it('1. client/vercel.json exists in the client directory and is valid JSON', () => {
    expect(fs.existsSync(vercelJsonPath)).toBe(true);

    const rawContent = fs.readFileSync(vercelJsonPath, 'utf-8');
    let parsed;
    expect(() => {
      parsed = JSON.parse(rawContent);
    }).not.toThrow();

    expect(typeof parsed).toBe('object');
    expect(parsed).not.toBeNull();
  });

  it('2. no duplicate or conflicting vercel.json exists at repository root', () => {
    // When Vercel root directory is set to 'client', vercel.json must only reside in client/
    expect(fs.existsSync(rootVercelJsonPath)).toBe(false);
  });

  it('3. client/vercel.json references the official Vercel schema', () => {
    const config = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
    expect(config.$schema).toBe('https://openapi.vercel.sh/vercel.json');
  });

  it('4. configures Vite SPA route fallback rewrite for non-API routes', () => {
    const config = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
    expect(Array.isArray(config.rewrites)).toBe(true);
    expect(config.rewrites.length).toBeGreaterThanOrEqual(1);

    const spaRewrite = config.rewrites.find(
      (r) => r.destination === '/index.html'
    );
    expect(spaRewrite).toBeDefined();
    expect(spaRewrite.source).toMatch(/api/);
  });

  it('5. configures baseline security headers for all routes (/(.*))', () => {
    const config = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
    expect(Array.isArray(config.headers)).toBe(true);

    const wildcardHeaderEntry = config.headers.find((h) => h.source === '/(.*)');
    expect(wildcardHeaderEntry).toBeDefined();
    expect(Array.isArray(wildcardHeaderEntry.headers)).toBe(true);
  });

  it('6. verifies all mandatory security headers and their exact values', () => {
    const config = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
    const wildcardHeaderEntry = config.headers.find((h) => h.source === '/(.*)');
    const headerMap = {};
    for (const item of wildcardHeaderEntry.headers) {
      headerMap[item.key.toLowerCase()] = item.value;
    }

    // X-Content-Type-Options: nosniff
    expect(headerMap['x-content-type-options']).toBe('nosniff');

    // Referrer-Policy: strict-origin-when-cross-origin
    expect(headerMap['referrer-policy']).toBe('strict-origin-when-cross-origin');

    // X-Frame-Options: DENY
    expect(headerMap['x-frame-options']).toBe('DENY');

    // Strict-Transport-Security: max-age=31536000
    expect(headerMap['strict-transport-security']).toBe('max-age=31536000');

    // Permissions-Policy restricting unused capabilities
    expect(headerMap['permissions-policy']).toBe(
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
    );
  });

  it('7. HSTS does not include unverified includeSubDomains or preload', () => {
    const config = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
    const wildcardHeaderEntry = config.headers.find((h) => h.source === '/(.*)');
    const hsts = wildcardHeaderEntry.headers.find(
      (h) => h.key.toLowerCase() === 'strict-transport-security'
    );

    expect(hsts).toBeDefined();
    expect(hsts.value.toLowerCase()).not.toContain('includesubdomains');
    expect(hsts.value.toLowerCase()).not.toContain('preload');
  });

  it('8. does not configure obsolete security headers (e.g. X-XSS-Protection)', () => {
    const config = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
    const wildcardHeaderEntry = config.headers.find((h) => h.source === '/(.*)');
    const headerKeys = wildcardHeaderEntry.headers.map((h) => h.key.toLowerCase());

    expect(headerKeys).not.toContain('x-xss-protection');
  });

  it('9. client/.env.example documents all variables consumed by frontend code', () => {
    expect(fs.existsSync(envExamplePath)).toBe(true);
    const envContent = fs.readFileSync(envExamplePath, 'utf-8');

    // Primary REST API URL
    expect(envContent).toContain('VITE_API_URL=');
    // API Origin for legacy relative media
    expect(envContent).toContain('VITE_API_ORIGIN=');
    // Optional display currency override
    expect(envContent).toContain('VITE_APP_CURRENCY');
  });

  it('10. client/.env.example strictly excludes backend credentials and secrets', () => {
    const envContent = fs.readFileSync(envExamplePath, 'utf-8');

    // Ensure no backend secrets are documented as frontend variables
    expect(envContent).not.toMatch(/^VITE_.*DATABASE_URL/m);
    expect(envContent).not.toMatch(/^VITE_.*PASSWORD/m);
    expect(envContent).not.toMatch(/^VITE_.*SECRET/m);
    expect(envContent).not.toMatch(/^VITE_.*R2_ACCESS_KEY/m);
    expect(envContent).not.toMatch(/^VITE_.*R2_SECRET_ACCESS_KEY/m);
  });

  it('11. root .gitignore contains .vercel/ deployment artifact exclusion', () => {
    expect(fs.existsSync(gitignorePath)).toBe(true);
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
    expect(gitignoreContent).toContain('.vercel/');
  });
});
