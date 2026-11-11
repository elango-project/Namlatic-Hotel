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
1. **`hotel.validator.test.js` (26 tests):**
   - `validateHotelId()`: Positive integer acceptance up to BIGINT max, safe integer vs unsafe integer handling, zero/negative rejection, decimal rejection, string injection defense, strict whitespace rejection without trimming, and BIGINT regression suite.
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
4. **`database.config.test.js` (35 tests - Phase 5B):**
   - DATABASE_URL parsing: Credentials, host, port, database name, and query parameter handling.
   - SSL/TLS configuration: `sslmode=require`, `sslmode=prefer`, `sslmode=disable`, rejectUnauthorized flag, and Neon Server Name Indication (SNI).
   - Channel binding semantics: Validates `disable`, `prefer` (with SCRAM-SHA-256-PLUS), and strict rejection of unsupported `require`.
   - Discrete environment fallback: Preserves local development compatibility (`DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME`).
   - Connection pool sizing and idle timeout configuration.
5. **`hardening.config.test.js` (23 tests - Phase 5C):**
   - Port & Host binding: Verifies default host `0.0.0.0` for Render, custom `HOST`, dynamic `PORT`, and safe logging.
   - CORS Allowlist: Parses comma-separated origin URLs, defaults to local dev origins, and strictly rejects wildcard `*` in production.
   - Reverse Proxy Trust: Configures `trust proxy: 1` by default in production; proves anti-spoofing by resolving client IP correctly when `X-Forwarded-For` contains multiple hops.
   - Rate Limit Configuration: Parses write and general rate limit windows and maximum request thresholds.
   - Rate Limit Headers & Payload: Verifies standard draft headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`) and consistent JSON error response structure on HTTP 429.
   - Body Size Limits: Verifies default 10kb JSON body limit and handles payload truncation.
   - Production Error Sanitization: Masks stack traces and internal errors to `"Internal server error"` when `NODE_ENV === 'production'`.
6. **`storage.test.js` (38 tests - Phases 5D & 5D.1):**
   - Driver router semantics: Verifies driver switching (`local` vs `r2`), defaults to `local` in test/dev, strictly forbids missing `MEDIA_STORAGE_DRIVER` in production without silent fallback, strictly rejects `MEDIA_STORAGE_DRIVER="local"` in production, and rejects unknown drivers.
   - Cloudflare R2 configuration & URL validation: Verifies required variables (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL`), normalizes endpoint (`https://${accountId}.r2.cloudflarestorage.com`) and region (`auto`), strictly requires `https:` protocol in production, permits `http:` in development/test, rejects embedded credentials, query strings, URL fragments, and malformed URLs without valid hostnames, normalizes multiple trailing slashes consistently, supports valid custom Cloudflare domains, and prevents credential leakage in error messages.
   - Object key generation: Verifies UUID-based server keys (`hotels/<uuid>.<ext>`) and path traversal protection.
   - Binary MIME detection: Verifies magic-byte extraction maps binary signatures directly to verified MIME types (`image/jpeg`, `image/png`, `image/webp`).
   - S3 command parameters: Verifies `PutObjectCommand` receives verified MIME type and immutable cache-control header (`public, max-age=31536000, immutable`).
   - Staged-file cleanup resilience: Verifies local staged file is unlinked on S3 upload failure, on local `readFile` failure, and verifies local unlink failures do not cause false-alarm upload failures or deletion of uploaded cloud objects.
   - Public URL resolution: Verifies `r2:hotels/<uuid>.<ext>` references resolve dynamically to `https://${R2_PUBLIC_BASE_URL}/hotels/<uuid>.<ext>`.
   - Reference deletion: Verifies `DeleteObjectCommand` strips `r2:` prefix and handles nonexistent objects gracefully without throwing.
   - Local adapter regression: Verifies legacy `/uploads/hotels/<filename>` resolution, directory traversal protection (`..`), protected file guards (`.gitkeep`), and safe ENOENT tolerance.
