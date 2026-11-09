# Technical Interview Preparation Guide

This guide prepares you to defend every engineering decision in the Namlatic Hotel Owner Portal during technical interviews.

---

### Q1: Why did you choose PostgreSQL over MongoDB or MySQL?
> **Answer:** "For hotel inventory management, data integrity and relational constraints are paramount. PostgreSQL provides strict type enforcement, native `NUMERIC(12,2)` for exact base-10 currency arithmetic without floating-point errors, and spatial range check constraints ($-90$ to $+90$ for latitude). Furthermore, PostgreSQL's `text_pattern_ops` indexing allows high-performance B-tree prefix searching on text fields without being hindered by locale collations. MySQL could support basic relations, but PostgreSQL offers superior constraint checks and ACID transaction isolation. MongoDB was avoided because hotel records are relational and structured; using a document store would have forced us to implement integrity constraints and coordinate checks at the application level rather than in the database engine."

---

### Q2: Why did you use native SQL instead of an ORM like Prisma or Sequelize?
> **Answer:** "Using native parameterized SQL with `pg.Pool` gave us three distinct advantages:
> 1. **Complete Control:** We can leverage specific PostgreSQL features like `lower(title) text_pattern_ops`, `INSERT ... RETURNING`, and row locking with `SELECT ... FOR UPDATE` during image replacements.
> 2. **Performance & Predictability:** ORMs frequently generate inefficient subqueries or cause the 'N+1' query problem. With native SQL, every query executed is explicit, transparent, and easily optimized using `EXPLAIN ANALYZE`.
> 3. **Security:** By utilizing parameterized queries (`$1`, `$2`), user inputs are sent as separate parameters over the PostgreSQL protocol, strictly separating query syntax from data and preventing untrusted input from modifying the query structure without relying on an ORM abstraction."

---

### Q3: Why does your backend return price as a string instead of a number in JSON?
> **Answer:** "In JavaScript, all numbers are 64-bit IEEE 754 double-precision floating-point numbers. If a high-precision decimal number or large financial calculation is parsed directly as a JavaScript `Number`, floating-point rounding errors can occur. The Node.js PostgreSQL driver (`node-pg`) intentionally returns `NUMERIC` types as strings to preserve full decimal precision and avoid silent precision degradation. In the frontend, we format and display it using `Intl.NumberFormat` for currency presentation."

---

### Q4: How do you prevent filesystem and database inconsistency during image updates and deletions?
> **Answer:** "A major challenge in full-stack architecture is that operating system filesystem mutations cannot be rolled back by database transactions. To solve this, we implemented a staged two-phase execution:
> - On `PUT`: The new photo is tentatively saved. If validation or the database transaction fails, the newly uploaded image is unlinked immediately, and the existing image remains intact. Only *after* the PostgreSQL transaction successfully commits do we delete the old image from disk.
> - On `DELETE`: We use `DELETE FROM hotels WHERE id = $1 RETURNING id, image_path;`. If the database delete succeeds, we unlink the file from disk using a path-traversal-safe utility. If the database query fails, the file is never deleted."

---

### Q5: How do you protect your upload endpoints against malicious files and directory traversal?
> **Answer:** "We implement defense-in-depth security:
> 1. **Size Limits:** Multer rejects any payload exceeding 5 MB before buffering to prevent memory exhaustion DoS.
> 2. **Magic Byte Verification:** An attacker can disguise a PHP script as `avatar.jpg` and send a spoofed `image/jpeg` MIME header. Our middleware reads the first 12 binary bytes directly from the file on disk and verifies that the file signature matches JPEG (`FF D8 FF`), PNG (`89 50 4E 47`), or WebP (`RIFF...WEBP`). If the signature doesn't match, the file is immediately unlinked and rejected with HTTP 400.
> 3. **Path Traversal Defense:** Filenames are generated on the server using `crypto.randomUUID()`. When deleting files, `safeDeleteHotelImage` uses `path.basename()` and verifies with `path.relative()` that the resolved path is strictly contained within `server/src/uploads/hotels` and never targets protected files like `.gitkeep`."

