import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../..');

describe('Session Expiry & Lifecycle Policy Consistency (Phase 5F-A3.1)', () => {
  it('backend session.service.js defines 7-day absolute lifetime and 2-hour idle timeout', () => {
    const sessionServicePath = path.join(ROOT_DIR, 'server/src/services/session.service.js');
    expect(fs.existsSync(sessionServicePath)).toBe(true);

    const content = fs.readFileSync(sessionServicePath, 'utf8');

    // 7-day hard absolute lifetime (7 * 24 * 60 * 60 * 1000)
    expect(content).toMatch(/const\s+ABSOLUTE_LIFETIME_MS\s*=\s*7\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);

    // 2-hour sliding idle timeout (2 * 60 * 60 * 1000)
    expect(content).toMatch(/const\s+IDLE_TIMEOUT_MS\s*=\s*2\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);

    // 5-minute sliding refresh throttle (5 * 60 * 1000)
    expect(content).toMatch(/const\s+REFRESH_THROTTLE_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
  });

  it('backend cookieHelper.js defines 7-day Max-Age matching absolute lifetime', () => {
    const cookieHelperPath = path.join(ROOT_DIR, 'server/src/utils/cookieHelper.js');
    expect(fs.existsSync(cookieHelperPath)).toBe(true);

    const content = fs.readFileSync(cookieHelperPath, 'utf8');

    // 7 days in seconds: 7 * 24 * 60 * 60 = 604800 seconds
    expect(content).toMatch(/const\s+SESSION_MAX_AGE_SECONDS\s*=\s*7\s*\*\s*24\s*\*\s*60\s*\*\s*60/);
  });

  it('cookie Max-Age and database absolute lifetime mathematically agree', () => {
    const absoluteLifetimeMs = 7 * 24 * 60 * 60 * 1000;
    const sessionMaxAgeSeconds = 7 * 24 * 60 * 60;

    expect(absoluteLifetimeMs / 1000).toBe(sessionMaxAgeSeconds);
    expect(sessionMaxAgeSeconds).toBe(604800);
  });

  it('documentation contains zero outdated 24-hour absolute session assertions', () => {
    const docFiles = [
      path.join(ROOT_DIR, 'README.md'),
      path.join(ROOT_DIR, 'docs/ARCHITECTURE.md'),
      path.join(ROOT_DIR, 'docs/TESTING_GUIDE.md'),
      path.join(ROOT_DIR, 'docs/NAMLATIC_HOTEL_PROJECT_INTERVIEW_GUIDE.md'),
    ];

    for (const filePath of docFiles) {
      if (fs.existsSync(filePath)) {
        const text = fs.readFileSync(filePath, 'utf8');
        // Must not assert 24-hour absolute session expiry or lifetime
        expect(text).not.toMatch(/24[\s-]hour\s+(?:absolute\s+)?(?:session\s+)?(?:expiry|lifetime)/i);
        expect(text).not.toMatch(/(?:absolute\s+session\s+(?:lifetime|expiry)|session\s+absolute\s+(?:lifetime|expiry)).*24[\s-]hour/i);
      }
    }
  });

  it('documentation explicitly asserts the 7-day absolute lifetime and 2-hour idle timeout', () => {
    const archDoc = path.join(ROOT_DIR, 'docs/ARCHITECTURE.md');
    expect(fs.existsSync(archDoc)).toBe(true);
    const archContent = fs.readFileSync(archDoc, 'utf8');

    expect(archContent).toMatch(/7\s*days/i);
    expect(archContent).toMatch(/2\s*hours/i);
    expect(archContent).toMatch(/5\s*minutes/i);
  });
});
