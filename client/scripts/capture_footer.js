import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.resolve(__dirname, '../../docs/screenshots/footer');
const ARTIFACTS_DIR = 'C:/Users/ELANGO/.gemini/antigravity/brain/2c8b7069-505b-4464-9e06-9427c75bd5ac/screenshots/footer';

[DOCS_DIR, ARTIFACTS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const VIEWPORTS = [
  { width: 1366, height: 850, name: 'desktop-1366' },
  { width: 768, height: 1024, name: 'tablet-768' },
  { width: 390, height: 844, name: 'mobile-390' },
];

async function capture() {
  console.log('1. Starting Vite dev server on port 5178...');
  const server = await createServer({
    root: path.resolve(__dirname, '..'),
    server: { port: 5178 },
  });
  await server.listen();
  console.log('✓ Vite server listening on http://localhost:5178');

  console.log('2. Launching Chromium...');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  try {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage({
        viewport: { width: vp.width, height: vp.height },
      });

      // Mock session probe
      await page.route('**/api/auth/me', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: { id: 1, email: 'owner@namlatic.com', role: 'owner' },
          }),
        });
      });

      // Mock stats and hotels
      await page.route('**/api/hotels/stats', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              totalProperties: 3,
              averagePrice: '284.50',
              minPrice: '220.00',
              maxPrice: '349.00',
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
            data: [
              {
                id: '1',
                title: 'Emerald Bay Resort & Spa',
                description: 'Beachfront luxury.',
                latitude: '25.1972',
                longitude: '55.2744',
                price: '349.00',
                image_path: '/uploads/hotels/emerald.jpg',
              },
            ],
            pagination: { total: 1, limit: 6, offset: 0, hasMore: false },
          }),
        });
      });

      await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' });

      // Verify footer presence
      const footer = page.locator('footer.app-footer');
      await footer.waitFor({ state: 'visible', timeout: 5000 });

      // Scroll to footer
      await footer.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);

      // Verify horizontal scrollbar / overflow
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth - document.documentElement.clientWidth;
      });

      console.log(`Viewport ${vp.name}: horizontal overflow = ${overflow}px`);

      const docsPath = path.join(DOCS_DIR, `footer-${vp.name}.png`);
      const artifactPath = path.join(ARTIFACTS_DIR, `footer-${vp.name}.png`);

      await page.screenshot({ path: docsPath, fullPage: false });
      await page.screenshot({ path: artifactPath, fullPage: false });
      console.log(`✓ Saved screenshot for ${vp.name}`);

      await page.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

capture().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
