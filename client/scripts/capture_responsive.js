import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCREENSHOT_DIR = path.resolve(__dirname, '../../docs/screenshots/phase4b');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

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

async function run() {
  console.log('Launching browser via Microsoft Edge channel...');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const results = [];

  // Create 1x1 dummy image for file upload demonstration
  const sampleImagePath = path.resolve(__dirname, 'sample-test-image.png');
  const dummyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  fs.writeFileSync(sampleImagePath, dummyPng);

  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2, // HiDPI crisp capture
      });
      const page = await context.newPage();

      // ─── Test 1: Create Hotel Form (/hotels/new) ───
      await page.goto('http://localhost:5173/hotels/new', { waitUntil: 'networkidle' });
      await page.waitForSelector('#hotel-title');

      // Check horizontal overflow
      const createOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      // Save key screenshots
      if (vp.width === 1440) {
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, 'create-form-desktop-1440.png'),
          fullPage: true,
        });
      } else if (vp.width === 768) {
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, 'create-form-tablet-768.png'),
          fullPage: true,
        });
      } else if (vp.width === 375) {
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, 'create-form-mobile-375.png'),
          fullPage: true,
        });
      }

      // Also on 1440 and 375, fill out form with an image preview to demonstrate image preview in action!
      if (vp.width === 1440 || vp.width === 375) {
        await page.fill('#hotel-title', 'Seaside Azure Palace');
        await page.fill('#hotel-description', 'Luxury waterfront suites with private panoramic ocean views, infinity pool, and Michelin-star Mediterranean dining.');
        await page.fill('#hotel-latitude', '24.453884');
        await page.fill('#hotel-longitude', '54.377344');
        await page.fill('#hotel-price', '285.00');

        // Select sample image
        const fileInput = await page.$('#hotel-image');
        await fileInput.setInputFiles(sampleImagePath);
        await page.waitForTimeout(400);

        const suffix = vp.width === 1440 ? 'desktop-1440' : 'mobile-375';
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `create-form-preview-${suffix}.png`),
          fullPage: true,
        });
      }

      // ─── Test 2: Edit Hotel Form (/hotels/71/edit) ───
      await page.goto('http://localhost:5173/hotels/71/edit', { waitUntil: 'networkidle' });
      await page.waitForSelector('#hotel-title');

      const editOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      if (vp.width === 1440) {
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, 'edit-form-desktop-1440.png'),
          fullPage: true,
        });
      } else if (vp.width === 768) {
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, 'edit-form-tablet-768.png'),
          fullPage: true,
        });
      } else if (vp.width === 375) {
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, 'edit-form-mobile-375.png'),
          fullPage: true,
        });
      }

      results.push({
        width: vp.width,
        name: vp.name,
        category: vp.category,
        createOverflow,
        editOverflow,
        status: !createOverflow && !editOverflow ? 'PASSED' : 'FAILED',
      });

      await context.close();
    }

    console.log('\n======================================================');
    console.log('       RESPONSIVE VIEWPORT TESTING RESULTS MATRIX     ');
    console.log('======================================================');
    console.table(results);
    console.log('All screenshots saved to:', SCREENSHOT_DIR);
  } finally {
    if (fs.existsSync(sampleImagePath)) {
      fs.unlinkSync(sampleImagePath);
    }
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Error during responsive testing:', err);
  process.exit(1);
});
