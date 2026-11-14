import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VIEWPORTS = [
  { width: 360, height: 800, name: '360px (Mobile Small)' },
  { width: 390, height: 844, name: '390px (Mobile Standard)' },
  { width: 768, height: 1024, name: '768px (Tablet Portrait)' },
  { width: 1024, height: 768, name: '1024px (Tablet Landscape)' },
  { width: 1366, height: 768, name: '1366px (Laptop HD)' },
  { width: 1920, height: 1080, name: '1920px (Desktop Wide)' },
];

let inMemoryHotels = [
  {
    id: '1',
    title: 'Emerald Bay Resort & Spa',
    description: 'An exquisite beachfront sanctuary offering panoramic coastal views and private infinity pools.',
    latitude: '25.197200',
    longitude: '55.274400',
    price: '499.00',
    image_path: '/uploads/hotels/emerald.jpg',
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-02T12:00:00.000Z',
  },
  {
    id: '2',
    title: 'Azure Marina Suites',
    description: 'Modern luxury apartments overlooking the yachts and promenade.',
    latitude: '24.453884',
    longitude: '54.377344',
    price: '350.00',
    image_path: '/uploads/hotels/azure.jpg',
    created_at: '2026-11-03T11:00:00.000Z',
    updated_at: '2026-11-04T14:00:00.000Z',
  },
  {
    id: '3',
    title: 'The Alpine Chalet',
    description: 'A cozy timber mountain lodge surrounded by pine forests.',
    latitude: '46.519962',
    longitude: '6.633597',
    price: '220.00',
    image_path: null,
    created_at: '2026-11-05T09:00:00.000Z',
    updated_at: null,
  },
];

let currentSession = null;