7. **`password.service.test.js` (30 tests - Phase 5F-A2.1 & 5F-A2.1.1):**
   - Email normalization & validation: Leading/trailing whitespace and uppercase conversion (`"  Owner@Namlatic.COM  "` -> `"owner@namlatic.com"`), rejection of invalid formats, empty/whitespace strings, non-string types, and strings > 255 chars.
   - Unicode code-point password validation: Minimum 12 Unicode code points (`Array.from(p).length >= 12`), acceptance of 12 multi-byte emojis (48 UTF-8 bytes, 24 UTF-16 code units), rejection of 11 emojis despite having 22 UTF-16 code units.
   - UTF-8 byte boundary: Acceptance of 128 UTF-8 bytes (`Buffer.byteLength(p, 'utf8') <= 128`), rejection of 129 bytes.
   - Password verification byte bounding: Candidate passwords of exactly 128 bytes reach verification; candidate passwords exceeding 128 bytes return `false` *before* entering the concurrency semaphore without consuming semaphore slots.
   - Password immutability: Strict preservation of leading, trailing, and internal spaces without trimming; preservation of raw decomposed/combining Unicode characters without normalization or casing mutation.
   - Argon2id cryptographic parameters: Verification of OWASP parameters (`memoryCost: 65536`, `timeCost: 3`, `parallelism: 1`, `hashLength: 32`), generation of unique salt hashes, verification of matching passwords, rejection of incorrect passwords, fast failure on invalid input, and safe handling of malformed hashes.
   - Constant-time dummy hash: Precomputed Argon2id hash verified syntactically valid and returning `false` via `argon2.verify()` without throwing.
   - Bounded concurrency semaphore: Max 2 concurrent active tasks, queuing up to 5 tasks, immediate rejection (`HTTP 503 Retry-After: 3`) on queue overflow, 3000ms queue timeout with automatic queue cleanup, active count recovery on task exceptions, and direct propagation of overload 503 errors during verification.
8. **`terminalPrompt.test.js` (5 tests - Phase 5F-A2.1.1):**
   - Character masking: Masks typed characters with asterisks (`*`) in real-time and returns unaltered password string on Enter.
   - Backspace handling: Correctly erases terminal asterisk display (`\b \b`) and pops character from candidate password string.
   - Unicode code point backspace: Accurately removes multibyte Unicode emojis code point by code point.
   - Signal handling & cleanup: Restores terminal raw mode and rejects with `USER_CANCELLED` error code on Ctrl+C (`\u0003`).
   - Non-TTY fallback: Falls back cleanly to line reading when input stream is not a TTY (supporting automated CI/CD and piped inputs).
9. **`testDb.config.test.js` (27 tests - Phases 5F-A2.1.1, 5F-A2.1.2, 5F-A2.3):**
   - Immediate rejection if `NODE_ENV === 'production'`.
   - Rejection when `TEST_DATABASE_URL` is missing or whitespace only.
   - Rejection of malformed URLs and non-PostgreSQL protocols (`mysql:`, `http:`).
   - Rejection of URLs without target database name or missing database username.
   - Rejection of normal application database user (`namlatic_app` / `DB_USER`) and administrative superusers (`postgres`, `root`, `admin`).
   - Enforcement that configured role strictly matches the designated test role (`namlatic_test` or `TEST_DB_USER`).
   - Safety checks rejecting protected databases (`namlatic_hotel`, `postgres`, `production`, `neondb`), non-test database names, and names that do not match exact expected test database (`namlatic_hotel_test` or `TEST_DB_NAME`).
   - Explicit allowed-host enforcement rejecting unauthorized remote hosts while supporting custom CI hosts via `TEST_DB_ALLOWED_HOSTS`.
   - Successful validation and extraction of sanitized test database metadata (name, host, test role).
   - Runtime role privilege verification (`verifyTestRolePrivileges`): Queries PostgreSQL catalog `pg_roles` at runtime to ensure `rolsuper=false`, `rolcreatedb=false`, and `rolcreaterole=false`.