---

### Q6: What is the difference between your unit tests and integration tests?
> **Answer:** "Our **backend unit tests** (42 tests) test individual functions in complete isolation with zero external dependencies. They verify input validation rules (coordinates, prices, titles, pagination boundaries, 64-bit BIGINT ranges, strict non-trimmed whitespace rejection, safe vs unsafe integer enforcement), binary magic byte detection, path traversal blocks, and database error mapping. They execute in under 400 ms using Node.js's native `node:test` runner.
> Our **backend integration tests** (43 tests) test the entire system end-to-end: they launch an Express test server on an isolated port, issue HTTP fetch requests with multipart form data, write and delete files on disk, and execute live queries against PostgreSQL 18.6, asserting both database state and disk storage integrity.
> Our **frontend unit tests** (102 tests) run with Vitest and React Testing Library, testing UI components, form validation rules, image lifecycle cleanup, dynamic Leaflet map-center synchronization with primitive dependencies, route BIGINT safety without trimming, Redux slices, and mock API flows with 100% reliability.
> Across the entire application, **187 automated tests** pass with a 100% pass rate."

---

### Q7: Where did you choose native browser / platform features instead of third-party npm packages?
> **Answer:** "To prevent dependency bloat and minimize vulnerability surface area, we prioritized native features:
> - **Image Preview:** Used native browser `URL.createObjectURL(file)` and revoked it with `URL.revokeObjectURL(url)` upon unmount, eliminating the need for an external image preview package.
> - **Unit Testing:** Used modern Node.js native `node:test` and `node:assert`, avoiding Jest/Mocha dependencies.
> - **HTTP Communication:** Native `fetch()` and `FormData`.
> - **Responsive Design:** Native CSS Grid, Flexbox, and media queries without bloated UI CSS frameworks."

---

### Q8: What are the current production limitations of this project, and how would you address them?
> **Answer:** "The primary limitation is media persistence. Currently, images are saved to the server's local filesystem. On cloud platforms like Render or AWS ECS with ephemeral containers, local files are wiped upon re-deployment. In a production environment, I would decouple file storage by streaming uploads directly to Amazon S3 or Google Cloud Storage using pre-signed URLs, storing only the CDN URLs in PostgreSQL. Second, I would add image re-encoding via `sharp` to strip malicious EXIF metadata and optimize image compression."

---

### Q9: How does the reusable `HotelForm` support both Create and Edit modes cleanly?
> **Answer:** "We use a single component `<HotelForm />` parameterized with `isEdit` and `initialData`:
> - In **Create Mode** (`/hotels/new`), the form mounts with blank field values and an empty image placeholder. Submitting assembles a new `FormData` payload and dispatches `createHotel()`.
> - In **Edit Mode** (`/hotels/:id/edit`), the page container fetches the existing record by ID and passes it to `initialData`. The form populates all text inputs and displays the existing hero photo (`initialData.image_path`). If the user modifies text fields without choosing a new photo, the form omits the `image` field so the backend preserves the existing image. If the user selects a replacement photo, an instant blob preview is displayed along with a 'Revert to Original' button to restore the original state if desired."

---

### Q10: How does browser image preview work with `URL.createObjectURL()`, and why must it be revoked?
> **Answer:** "When a user selects an image from an `<input type="file" />`, the browser provides a `File` object (an immutable binary `Blob` stored on the client disk).
> - Instead of converting the file into a heavy base64 string using `FileReader.readAsDataURL()` (which increases memory usage by ~33% and blocks the main thread for large photos), `URL.createObjectURL(file)` creates a lightweight reference URL (e.g. `blob:http://localhost:5173/3f9...`) pointing directly to the browser's internal file buffer.
> - **Memory Lifecycle:** The browser holds that blob URL in memory until the entire document is closed unless explicitly freed. If a user selects multiple images or navigates back and forth, unreleased URLs cause client memory leaks. In our component, we revoke the previous blob URL whenever a replacement file is chosen, and we attach a cleanup function in a `useEffect` hook to invoke `URL.revokeObjectURL()` automatically when the component unmounts."