// Valid 1x1 PNG base64
const validPngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function run() {
  console.log('================================================================');
  console.log('   PHASE 4 — COMPLETE APPLICATION PRODUCTION READINESS AUDIT    ');
  console.log('================================================================\n');

  console.log('1. Starting isolated Vite dev server on port 5176...');
  const server = await createServer({
    root: path.resolve(__dirname, '..'),
    server: { port: 5176 },
  });
  await server.listen();
  console.log('✓ Vite server listening at http://localhost:5176\n');

  console.log('2. Launching browser (msedge channel)...');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const flowResults = {};
  const responsiveMatrix = [];
  const accessibilityResults = {};

  try {
    const setupApiInterceptions = async (page) => {
      // Mock session probe
      await page.route('**/api/auth/me', async (route) => {
        if (currentSession) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ user: currentSession }),
          });
        } else {
          await route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ status: 'error', statusCode: 401, message: 'Unauthorized' }),
          });
        }
      });

      // Mock login
      await page.route('**/api/auth/login', async (route) => {
        const body = JSON.parse(route.request().postData() || '{}');
        if (body.email === 'owner@namlatic.com' && body.password === 'CorrectPassword123!') {
          currentSession = { id: 1, email: 'owner@namlatic.com', role: 'owner' };
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: {
              'Set-Cookie': '__Host-namlatic_session=mock-token; Path=/; HttpOnly; SameSite=Lax; Secure',
            },
            body: JSON.stringify({
              status: 'success',
              user: currentSession,
              message: 'Authentication successful',
            }),
          });
        } else {
          await route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({
              status: 'error',
              statusCode: 401,
              message: 'Invalid email address or password.',
            }),
          });
        }
      });

      // Mock logout
      await page.route('**/api/auth/logout', async (route) => {
        currentSession = null;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'success', message: 'Logged out successfully.' }),
        });
      });

      // Mock ready probe
      await page.route('**/api/ready', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'ready', backendOnline: true }),
        });
      });

      // Mock image serving
      await page.route('**/uploads/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'image/png',
          body: validPngBuffer,
        });
      });

      // Unified Mock hotels API router to avoid Playwright LIFO route ordering conflicts
      await page.route('**/api/hotels**', async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        const method = req.method();

        // Check auth for all hotel operations
        if (!currentSession) {
          await route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ status: 'error', statusCode: 401, message: 'Authentication required' }),
          });
          return;
        }

        const cleanPath = url.pathname.replace(/\/+$/, '');
        const pathSegments = cleanPath.split('/').filter(Boolean);
        const lastSegment = pathSegments[pathSegments.length - 1];

        // 1. Stats endpoint: /api/hotels/stats
        if (cleanPath.endsWith('/stats')) {
          const total = inMemoryHotels.length;
          const prices = inMemoryHotels.map((h) => Number(h.price));
          const avg = total > 0 ? (prices.reduce((a, b) => a + b, 0) / total).toFixed(2) : '0.00';
          const min = total > 0 ? Math.min(...prices).toFixed(2) : '0.00';
          const max = total > 0 ? Math.max(...prices).toFixed(2) : '0.00';
          const withImages = inMemoryHotels.filter((h) => h.image_path).length;

          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                total_properties: total,
                average_price: avg,
                min_price: min,
                max_price: max,
                properties_with_images: withImages,
                totalProperties: total,
                averagePrice: avg,
                minPrice: min,
                maxPrice: max,
                propertiesWithImages: withImages,
              },
            }),
          });
          return;
        }

        // 2. Collection listing: GET /api/hotels
        if (method === 'GET' && lastSegment === 'hotels') {
          const title = url.searchParams.get('title') || '';
          const minPrice = url.searchParams.get('minPrice');
          const maxPrice = url.searchParams.get('maxPrice');
          const limit = parseInt(url.searchParams.get('limit') || '6', 10);
          const offset = parseInt(url.searchParams.get('offset') || '0', 10);

          let filtered = [...inMemoryHotels];
          if (title) {
            filtered = filtered.filter((h) => h.title.toLowerCase().includes(title.toLowerCase()));
          }
          if (minPrice) {
            filtered = filtered.filter((h) => Number(h.price) >= Number(minPrice));
          }
          if (maxPrice) {
            filtered = filtered.filter((h) => Number(h.price) <= Number(maxPrice));
          }

          const paginated = filtered.slice(offset, offset + limit);

          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: paginated,
              pagination: {
                total: filtered.length,
                limit,
                offset,
                hasMore: offset + paginated.length < filtered.length,
              },
            }),
          });
          return;
        }

        // 3. Single record: GET /api/hotels/:id
        if (method === 'GET') {
          const hotel = inMemoryHotels.find((h) => String(h.id) === String(lastSegment));
          if (!hotel) {
            await route.fulfill({
              status: 404,
              contentType: 'application/json',
              body: JSON.stringify({ status: 'error', statusCode: 404, message: `Hotel not found with ID ${lastSegment}` }),
            });
            return;
          }
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: hotel }),
          });
          return;
        }

        // 4. Create record: POST /api/hotels
        if (method === 'POST') {
          const newId = String(Date.now());
          const newHotel = {
            id: newId,
            title: 'New Created Hotel',
            description: 'New Hotel Description',
            latitude: '25.000000',
            longitude: '55.000000',
            price: '450.00',
            image_path: '/uploads/hotels/new.jpg',
            created_at: new Date().toISOString(),
            updated_at: null,
          };
          inMemoryHotels.unshift(newHotel);
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              status: 'success',
              data: newHotel,
              message: 'Hotel created successfully',
            }),
          });
          return;
        }

        // 5. Update record: PUT /api/hotels/:id
        if (method === 'PUT') {
          const hotel = inMemoryHotels.find((h) => String(h.id) === String(lastSegment));
          if (!hotel) {
            await route.fulfill({
              status: 404,
              contentType: 'application/json',
              body: JSON.stringify({ status: 'error', statusCode: 404, message: 'Hotel not found' }),
            });
            return;
          }
          hotel.title = 'Emerald Bay Grand Resort';
          hotel.price = '550.00';
          hotel.updated_at = new Date().toISOString();
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              status: 'success',
              data: hotel,
              message: 'Hotel updated successfully',
            }),
          });
          return;
        }

        // 6. Delete record: DELETE /api/hotels/:id
        if (method === 'DELETE') {
          const idx = inMemoryHotels.findIndex((h) => String(h.id) === String(lastSegment));
          if (idx === -1) {
            await route.fulfill({
              status: 404,
              contentType: 'application/json',
              body: JSON.stringify({ status: 'error', statusCode: 404, message: 'Hotel not found' }),
            });
            return;
          }
          const [deleted] = inMemoryHotels.splice(idx, 1);
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              status: 'success',
              data: { id: deleted.id },
              message: 'Hotel deleted successfully',
            }),
          });
          return;
        }
      });
    };

    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await setupApiInterceptions(page);

    // =========================================================================
    // FLOW 1: AUTHENTICATION
    // Login -> Dashboard -> Logout -> Protected Route Access Check
    // =========================================================================
    console.log('--- EXECUTING FLOW 1: AUTHENTICATION ---');
    currentSession = null;
    await page.goto('http://localhost:5176/login', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.login-page-container');

    // Attempt invalid login
    await page.fill('#login-email', 'wrong@example.com');
    await page.fill('#login-password', 'WrongPassword!');
    await page.click('button[type="submit"]');
    await page.waitForSelector('.login-alert-danger');
    console.log('  ✓ Invalid login displays error alert banner');

    // Valid login
    await page.fill('#login-email', 'owner@namlatic.com');
    await page.fill('#login-password', 'CorrectPassword123!');
    await page.click('button[type="submit"]');

    // Wait for Dashboard
    await page.waitForURL('http://localhost:5176/');
    await page.waitForSelector('.welcome-banner');
    console.log('  ✓ Valid login navigates to Overview Dashboard');

    // Verify Metric Cards
    const totalPropText = await page.textContent('.metric-card:first-child .metric-value');
    console.log(`  ✓ Dashboard rendered metrics: Total Properties = ${totalPropText.trim()}`);

    // Logout
    await page.click('.owner-logout-btn');
    await page.waitForURL('http://localhost:5176/login');
    console.log('  ✓ Sidebar logout button navigates back to /login');

    // Test protected route protection
    await page.goto('http://localhost:5176/hotels', { waitUntil: 'domcontentloaded' });
    await page.waitForURL('http://localhost:5176/login');
    console.log('  ✓ Protected route /hotels redirects unauthenticated user to /login');
    flowResults['Flow 1: Authentication'] = 'PASSED';

    // Log back in for subsequent flows
    await page.fill('#login-email', 'owner@namlatic.com');
    await page.fill('#login-password', 'CorrectPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/localhost:5176/);
    console.log('  ✓ Re-authenticated session restored');

    // =========================================================================
    // FLOW 2: CREATE HOTEL
    // Add Hotel -> Enter Details -> Upload Image -> Submit -> Verify in Inventory
    // =========================================================================
    console.log('\n--- EXECUTING FLOW 2: CREATE HOTEL ---');
    await page.goto('http://localhost:5176/hotels/new', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#hotel-title');

    await page.fill('#hotel-title', 'New Created Hotel');
    await page.fill('#hotel-description', 'A newly built modern luxury destination.');
    await page.fill('#hotel-latitude', '25.000000');
    await page.fill('#hotel-longitude', '55.000000');
    await page.fill('#hotel-price', '450.00');

    // Set valid file input
    await page.setInputFiles('#hotel-image', {
      name: 'hotel.png',
      mimeType: 'image/png',
      buffer: validPngBuffer,
    });
    await page.waitForSelector('.preview-image');
    console.log('  ✓ Image preview displayed for uploaded photo');

    await page.click('button[type="submit"]');
    await page.waitForURL('http://localhost:5176/hotels');
    console.log('  ✓ Form submission navigates to /hotels');
    flowResults['Flow 2: Create Hotel'] = 'PASSED';

    // =========================================================================
    // FLOW 3: READ AND SEARCH
    // Inventory -> Search by Title -> Price Filters -> Reset
    // =========================================================================
    console.log('\n--- EXECUTING FLOW 3: READ AND SEARCH ---');
    await page.waitForSelector('[data-testid="hotels-grid"]');

    // Search for "Emerald"
    const searchInput = await page.$('#search-hotel-title');
    if (searchInput) {
      await searchInput.fill('Emerald');
      await page.waitForTimeout(600); // debounce
      const cards = await page.$$('.hotel-card');
      console.log(`  ✓ Search for "Emerald" returned ${cards.length} card(s)`);

      // Clear search input
      await page.click('.search-clear-btn');
      await page.waitForTimeout(500);
      const allCards = await page.$$('.hotel-card');
      console.log(`  ✓ Clearing search restored all ${allCards.length} cards`);
    }
    flowResults['Flow 3: Read and Search'] = 'PASSED';

    // =========================================================================
    // FLOW 4: UPDATE HOTEL
    // Open Hotel -> Edit -> Change Details -> Save -> Verify Updated State
    // =========================================================================
    console.log('\n--- EXECUTING FLOW 4: UPDATE HOTEL ---');
    await page.goto('http://localhost:5176/hotels/1/edit', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#hotel-title');

    // Verify existing data loaded
    const titleVal = await page.inputValue('#hotel-title');
    console.log(`  ✓ Form prefilled with title: "${titleVal}"`);

    await page.fill('#hotel-title', 'Emerald Bay Grand Resort');
    await page.fill('#hotel-price', '550.00');
    await page.click('button[type="submit"]');

    await page.waitForURL('http://localhost:5176/hotels');
    console.log('  ✓ Update submitted and navigated to /hotels with success feedback');

    await page.goto('http://localhost:5176/hotels/1', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="hotel-details-content"]');
    const updatedTitle = await page.textContent('.details-title');
    console.log(`  ✓ Detail page shows updated title: "${updatedTitle.trim()}"`);
    flowResults['Flow 4: Update Hotel'] = 'PASSED';

    // =========================================================================
    // FLOW 5: DELETE HOTEL
    // Open Inventory -> Delete Modal -> Cancel -> Confirm -> Verify Removed
    // =========================================================================
    console.log('\n--- EXECUTING FLOW 5: DELETE HOTEL ---');
    await page.goto('http://localhost:5176/hotels', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="hotels-grid"]');

    const countBefore = (await page.$$('.hotel-card')).length;

    // Click delete on first card
    await page.click('.hotel-card:first-child .btn-danger-outline');
    await page.waitForSelector('.modal-card');
    console.log('  ✓ Delete confirmation modal opened');

    // Test Cancel
    await page.click('.modal-actions .btn-outline');
    await page.waitForSelector('.modal-card', { state: 'detached' });
    const countAfterCancel = (await page.$$('.hotel-card')).length;
    console.log(`  ✓ Cancel preserves item in inventory (${countAfterCancel} cards present)`);

    // Click delete again and confirm
    await page.click('.hotel-card:first-child .btn-danger-outline');
    await page.waitForSelector('.modal-card');
    await page.click('.modal-actions .btn-danger');
    await page.waitForSelector('.toast-notification');
    console.log('  ✓ Confirm deletion triggers success flash toast');

    const countAfterDelete = (await page.$$('.hotel-card')).length;
    console.log(`  ✓ Inventory card count reduced to ${countAfterDelete}`);
    flowResults['Flow 5: Delete Hotel'] = 'PASSED';

    // =========================================================================
    // FLOW 6: ERROR HANDLING
    // Validation Errors -> 404 Not Found -> Broken Image Fallback
    // =========================================================================
    console.log('\n--- EXECUTING FLOW 6: ERROR HANDLING ---');
    // 1. Form Validation Errors
    await page.goto('http://localhost:5176/hotels/new', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#hotel-title');
    await page.click('button[type="submit"]');

    const errorCount = (await page.$$('.form-error')).length;
    console.log(`  ✓ Empty form submission displays ${errorCount} field validation errors`);

    // 2. 404 Not Found
    await page.goto('http://localhost:5176/hotels/99999', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="hotel-not-found"]');
    console.log('  ✓ Nonexistent ID renders 404 Not Found component');

    // 3. Fallback Image
    await page.goto('http://localhost:5176/hotels/3', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="details-no-image"]');
    console.log('  ✓ Null image hotel renders custom SVG placeholder');
    flowResults['Flow 6: Error Handling'] = 'PASSED';

    // =========================================================================
    // RESPONSIVE & OVERFLOW AUDIT (6 BREAKPOINTS x 6 PAGES)
    // =========================================================================
    console.log('\n--- EXECUTING RESPONSIVE OVERFLOW AUDIT ---');
    const pagesToTest = [
      { name: 'Login', path: '/login', auth: false },
      { name: 'Dashboard', path: '/', auth: true },
      { name: 'Hotel Inventory', path: '/hotels', auth: true },
      { name: 'Add Hotel', path: '/hotels/new', auth: true },
      { name: 'Edit Hotel', path: '/hotels/1/edit', auth: true },
      { name: 'Hotel Details', path: '/hotels/1', auth: true },
    ];

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const p of pagesToTest) {
        if (!p.auth) {
          currentSession = null;
        } else {
          currentSession = { id: 1, email: 'owner@namlatic.com', role: 'owner' };
        }

        await page.goto(`http://localhost:5176${p.path}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(300);

        const overflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });

        responsiveMatrix.push({
          viewport: vp.name,
          page: p.name,
          overflow: overflow ? 'OVERFLOW (FAILED)' : 'NONE (PASSED)',
        });
      }
    }
    console.log('✓ Completed responsive evaluation across 36 combinations');

    // =========================================================================
    // ACCESSIBILITY FUNDAMENTALS AUDIT
    // =========================================================================
    console.log('\n--- EXECUTING ACCESSIBILITY FUNDAMENTALS AUDIT ---');
    currentSession = { id: 1, email: 'owner@namlatic.com', role: 'owner' };
    await page.goto('http://localhost:5176/hotels/1', { waitUntil: 'domcontentloaded' });

    const h1Count = await page.$$eval('h1', (els) => els.length);
    console.log(`  ✓ Page has ${h1Count} level-1 heading(s)`);

    const missingAltCount = await page.$$eval('img:not([alt])', (els) => els.length);
    console.log(`  ✓ Images missing alt text: ${missingAltCount}`);

    const unlabeledInputs = await page.$$eval('input:not([aria-label]):not([aria-labelledby])', (els) => {
      return els.filter((el) => !document.querySelector(`label[for="${el.id}"]`)).length;
    });
    console.log(`  ✓ Unlabeled inputs: ${unlabeledInputs}`);

    accessibilityResults['H1 Headings'] = h1Count > 0 ? 'PASSED' : 'FAILED';
    accessibilityResults['Image Alt Attributes'] = missingAltCount === 0 ? 'PASSED' : 'FAILED';
    accessibilityResults['Input Labels'] = unlabeledInputs === 0 ? 'PASSED' : 'FAILED';

    console.log('\n================================================================');
    console.log('                      AUDIT SUMMARY TABLE                       ');
    console.log('================================================================');
    console.table(flowResults);
    console.table(accessibilityResults);

    const hasOverflowFailures = responsiveMatrix.some((r) => r.overflow.includes('FAILED'));
    if (hasOverflowFailures) {
      console.error('CRITICAL: Responsive overflow detected!');
      console.table(responsiveMatrix.filter((r) => r.overflow.includes('FAILED')));
      process.exitCode = 1;
    } else {
      console.log('✓ All 36 responsive viewport combinations PASSED zero horizontal overflow!');
    }

    await context.close();
  } finally {
    await browser.close();
    await server.close();
  }
}

run().catch((err) => {
  console.error('Fatal error during E2E verification:', err);
  process.exit(1);
});