10. **`cookieHelper.test.js` (18 tests - Phases 5F-A2.2 & 5F-A2.3):**
    - `parseCookies`: Handles falsy, non-string, single, multiple, quoted values, URI decoding, and malformed encoding.
    - `sanitizeIp`: Validates IPv4, IPv6, IPv4-mapped IPv6, and returns null for non-IP strings, port-appended IPs, or injection attempts.
    - `truncateUserAgent`: Preserves <= 512 chars, truncates > 512 chars, and handles non-string values.
    - Cookie header builders & RFC 6265bis: Verifies `__Host-` prefix rules (Path=/, no Domain, HttpOnly, SameSite=Lax, Secure in production and HTTPS development).
    - Safe plain-HTTP dev fallback: Verifies `getSessionCookieName` and `buildSessionCookie` select `namlatic_session` without Secure when `plainHttpDev: true` is explicitly configured outside production.
11. **`proxySecret.middleware.test.js` (15 tests - Phases 5F-A2.2 & 5F-A2.3):**
    - `timingSafeSecretCompare`: Constant-time comparison of matching secrets, rejection of differing secrets of same or different lengths without throwing.
    - `verifyProxySecret`: Narrow probe exemption strictly limited to GET and HEAD on `/health` and `/ready`, query string normalization, strict 403 rejection of non-GET methods (`POST /api/health`, `DELETE /api/ready`) and subpaths without proxy secret, rejection of missing or invalid `x-vercel-proxy-secret` (HTTP 403), acceptance of current secret and old secret during rotation.
12. **`csrf.middleware.test.js` (16 tests - Phases 5F-A2.2 & 5F-A2.3):**
    - Safe HTTP methods bypass (`GET`, `HEAD`, `OPTIONS`).
    - Custom header enforcement: Missing or invalid `X-Requested-With` rejected with HTTP 403; case-insensitive `XMLHttpRequest` accepted.
    - Fetch Metadata defense: Rejection of `Sec-Fetch-Site: cross-site`, lowercase normalization, and rejection of unexpected metadata values with HTTP 403.
    - Origin & Referer validation: Rejection of `Origin: null`, rejection of untrusted origin, acceptance of trusted origin in `env.corsOrigins`, safe Referer fallback, and safe 403 rejection on malformed Referer (never HTTP 500).
13. **`auth.middleware.test.js` (6 tests - Phases 5F-A2.2 & 5F-A2.3):**
    - Cache prevention header: Injects `Cache-Control: private, no-store, no-cache, max-age=0, must-revalidate` unconditionally.
    - Missing cookie rejection: HTTP 401 when session cookie is absent.
    - Invalid session rejection: HTTP 401 when token is invalid or expired.
    - Profile attachment: Populates `req.user`, `req.sessionId`, `req.rawSessionToken` on valid session.
    - Environment cookie differentiation: Strictly rejects plain-HTTP dev cookie in production; accepts dev cookie in development mode.
14. **`loginThrottler.test.js` (15 tests - Phase 5F-A2.2):**
    - IP Rate Limiting: Blocks IP after 5 failed attempts with HTTP 429 and `retryAfter`.
    - No Global Lockout: Legitimate owner from independent IP is never blocked by attacks on other IPs.
    - Progressive Delays: 0ms for attempts 1-2, 1000ms for attempt 3, 2000ms for attempts 4-5+.
    - Reset on success: Clears IP and pair records upon successful authentication.
    - Bounded LRU store & Memory Benchmark: 10,000 entry limit, evicts oldest entry, and heap benchmark asserts < 25 MB growth under 10,000 entries.
