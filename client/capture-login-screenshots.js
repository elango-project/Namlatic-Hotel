import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project-relative screenshot directory by default
const DOCS_DIR = process.env.SCREENSHOT_OUTPUT_DIR
  ? path.resolve(process.env.SCREENSHOT_OUTPUT_DIR)
  : path.resolve(__dirname, '../docs/screenshots/phase5f-a3');

// Optional secondary artifact directory (if configured via environment)
const ARTIFACT_DIR = process.env.ARTIFACT_SCREENSHOT_DIR
  ? path.resolve(process.env.ARTIFACT_SCREENSHOT_DIR)
  : null;

if (!fs.existsSync(DOCS_DIR)) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
}
if (ARTIFACT_DIR && !fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

// Optional browser executable path override from environment variable
const browserExecutable =
  process.env.PLAYWRIGHT_CHROME_PATH ||
  process.env.CHROME_PATH ||
  process.env.BROWSER_EXECUTABLE_PATH ||
  undefined;

async function main() {
  console.log('[SCREENSHOT] Starting in-process Vite server on port 5174...');
  const server = await createServer({
    root: path.resolve(__dirname, '.'),
    server: { port: 5174 },
  });
  await server.listen();
  console.log('[SCREENSHOT] Vite server listening at http://localhost:5174');

  console.log('[SCREENSHOT] Launching browser...');
  const launchOptions = { headless: true };
  if (browserExecutable && fs.existsSync(browserExecutable)) {
    console.log(`[SCREENSHOT] Using browser executable: ${browserExecutable}`);
    launchOptions.executablePath = browserExecutable;
  } else {
    console.log('[SCREENSHOT] Using default Playwright browser resolution');
  }

  const browser = await chromium.launch(launchOptions);

  const viewports = [
    { name: 'login-desktop-1440', width: 1440, height: 900, desc: 'Desktop 1440px' },
    { name: 'login-desktop-1280', width: 1280, height: 800, desc: 'Desktop 1280px' },
    { name: 'login-tablet-1024', width: 1024, height: 768, desc: 'Tablet 1024px' },
    { name: 'login-tablet-768', width: 768, height: 1024, desc: 'Tablet 768px' },
    { name: 'login-mobile-430', width: 430, height: 932, desc: 'Mobile iPhone 14 Pro Max 430px' },
    { name: 'login-mobile-390', width: 390, height: 844, desc: 'Mobile iPhone 12/13 390px' },
    { name: 'login-mobile-375', width: 375, height: 667, desc: 'Mobile iPhone SE 375px' },
    { name: 'login-mobile-360', width: 360, height: 740, desc: 'Mobile Android 360px' },
  ];

  for (const vp of viewports) {
    console.log(`[SCREENSHOT] Capturing ${vp.desc}...`);
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
    });

    await page.goto('http://localhost:5174/login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const docsPath = path.join(DOCS_DIR, `${vp.name}.png`);
    await page.screenshot({ path: docsPath, fullPage: false });

    if (ARTIFACT_DIR) {
      const artifactPath = path.join(ARTIFACT_DIR, `${vp.name}.png`);
      fs.copyFileSync(docsPath, artifactPath);
    }

    console.log(`[SCREENSHOT] Saved: ${docsPath}`);
    await page.close();
  }

  // Also capture validation error state on desktop 1440
  console.log('[SCREENSHOT] Capturing login validation error state...');
  const errorPage = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await errorPage.goto('http://localhost:5174/login', { waitUntil: 'networkidle' });
  await errorPage.click('button[type="submit"]');
  await errorPage.waitForTimeout(500);

  const errorDocsPath = path.join(DOCS_DIR, 'login-errors-desktop-1440.png');
  await errorPage.screenshot({ path: errorDocsPath, fullPage: false });
  if (ARTIFACT_DIR) {
    const errorArtifactPath = path.join(ARTIFACT_DIR, 'login-errors-desktop-1440.png');
    fs.copyFileSync(errorDocsPath, errorArtifactPath);
  }
  await errorPage.close();

  await browser.close();
  await server.close();
  console.log('[SCREENSHOT] Complete! All viewports captured successfully.');
}

main().catch((err) => {
  console.error('[SCREENSHOT ERROR]', err);
  process.exit(1);
});
