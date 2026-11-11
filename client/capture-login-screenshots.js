import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.resolve(__dirname, '../docs/screenshots/phase5f-a3');
const ARTIFACT_DIR = 'C:\\Users\\ELANGO\\.gemini\\antigravity\\brain\\2c8b7069-505b-4464-9e06-9427c75bd5ac\\screenshots';

for (const dir of [DOCS_DIR, ARTIFACT_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function main() {
  console.log('[SCREENSHOT] Starting in-process Vite server on port 5174...');
  const server = await createServer({
    root: path.resolve(__dirname, '.'),
    server: { port: 5174 },
  });
  await server.listen();
  console.log('[SCREENSHOT] Vite server listening at http://localhost:5174');

  console.log('[SCREENSHOT] Launching browser...');
  const browser = await chromium.launch({
    executablePath: fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
    headless: true,
  });

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
    const artifactPath = path.join(ARTIFACT_DIR, `${vp.name}.png`);

    await page.screenshot({ path: docsPath, fullPage: false });
    fs.copyFileSync(docsPath, artifactPath);

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
  const errorArtifactPath = path.join(ARTIFACT_DIR, 'login-errors-desktop-1440.png');
  await errorPage.screenshot({ path: errorDocsPath, fullPage: false });
  fs.copyFileSync(errorDocsPath, errorArtifactPath);
  await errorPage.close();

  await browser.close();
  await server.close();
  console.log('[SCREENSHOT] Complete! All viewports captured successfully.');
}

main().catch((err) => {
  console.error('[SCREENSHOT ERROR]', err);
  process.exit(1);
});