15. **`session.service.test.js` (10 tests - Phases 5F-A2.2 & 5F-A2.3):**
    - Security Lifecycles: 7-day hard absolute lifetime (`expires_at`), 2-hour sliding idle timeout (`idle_expires_at`), 5-minute sliding refresh throttle (`REFRESH_THROTTLE_MS`).
    - Token generation: Generates 256-bit (64 hex characters) cryptographically secure random tokens.
    - Token hashing: Consistent lowercase SHA-256 hex digest, raw token never stored in database.
    - Input validation: Safe rejection of null/non-string tokens without throwing.
    - Race condition protection: Detects concurrent session revocation during sliding idle update and returns null.

---

## 3. Integration Testing Suite (`tests/integration/`)

Communicates over HTTP to an isolated Express test instance on port 5001 connected to live PostgreSQL 18.6:

> [!NOTE]
> Object storage operations in integration tests are tested using an injectable mock S3 client (`s3ClientMock`), while all database transactions execute against live PostgreSQL 18.6. This verifies upload orchestration, compensating deletes, and database rollbacks end-to-end without requiring cloud accounts or network latency.

### Test Breakdown (63 tests):
- **Part 1 (POST):** Valid creation with/without JPEG and PNG, validation errors, magic bytes spoofing, 5 MB limit, and upload file cleanup on failure.
- **Part 2 (GET List):** Retrieval of collection, prefix search (`lower(title) LIKE lower($1) || '%'`), price range filters, pagination slices, and parameter validation.
- **Part 3 (GET Detail):** Retrieval of existing record, 404 on nonexistent record, 400 on non-integer, zero, and negative IDs.
- **Part 4 (PUT):** Update without image (preserves old image), update with new image (deletes old image from configured storage provider: local disk in dev/test, Cloudflare R2 in prod), invalid updates (preserves existing image and cleans up new upload), 404 handling.
- **Part 5 (DELETE):** Deletion of hotel with image (verifies object removed from configured storage provider), deletion without image, 404 handling, and graceful tolerance when image is already missing from storage provider.
- **Part 6 (GET /api/hotels/stats):** Verifies HTTP 200 aggregate structure, total properties exact database count match, and properties with images strictly reflecting non-null `image_path` records in PostgreSQL.
- **Part 7 (Security & Storage Integrity):** Path traversal block verification, confirmation of zero orphaned files in `server/src/uploads/hotels`.
- **Part 8 (Database Connectivity & Health Probes - Phase 5B):** Liveness probe (`GET /api/health`), readiness probe (`GET /api/ready`), and database connection pool verification.
- **Part 9 (Hardening, Security Headers, CORS & Rate Limiting - Phase 5C):**
  - Verifies Helmet security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Resource-Policy: cross-origin`, and Content Security Policy).
  - Verifies CORS allowlist accepts requests from authorized origin (`http://localhost:5173`) with appropriate `Access-Control-Allow-Origin`.
  - Verifies CORS rejects unauthorized origins with HTTP 403 Forbidden.
  - Verifies CORS preflight `OPTIONS` requests respond with HTTP 204 and cached max age.
  - Verifies JSON body size cap rejects payloads exceeding 10 KB with HTTP 413.
  - Verifies health probes (`/api/health` and `/api/ready`) bypass rate limiting.
