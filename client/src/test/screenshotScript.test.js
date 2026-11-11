import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_PATH = path.resolve(__dirname, '../../capture-login-screenshots.js');

describe('Screenshot Script Portability (Phase 5F-A3.1)', () => {
  it('script file exists in client directory', () => {
    expect(fs.existsSync(SCRIPT_PATH)).toBe(true);
  });

  it('contains zero hardcoded user or personal Windows directory paths', () => {
    const content = fs.readFileSync(SCRIPT_PATH, 'utf8');

    // Must not contain user-specific C:\Users\... paths
    expect(content).not.toMatch(/C:\\Users\\/i);
    expect(content).not.toMatch(/\/Users\//i);
    expect(content).not.toMatch(/ELANGO/i);
  });

  it('uses project-relative default output directory for screenshots', () => {
    const content = fs.readFileSync(SCRIPT_PATH, 'utf8');

    // Defaults to docs/screenshots/phase5f-a3 using path.resolve(__dirname, ...)
    expect(content).toMatch(/path\.resolve\(__dirname,\s*['"]\.\.\/docs\/screenshots\/phase5f-a3['"]\)/);
  });

  it('supports browser executable override via environment variables', () => {
    const content = fs.readFileSync(SCRIPT_PATH, 'utf8');

    expect(content).toMatch(/process\.env\.PLAYWRIGHT_CHROME_PATH/);
    expect(content).toMatch(/process\.env\.CHROME_PATH/);
    expect(content).toMatch(/process\.env\.BROWSER_EXECUTABLE_PATH/);
  });

  it('supports default Playwright browser resolution when no override is set', () => {
    const content = fs.readFileSync(SCRIPT_PATH, 'utf8');

    // Logs and uses default resolution
    expect(content).toMatch(/Using default Playwright browser resolution/);
    expect(content).toMatch(/chromium\.launch\(launchOptions\)/);
  });

  it('supports optional secondary artifact directory through environment variable', () => {
    const content = fs.readFileSync(SCRIPT_PATH, 'utf8');

    expect(content).toMatch(/process\.env\.ARTIFACT_SCREENSHOT_DIR/);
  });
});