---

### Q11: What is `FormData`, and why must we NOT manually set `Content-Type: multipart/form-data`?
> **Answer:** "`FormData` is a native browser API that compiles form fields and binary file streams into a format suitable for transmission via HTTP multipart requests.
> - A `multipart/form-data` request requires a unique boundary parameter in the `Content-Type` header (e.g. `Content-Type: multipart/form-data; boundary=----WebKitFormBoundaryX...`) which the server's multipart parser (Multer) uses to delineate separate fields and binary chunks.
> - When `FormData` is passed to `fetch(url, { method: 'POST', body: formData })`, the browser automatically generates this header with the exact boundary string.
> - If a developer manually specifies `headers: { 'Content-Type': 'multipart/form-data' }`, the crucial boundary parameter is missing. The server cannot split the body parts and will fail to parse the incoming fields, returning a 400 or 500 error."

---

### Q12: How is validation coordinated between the frontend, backend, and database (Defense-in-Depth)?
> **Answer:** "We validate data across three independent layers:
> 1. **Client Tier (`HotelForm.jsx`):** Immediate UX feedback on blur and submit. Checks title length ($\le 255$), description length ($\le 5000$), coordinates ($-90 \le \text{lat} \le 90$, $-180 \le \text{long} \le 180$, max 6 decimals), positive price (max 2 decimals), and file format/size ($\le 5\text{ MB}$). Automatically focuses the first invalid field for accessibility.
> 2. **Backend API Tier (`hotel.validator.js` & `upload.middleware.js`):** Sanitizes inputs, trims whitespace, verifies decimal precision, and checks 12-byte binary magic bytes on disk. This protects against direct API consumers, cURL, or Postman requests that bypass the React frontend.
> 3. **Database Tier (PostgreSQL 18.6):** Enforces relational integrity using strict types (`NUMERIC(12,2)`) and database check constraints (`chk_hotels_price_positive`, `chk_hotels_latitude_range`, etc.). Database constraint errors are mapped by our controller into clean, human-readable messages without leaking internal schema details."

---

### Q13: Why did you choose Leaflet and OpenStreetMap over Google Maps or Mapbox?
> **Answer:** "For hotel inventory location display, Leaflet 1.9.4 and OpenStreetMap provide three decisive advantages:
> 1. **Zero External Billing / Free & Open Source:** Google Maps JavaScript API and Mapbox GL require credit card registration, billing accounts, and paid API key management. OpenStreetMap raster tiles are free and community-governed.
> 2. **Lightweight Footprint:** Leaflet is approximately 40 KB gzipped, whereas the Google Maps SDK is over 150 KB and loads third-party tracking scripts that impact Core Web Vitals.
> 3. **Privacy & Legal Compliance:** OpenStreetMap tile loading respects user privacy without collecting advertising identifiers. We include the mandatory OpenStreetMap copyright attribution string directly on the tile layer in accordance with the ODbL license."

---

### Q14: How did you resolve Leaflet marker icon asset bundling in Vite?
> **Answer:** "Leaflet was historically written before modern ESM bundlers. By default, Leaflet attempts to detect the path of `marker-icon.png` relative to its loaded stylesheet URL, which fails in Vite because Vite hashes and relocates assets (e.g. `/assets/marker-icon-[hash].png`).
> To solve this robustly:
> 1. We directly imported the icon assets in `HotelLocationMap.jsx`:
>    ```javascript
>    import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
>    import markerIcon from 'leaflet/dist/images/marker-icon.png';
>    import markerShadow from 'leaflet/dist/images/marker-shadow.png';
>    ```
> 2. We explicitly created the Leaflet icon instance with `L.icon({ iconUrl, iconRetinaUrl, shadowUrl, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] })`.
> 3. This guarantees that Vite includes and hashes all retina and shadow assets in the production bundle, and the pin's bottom anchor `[12, 41]` accurately points to the exact geographic coordinate at any zoom level."