- **Part 10 (Cloudflare R2 Storage & Resilience Scenarios - Phases 5D & 5D.1, Tests 53–63):**
  - Test 53: Create hotel with image using R2 storage driver (verifies S3 PutObject called with verified MIME, CacheControl header, database stores `r2:` reference, API returns public CDN URL).
  - Test 54: Create hotel without image using R2 storage driver (preserves null `image_path`).
  - Test 55: Update hotel with replacement image (uploads new image, updates database, deletes old R2 object from bucket).
  - Test 56: Update hotel without replacement image (preserves existing R2 image reference and object).
  - Test 57: Delete hotel with R2 image (deletes database record first, then deletes R2 object from bucket).
  - Test 58: R2 upload failure handling (cleans up staged temporary file, aborts before database insert, returns HTTP 500 without orphan database record).
  - Test 59: Compensating delete on database insert failure (deletes newly uploaded R2 object if database insert fails).
  - Test 60: Database update failure during image replacement (compensating delete of new R2 object, leaves existing database reference and old R2 object untouched).
  - Test 61: R2 deletion failure tolerance on hotel deletion (database deletion succeeds, logs orphan warning, returns HTTP 200 without rollback).
  - Test 62: Legacy local image reference compatibility (retrieval and updates correctly resolve and delete legacy `/uploads/hotels/...` references alongside R2).
  - Test 63: Database connection acquisition failure during update (compensating delete of newly uploaded R2 object when `db.pool.connect()` fails, safely bypassing rollback/release on unacquired client).
- **Part 11 (Authentication Schema, Migrations & CLI Tools - Phase 5F-A2.1 & 5F-A2.1.1, 17 tests in `tests/integration/auth.database.test.js`):**
  - Migration repeat-safety & concurrency: Re-running `runMigrations()` is idempotent, succeeds without re-applying, records migration versions in `schema_migrations`, detects concurrent lock `MIGRATION_ADVISORY_LOCK_ID = 987654322`, exits cleanly without running migrations (`locked: true`), and ensures lock release.
  - Session Expiry Index Optimization (Migration 003): Verifies `idx_sessions_expires_at` and `idx_sessions_idle_expires_at` exist as separate single-column B-tree indexes, and confirms legacy composite index `idx_sessions_cleanup` does not exist.
  - Users schema: Columns (`id`, `email`, `password_hash`, `role`, `status`, `created_at`, `updated_at`), email uniqueness constraint (`23505`), partial unique index singleton (`idx_users_owner_singleton`), and email normalization check constraint (`chk_users_email_normalized`).
  - Sessions schema: Columns, token hash uniqueness constraint (`23505`), timestamp constraints (`chk_sessions_expires_after_created`), and foreign-key cascade (`ON DELETE CASCADE` removes user sessions upon user deletion).
  - One-time owner bootstrap CLI: Initial account creation, Argon2id verification of stored hash, non-overwriting behavior on subsequent runs, and race-condition safety under concurrent execution via advisory lock `pg_try_advisory_xact_lock`.
  - Administrative password recovery CLI: Updating owner password hash, revoking all active sessions atomically, and clean rejection when no owner exists.
  - Dedicated test database isolation & safe record tracking: Tests execute exclusively against `namlatic_hotel_test` via `getTestPool()`. All created test users are tracked by ID in `createdUserIds` and cleaned up strictly via `WHERE id = ANY($1::bigint[])`, eliminating destructive broad owner deletions (`DELETE FROM users WHERE role = 'owner'`). Zero modification or loss of existing hotel inventory records.
