import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.resolve(__dirname, '../../docs/screenshots/phase3');
const ARTIFACT_DIR = 'C:/Users/ELANGO/.gemini/antigravity/brain/2c8b7069-505b-4464-9e06-9427c75bd5ac/screenshots/phase3';

[DOCS_DIR, ARTIFACT_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const VIEWPORTS = [
  { width: 360, height: 800, category: 'mobile', name: '360px (Mobile Small)', file: 'detail-mobile-360.png' },
  { width: 390, height: 844, category: 'mobile', name: '390px (Mobile Standard)', file: 'detail-mobile-390.png' },
  { width: 768, height: 1024, category: 'tablet', name: '768px (Tablet Portrait)', file: 'detail-tablet-768.png' },
  { width: 1024, height: 768, category: 'tablet', name: '1024px (Tablet Landscape)', file: 'detail-tablet-1024.png' },
  { width: 1366, height: 768, category: 'desktop', name: '1366px (Laptop HD)', file: 'detail-desktop-1366.png' },
  { width: 1920, height: 1080, category: 'desktop', name: '1920px (Desktop Wide FHD)', file: 'detail-desktop-1920.png' },
];

const mockHotel71 = {
  id: 71,
  title: 'Grand Namlatic Luxury Resort & Spa',
  description: 'An exquisite 5-star beachfront retreat in the heart of Abu Dhabi offering panoramic sea views, fine dining restaurants, Olympic-size infinity pools, and exclusive private beach access.',
  price: '850.00',
  latitude: '24.453884',
  longitude: '54.377344',
  image_path: '/uploads/marina-resort.jpg',
  created_at: '2026-11-06T10:30:00.000Z',
  updated_at: '2026-11-08T14:45:00.000Z',
};

const mockHotel72 = {
  id: 72,
  title: 'Prime Meridian Oceanic Lodge',
  description: 'A scientific maritime retreat situated precisely at the intersection of the Equator and the Prime Meridian (0.0000°, 0.0000°).',
  price: '420.00',
  latitude: '0',
  longitude: '0',
  image_path: '/uploads/meridian.jpg',
  created_at: '2026-11-07T12:00:00.000Z',
  updated_at: '2026-11-09T08:15:00.000Z',
};

const mockHotel73 = {
  id: 73,
  title: 'Minimalist Urban Pods',
  description: 'Compact, automated suites designed for modern business travelers in urban centers.',
  price: '120.00',
  latitude: null,
  longitude: null,
  image_path: null,
  created_at: '2026-11-10T09:00:00.000Z',
  updated_at: null,
};

// SVG placeholder buffer for mock hotel hero images
const sampleImageSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 1200 600">
  <defs>
    <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e3a8a"/>
      <stop offset="60%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#93c5fd"/>
    </linearGradient>
    <linearGradient id="seaGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0284c7"/>
      <stop offset="100%" stop-color="#0369a1"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="380" fill="url(#skyGrad)"/>
  <rect y="380" width="1200" height="220" fill="url(#seaGrad)"/>
  <circle cx="1000" cy="120" r="60" fill="#fef08a" opacity="0.9"/>
  <!-- Modern architectural resort silhouette -->
  <polygon points="150,380 150,180 350,180 350,380" fill="#ffffff" opacity="0.95"/>
  <polygon points="320,380 320,120 580,120 580,380" fill="#f8fafc" opacity="0.98"/>
  <polygon points="560,380 560,220 720,220 720,380" fill="#e2e8f0" opacity="0.95"/>
  <!-- Windows -->
  <g fill="#0284c7" opacity="0.7">
    <rect x="340" y="140" width="40" height="30" rx="2"/>
    <rect x="400" y="140" width="40" height="30" rx="2"/>
    <rect x="460" y="140" width="40" height="30" rx="2"/>
    <rect x="520" y="140" width="40" height="30" rx="2"/>
    <rect x="340" y="190" width="40" height="30" rx="2"/>
    <rect x="400" y="190" width="40" height="30" rx="2"/>
    <rect x="460" y="190" width="40" height="30" rx="2"/>
    <rect x="520" y="190" width="40" height="30" rx="2"/>
    <rect x="340" y="240" width="40" height="30" rx="2"/>
    <rect x="400" y="240" width="40" height="30" rx="2"/>
    <rect x="460" y="240" width="40" height="30" rx="2"/>
    <rect x="520" y="240" width="40" height="30" rx="2"/>
  </g>
  <text x="600" y="550" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="600" fill="#ffffff" text-anchor="middle">
    Namlatic Luxury Resort &amp; Spa • Abu Dhabi Waterfront
  </text>
</svg>
`;

function saveScreenshot(sourceBuffer, filename) {
  const docsPath = path.join(DOCS_DIR, filename);
  fs.writeFileSync(docsPath, sourceBuffer);
  const artifactPath = path.join(ARTIFACT_DIR, filename);
  fs.writeFileSync(artifactPath, sourceBuffer);
  console.log(`Saved screenshot: ${filename}`);
}

async function run() {
  console.log('1. Starting isolated Vite dev server for Phase 3 capture...');
  const server = await createServer({
    root: path.resolve(__dirname, '..'),
    server: { port: 5175 },
  });
  await server.listen();
  console.log('Vite listening at http://localhost:5175');

  console.log('2. Launching browser (msedge channel)...');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const matrix = [];

  try {
    const setupInterceptions = async (page) => {
      // Mock session
      await page.route('**/api/auth/me', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ user: { id: 1, email: 'owner@namlatic.com', role: 'owner' } }),
        });
      });

      await page.route('**/api/ready', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ready' }),
        });
      });

      // Mock mock image
      await page.route('**/uploads/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'image/svg+xml',
          body: sampleImageSvg,
        });
      });

      // Mock individual hotel endpoints
      await page.route('**/api/hotels/71', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: mockHotel71 }),
        });
      });

      await page.route('**/api/hotels/72', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: mockHotel72 }),
        });
      });

      await page.route('**/api/hotels/73', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: mockHotel73 }),
        });
      });

      await page.route('**/api/hotels/999', async (route) => {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'error', statusCode: 404, message: 'Hotel not found with ID 999' }),
        });
      });
    };

    // ─── 1. Target Breakpoints: Standard Hotel (71) ───
    for (const vp of VIEWPORTS) {
      console.log(`Testing viewport: ${vp.name} (${vp.width}x${vp.height})...`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
      });

      const page = await context.newPage();
      await setupInterceptions(page);

      await page.goto('http://localhost:5175/hotels/71', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="hotel-details-content"]', { timeout: 15000 });

      // Wait for Leaflet tiles/map layout
      await page.waitForTimeout(1200);

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      const buffer = await page.screenshot({ fullPage: true });
      saveScreenshot(buffer, vp.file);

      // On 1920px desktop wide, also test clicking Leaflet marker icon
      if (vp.width === 1920) {
        try {
          const markerSelector = '.leaflet-marker-icon';
          await page.waitForSelector(markerSelector, { timeout: 5000 });
          await page.click(markerSelector);
          await page.waitForTimeout(500); // allow popup fade-in
          const markerBuffer = await page.screenshot({ fullPage: true });
          saveScreenshot(markerBuffer, 'detail-map-marker-1920.png');
          console.log('Saved screenshot: detail-map-marker-1920.png');
        } catch (e) {
          console.warn('Marker click warning:', e.message);
        }
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

    // ─── 2. Zero Coordinates (Hotel 72: 0, 0) ───
    console.log('Capturing Zero Coordinates State (Hotel 72)...');
    {
      const context = await browser.newContext({
        viewport: { width: 1366, height: 768 },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      await setupInterceptions(page);

      await page.goto('http://localhost:5175/hotels/72', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="hotel-details-content"]', { timeout: 10000 });
      await page.waitForTimeout(1000);

      const buffer = await page.screenshot({ fullPage: true });
      saveScreenshot(buffer, 'detail-zero-coords-1366.png');
      await context.close();
    }

    // ─── 3. Missing Image & Coordinates Fallback (Hotel 73) ───
    console.log('Capturing No-Image & Unavailable Coordinates Fallback (Hotel 73)...');
    {
      const context = await browser.newContext({
        viewport: { width: 1366, height: 768 },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      await setupInterceptions(page);

      await page.goto('http://localhost:5175/hotels/73', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="hotel-details-content"]', { timeout: 10000 });
      await page.waitForTimeout(1000);

      const buffer = await page.screenshot({ fullPage: true });
      saveScreenshot(buffer, 'detail-no-image-fallback-1366.png');
      await context.close();
    }

    // ─── 4. 404 Not Found State (Hotel 999) ───
    console.log('Capturing 404 Not Found State (Hotel 999)...');
    {
      const context = await browser.newContext({
        viewport: { width: 1366, height: 768 },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      await setupInterceptions(page);

      await page.goto('http://localhost:5175/hotels/999', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="hotel-not-found"]', { timeout: 10000 });
      await page.waitForTimeout(500);

      const buffer = await page.screenshot({ fullPage: true });
      saveScreenshot(buffer, 'detail-404-not-found-1366.png');
      await context.close();
    }

    // ─── 5. Client-Side Route Transition (71 -> 72 without reload) ───
    console.log('Testing dynamic client-side route transition (/hotels/71 -> /hotels/72)...');
    {
      const context = await browser.newContext({
        viewport: { width: 1366, height: 768 },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      await setupInterceptions(page);

      await page.goto('http://localhost:5175/hotels/71', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="hotel-details-content"]', { timeout: 10000 });
      await page.waitForFunction(
        () => document.querySelector('.details-title')?.textContent?.includes('Grand Namlatic')
      );

      // Perform SPA navigation to /hotels/72
      await page.evaluate(() => {
        window.history.pushState({}, '', '/hotels/72');
        window.dispatchEvent(new PopStateEvent('popstate'));
      });

      // Wait for Redux to fetch hotel 72 and render
      await page.waitForFunction(
        () => document.querySelector('.details-title')?.textContent?.includes('Prime Meridian')
      );
      await page.waitForTimeout(1000);

      const buffer = await page.screenshot({ fullPage: true });
      saveScreenshot(buffer, 'detail-transition-1366.png');
      console.log('Saved screenshot: detail-transition-1366.png');
      await context.close();
    }

    console.log('\n======================================================');
    console.log('       RESPONSIVE VIEWPORT TESTING RESULTS MATRIX     ');
    console.log('======================================================');
    console.table(matrix);

    const hasFailure = matrix.some((m) => m.status !== 'PASSED');
    if (hasFailure) {
      console.error('ERROR: One or more viewports suffered horizontal overflow!');
      process.exitCode = 1;
    } else {
      console.log('SUCCESS: All target viewports passed zero-horizontal-overflow verification!');
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

run().catch((err) => {
  console.error('Fatal error running capture_phase3:', err);
  process.exit(1);
});
