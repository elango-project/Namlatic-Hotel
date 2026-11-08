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

### Test Suites Breakdown (57 tests):
1. **`HotelCard.test.jsx` (4 tests):**
   - Renders hotel title, formatted price (currency-neutral `250.00` by default, or `$250.00` when configured), coordinates (`24.4539°, 54.3773°`), and description snippet.
   - Renders accessible fallback SVG badge ("No Image Available") when `image_path` is null.
   - Renders `<img>` element with proper `alt` tag and `src` URL when `image_path` is provided.
   - Renders action buttons (`Details`, `Edit`, `Delete`) and triggers `onDeleteClick` callback with hotel ID on click.
2. **`hotelsSlice.test.js` (13 tests):**
   - `initialState`: Verifies clean defaults (`items: []`, `status: 'idle'`, `limit: 6`).
   - `setFilters`: Updates title search, minPrice, and maxPrice, resetting active offset to 0.
   - `setPageOffset`: Updates offset while clamping negative values.
   - `fetchHotels.pending`: Sets `status: 'loading'` and clears error.
   - `fetchHotels.fulfilled`: Populates `items` array and updates `pagination` metadata.
   - `fetchHotels.rejected`: Sets `status: 'failed'` and captures error message.
   - `deleteHotel.fulfilled`: Removes hotel from `items` and decrements total count.
   - `fetchHotelStats.fulfilled`: Updates aggregate stats (`totalProperties`, `averagePrice`, `minPrice`, `maxPrice`, `propertiesWithImages`).
   - `updateHotel.fulfilled`: Updates modified hotel in `state.items` in place without full page reload.
   - `createHotel.fulfilled`: Increments total count and prepends newly created hotel to `state.items` on page 1.
3. **`FilterToolbar.test.jsx` (4 tests):**
   - Search input debounce and query clearing.
   - Price range inputs (Min Price / Max Price) with conditional currency symbol.
   - Apply filter submission and state dispatch.
   - Reset button restoring clean search state.
4. **`Pagination.test.jsx` (4 tests):**
   - Record count display ("Showing X to Y of Z").
   - Previous/Next button states and boundary disabling.
   - Numerical page button generation and active indicator.
   - Hidden state when total items is zero.
5. **`EmptyAndErrorStates.test.jsx` (4 tests):**
   - Empty search results state with reset action.
   - Empty inventory state with create property action.
   - Error banner with retry callback.
   - Skeleton loading placeholders.
6. **`HotelForm.test.jsx` (22 tests):**
   - Create mode empty render with "Register Hotel Property" action.
   - Required field validations (title, description, latitude, longitude, price).
   - Character boundary validations (title max 255, description max 5000).
   - Coordinate boundaries (accepts negative coordinates e.g. `-33.8688`, `-70.6693`, rejects out-of-range `-90.000001`, `90.000001`).
   - Decimal precision limits (coordinates max 6 decimals, price max 2 decimals).
   - Strict numeric validation (rejects `12abc`, `--5`, `Infinity`, scientific notation `1e2`).
   - Image format validation (accepts JPEG, PNG, WebP; rejects PDF, text, GIF).
   - Image size ceiling (5 MB limit).
   - Blob preview creation (`URL.createObjectURL`) and previous blob cleanup (`URL.revokeObjectURL`).
   - Unmount cleanup preventing memory leaks.
   - Edit mode initialization and existing image preservation.
   - Cancel/Revert action restoring original image and revoking replacement.
   - Dynamic accessible name (`aria-label`) aligned with visible state.
   - Input file resetting on invalid selection.
   - React StrictMode mount/unmount resilience.
7. **`HotelFormPage.test.jsx` (6 tests):**
   - Route parsing for `/hotels/new` (create mode) and `/hotels/:id/edit` (edit mode).
   - Non-numeric or negative ID parameter validation.
   - Graceful 404 handling with ErrorAlert and Return button.
   - Edit form pre-population from API.
   - Create property submission and navigation.
   - Complete edit flow: field mutation, Redux items update, list refresh trigger, and navigation.
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

### Frontend Tests (52 tests):
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
- **Frontend Unit Tests:** 52 passed
- **Total Automated Tests:** **133 / 133 passed (100% pass rate)**

---

## 6. Phase 4B Frontend Test Suite Breakdown

### 6.1 `HotelForm.test.jsx` (20 Tests)
1. **Create Mode Rendering:** Validates initial empty inputs and "Register Hotel Property" action button.
2. **Required Field Validation:** Blocks submission when title, description, latitude, longitude, or price are missing.
3. **Title Length Validation:** Rejects title strings > 255 characters with clear field error.
4. **Coordinate Boundaries:** Rejects latitude outside $-90.0 \dots 90.0$ and longitude outside $-180.0 \dots 180.0$.
5. **Decimal Precision Enforcement:** Rejects coordinates with > 6 decimal places and price with > 2 decimal places.
6. **Price Boundaries:** Rejects price $\le 0$, negative numbers, and non-numeric strings.
7. **Invalid Image Format:** Rejects unsupported file types (e.g., text, pdf, gif).
8. **File Size Enforcement:** Rejects image files exceeding the 5 MB ceiling.
9. **Instant Image Preview:** Verifies `URL.createObjectURL(file)` is called and the `<img>` element renders the blob URL.
10. **Previous Blob Cleanup:** Verifies `URL.revokeObjectURL(oldBlob)` is called when a user selects a replacement image.
11. **Unmount Cleanup:** Verifies active blob URLs are revoked on unmount to prevent browser memory leaks.
12. **Edit Mode Initialization:** Verifies existing hotel hero image is rendered without creating unnecessary blob URLs.
13. **Existing Image Preservation:** Verifies `FormData` omits the `image` field when no replacement is chosen.
14. **Revert / Cancel Action:** Restores original image preview and revokes replacement blob when clicking "Revert to Original".
15. **Successful Creation:** Validates fields and dispatches complete `FormData` to `onSubmit`.
16. **Failed Creation:** Displays accessible server error banner when submission is rejected.
17. **Successful Update:** Captures edited field values and passes updated `FormData` to `onSubmit`.
18. **Failed Update:** Renders server error notification in edit context.
19. **Loading & Anti-Duplicate:** Disables inputs and submit button during active loading to prevent duplicate requests.
20. **Accessibility & Focus:** Automatically focuses first invalid form field upon submission error.

### 6.2 `HotelFormPage.test.jsx` (5 Tests)
1. **Create Route Parsing:** Renders breadcrumbs and create form for `/hotels/new`.
2. **Invalid ID Rejection:** Detects non-numeric or non-positive ID parameters and shows error banner.
3. **404 / Missing Hotel:** Handles missing hotel records gracefully with `ErrorAlert` and return button.
4. **Edit Form Population:** Fetches existing hotel record by ID and populates fields.
5. **Create & Redirect:** Dispatches `createHotel`, triggers statistics refresh, and navigates to `/hotels`.

### 6.3 Responsive Viewport Verification Matrix (10 Viewports)
Verified using Playwright with Microsoft Edge across all 10 required device viewports with zero horizontal overflow:
- **Mobile:** 360px, 375px, 390px, 430px (Passed, 0 overflow)
- **Tablet:** 768px, 820px, 1024px (Passed, 0 overflow)
- **Desktop:** 1280px, 1366px, 1440px (Passed, 0 overflow)