- **Part 12 (Owner Authentication, Sessions & Route Protection - Phase 5F-A2.2, 38 tests in `tests/integration/auth.api.test.js`):**
  - Health & readiness probes: `GET /api/health` and `GET /api/ready` succeed (HTTP 200) without proxy secret, without session cookies, and without CSRF headers.
  - Reverse proxy secret verification: Rejection of missing `x-vercel-proxy-secret` (HTTP 403), rejection of invalid secret (HTTP 403), acceptance of matching secret.
  - Tokenless CSRF defense: State-changing POST/PUT/DELETE requests missing `X-Requested-With: XMLHttpRequest` rejected (HTTP 403), `Origin: null` rejected (HTTP 403), untrusted Origin rejected (HTTP 403), `Sec-Fetch-Site: cross-site` rejected (HTTP 403), trusted Origin accepted.
  - Owner login endpoint (`POST /api/auth/login`): Rejection of missing credentials (HTTP 400), invalid email syntax (HTTP 400), non-existent owner (HTTP 401 generic message), suspended owner (HTTP 401), wrong password (HTTP 401), successful login sets `__Host-namlatic_session` HttpOnly cookie and returns safe user profile without password hash, rate-limit triggering HTTP 429 when IP exceeds 5 failed attempts in 15 minutes.
  - Session inspection (`GET /api/auth/me`): Rejection when cookie missing (HTTP 401), rejection of invalid/bogus token (HTTP 401), acceptance of valid session returning owner profile, cache-control header verification (`private, no-store, no-cache, max-age=0, must-revalidate`), idle timeout expiration (HTTP 401), absolute lifetime expiration (HTTP 401), and sliding idle extension when > 5 minutes have elapsed.
  - Owner logout endpoint (`POST /api/auth/logout`): Revokes session in PostgreSQL, clears cookie in browser (`Max-Age=0`), subsequent `/me` returns HTTP 401, idempotent repeat logout succeeds cleanly.
  - Private hotel route protection: Tests EVERY hotel endpoint (`GET /api/hotels`, `GET /api/hotels/stats`, `GET /api/hotels/:id`, `POST /api/hotels`, `PUT /api/hotels/:id`, `DELETE /api/hotels/:id`), confirming unauthenticated requests are blocked with HTTP 401 and direct requests without proxy secret are blocked with HTTP 403, while authenticated requests succeed with HTTP 200.

---

## 4. Frontend Unit Testing Suite (`client/src/test/`)

Built using **Vitest** + **React Testing Library** + **@testing-library/jest-dom** with `jsdom`:

### Test Suites Breakdown (98 tests):
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
7. **`HotelFormPage.test.jsx` (7 tests):**
   - Route parsing for `/hotels/new` (create mode) and `/hotels/:id/edit` (edit mode).
   - Non-numeric ID parameter validation.
   - Rejection of route ID exceeding PostgreSQL BIGINT maximum (`9223372036854775808`).
   - Graceful 404 handling with ErrorAlert and Return button.
   - Edit form pre-population from API.
   - Create property submission and navigation.
   - Complete edit flow: field mutation, Redux items update, list refresh trigger, and navigation.