---

### Q15: How do you handle numeric coordinates from PostgreSQL and guard against invalid geographic bounds?
> **Answer:** "PostgreSQL `NUMERIC` columns are returned by `node-pg` as strings (e.g., `'24.453884'`) to prevent IEEE 754 precision loss.
> In `HotelLocationMap`, we convert coordinates using `typeof === 'number' ? coord : Number(coord)` and validate them against geographic boundaries:
> - Latitude: $-90.0 \le \text{lat} \le +90.0$
> - Longitude: $-180.0 \le \text{lng} \le +180.0$
> - Finite numbers: rejects `NaN`, `null`, `undefined`, and `Infinity`.
> Southern latitudes and western longitudes (e.g. Sydney at `-33.8688` or Santiago at `-70.6693`) are accepted. If coordinates are out of bounds or missing, the component displays a clean `<div class="map-unavailable-container">` with an SVG alert badge and informative copy without crashing the page or throwing unhandled React exceptions."

---

### Q16: How do you prevent race conditions, memory leaks, and route shadowing on `/hotels/:id`?
> **Answer:** "We addressed each of these potential frontend pitfalls:
> 1. **Route Precedence & Shadowing:** In `App.jsx`, static routes (`/hotels/new`) are defined before dynamic parameterized routes (`/hotels/:id`), preventing the string `'new'` from being captured as an ID parameter. Similarly, `/hotels/:id/edit` precedes `/hotels/:id`.
> 2. **PostgreSQL BIGINT Parameter Validation:** In `HotelDetailsPage.jsx` and `HotelFormPage.jsx`, the `:id` parameter is verified using `isValidRouteId(id)`. This checks that the ID consists of pure decimal digits (`/^\d+$/`) and lies within the valid 64-bit PostgreSQL BIGINT range ($1 \le \text{id} \le 9223372036854775807$) using native JavaScript `BigInt`. Invalid or overflowed IDs immediately set an error state without dispatching an unnecessary backend network call, while preserving the raw string ID for the HTTP fetch to avoid IEEE 754 precision loss.
> 3. **Promise Abort & Cleanup:** When `fetchHotelById(id)` is dispatched, its RTK promise is retained. On component unmount, `promise.abort()` cancels the inflight HTTP request, and `dispatch(clearCurrentHotel())` resets the current hotel in the Redux store so that stale property data never flashes when switching hotels."

---

### Q17: How did you implement dynamic SEO and head management with React Helmet Async?
> **Answer:** "In a Single Page Application (SPA), the browser document title and meta description reside in `index.html` unless dynamically mutated. We wrapped the application in `<HelmetProvider>` and placed `<Helmet>` inside `HotelDetailsPage.jsx`:
> - Dynamic Title: Renders `${hotel.title} | Namlatic Hotel Portal` when loaded, `Hotel Not Found | Namlatic Hotel Portal` on 404, or `Hotel Details | Namlatic Hotel Portal` during initial load.
> - Dynamic Meta Description: Dynamically truncates the hotel description to 155 characters followed by an ellipsis (`...`), conforming to search engine snippet best practices.
> - Heading Hierarchy: The page employs a single `<h1>` for the hotel title, with content sections using `<h2>` and accessible `aria-labelledby` linkages."

---

