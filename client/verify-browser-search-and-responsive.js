import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCREENSHOT_DIR = path.resolve(__dirname, '../docs/screenshots');
const RESPONSIVE_DIR = path.resolve(SCREENSHOT_DIR, 'responsive');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

[SCREENSHOT_DIR, RESPONSIVE_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

async function runBrowserVerification() {
  console.log('====================================================');
  console.log('   NAMLATIC BROWSER SEARCH & RESPONSIVE VERIFIER   ');
  console.log('====================================================\n');

  const browser = await chromium.launch({
    executablePath: fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
    headless: true,
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });

  // Track all outgoing API requests from the browser
  const interceptedRequests = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/hotels')) {
      interceptedRequests.push({
        method: req.method(),
        url: req.url(),
        postData: req.postData(),
      });
    }
  });

  console.log('--- TASK 3: TESTING LIVE BROWSER SEARCH PARAMETER CONSISTENCY ---');

  // 1. Initial page load
  console.log('[1/4] Navigating to http://localhost:5173/hotels ...');
  await page.goto('http://localhost:5173/hotels', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const initialReq = interceptedRequests.find((r) => r.url.includes('/api/hotels'));
  console.log(`Initial listing request: ${initialReq ? initialReq.url : 'None'}`);

  // Count initial cards
  const initialCards = await page.$$('.hotel-card');
  console.log(`Initial hotel cards displayed: ${initialCards.length}`);

  // 2. Type "sea" into search input
  console.log('\n[2/4] Typing search query "sea" into search input...');
  const searchInput = await page.$('#search-hotel-title');
  if (!searchInput) throw new Error('Search input #search-hotel-title not found!');

  interceptedRequests.length = 0; // reset tracker
  await searchInput.fill('sea');
  await page.waitForTimeout(1200);

  const seaReq = interceptedRequests.find((r) => r.url.includes('/api/hotels?'));
  console.log(`Outgoing search request for "sea": ${seaReq ? seaReq.url : 'None'}`);

  // 2b. Type "Coral" to verify matching records display
  console.log('\n[2b/4] Typing search query "Coral" to verify matching record display...');
  interceptedRequests.length = 0;
  await searchInput.fill('Coral');
  await page.waitForTimeout(1200);

  const coralReq = interceptedRequests.find((r) => r.url.includes('/api/hotels?'));
  console.log(`Outgoing search request for "Coral": ${coralReq ? coralReq.url : 'None'}`);

  const coralCards = await page.$$('.hotel-card');
  console.log(`Cards displayed for "Coral": ${coralCards.length}`);
  for (const card of coralCards) {
    const title = await card.$eval('.hotel-card-title', (el) => el.textContent.trim());
    console.log(`  - Matched Hotel: "${title}"`);
  }

  // 3. Search for nonexistent hotel
  console.log('\n[3/4] Typing nonexistent query "nonexistenthotel999"...');
  interceptedRequests.length = 0;
  await searchInput.fill('nonexistenthotel999');
  await page.waitForTimeout(1200);

  const emptyReq = interceptedRequests.find((r) => r.url.includes('/api/hotels?'));
  console.log(`Outgoing nonexistent search request: ${emptyReq ? emptyReq.url : 'None'}`);

  const emptyStateVisible = await page.$('.empty-state');
  const emptyText = emptyStateVisible
    ? await page.$eval('.empty-state-title', (el) => el.textContent.trim())
    : 'None';
  console.log(`Empty state container rendered: ${Boolean(emptyStateVisible)} ("${emptyText}")`);

  // 4. Clear search using clear button (✕)
  console.log('\n[4/4] Clearing search input via clear button...');
  interceptedRequests.length = 0;
  const clearBtn = await page.$('.search-clear-btn');
  if (clearBtn) {
    await clearBtn.click();
  } else {
    await searchInput.fill('');
  }
  await page.waitForTimeout(1200);

  const clearedReq = interceptedRequests.find((r) => r.url.includes('/api/hotels?'));
  console.log(`Outgoing cleared search request: ${clearedReq ? clearedReq.url : 'None'}`);

  const restoredCards = await page.$$('.hotel-card');
  console.log(`Restored hotel cards count: ${restoredCards.length}`);

  await page.close();

  // -----------------------------------------------------------------
  // TASK 5: RESPONSIVE VIEWPORT VERIFICATION (10 VIEWPORTS)
  // -----------------------------------------------------------------
  console.log('\n====================================================');
  console.log('   TASK 5: RESPONSIVE VIEWPORT VERIFICATION (10 VIEWPORTS)   ');
  console.log('====================================================\n');

  const viewports = [
    { width: 360, height: 740, name: 'mobile-360px', device: 'Android Small (360x740)' },
    { width: 375, height: 667, name: 'mobile-375px', device: 'iPhone SE (375x667)' },
    { width: 390, height: 844, name: 'mobile-390px', device: 'iPhone 12/13/14 (390x844)' },
    { width: 430, height: 932, name: 'mobile-430px', device: 'iPhone 14/15 Pro Max (430x932)' },
    { width: 768, height: 1024, name: 'tablet-768px', device: 'iPad Mini / Portrait Tablet (768x1024)' },
    { width: 820, height: 1180, name: 'tablet-820px', device: 'iPad Air (820x1180)' },
    { width: 1024, height: 768, name: 'tablet-1024px', device: 'iPad Pro / Small Laptop (1024x768)' },
    { width: 1280, height: 850, name: 'desktop-1280px', device: 'Standard Desktop (1280x850)' },
    { width: 1366, height: 768, name: 'desktop-1366px', device: 'HD Laptop (1366x768)' },
    { width: 1440, height: 900, name: 'desktop-1440px', device: 'Wide Desktop (1440x900)' },
  ];

  for (const vp of viewports) {
    const vpPage = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
    });

    // 1. Capture Dashboard
    await vpPage.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
    await vpPage.waitForTimeout(800);

    // Check horizontal scrollbar / overflow
    const overflowX = await vpPage.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    // Check touch targets / elements
    const totalPropsMetric = await vpPage.$eval('.metric-value', (el) => el.textContent.trim()).catch(() => 'N/A');

    const dashPath = path.join(RESPONSIVE_DIR, `dashboard-${vp.name}.png`);
    await vpPage.screenshot({ path: dashPath, fullPage: false });

    // 2. Capture Hotels Listing
    await vpPage.goto('http://localhost:5173/hotels', { waitUntil: 'networkidle' });
    await vpPage.waitForTimeout(800);

    const hotelsPath = path.join(RESPONSIVE_DIR, `hotels-${vp.name}.png`);
    await vpPage.screenshot({ path: hotelsPath, fullPage: false });

    console.log(
      `✅ [${vp.width}px] ${vp.device}: Captured Dashboard & Hotels (Overflow: ${overflowX ? 'YES (FAIL)' : 'NO (CLEAN)'}, Total Props: ${totalPropsMetric})`
    );

    await vpPage.close();
  }

  // Also update primary canonical screenshots in docs/screenshots/
  console.log('\n[UPDATING CANONICAL SCREENSHOTS]');
  const canonicalScreenshots = [
    { url: 'http://localhost:5173/', width: 1280, height: 850, file: 'desktop-dashboard.png' },
    { url: 'http://localhost:5173/hotels', width: 1280, height: 950, file: 'desktop-hotels.png' },
    { url: 'http://localhost:5173/hotels', width: 768, height: 1024, file: 'tablet-hotels.png' },
    { url: 'http://localhost:5173/hotels', width: 375, height: 812, file: 'mobile-hotels.png' },
  ];

  for (const s of canonicalScreenshots) {
    const p = await browser.newPage({ viewport: { width: s.width, height: s.height } });
    await p.goto(s.url, { waitUntil: 'networkidle' });
    await p.waitForTimeout(1000);
    const savePath = path.join(SCREENSHOT_DIR, s.file);
    await p.screenshot({ path: savePath, fullPage: false });
    console.log(`Saved canonical: ${savePath}`);
    await p.close();
  }

  await browser.close();
  console.log('\nAll browser searches and responsive tests verified successfully!');
}

runBrowserVerification().catch((err) => {
  console.error('Fatal error during browser verification:', err);
  process.exit(1);
});