8. **`HotelLocationMap.test.jsx` (15 tests - Phase 4C):**
   - `isValidCoordinate`: Validates standard coordinates `(24.453884, 54.377344)` and `(0, 0)`.
   - `isValidCoordinate`: Accepts boundary coordinates `(90, 180)` and `(-90, -180)`.
   - `isValidCoordinate`: Accepts valid southern and western negative coordinates (Sydney `-33.8688, 151.2093`, Santiago `-33.4489, -70.6693`).
   - `isValidCoordinate`: Rejects out-of-range latitude (`90.000001`, `-90.000001`, `120`, `-150`).
   - `isValidCoordinate`: Rejects out-of-range longitude (`180.000001`, `-180.000001`, `200`, `-200`).
   - `isValidCoordinate`: Rejects `NaN`, `Infinity`, and non-numeric values.
   - Component rendering: Renders map container with valid coordinates and correct `aria-label`.
   - Component rendering: Safely parses string coordinates from PostgreSQL `NUMERIC` columns.
   - Component rendering: Renders map with negative coordinates.
   - Component rendering: Verifies compliant OpenStreetMap tile URL (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`).
   - Component rendering: Renders accessible `map-unavailable` fallback when latitude > 90.
   - Component rendering: Renders accessible `map-unavailable` fallback when longitude < -180.
   - Component rendering: Renders fallback when coordinates are non-numeric strings or `NaN`.
   - Dynamic map-center update: Verifies `MapViewController` calls `map.setView()` and moves marker when coordinates change after mount.
   - Effect stability: Verifies `MapViewController` does NOT call `map.setView()` again on unrelated parent rerenders with unchanged coordinates.
9. **`HotelDetailsPage.test.jsx` (28 tests - Phase 4C):**
   - `formatDateTime`: Formats ISO timestamps into localized dates (`Nov 6, 2026, 4:00 PM`).
   - `formatDateTime`: Returns `null` for null, undefined, or empty timestamps.
   - `formatDateTime`: Returns `null` for invalid date strings.
   - `isValidRouteId`: Accepts valid small and large BIGINT strings up to `9223372036854775807`.
   - `isValidRouteId`: Rejects numbers exceeding PostgreSQL BIGINT maximum (`9223372036854775808`).
   - `isValidRouteId`: Rejects zero, negative numbers, decimals, and malformed strings.
   - `isValidRouteId`: Rejects leading, trailing, and surrounding whitespace without trimming.
   - `isValidRouteId`: Full regression suite verifying required boundary and invalid inputs.
   - Route validation: Accepts valid large PostgreSQL BIGINT ID (`9223372036854775807`) and dispatches string ID.
   - Route validation: Rejects non-numeric hotel ID (`/hotels/abc`) and displays error alert.
   - Route validation: Rejects route parameter with whitespace (`/hotels/ 123`) without calling API.
   - Route validation: Rejects negative ID (`/hotels/-10`) without API fetch.
   - Route validation: Rejects zero ID (`/hotels/0`) without API fetch.
   - Route validation: Rejects decimal ID (`/hotels/12.34`) without API fetch.
   - Route validation: Rejects malformed strings (`/hotels/12abc`) without API fetch.
   - Route validation: Rejects IDs exceeding PostgreSQL BIGINT maximum (`9223372036854775808`).
   - Loading state: Renders loading spinner and message while fetching details.
   - 404 Not Found: Renders dedicated 404 state with property ID and "Return to My Hotels" button.
   - General error: Renders `ErrorAlert` banner with "Try Again" retry action on network failure.
   - Success rendering: Renders title, coordinates pill, price, description, and location map.
   - Hero media: Renders `<img>` when `image_path` is present.
   - Fallback media: Renders clean SVG "No Image Available" placeholder when `image_path` is null.
   - Media error handling: Falls back to placeholder if image fails to load (`onError` event).
   - Audit history: Renders "Created" and "Updated" timestamps when returned by backend.
   - Audit history: Omits audit history section when timestamps are null.
   - Navigation links: "Edit Hotel" links to `/hotels/:id/edit` and "Back to My Hotels" links to `/hotels`.
   - Dynamic navigation: Handles route ID change without page reload (`/hotels/71` to `/hotels/72`), updating map props.
   - Cleanup on unmount: Dispatches `clearCurrentHotel()` and aborts active promise when unmounting.
10. **`vercelConfig.test.js` (11 tests - Phase 5E):**
   - Schema validation: Validates `client/vercel.json` against official `$schema` (`https://openapi.vercel.sh/vercel.json`).
   - SPA rewrite source: Verifies rewrite source pattern captures all routes (`/(.*)`).
   - SPA rewrite destination: Verifies rewrite destination routes to root `/index.html`.
   - Static asset preservation: Verifies that physical static build assets (`/assets/*`, `/favicon.ico`) are served directly by Vercel before the SPA rewrite fallback fires.
   - Baseline security headers: Verifies mandatory security headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy`).
   - Permissions-Policy restriction: Confirms restrictive permissions policy disabling camera, microphone, geolocation, payment, and usb APIs.
   - HSTS header scoping: Verifies `Strict-Transport-Security` enforces `max-age=31536000` without unverified `includeSubDomains` or `preload` flags.
   - Obsolete header avoidance: Confirms deprecated and counter-productive headers like `X-XSS-Protection` are strictly omitted.
   - Environment documentation completeness: Verifies `client/.env.example` documents all required frontend variables (`VITE_API_URL`, `VITE_API_ORIGIN`, `VITE_APP_CURRENCY`).
   - Build-time secret exclusion: Asserts `client/.env.example` warns about Vite build-time client bundling and strictly forbids backend secrets (`DATABASE_URL`, R2 keys, passwords).
   - Deployment artifact safety: Confirms root directory has no duplicate `vercel.json` and `.gitignore` includes the `.vercel` build cache directory.
11. **`apiEnv.test.js` (26 tests - Phase 5E.2):**
   - Production API URL requirement: Rejects missing, empty, or whitespace-only `VITE_API_URL` in production.
   - Legacy variable rejection: Strictly rejects legacy-only `VITE_API_BASE_URL` in production.
   - Absolute URL validation: Rejects malformed and relative URL inputs (`/api`, `not-a-url`) in production.
   - Protocol security: Rejects unencrypted HTTP URLs in production, enforcing HTTPS.
   - API path convention: Enforces documented `/api` path suffix on `VITE_API_URL`.
   - Credential defense: Rejects embedded credentials in `VITE_API_URL` (`user:pass@`).
   - Query string defense: Rejects query parameters in `VITE_API_URL` (`?key=val`).
   - Fragment defense: Rejects URL fragments in `VITE_API_URL` (`#hash`).
   - Localhost defense: Rejects localhost, `127.0.0.1`, and `::1` hostnames in production.
   - Normalization: Verifies trailing slash normalization (`https://api.namlatic.com/api/` -> `https://api.namlatic.com/api`).
   - Localhost fallback: Confirms safe fallback to `http://localhost:5000/api` and `http://localhost:5000` in development and test modes.
   - Legacy compatibility: Verifies `VITE_API_BASE_URL` works in development when `VITE_API_URL` is unset.
   - Precedence: Confirms `VITE_API_URL` takes precedence over legacy `VITE_API_BASE_URL` in development.
   - Origin derivation: Derives `API_ORIGIN` directly from `VITE_API_URL` without the `/api` path when `VITE_API_ORIGIN` is omitted.
   - Explicit origin override: Respects `VITE_API_ORIGIN` override when valid HTTPS.
   - Origin security validation: Rejects non-HTTPS, credentials, queries, fragments, or localhost on `VITE_API_ORIGIN` in production.
   - Absolute HTTPS image preservation: Preserves absolute HTTPS URLs without rewriting.
   - Mixed-content prevention: Rejects unencrypted HTTP image URLs in production by returning `null`.
   - Local testing HTTP support: Permits HTTP image URLs in development for local testing.
   - Cloudflare R2 preservation: Preserves absolute `https://pub-*.r2.dev/hotels/...` URLs without rewriting.
   - Previews preservation: Preserves `data:` and `blob:` preview URLs without rewriting.
   - Legacy relative media resolution: Verifies `getImageUrl('/uploads/hotels/photo.jpg')` resolves against origin without appending `/api`.
   - Path without leading slash: Correctly prepends leading slash for relative media paths.
   - Null handling: Safely returns `null` for null, undefined, empty, or whitespace image paths.

---

## 5. Running the Tests

### Backend Tests (428 tests):
From the `server` directory:
```powershell
# Run all backend tests (Unit tests + Integration tests)
npm test

# Run only backend unit tests (lightning-fast Node native runner)
npm run test:unit

# Run only backend integration tests (requires TEST_DATABASE_URL)
npm run test:integration
```

### Frontend Tests (139 tests):
From the `client` directory:
```powershell
# Run all frontend unit tests with Vitest
npm test

# Run Vitest in interactive watch mode
npm run test:watch
```

### Total Test Suite Count:
- **Backend Unit Tests:** 272 passed (15 test suites)
- **Backend Integration Tests:** 156 passed (63 hotel API + 18 auth/migrations + 75 auth API)
- **Frontend Unit Tests:** 139 passed (11 test suites)
- **Total Automated Tests:** **567 / 567 passed (100% pass rate)**

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
