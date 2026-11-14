import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.resolve(__dirname, '../../docs/screenshots/phase2');
const ARTIFACT_DIR = 'C:/Users/ELANGO/.gemini/antigravity/brain/2c8b7069-505b-4464-9e06-9427c75bd5ac/screenshots/phase2';

[DOCS_DIR, ARTIFACT_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const VIEWPORTS = [
  { width: 360, height: 800, category: 'mobile', name: '360px (Small Android)' },
  { width: 390, height: 844, category: 'mobile', name: '390px (iPhone 14/15)' },
  { width: 768, height: 1024, category: 'tablet', name: '768px (iPad Mini/Portrait)' },
  { width: 1024, height: 768, category: 'tablet', name: '1024px (iPad Pro/Laptop)' },
  { width: 1366, height: 768, category: 'desktop', name: '1366px (HD Desktop)' },
  { width: 1920, height: 1080, category: 'desktop', name: '1920px (FHD Desktop)' },
];

const mockHotels = [
  {
    id: '1',
    title: 'Grand Palace Beach Resort',
    description: 'Luxury beachfront property featuring private cabanas, infinity pool, and fine dining.',
    latitude: '24.453884',
    longitude: '54.377344',
    price: '349.00',
    image_path: '/uploads/hotels/resort.jpg',
  },
  {
    id: '2',
    title: 'Azure Marina Boutique Hotel',
    description: 'Modern waterfront suites overlooking the marina promenade.',
    latitude: '25.080512',
    longitude: '55.140321',
    price: '72.74',
    image_path: '/uploads/hotels/broken-image.jpg', // will fail to load and test error fallback
  },
  {
    id: '3',
    title: 'The Grand Royal Continental Luxury Palace Beach Resort & International Spa Suites Abu Dhabi',
    description: 'An expansive luxury hospitality estate offering premier accommodations, Olympic-size heated pools, world-class conference halls, and bespoke concierge services for distinguished guests.',
    latitude: null,
    longitude: null,
    price: '1500000.00',
    image_path: null, // tests null fallback
  },
  {
    id: '4',
    title: 'Minimalist Urban Pods',
    description: '', // tests empty description fallback
    latitude: 'invalid',
    longitude: 'abc', // tests non-numeric coordinates fallback
    price: '0.00',
    image_path: null,
  },
];

function saveScreenshot(sourceBuffer, filename) {
  const docsPath = path.join(DOCS_DIR, filename);
  fs.writeFileSync(docsPath, sourceBuffer);
  const artifactPath = path.join(ARTIFACT_DIR, filename);
  fs.writeFileSync(artifactPath, sourceBuffer);
  console.log(`Saved screenshot: ${filename}`);
}

async function run() {
  console.log('1. Starting Vite dev server programmatically...');
  const server = await createServer({
    root: path.resolve(__dirname, '..'),
    server: { port: 5174 },
  });
  await server.listen();
  console.log('Vite listening at http://localhost:5174');

  console.log('2. Launching Edge / Chrome...');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const matrix = [];

  try {
    for (const vp of VIEWPORTS) {
      console.log(`Testing viewport: ${vp.name} (${vp.width}x${vp.height})...`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
      });

      const page = await context.newPage();

      // Intercept APIs to supply controlled mock data covering all edge cases
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

      await page.route('**/api/hotels/stats', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              totalProperties: 4,
              averagePrice: '375105.43',
              minPrice: '0.00',
              maxPrice: '1500000.00',
              propertiesWithImages: 2,
            },
          }),
        });
      });

      await page.route('**/api/hotels*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: mockHotels,
            pagination: { total: 4, limit: 6, offset: 0, hasMore: false },
          }),
        });
      });

      // Navigate to /hotels
      await page.goto('http://localhost:5174/hotels', { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-testid="hotels-grid"]', { timeout: 10000 });

      // Check horizontal overflow
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      // Capture screenshot
      const buffer = await page.screenshot({ fullPage: true });
      saveScreenshot(buffer, `inventory-${vp.category}-${vp.width}.png`);

      matrix.push({
        width: vp.width,
        height: vp.height,
        name: vp.name,
        category: vp.category,
        horizontalOverflow: hasHorizontalScroll,
        status: !hasHorizontalScroll ? 'PASSED' : 'FAILED',
      });

      await context.close();
    }

    console.log('\n--- Responsive Verification Matrix ---');
    console.table(matrix);

    const hasFailed = matrix.some((m) => m.status === 'FAILED');
    if (hasFailed) {
      console.error('Horizontal overflow detected in one or more viewports!');
      process.exitCode = 1;
    } else {
      console.log('All viewports passed responsive verification with 0 horizontal overflow!');
    }
  } catch (err) {
    console.error('Error during responsive capture:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
    await server.close();
    console.log('Vite server stopped.');
  }
}

run();
