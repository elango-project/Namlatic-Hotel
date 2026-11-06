import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.resolve(__dirname, '../docs/screenshots');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function capture() {
  console.log('[CAPTURE] Launching Chromium using system Chrome...');
  const browser = await chromium.launch({
    executablePath: fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
    headless: true,
  });

  const viewports = [
    {
      name: 'desktop-dashboard',
      url: 'http://localhost:5173/',
      width: 1280,
      height: 850,
      desc: 'Desktop Dashboard Overview (1280x850)',
    },
    {
      name: 'desktop-hotels',
      url: 'http://localhost:5173/hotels',
      width: 1280,
      height: 950,
      desc: 'Desktop Hotel Properties Listing (1280x950)',
    },
    {
      name: 'tablet-hotels',
      url: 'http://localhost:5173/hotels',
      width: 768,
      height: 1024,
      desc: 'Tablet View (768x1024)',
    },
    {
      name: 'mobile-hotels',
      url: 'http://localhost:5173/hotels',
      width: 375,
      height: 812,
      desc: 'Mobile iPhone SE/13 View (375x812)',
    },
  ];

  for (const vp of viewports) {
    console.log(`[CAPTURE] Capturing ${vp.desc}...`);
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
    });

    await page.goto(vp.url, { waitUntil: 'networkidle' });
    // Wait an additional second for images and transitions
    await page.waitForTimeout(1000);

    const filePath = path.join(OUTPUT_DIR, `${vp.name}.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    console.log(`[CAPTURE] Saved: ${filePath}`);
    await page.close();
  }

  await browser.close();
  console.log('[CAPTURE] All screenshots captured successfully!');
}

capture().catch((err) => {
  console.error('[CAPTURE ERROR]', err);
  process.exit(1);
});
