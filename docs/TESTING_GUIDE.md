# Testing Guide: Namlatic Hotel Portal

## 1. Testing Philosophy & Separation

Our testing architecture strictly separates **Unit Tests** from **Integration Tests**:

| Characteristic | Unit Tests (`tests/unit/`) | Integration Tests (`tests/integration/`) |
| :--- | :--- | :--- |
| **Scope** | Single function / isolated logic | Full HTTP request-response cycle |
| **External Dependencies** | None (in-memory / mock temp files) | Live PostgreSQL database + Express + disk |
| **Execution Time** | < 400 milliseconds | ~2 seconds |
| **Runner** | Modern native `node:test` + `node:assert` | Custom async HTTP test runner |
| **Purpose** | Validate business rules, edge cases, boundaries | Verify end-to-end data flow and ACID transactions |

---

## 2. Unit Testing Suite (`tests/unit/`)

Built entirely using Node.js's built-in `node:test` framework to avoid bloating `node_modules` with third-party runners.

### Test Suites:
1. **`hotel.validator.test.js` (22 tests):**
   - `validateHotelId()`: Positive integer acceptance, zero/negative rejection, decimal rejection, string injection defense.
   - `validateCreateHotel()`: Title/description length and whitespace rules, coordinate limits ($-90..90$, $-180..180$) and 6-decimal precision, price positivity, 2-decimal scale, and `NaN` rejection.
   - `validateListHotels()`: Default limits/offsets, pagination bounds ($1..100$), search query trimming, `minPrice > maxPrice` rejection.
2. **`security.test.js` (13 tests):**
   - `verifyMagicBytes()`: Binary signature detection for JPEG, PNG, and WebP; rejection of disguised HTML/PHP scripts and truncated buffers.
   - `safeDeleteHotelImage()`: Directory traversal rejection (`..`), protected file protection (`.gitkeep`), null/type handling.
   - `safeUnlinkFile()`: Strict containment within upload root.
   - `mapDbConstraintError()`: Error masking ensuring database schema internals are never leaked to clients.
3. **`stats.test.js` (3 tests):**
   - Maps raw PostgreSQL server-side aggregation rows to numeric types and strings.
   - Handles empty database state safely (`0` count, `0.00` rates) without `NaN`.
   - Preserves exact decimal precision without IEEE 754 floating-point distortion.

---

## 3. Integration Testing Suite (`tests/integration/`)

Communicates over HTTP to an isolated Express test instance on port 5001 connected to live PostgreSQL 18.6:

### Test Breakdown (43 tests):
- **Part 1 (POST):** Valid creation with/without JPEG and PNG, validation errors, magic bytes spoofing, 5 MB limit, and upload file cleanup on failure.
- **Part 2 (GET List):** Retrieval of collection, prefix search (`lower(title) LIKE lower($1) || '%'`), price range filters, pagination slices, and parameter validation.
- **Part 3 (GET Detail):** Retrieval of existing record, 404 on nonexistent record, 400 on non-integer, zero, and negative IDs.
- **Part 4 (PUT):** Update without image (preserves old image), update with new image (deletes old image from disk), invalid updates (preserves existing image and cleans up new upload), 404 handling.
- **Part 5 (DELETE):** Deletion of hotel with image (verifies physical file removed), deletion without image, 404 handling, and graceful tolerance when image is already missing from disk.
- **Part 6 (GET /api/hotels/stats):** Verifies HTTP 200 aggregate structure, total properties exact database count match, and properties with images strictly reflecting non-null `image_path` records in PostgreSQL.
- **Part 7 (Security & Storage Integrity):** Path traversal block verification, confirmation of zero orphaned files in `server/src/uploads/hotels`.

---

## 4. Frontend Unit Testing Suite (`client/src/test/`)

Built using **Vitest** + **React Testing Library** + **@testing-library/jest-dom** with `jsdom`:

### Test Suites Breakdown (27 tests):
1. **`HotelCard.test.jsx` (4 tests):**
   - Renders hotel title, formatted price (`$250.00 / night`), coordinates (`24.4539°, 54.3773°`), and description snippet.
   - Renders accessible fallback SVG badge ("No Image Available") when `image_path` is null.
   - Renders `<img>` element with proper `alt` tag and `src` URL when `image_path` is provided.
   - Renders action buttons (`Details`, `Edit`, `Delete`) and triggers `onDeleteClick` callback with hotel ID on click.
2. **`hotelsSlice.test.js` (11 tests):**
   - `initialState`: Verifies clean defaults (`items: []`, `status: 'idle'`, `page: 1`, `limit: 6`).
   - `setFilters`: Updates title search, minPrice, and maxPrice, resetting active page to 1.
   - `setPage`: Updates page number while keeping existing filters.
   - `fetchHotels.pending`: Sets `status: 'loading'` and clears error.
   - `fetchHotels.fulfilled`: Populates `items` array and updates `pagination` metadata (`total`, `totalPages`, `limit`, `offset`).
   - `fetchHotels.rejected`: Sets `status: 'failed'` and captures error message.
   - `deleteHotel.pending`: Sets `deleteStatus: 'loading'`.
   - `deleteHotel.fulfilled`: Removes the deleted hotel from state by ID and resets `deleteStatus`.
   - `fetchHotelStats.pending`: Sets `statsStatus: 'loading'` and clears error.
   - `fetchHotelStats.fulfilled`: Populates `stats` object with server aggregates (`totalProperties`, `averagePrice`, `minPrice`, `maxPrice`, `propertiesWithImages`).
   - `fetchHotelStats.rejected`: Sets `statsStatus: 'failed'` and captures error message.
3. **`FilterToolbar.test.jsx` (4 tests):**
   - Renders search input with placeholder and min/max price inputs.
   - Calls `onFilterChange` debounced after typing search query.
   - Shows validation warning if `minPrice > maxPrice`.
   - Calls `onReset` and clears input fields when "Reset" button is clicked.
4. **`Pagination.test.jsx` (4 tests):**
   - Renders record range ("Showing 1 to 6 of 12 properties") and disables Prev button on page 1.
   - Calls `onPageChange` with target page number when page button clicked.
   - Disables Next button on the final page.
   - Renders null when `totalPages <= 1` (no unnecessary controls displayed).
5. **`EmptyAndErrorStates.test.jsx` (4 tests):**
   - `EmptyState`: Renders empty title, message, and action button.
   - `EmptyState`: Triggers `onAction` callback when action button clicked.
   - `ErrorAlert`: Renders error message and "Try Again" retry button.
   - `ErrorAlert`: Triggers `onRetry` callback on click.

---

## 5. Running the Tests

### Backend Tests (81 tests):
From the `server` directory:
```powershell
# Run all backend tests (Unit tests + Integration tests)
npm test

# Run only backend unit tests (lightning-fast Node native runner)
npm run test:unit

# Run only backend integration tests
npm run test:integration
```

### Frontend Tests (27 tests):
From the `client` directory:
```powershell
# Run all frontend unit tests with Vitest
npm test

# Run Vitest in interactive watch mode
npm run test:watch
```

### Total Test Suite Count:
- **Backend Unit Tests:** 38 passed
- **Backend Integration Tests:** 43 passed
- **Frontend Unit Tests:** 27 passed
- **Total Automated Tests:** **108 / 108 passed (100% pass rate)**
