import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = process.env.SCREENSHOT_OUTPUT_DIR
  ? path.resolve(process.env.SCREENSHOT_OUTPUT_DIR)
  : path.resolve(__dirname, '../../docs/screenshots/phase4c');

// Optional secondary artifact directory if configured via environment variable
const ARTIFACT_DIR = process.env.ARTIFACT_DIR
  ? path.resolve(process.env.ARTIFACT_DIR)
  : null;

const targetDirs = [DOCS_DIR];
if (ARTIFACT_DIR) {
  targetDirs.push(ARTIFACT_DIR);
}

targetDirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const VIEWPORTS = [
  { width: 360, height: 800, category: 'mobile', name: '360px (Small Android)' },
  { width: 375, height: 812, category: 'mobile', name: '375px (iPhone SE/Mini)' },
  { width: 390, height: 844, category: 'mobile', name: '390px (iPhone 14/15)' },
  { width: 430, height: 932, category: 'mobile', name: '430px (iPhone Pro Max)' },
  { width: 768, height: 1024, category: 'tablet', name: '768px (iPad Mini/Portrait)' },
  { width: 820, height: 1180, category: 'tablet', name: '820px (iPad Air)' },
  { width: 1024, height: 768, category: 'tablet', name: '1024px (iPad Pro/Small Laptop)' },
  { width: 1280, height: 800, category: 'desktop', name: '1280px (Standard Laptop)' },
  { width: 1366, height: 768, category: 'desktop', name: '1366px (HD Desktop)' },
  { width: 1440, height: 900, category: 'desktop', name: '1440px (FHD/Widescreen Desktop)' },
];

function saveScreenshot(sourceBuffer, filename) {
  const docsPath = path.join(DOCS_DIR, filename);
  fs.writeFileSync(docsPath, sourceBuffer);
  if (ARTIFACT_DIR) {
    const artifactPath = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(artifactPath, sourceBuffer);
  }
  console.log(`Saved screenshot: ${filename}`);
}

async function run() {
  console.log('Launching browser via Microsoft Edge channel...');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const matrix = [];

  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2, // Crisp HiDPI
      });
      const page = await context.newPage();

      // Navigate to existing seeded hotel (ID 66: Grand Namlatic Luxury Resort)
      await page.goto('http://localhost:5173/hotels/66', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="hotel-details-content"]', { timeout: 15000 });

      // Wait a moment for Leaflet tiles and images to settle
      await page.waitForTimeout(1500);

      // Check horizontal overflow
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      // Capture key viewports
      if (vp.width === 1440) {
        const buffer = await page.screenshot({ fullPage: true });
        saveScreenshot(buffer, 'details-desktop-1440.png');

        // Also interact with map: click marker to open popup
        try {
          const markerSelector = '.leaflet-marker-icon';
          await page.waitForSelector(markerSelector, { timeout: 5000 });
          await page.click(markerSelector);
          await page.waitForTimeout(500); // allow popup fade-in
          const markerBuffer = await page.screenshot({ fullPage: true });
          saveScreenshot(markerBuffer, 'details-map-marker-1440.png');
        } catch (e) {
          console.warn('Could not click Leaflet marker icon:', e.message);
        }
      } else if (vp.width === 768) {
        const buffer = await page.screenshot({ fullPage: true });
        saveScreenshot(buffer, 'details-tablet-768.png');
      } else if (vp.width === 375) {
        const buffer = await page.screenshot({ fullPage: true });
        saveScreenshot(buffer, 'details-mobile-375.png');
      } else if (vp.width === 360) {
        const buffer = await page.screenshot({ fullPage: true });
        saveScreenshot(buffer, 'details-mobile-360.png');
      }

      matrix.push({
        width: vp.width,
        name: vp.name,
        category: vp.category,
        horizontalOverflow: hasHorizontalScroll,
        status: !hasHorizontalScroll ? 'PASSED' : 'FAILED',
      });

      await context.close();
    }

    // Capture No-Image Fallback State (Hotel 70: Manhattan Urban Boutique Suites)
    const contextNoImage = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const pageNoImage = await contextNoImage.newPage();
    await pageNoImage.goto('http://localhost:5173/hotels/70', { waitUntil: 'domcontentloaded' });
    await pageNoImage.waitForSelector('[data-testid="hotel-details-content"]', { timeout: 10000 });
    await pageNoImage.waitForTimeout(800);
    const noImageBuffer = await pageNoImage.screenshot({ fullPage: true });
    saveScreenshot(noImageBuffer, 'details-no-image-desktop-1440.png');
    await contextNoImage.close();

    // Capture 404 Not Found State
    const context404 = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const page404 = await context404.newPage();
    await page404.goto('http://localhost:5173/hotels/99999', { waitUntil: 'domcontentloaded' });
    await page404.waitForSelector('[data-testid="hotel-not-found"]', { timeout: 10000 });
    const notFoundBuffer = await page404.screenshot({ fullPage: true });
    saveScreenshot(notFoundBuffer, 'details-404-desktop-1440.png');
    await context404.close();

    // ─── Test Dynamic Map-Center Switching Between Hotels ───
    console.log('\nTesting dynamic map-center switching without full page reload (/hotels/66 -> /hotels/67)...');
    const contextSwitch = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const pageSwitch = await contextSwitch.newPage();

    // 1. Initial hotel 66 (Grand Namlatic, Abu Dhabi: 24.453884, 54.377344)
    await pageSwitch.goto('http://localhost:5173/hotels/66', { waitUntil: 'domcontentloaded' });
    await pageSwitch.waitForSelector('[data-testid="hotel-details-content"]', { timeout: 10000 });
    await pageSwitch.waitForFunction(
      () => document.querySelector('.details-title')?.textContent?.includes('Grand Namlatic')
    );
    console.log('  Loaded Hotel 66: Grand Namlatic Luxury Resort');

    // 2. Perform client-side route transition to Hotel 67 without page reload
    await pageSwitch.evaluate(() => {
      window.history.pushState({}, '', '/hotels/67');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    // 3. Wait for Redux to fetch hotel 67 and update details
    await pageSwitch.waitForFunction(
      () => document.querySelector('.details-title')?.textContent?.includes('Azure Marina')
    );
    console.log('  Transitioned to Hotel 67: The Azure Marina Hotel');

    // Allow Leaflet map.setView animation / tile load to settle
    await pageSwitch.waitForTimeout(1000);

    // Click marker on newly centered hotel
    try {
      const markerSelector = '.leaflet-marker-icon';
      await pageSwitch.waitForSelector(markerSelector, { timeout: 5000 });
      await pageSwitch.click(markerSelector);
      await pageSwitch.waitForTimeout(400);
      const switchBuffer = await pageSwitch.screenshot({ fullPage: true });
      saveScreenshot(switchBuffer, 'details-map-transition-1440.png');
      console.log('  Captured transition screenshot with active marker popup on Hotel 67');
    } catch (e) {
      console.warn('Could not click Leaflet marker on Hotel 67:', e.message);
    }
    await contextSwitch.close();

    console.log('\n======================================================');
    console.log('       RESPONSIVE VIEWPORT TESTING RESULTS MATRIX     ');
    console.log('======================================================');
    console.table(matrix);
    console.log('All screenshots saved successfully.');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Error during responsive testing:', err);
  process.exit(1);
});