### Q18: Why doesn't React Leaflet's `MapContainer` automatically re-center when coordinates change, and how did you resolve it?
> **Answer:** "In React Leaflet v3/v4, the `center` and `zoom` props passed to `<MapContainer>` are initialization properties passed to `L.map()` only when the component mounts. They are intentionally immutable after mount.
> If an owner navigates directly from `/hotels/66` to `/hotels/67` without a page reload, the map viewport remains anchored to the first hotel's coordinates while the marker moves, causing the pin to be off-screen.
> We considered two solutions:
> 1. Giving `MapContainer` a `key` prop based on coordinates: forces React to unmount the entire Leaflet instance and rebuild a new one. This causes a noticeable white flash, destroys the tile cache, and risks DOM memory leaks if event listeners are not cleanly torn down.
> 2. Introducing a lightweight child component `<MapViewController>` that accesses the Leaflet instance via `useMap()` and calls `map.setView([latitude, longitude], zoom)` in a `useEffect` whenever coordinates change.
>
> **Critical Dependency Optimization:** Passing composite objects or arrays (such as `center={[lat, lng]}`) into `MapViewController` causes React's `useEffect` to trigger on every parent render because `[a, b] !== [a, b]` by reference equality (`Object.is`). This would repeatedly reset the user's manual pan and zoom. We resolved this by decomposing the props into primitive numbers (`latitude`, `longitude`, `zoom`) with dependency array `[latitude, longitude, zoom, map]`. Now, `map.setView` is invoked exclusively when geographic coordinates genuinely change."

---

### Q19: How does the application comply with the OpenStreetMap Foundation Tile Usage Policy, and what are the production SLA considerations?
> **Answer:** "We adhere strictly to the official OpenStreetMap Foundation Tile Usage Policy (https://operations.osmfoundation.org/policies/tiles/):
> 1. **Compliant Tile URL:** We use `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. We avoid deprecated subdomain sharding (`{s}.`), as modern HTTP/2 multiplexing makes domain sharding counterproductive and discouraged by the OSM Foundation.
> 2. **Attribution:** The `<TileLayer>` displays visible hyperlinked attribution (`© OpenStreetMap contributors`) linking to the OpenStreetMap copyright page.
> 3. **Usage Restrictions:** We do not implement bulk downloading, offline scraping, or speculative prefetching. We do not alter browser caching headers (`no-cache`) and do not strip the `Referer` header.
> 4. **Production SLA:** Standard OpenStreetMap tile servers are community-funded resources provided on a best-effort basis without a commercial SLA. For high-scale production systems, we document transitioning to dedicated commercial tile providers (e.g. Mapbox, Stadia Maps, Jawg, CartoDB) or hosting an internal tile server using Mapnik or TileServer-GL."

---

### Q20: Why can't we use standard JavaScript `Number` for PostgreSQL BIGINT primary keys?
> **Answer:** "In JavaScript, standard numbers are 64-bit IEEE 754 double-precision floating-point values. They allocate 53 bits for the significand, providing safe integer precision up to `Number.MAX_SAFE_INTEGER` ($2^{53}-1 = 9,007,199,254,740,991 \approx 9 \times 10^{15}$).
> However, PostgreSQL's `BIGINT` (and `BIGSERIAL`) is a 64-bit signed integer with a maximum value of $2^{63}-1 = 9,223,372,036,854,775,807 \approx 9.22 \times 10^{18}$.
> - If an application parses large BIGINT primary keys with `Number(id)` or `parseInt(id, 10)`, values beyond $2^{53}-1$ lose precision (e.g., `9007199254740993` rounds to `9007199254740992`). This can cause destructive data collisions or fetching the wrong record.
> - Furthermore, `Number.isSafeInteger(id)` incorrectly rejects legitimate PostgreSQL BIGINT IDs between $2^{53}$ and $2^{63}-1$.
> - To solve this, we validate IDs as digit strings (`/^\d+$/`) and check the boundary using native ES2020 `BigInt` ($1\text{n} \le \text{id} \le 9223372036854775807\text{n}$) without floating-point conversion. Across network boundaries (REST URLs and JSON bodies), IDs are transmitted and maintained strictly as strings, ensuring exact 64-bit integer preservation end-to-end."
