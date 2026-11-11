# System Architecture: Namlatic Hotel Owner Portal

## 1. High-Level Architecture Overview

The Namlatic Hotel Owner Portal is a decoupled full-stack web application designed for hotel inventory management. It follows modern multi-tier architectural standards with strict separation of concerns:

```
[ Client Tier ]                [ Server Tier ]                  [ Persistence Tier ]
React 18.3.1 + Redux Toolkit ──> Express.js REST API       ──>    PostgreSQL 18.6 (Database)
Native Fetch & FormData        Node.js Native Test Runner ──>    Local / Persistent Disk (Media)
```

### Key Architectural Layers:
1. **Presentation Layer (`client/`):**
   - Single Page Application (SPA) bootstrapped with **Vite 6** and **React 18.3.1**.
   - State management powered by **Redux Toolkit** (`@reduxjs/toolkit`) for centralized caching, async thunk handling, and predictable data updates.
   - Declarative routing powered by **React Router 7**.
   - Client-side SEO headers managed via **React Helmet Async**.
   - Responsive design system with custom CSS custom properties (tokens) adhering strictly to Namlatic's brand identity.
   - Interactive hotel mapping utilizing **Leaflet** (Phase 4C).

2. **Application & Routing Layer (`server/src/app.js`, `routes/`):**
   - **Express.js** application acting as the HTTP interface.
   - Decoupled health probes: `GET /api/health` (process liveness) and `GET /api/ready` (database readiness).
   - Route modules (`server/src/routes/hotel.routes.js`) delegating HTTP handling to controllers.

3. **Controller Layer (`server/src/controllers/`):**
   - Pure request orchestration.
   - Validates input parameters via validator modules before invoking business logic.
   - Sanitizes and formats HTTP responses (`200 OK`, `201 Created`, `400 Bad Request`, `404 Not Found`).
   - Translates low-level database constraint errors into user-friendly messages without leaking schema internals.

4. **Service Layer (`server/src/services/`):**
   - Houses core business logic and transaction orchestration.
   - Manages filesystem operations in coordination with PostgreSQL transactions to maintain referential and physical integrity.
   - Parameterized native SQL generation (no ORM abstraction).

5. **Data & Storage Layer (`server/src/database/`, `uploads/hotels/`):**
   - **PostgreSQL 18.6** relational database engine accessed via `pg.Pool`.
   - Dedicated identity sequences, range constraints, check constraints, composite B-tree indexes, and automatic timestamp triggers.
   - Isolated media storage with cryptographic UUID filename hashing and directory containment checks.

---

## 2. Request-Response Execution Flow

### Hotel Creation / Update Lifecycle (`POST` & `PUT`)

```
Client (multipart/form-data)
   │
   ▼
[ Rate Limiter Middleware (writeLimiter) ]
   ├── Checks client IP request count against window (60 req / 15 min)
   └── If EXCEEDED: Halts request with HTTP 429 before any file I/O
   │
   ▼
[ Multer Middleware ]
   ├── Reads file stream, enforces 5 MB limit
   ├── Assigns crypto.randomUUID() filename with safe extension
   └── Writes tentative file to disk in server/src/uploads/hotels
   │
   ▼
[ Magic Bytes Security Inspection ]
   ├── Reads first 12 binary bytes directly from disk
   ├── Validates header: JPEG (FF D8 FF), PNG (89 50 4E 47), WebP (RIFF...WEBP)
   └── If INVALID: Unlinks file immediately, halts request with HTTP 400
   │
   ▼
[ Controller & Validator Layer ]
   ├── Validates fields: title, description, lat (-90..90), lng (-180..180), price (>0)
   └── If INVALID: Unlinks tentative file immediately, responds with HTTP 400
   │
   ▼
[ Service Layer & Database Transaction ]
   ├── Acquires client from pg.Pool, issues BEGIN
   ├── In PUT: SELECT id, image_path FROM hotels WHERE id = $1 FOR UPDATE
   ├── Executes parameterized INSERT or UPDATE ... RETURNING
   ├── On DB error: ROLLBACK, unlinks tentative file, throws sanitized error
   └── On DB success: COMMIT
   │
   ▼
[ Post-Commit Cleanup ]
   ├── In PUT: Safely unlinks OLD image file (after commit verification)
   └── Responds with HTTP 201 (Created) or HTTP 200 (OK)
```

---

## 3. Directory Structure

```
namlatic-hotel-portal/
├── README.md                          # Project landing documentation
├── docs/                              # Detailed engineering documentation
│   ├── ARCHITECTURE.md                # System topology and execution flow
│   ├── DATABASE_GUIDE.md              # Schema, constraints, triggers, indexes
│   ├── API_DOCUMENTATION.md           # REST API specifications and contracts
│   ├── TESTING_GUIDE.md               # Unit and integration testing strategies
│   ├── TECHNICAL_DECISIONS.md         # Technology trade-offs and rationale
│   ├── TWELVE_FACTOR_COMPLIANCE.md    # 12-Factor App adherence audit
│   └── INTERVIEW_PREPARATION.md       # Technical interview defense guide
├── client/                            # React Frontend (SPA)
│   ├── src/
│   │   ├── app/                       # Redux store configuration
│   │   │   └── store.js
│   │   ├── config/                    # Project configurations
│   │   │   └── currency.js            # Configurable currency formatting (neutral by default, via VITE_APP_CURRENCY)
│   │   ├── components/                # Reusable UI components
│   │   │   ├── HotelCard.jsx          # Property card with image fallback & actions
│   │   │   ├── HotelCardSkeleton.jsx  # Shimmer loading placeholder
│   │   │   ├── HotelForm.jsx          # Reusable Add/Edit form with live preview & validation
│   │   │   ├── HotelLocationMap.jsx   # Interactive Leaflet map with custom retina pins & popup
│   │   │   ├── FilterToolbar.jsx      # Debounced search & price filters
│   │   │   ├── Pagination.jsx         # Server-side pagination controls
│   │   │   ├── DeleteConfirmModal.jsx # Accessible delete confirmation modal
│   │   │   ├── EmptyState.jsx         # Zero-state empty view
│   │   │   └── ErrorAlert.jsx         # Server error banner with retry
│   │   ├── features/hotels/           # Domain-driven Redux slices
│   │   │   └── hotelsSlice.js         # Async thunks, inventory state, stats & filters
│   │   ├── layouts/
│   │   │   └── MainLayout.jsx         # Sidebar navigation, top bar, connection badge
│   │   ├── pages/
│   │   │   ├── DashboardPage.jsx      # Server-aggregated KPIs, quick actions, recent items
│   │   │   ├── HotelDetailsPage.jsx   # Detailed property view, hero image, facts & map (Phase 4C)
│   │   │   ├── HotelFormPage.jsx      # Page container for Create and Edit routes
│   │   │   ├── LandingPage.jsx        # Landing hero and portal overview
│   │   │   └── MyHotelsPage.jsx       # Inventory grid, filter toolbar & pagination
│   │   ├── services/
│   │   │   └── api.js                 # Centralized fetch wrapper & URL builder
│   │   ├── styles/
│   │   │   ├── index.css              # Design tokens, reset, typography
│   │   │   └── App.css                # Layout, components, and responsive rules
│   │   ├── test/                      # Vitest unit test suites (98 tests)
│   │   │   ├── setup.js
│   │   │   ├── HotelDetailsPage.test.jsx
│   │   │   ├── HotelLocationMap.test.jsx
│   │   │   ├── HotelForm.test.jsx
│   │   │   ├── HotelFormPage.test.jsx
│   │   │   ├── HotelCard.test.jsx
│   │   │   ├── hotelsSlice.test.js
│   │   │   ├── FilterToolbar.test.jsx
│   │   │   ├── Pagination.test.jsx
│   │   │   └── EmptyAndErrorStates.test.jsx
│   │   ├── App.jsx                    # Route mapping & HelmetProvider
│   │   └── main.jsx                   # Entry point with Redux Provider
│   ├── package.json
│   └── vite.config.js
└── server/                            # Node.js + Express Backend
    ├── src/
    │   ├── config/                    # Database pool and environment parsing
    │   ├── controllers/               # HTTP request handlers & stats aggregation
    │   ├── services/                  # Business logic and SQL execution
    │   ├── validators/                # Input validation rules
    │   ├── middleware/                # Upload, error handling, security
    │   ├── routes/                    # API route definitions (including /stats)
    │   ├── database/                  # init.sql and verify.sql
    │   └── uploads/hotels/            # Managed media storage
    ├── tests/
    │   ├── unit/                      # Node.js native unit tests (38 tests)
    │   └── integration/               # Full-stack HTTP & DB integration tests (43 tests)
    ├── package.json
    └── .env.example
```

---

## 4. Frontend Component Hierarchy & Redux Data Flow

### 4.1 Component Hierarchy

```
<App>
  └── <HelmetProvider>
        └── <BrowserRouter>
              └── <MainLayout>
                    ├── <Sidebar> (Desktop navigation & live backend indicator)
                    ├── <MobileDrawer> (Slide-out menu for mobile viewports)
                    ├── <Header> (Brand title & owner quick links)
                    └── <Outlet>
                          ├── Route: "/" | "/dashboard" ──> <DashboardPage>
                          │     ├── <StatCard> (Total Properties from DB: COUNT(*))
                          │     ├── <StatCard> (Average Price from DB: AVG(price))
                          │     ├── <StatCard> (Price Range from DB: MIN(price) - MAX(price))
                          │     ├── <StatCard> (Properties with Images: COUNT(image_path))
                          │     └── <RecentPropertiesGrid>
                          │           └── <HotelCard> (x3 preview)
                          │
                          ├── Route: "/hotels" ──> <MyHotelsPage>
                          │     ├── <FilterToolbar> (Debounced search, min/max price)
                          │     ├── Status: loading ──> <HotelCardSkeleton> (x6 shimmer)
                          │     ├── Status: error   ──> <ErrorAlert> (retry trigger)
                          │     ├── Status: empty   ──> <EmptyState> (zero results)
                          │     ├── Status: success ──> <HotelCardGrid>
                          │     │     └── <HotelCard> (xN responsive grid)
                          │     ├── <Pagination> (Page numbers, records range, prev/next)
                          │     └── <DeleteConfirmModal> (Accessible modal with focus trap)
                          │
                          ├── Route: "/hotels/new" | "/hotels/:id/edit" ──> <HotelFormPage>
                          │     └── <HotelForm> (Add/Edit property with live preview)
                          │
                          └── Route: "/hotels/:id" ──> <HotelDetailsPage>
                                ├── <Helmet> (Dynamic property title & meta description)
                                ├── <Breadcrumbs> (My Hotels / Property title)
                                ├── <Header> (Title, coordinate badge, Edit Hotel & Back buttons)
                                ├── <HeroMediaSection> (Image / Accessible No Image placeholder)
                                ├── <FactsGrid> (Price, Geolocation, Audit History timestamps)
                                ├── <DescriptionSection> (Full property description)
                                └── <LocationMapSection>
                                      └── <HotelLocationMap> (Leaflet 1.9.4 OSM map with marker pin & popup)
```

### 4.2 Redux State & Async Data Flow

```
[ User Interaction ] (Search input typing / Price filter / Page change / Delete button)
        │
        ▼
[ Action Dispatch ]
        ├── setTitleFilter(term)
        ├── setPriceFilters({ minPrice, maxPrice })
        ├── setPageOffset(offset)
        ├── fetchHotelStats()          [createAsyncThunk] -> GET /api/hotels/stats
        └── fetchHotels(params)        [createAsyncThunk] -> GET /api/hotels?title=...&limit=6&offset=0
        │
        ▼
[ api.js HTTP Client ]
        ├── GET /api/hotels/stats -> Server-side SQL aggregates
        └── GET /api/hotels?title=sea&limit=6&offset=0 -> Paginated subset
        │
        ▼
[ Backend Express + PostgreSQL 18.6 ]
        ├── SELECT COUNT(*), ROUND(AVG(price), 2), MIN(price), MAX(price), COUNT(image_path) FROM hotels;
        └── SELECT * FROM hotels WHERE lower(title) LIKE lower($1) || '%' ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3;
        │
        ▼
[ Redux hotelsSlice ExtraReducers ]
        ├── fetchHotelStats.fulfilled -> state.stats updated independently from paginated items
        └── fetchHotels.fulfilled     -> state.items = payload.data, state.pagination = payload.pagination
        │
        ▼
[ React Component Re-render via useSelector ]
        ├── <DashboardPage> displays true portfolio metrics from PostgreSQL server-side aggregation
        ├── <MyHotelsPage> re-renders HotelCard grid for active page
        └── <Pagination> recalculates active page and boundary controls
```

### 4.3 Why Dashboard Aggregates Belong in PostgreSQL Rather Than In-Memory

1. **Pagination Isolation:** The hotel list API returns a single slice (e.g. 6 items). Computing averages or rate bounds over 6 items produces invalid metrics that misrepresent the owner's true portfolio.
2. **Filter Independence:** When an owner searches by title or filters by price on the inventory page, Redux updates `state.hotels.items` to only the matching subset. Global dashboard metrics must remain accurate regardless of active search filters.
3. **Database Engine Efficiency:** PostgreSQL calculates `COUNT(*)`, `AVG(price)`, `MIN(price)`, `MAX(price)`, and `COUNT(image_path)` in a single optimized sequential scan in sub-milliseconds without transmitting raw records over the wire.
4. **Exact Decimal Precision:** PostgreSQL's `ROUND(COALESCE(AVG(price), 0), 2)` operates on native arbitrary-precision `NUMERIC` types, eliminating floating-point rounding errors.

---

## 5. Hotel Creation & Editing Architecture (Phase 4B)

### 5.1 Reusable Form Architecture

The portal implements a single, unified `<HotelForm />` component serving two distinct routing contexts:
1. **Create Mode (`/hotels/new`):**
   - Initializes with clean default values.
   - Allows optional image upload with instant client preview.
   - Dispatches `createHotel(formData)` to `POST /api/hotels`.
   - On success, invalidates/refreshes portfolio statistics and navigates to `/hotels` with a flash success toast.
2. **Edit Mode (`/hotels/:id/edit`):**
   - Validates the numeric route `:id` parameter.
   - Dispatches `fetchHotelById(id)` to retrieve existing database values.
   - Populates form inputs and displays the current server-stored hero image (`initialData.image_path`).
   - Allows modifying text fields and optionally choosing a replacement photo.
   - Allows reverting back to the original image via the "Revert to Original" button.
   - Dispatches `updateHotel({ id, formData })` to `PUT /api/hotels/:id`.
   - Preserves the existing image on the backend if no new file is uploaded.

### 5.2 Browser File API & Object URL Lifecycle Management

#### What is a browser `File` object?
When a user selects a file using `<input type="file" />`, the browser provides a `File` object (inheriting from `Blob`). It represents raw immutable binary data on the user's local disk, providing metadata including `.name`, `.size`, and `.type` (MIME).

#### Why use `URL.createObjectURL(file)`?
Instead of reading the entire file into JavaScript memory as a base64 Data URL (which consumes 33% more memory and freezes the UI thread for large images) or uploading the file to a server merely to preview it:
- `URL.createObjectURL(file)` generates a lightweight, synchronous reference URI (e.g. `blob:http://localhost:5173/3f92b7...`) pointing directly to the file data already held in the browser's internal file cache.
- The `<img>` tag renders this blob URL instantly with zero network delay and zero CPU conversion overhead.

#### Why must Object URLs be explicitly revoked?
Browser blob URLs remain registered in browser memory for the entire lifespan of the document window unless explicitly freed. If a user selects several high-resolution photos consecutively or repeatedly mounts/unmounts form views:
- Unrevoked blob URLs lead to significant memory leaks.
- In `HotelForm.jsx`, previous blob URLs are revoked immediately when a new file is chosen (`URL.revokeObjectURL(oldUrl)`), when a replacement is cancelled, and automatically upon component unmount via a `useEffect` cleanup hook:
  ```javascript
  useEffect(() => {
    return () => {
      if (currentBlobUrlRef.current && currentBlobUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }
    };
  }, []);
  ```

### 5.3 Multipart `FormData` & Why Content-Type Headers Must Not Be Manually Set

#### What is `FormData`?
`FormData` is a native browser API that compiles key-value pairs representing form fields and binary file streams into a format suitable for transmission using `multipart/form-data`.

#### Why MUST we NOT manually set `Content-Type: multipart/form-data`?
A multipart HTTP request requires a unique boundary delimiter (e.g. `multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW`) that separates individual fields and binary file chunks within the HTTP body.
- When you pass a `FormData` object to `fetch(url, { method: 'POST', body: formData })`, the browser automatically computes and attaches the `Content-Type` header along with the exact matching `boundary` string.
- If a developer manually hardcodes `headers: { 'Content-Type': 'multipart/form-data' }`, the boundary parameter is omitted. The backend server (Multer) will be unable to parse field boundaries and will reject the request with HTTP 400 or HTTP 500 error.
- In [`client/src/services/api.js`](../client/src/services/api.js), the centralized `request` wrapper enforces this rule:
  ```javascript
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  ```

### 5.4 Existing Image Preservation Logic

During property editing (`PUT /api/hotels/:id`), hotel owners frequently update descriptions or prices without altering property photos.
1. **Frontend Handling:**
   - If the user does not select a new file, the `FormData` submitted by `HotelForm` omits the `image` field entirely.
   - It sends only updated text fields (`title`, `description`, `latitude`, `longitude`, `price`).
2. **Backend Handling:**
   - Express Multer inspects `req.file`. Since no new file was uploaded, `req.file` is `undefined`.
   - In `hotelService.updateHotel(id, hotelData, imageFile)`:
     ```javascript
     const oldImagePath = checkRes.rows[0].image_path;
     const finalImagePath = imageFile ? imageFile.relativeUrl : oldImagePath;
     ```
   - The database retains the existing `image_path`, and the existing file on disk is untouched.
   - If a new file *is* uploaded, Multer verifies its magic bytes, replaces the database path, and safely unlinks the old file from disk *after* the database transaction commits.

### 5.5 Defense-in-Depth Validation Model

Input validation is rigorously enforced across three independent architectural tiers:

| Field | Client Validation (`HotelForm.jsx`) | Backend Validation (`hotel.validator.js`) | PostgreSQL Constraint (`init.sql`) |
| :--- | :--- | :--- | :--- |
| **Title** | Non-empty, max 255 chars, trimmed | Required, string, trimmed length > 0, max 255 chars | `length(trim(title)) > 0` |
| **Description** | Non-empty, max 5000 chars, trimmed | Required, string, trimmed length > 0 | `length(trim(description)) > 0` |
| **Latitude** | Finite number, -90.0 to 90.0, max 6 decimals | Required, -90.0 to 90.0, max 6 decimals | `latitude BETWEEN -90.0 AND 90.0` |
| **Longitude** | Finite number, -180.0 to 180.0, max 6 decimals | Required, -180.0 to 180.0, max 6 decimals | `longitude BETWEEN -180.0 AND 180.0` |
| **Price** | Finite number, > 0, max 2 decimals | Required, > 0, max 2 decimals | `price > 0`, `NUMERIC(12,2)` |
| **Image** | JPEG/PNG/WebP MIME & ext, max 5 MB | Multer MIME filter, 5 MB limit, 12-byte binary magic byte inspection | Stored as relative path `image_path` |

### 5.6 Coordinate Validation & Scientific Notation Rule

Geographic coordinates (latitude $-90.0 \dots +90.0$ and longitude $-180.0 \dots +180.0$) strictly support both positive and negative values.
1. **Format Validation (`NUMERIC_FORMAT_REGEX`):**
   - Both client (`HotelForm.jsx`) and server (`hotel.validator.js`) validate numeric strings against `/^-?\d+(\.\d+)?$/`.
   - An optional leading negative sign (`-?`) allows legitimate southern latitudes (e.g., Sydney at `-33.8688`) and western longitudes (e.g., Santiago at `-70.6693`).
   - Inputs with multiple signs (`--5`), trailing non-numeric characters (`12abc`), or `Infinity` are rejected as invalid.
2. **Rejection of Scientific Notation:**
   - Values containing exponential notation (e.g., `1e2`, `1.5e-3`) are intentionally rejected on both client and server.
   - While `Number('1e2')` yields `100` in JavaScript, scientific notation is inappropriate and ambiguous for geographical coordinate inputs and financial property prices. Enforcing `/^-?\d+(\.\d+)?$/` guarantees explicit decimal inputs.
3. **Decimal Precision Checks:**
   - Coordinates allow at most 6 decimal places (approximately 0.11-meter precision on Earth's surface).
   - Prices allow at most 2 decimal places.

### 5.7 Redux List Synchronization Strategy

When an owner creates or edits a property, the application avoids full browser reloads:
1. **In-Place Mutation Update:**
   - `updateHotel.fulfilled` locates the hotel by ID in `state.hotels.items` and updates it in place. If the user navigates back to the hotel list, the updated title, price, and details are immediately visible.
2. **First-Page Prepend on Create:**
   - `createHotel.fulfilled` increments `state.pagination.total` and prepends the new hotel to `state.hotels.items` (respecting `limit`), keeping the list synchronized with PostgreSQL's `ORDER BY created_at DESC`.
3. **Authoritative Navigation Refetch:**
   - When the user is routed to `/hotels`, `MyHotelsPage` mounts and triggers `fetchHotels()` to reconcile with PostgreSQL. In addition, `fetchHotelStats()` is triggered in the background to invalidate stale KPI aggregates.

### 5.8 Currency Neutrality & Configurable Display

The application does not assume a specific currency (e.g., USD or INR):
- **Default Display:** Formats prices as clean numbers with standard grouping and two decimal places (e.g., `250.00`, `1,250.50`).
- **Configuration (`VITE_APP_CURRENCY`):** If set to an ISO 4217 code (e.g., `USD`, `EUR`, `INR`), `formatCurrency` and `getCurrencySymbol` automatically format prices with the corresponding symbol (e.g., `$250.00`, `€250.00`, `₹250.00`).
- **Filter Inputs:** The minimum/maximum price input fields conditionally render the currency symbol only when configured, ensuring visual harmony in both neutral and localized modes.

---

## 6. Hotel Details Page & Interactive Location Map Architecture (Phase 4C)

### 6.1 Route Architecture & Route Parameter Validation

The Details view is served at the dynamic parameterized route `/hotels/:id`.
1. **Route Precedence in React Router 7:**
   - Static routes (`/hotels/new`) are defined prior to dynamic parameterized routes (`/hotels/:id`) to prevent Route Shadowing, ensuring `/hotels/new` is never misparsed as an ID parameter `new`.
   - The route pattern `/hotels/:id/edit` precedes `/hotels/:id` to correctly prioritize edit mode.
2. **Strict Route Parameter Validation & PostgreSQL BIGINT Support:**
   - In `HotelDetailsPage.jsx` and `HotelFormPage.jsx`, the route parameter `:id` is validated via `isValidRouteId(id)` against PostgreSQL signed `BIGINT` range: $1 \le \text{id} \le 9{,}223{,}372{,}036{,}854{,}775{,}807$ ($2^{63}-1$).
   - The validation enforces digits-only (`/^\d+$/`) directly on the original string without trimming (strictly rejecting leading, trailing, and surrounding whitespace) and parses using native `BigInt(id)` without converting to a JavaScript `Number`. This prevents the silent precision degradation that occurs when 64-bit integers exceed JavaScript's `Number.MAX_SAFE_INTEGER` ($2^{53}-1 = 9{,}007{,}199{,}254{,}740{,}991$).
   - If an invalid parameter is detected (e.g., `/hotels/abc`, `/hotels/-5`, `/hotels/0`, `/hotels/12.34`, or overflowing IDs $> 9223372036854775807`), state `idValidationError` is set immediately.
   - The original ID string is preserved across API boundaries (`fetchHotelById(id)`), ensuring full fidelity with PostgreSQL's 64-bit `BIGINT` primary keys.
   - The component displays an `ErrorAlert` banner with a "Return to My Hotels" action without issuing an unnecessary backend HTTP request.
3. **Promise Abort and Lifecycle Cleanup:**
   - When `fetchHotelById(id)` is dispatched, its RTK abort controller promise is stored.
   - Upon component unmount, `promise.abort()` is executed to cancel any pending HTTP requests, and `clearCurrentHotel()` is dispatched to clear `currentHotel` from the Redux store. This guarantees that stale property data never flashes when the owner navigates to another hotel.

### 6.2 Leaflet 1.9.4 & React Leaflet 4.2.1 Integration

Map rendering is implemented via the isolated `<HotelLocationMap />` component using **Leaflet 1.9.4** and **React Leaflet 4.2.1**:
1. **Zero External API Keys:**
   - Leaflet is completely open-source and utilizes OpenStreetMap raster tile servers, requiring no paid API keys, credit cards, or external proprietary SDKs.
2. **Vite Asset Bundler Path Resolution:**
   - Leaflet's default icon implementation dynamically infers image paths relative to its own stylesheet, which breaks in Vite due to asset hashing in production.
   - `HotelLocationMap.jsx` resolves this by importing marker assets directly:
     ```javascript
     import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
     import markerIcon from 'leaflet/dist/images/marker-icon.png';
     import markerShadow from 'leaflet/dist/images/marker-shadow.png';

     const hotelMarkerIcon = L.icon({
       iconUrl: markerIcon,
       iconRetinaUrl: markerIcon2x,
       shadowUrl: markerShadow,
       iconSize: [25, 41],
       iconAnchor: [12, 41],
       popupAnchor: [1, -34],
       shadowSize: [41, 41],
     });
     ```
   - This ensures Vite hashes and bundles all retina marker assets correctly during `npm run build`.
3. **Exact Anchor Offsets:**
   - `iconAnchor: [12, 41]` ensures the sharp bottom tip of the 25x41px pin aligns precisely with the geographic point coordinate, regardless of map zoom level.
   - `popupAnchor: [1, -34]` anchors the popup tooltip directly above the pin without obscuring the marker head.
4. **Dynamic Map-Center Synchronization via `MapViewController` (Primitive Prop Dependencies):**
   - In React Leaflet, the `MapContainer`'s `center` and `zoom` properties are purely initial values and are immutable after initial mount. If an owner navigates from `/hotels/66` to `/hotels/67` without a page reload, the map viewport remains locked at the first hotel's coordinates unless explicitly updated.
   - **Why Primitive Props Matter:** If an array `center={[lat, lng]}` is passed to a child component, JavaScript creates a new array object reference on every parent re-render. Since `[lat, lng] !== [lat, lng]` by reference equality, a `useEffect([center, ...])` would trigger on *every* unrelated render (e.g. title edits, hover states, image loading), continually calling `map.setView()` and resetting any manual pan or zoom gestures made by the user.
   - **Corrected Architecture:** `MapViewController` accepts distinct primitive numbers (`latitude`, `longitude`, `zoom`):
     ```javascript
     export function MapViewController({ latitude, longitude, zoom = 14 }) {
       const map = useMap();
       useEffect(() => {
         if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
           map.setView([latitude, longitude], zoom);
         }
       }, [latitude, longitude, zoom, map]);
       return null;
     }
     ```
   - Because `latitude` and `longitude` are primitive numbers, `useEffect` uses `Object.is()` comparison and executes *only* when coordinates genuinely change, leaving manual user pan/zoom intact during unrelated re-renders.

### 6.3 Coordinate Parsing & Geographic Bounds Validation

1. **PostgreSQL NUMERIC Precision Handling:**
   - Coordinates stored in PostgreSQL `NUMERIC(10,6)` or `NUMERIC(11,6)` columns are transmitted as strings over JSON (e.g., `"24.453884"`).
   - In `HotelLocationMap`, coordinates are parsed safely via `Number(val)` with explicit `Number.isFinite()` and bounds validation.
2. **Geographic Bounds Enforcement:**
   - Function `isValidCoordinate(lat, lng)` verifies:
     - $-90.0 \le \text{latitude} \le +90.0$
     - $-180.0 \le \text{longitude} \le +180.0$
     - Values are finite numbers (not `NaN`, `null`, `undefined`, or `Infinity`).
   - Valid negative coordinates (e.g. Sydney `-33.8688, 151.2093` or Santiago `-33.4489, -70.6693`) are accepted and correctly centered.
3. **Graceful Fallback State:**
   - If coordinates are out of bounds or invalid, `HotelLocationMap` renders a clean, accessible `<div class="map-unavailable-container">` with an SVG alert icon, describing that coordinates are outside valid geographic bounds, without throwing unhandled JavaScript exceptions or blanking the page.

### 6.4 OpenStreetMap Policy Compliance & Production Tile Scaling

In compliance with the official **OpenStreetMap Foundation Tile Usage Policy** (https://operations.osmfoundation.org/policies/tiles/):
- **Tile URL Standard:** The application uses `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. It explicitly avoids deprecated `{s}.` subdomain sharding (`a.tile`, `b.tile`, `c.tile`), which was an HTTP/1.1 workaround now discouraged under HTTP/2.
- **Attribution:** The `<TileLayer />` provides visible, hyperlinked attribution identifying `© OpenStreetMap contributors` with a link to `https://www.openstreetmap.org/copyright`.
- **Resource Protection:**
  - No bulk tile scraping, offline prefetching, or speculative preloading is implemented. Tiles are requested strictly on-demand as map areas become visible.
  - Browser caching is fully respected; no cache-busting queries or `no-cache` headers are sent.
  - Standard browser `Referer` headers are preserved without restrictive `no-referrer` policies.
- **Availability SLA & Production Options:**
  - Standard OpenStreetMap public tile servers operate on donated server resources with best-effort availability and **no guaranteed Service Level Agreement (SLA)**.
  - For high-volume production deployments, commercial tile providers (Mapbox, Stadia Maps, Jawg Maps, CartoDB) or self-hosted vector/raster tile infrastructure (e.g., Mapnik, TileServer-GL, or OpenMapTiles on cloud Kubernetes) should be configured.

### 6.5 Dynamic SEO & Head Management with React Helmet Async

Page-specific metadata is dynamically injected into the document head via `<Helmet>` from `react-helmet-async`:
1. **Dynamic Document Title:**
   - Success state: `<title>{hotel.title} | Namlatic Hotel Portal</title>`
   - 404 state: `<title>Hotel Not Found | Namlatic Hotel Portal</title>`
   - Loading/Default state: `<title>Hotel Details | Namlatic Hotel Portal</title>`
2. **Meta Description:**
   - Generates meta description dynamically truncated to 155 characters with ellipsis to conform to search engine snippet best practices.
3. **Heading Hierarchy:**
   - Main page title is the single `<h1>` (`.details-title`).
   - Major content divisions use `<h2>` with accessible `aria-labelledby` linkages (`#desc-heading`, `#map-heading`).

### 6.6 Visual Hierarchy, Hero Media & Audit History

1. **Hero Media & Zero Fake Stock Photo Fallback:**
   - If `hotel.image_path` is present and valid, renders a responsive `<img>` element with descriptive alt text (`Exterior view of {hotel.title}`).
   - If `hotel.image_path` is `null` or if the image fails to load (`onError`), it renders a clean, dedicated SVG building illustration placeholder labeled **"No Image Available"**. It never introduces fake generic stock photos or unbranded external placeholders.
2. **Facts Summary Cards:**
   - Price: Formatted using configurable `formatCurrency` with caption "Listed price".
   - Coordinates: Displays formatted WGS 84 geolocation coordinates with degree notation.
   - Audit History: Displays localized "Created" and "Updated" timestamps (`Intl.DateTimeFormat`) only if returned by the PostgreSQL backend. If timestamps are absent, the card section is omitted.

---

## 7. Production Hardening & Reverse Proxy Architecture (Phase 5C)

### 7.1 Port & Network Interface Binding (`0.0.0.0`)
- **Render Host Requirement:** In cloud container environments such as Render, web services run inside private container networks. If the server binds only to localhost (`127.0.0.1`), Render's edge load balancer cannot forward incoming external traffic to the container. The Express server binds explicitly to `0.0.0.0` (configurable via `process.env.HOST`), allowing incoming connections across all container interfaces.
- **Dynamic Port Selection:** The port is determined dynamically via `process.env.PORT` (defaults to `5000` in local development). The active listening port and host are logged safely at startup.

### 7.2 Reverse Proxy Trust & Anti-Spoofing Client IP Resolution (`trust proxy: 1`)
- **Render Network Topology:** Render terminates public TLS at its edge reverse proxy before forwarding requests to the container via HTTP over an internal network.
- **The Vulnerability of `trust proxy: true`:** Naively setting `app.set('trust proxy', true)` instructs Express to trust every IP hop in the `X-Forwarded-For` header chain. An attacker can easily spoof their IP address by injecting arbitrary client IPs into an `X-Forwarded-For: <spoofed-ip>` header, thereby bypassing per-IP rate limiters. Under no circumstances should the application switch to unrestricted `trust proxy: true`.
- **Strict 1-Hop Proxy Trust Assumption:** Setting `app.set('trust proxy', 1)` is based on an assumed single-hop Render reverse proxy topology. Express trusts exactly one upstream reverse proxy hop (Render's edge proxy). The leftmost un-trusted IP in the chain is resolved as `req.ip`, rendering client header-injection IP spoofing ineffective.
- **Post-Deployment Verification Protocol:**
  - Because `trust proxy: 1` assumes a 1-hop topology, the actual client IP resolution must be verified against live Render infrastructure upon deployment (Phase 5F / Phase 5G).
  - A temporary diagnostic endpoint exposing `req.ip` and headers can be used to confirm that `req.ip` accurately reflects the caller's genuine public IP rather than an internal proxy IP or a spoofed header.
  - **Mandatory Removal:** Any temporary diagnostic endpoint created for IP verification must be removed immediately once verification is concluded.
  - Never switch to unrestricted `trust proxy: true` as a workaround.

### 7.3 Security Headers & Helmet Policy (`helmet@8.3.0`)
- **Backend Response Scope:** Helmet security headers emitted by Express apply strictly to HTTP responses generated by the backend API and static files served from `/uploads/hotels`.
- **Architectural Boundary & Frontend Header Decoupling:**
  - The Express backend and React frontend are deployed to distinct infrastructure tiers (Render for Node.js API, Vercel for the React Single Page Application).
  - **CSP Scope:** The Content Security Policy configured in Express **does not** automatically protect the React HTML document (`index.html`) delivered by Vercel.
  - **HSTS Scope:** HTTP Strict Transport Security configured on the Render API hostname (`api.namlatic...`) **does not** automatically configure HSTS for the Vercel frontend hostname (`portal.namlatic...`).
  - **Phase 5E Requirement:** Dedicated frontend Content Security Policy, HSTS, frame options, and referrer policies must be configured and verified separately on Vercel via `vercel.json` or edge headers in **Phase 5E: Vercel Routing & Frontend Cloud Configuration**. The React application must never be represented as fully protected by the Express backend CSP.
- **Cross-Origin Resource Policy (CORP):** By default, Helmet sets `Cross-Origin-Resource-Policy: same-origin`. In our decoupled architecture (where the frontend SPA runs on Vercel or localhost and the backend runs on Render), this default header prevents browsers from loading uploaded hotel images (`/uploads/hotels/*`) across different origins. The backend explicitly configures `crossOriginResourcePolicy: { policy: 'cross-origin' }`.
- **Content Security Policy (CSP):** Configured on Express with explicit directives permitting self, Leaflet OpenStreetMap tiles (`*.tile.openstreetmap.org`), and inline style attributes required by UI libraries while restricting unauthorized script and object execution on backend responses.
- **Defensive Headers:** Enforces `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (anti-clickjacking), `Referrer-Policy: strict-origin-when-cross-origin`, `X-DNS-Prefetch-Control: off`, and conditionally enables HTTP Strict Transport Security (`Strict-Transport-Security: max-age=15552000; includeSubDomains`) in production environments for API responses.

### 7.4 CORS Origin Allowlist Strategy
- **Explicit Allowlist:** Rejects insecure wildcard `*` origins in production. Parses comma-separated origin URLs from `process.env.CORS_ORIGIN`. In development, defaults to `http://localhost:5173` (Vite dev) and `http://localhost:4173` (Vite preview).
- **Exact Origin Matching:** Incoming request origins are compared against the allowlist. Disallowed origins are rejected with `403 Forbidden` (`Not allowed by CORS policy`).
- **Missing Origin Exemption:** Requests without an `Origin` header (such as curl, Postman, automated health probes, and server-to-server calls) are permitted through without setting CORS response headers.
- **Credentials & Preflight Caching:** Because session cookies and HTTP authentication credentials are not yet implemented, `credentials: false` is enforced. Preflight `OPTIONS` requests respond with HTTP 204 and cache approvals for 24 hours (`Access-Control-Max-Age: 86400`).

### 7.5 API Rate Limiting & Denial-of-Service Defense (`express-rate-limit@8.7.4`)
- **Mutating Route Limiter (`writeLimiter`):**
  - Applied to `POST /api/hotels`, `PUT /api/hotels/:id`, and `DELETE /api/hotels/:id`.
  - Enforces a threshold of 60 mutating requests per 15-minute window per IP.
  - **Early Guard Placement:** In `hotel.routes.js`, `writeLimiter` is mounted *before* Multer's `uploadHotelImage` middleware. Rate-limited requests are aborted immediately before reading multipart file streams or allocating temporary disk storage.
- **General Route Limiter (`generalLimiter`):**
  - Applied globally to `/api/*` endpoints with a threshold of 300 requests per 15-minute window.
  - Automatically bypasses liveness (`/api/health`) and readiness (`/api/ready`) probes so orchestrator health checks are never throttled.
- **Response Format & Headers:** Returns standardized JSON payloads (`{ status: 'error', statusCode: 429, message: '...' }`) alongside IETF draft-standard headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`).
- **In-Memory Store Limitation:** The current implementation uses `express-rate-limit`'s built-in memory store. Each Node.js process maintains its own counters; horizontal scaling across multiple dynos or containers will require a centralized shared store (e.g., Redis / Upstash).
- **Rate Limiting is NOT Authentication:** Rate limiting restricts request frequency per client IP to mitigate automated abuse. It does **not** identify or authenticate users. Any client within their rate quota can create, modify, or delete hotel records until owner authentication is integrated before public production exposure.

### 7.6 Request Body Size & Process Error Safety
- **Body Size Caps:** JSON payloads are strictly bounded to 10 KB (`express.json({ limit: '10kb' })`). Payloads exceeding this limit receive HTTP 413 (`Payload Too Large`).
- **Process Exception Guards:** `process.on('unhandledRejection')` and `process.on('uncaughtException')` log fatal errors and initiate graceful shutdown to prevent server hangs or silent failures.
- **Production Error Masking:** Stack traces and internal database errors are withheld from client responses in production (`process.env.NODE_ENV === 'production'`), returning a sanitized message (`"Internal server error"`).

---

## 8. Durable Cloud Media Storage Architecture (Phase 5D)

### 8.1 Why Local Disk Storage is Unsuitable on Cloud PaaS (Render)
- **Ephemeral Filesystem Limitation:** Cloud web service containers on Render, AWS ECS, and similar PaaS providers operate on ephemeral container filesystems. When a new commit is deployed, an automatic scaling event occurs, or a container crashes and restarts, the local disk is wiped. Any uploaded hotel images saved directly to `server/src/uploads/hotels` on the container disk are permanently lost.
- **Decoupled Object Storage:** To ensure production durability, media storage is decoupled from the web application processes and delegated to **Cloudflare R2** durable object storage.

### 8.2 Provider-Neutral Storage Abstraction
The application interacts with media storage exclusively through an abstract, provider-neutral storage service layer (`server/src/storage/`):
- **`LocalStorageAdapter`:** Manages files on the local filesystem (`server/src/uploads/hotels`) during local development and testing. Enforces directory traversal protection (`..`), protected file guards (`.gitkeep`), and safe unlinking.
- **`R2StorageAdapter`:** Manages durable object storage in Cloudflare R2 using the official `@aws-sdk/client-s3` (AWS SDK v3 for JavaScript) client.
- **`StorageService` (Unified Router):** Dynamically delegates upload operations to the active storage driver (`MEDIA_STORAGE_DRIVER=local` or `MEDIA_STORAGE_DRIVER=r2`) and intelligently routes delete operations based on reference prefixes (`r2:` to R2 adapter, `/uploads/` to local adapter). This strictly prevents local filesystem helpers from ever receiving cloud object references.

### 8.3 Cloudflare R2 & S3 Client Integration
- **Endpoint Structure:** Uses Cloudflare R2's official S3-compatible API endpoint: `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`.
- **Region:** Configured with region `'auto'` in accordance with Cloudflare R2 specification.
- **Least-Privilege API Tokens:** Requires a bucket-scoped R2 API Token with minimal read and write permissions restricted strictly to the designated bucket (`R2_BUCKET_NAME`). Account-level or admin permissions are strictly prohibited.
- **Public Read Access:** Public image delivery is routed through Cloudflare's edge CDN via `R2_PUBLIC_BASE_URL` (e.g., `https://pub-<hash>.r2.dev` or a custom vanity domain `https://assets.namlatic.com`). Public bucket listing and anonymous bucket writes are disabled.

### 8.4 Stable Object Keys & Zero-Migration Database References
- **Server-Generated Object Keys:** Keys are generated server-side using cryptographic UUIDs: `hotels/<uuid>.<ext>`. User-supplied filenames are never used in object keys, eliminating filename injection and overwriting collisions.
- **Verified MIME Type & Cache Control:** Uploads detect the binary magic bytes of the staged image and attach the verified `ContentType` (`image/jpeg`, `image/png`, `image/webp`) and immutable long-lived HTTP caching headers (`Cache-Control: public, max-age=31536000, immutable`).
- **Database Reference Persistence:**
  - Full public URLs are **never** stored in PostgreSQL. Storing full URLs tightly couples the database to a specific CDN hostname or bucket provider, requiring complex migrations if domains or storage providers change.
  - The database persists a stable, unambiguous storage reference in the existing `image_path TEXT` column:
    - R2 format: `r2:hotels/<uuid>.<ext>`
    - Local format: `/uploads/hotels/<uuid>.<ext>`
  - **Zero Database Migration:** Because `image_path` was defined as `TEXT` in Phase 2, no SQL DDL migration is required. Existing PostgreSQL queries, aggregate count queries (`COUNT(image_path)` in `getHotelStats`), and constraints remain 100% compatible.

### 8.5 Public URL Resolution in API Response Layer
- When hotel entities are serialized for API responses, `formatHotelResponse(hotel)` translates internal storage references to public URLs:
  - `r2:hotels/<uuid>.<ext>` $\to$ `https://<R2_PUBLIC_BASE_URL>/hotels/<uuid>.<ext>`
  - `/uploads/hotels/<uuid>.<ext>` $\to$ `/uploads/hotels/<uuid>.<ext>` (or local path)
- The React frontend receives the exact same `image_path` property shape. Because `client/src/services/api.js` already checks `imagePath.startsWith('http')` and leaves full URLs untouched, the frontend functions seamlessly with zero client-side code changes.

### 8.6 Storage Lifecycle & PostgreSQL Transaction Coordination
Because external object storage and relational PostgreSQL cannot participate in a single two-phase commit, the application coordinates storage mutations and database transactions defensively:
1. **Hotel Creation:**
   - Image is uploaded to storage first.
   - PostgreSQL `INSERT INTO hotels ...` executes with the resulting storage reference.
   - If PostgreSQL insertion fails (e.g. database error or constraint violation), the application executes a compensating delete (`storage.delete(imagePath)`) to clean up the newly created cloud object.
2. **Hotel Update (Image Replacement):**
   - If a new photo is uploaded, it is uploaded to storage first.
   - PostgreSQL transaction locks the row (`SELECT ... FOR UPDATE`), updates the record to the new reference, and commits.
   - The old image is deleted from storage **only after** the PostgreSQL transaction successfully commits.
   - If the database update fails, the newly uploaded replacement object is compensating-deleted, and the old image remains untouched in both PostgreSQL and object storage.
3. **Hotel Deletion:**
   - PostgreSQL executes `DELETE FROM hotels WHERE id = $1 RETURNING id, image_path`.
   - The associated storage object is deleted **only after** the database deletion succeeds.
   - If the object was already deleted or missing from storage, the operation completes safely without throwing.

### 8.7 Orphan Object Handling & Limitations
- If a cloud object storage deletion fails due to an unexpected S3 network timeout or API outage *after* the PostgreSQL transaction has already committed, the application does not fail the HTTP response (since the database deletion was successful).
- Instead, it logs a sanitized, actionable warning (`[STORAGE WARNING] Failed to delete orphaned media object...`).
- In production architectures, periodic asynchronous bucket reconciliation (e.g., comparing active database `image_path` references against bucket inventory via a background worker or lifecycle rule) serves as a secondary garbage-collection safety net.

### 8.8 Failure-Path Hardening & Production Validation (Phase 5D.1)
- **Production Driver Enforcement:** In production (`NODE_ENV=production`), `MEDIA_STORAGE_DRIVER=r2` is strictly required. Setting `MEDIA_STORAGE_DRIVER=local` or leaving it unset triggers a fatal startup error, eliminating accidental deployment with ephemeral container storage. Local storage is strictly reserved for `development` and `test` environments.
- **Strict R2 Public URL Validation:** `R2_PUBLIC_BASE_URL` is thoroughly validated at environment initialization. In production, it must use the `https:` protocol. Hostnames are verified, and embedded credentials (`user:pass@`), query parameters (`?query=`), and URL fragments (`#hash`) are strictly rejected. Trailing slashes are normalized to prevent double-slash artifacts.
- **Staged-File Cleanup on Read Failures:** If `fs.promises.readFile(file.path)` throws an I/O error during upload, the adapter catches the exception, executes a best-effort unlink of the local Multer temporary file to prevent disk exhaustion, and surfaces a sanitized error without credentials.
- **Connection Acquisition Safety in `updateHotel`:** In `updateHotel()`, database pool connection acquisition (`db.pool.connect()`) is positioned inside a cleanup-safe `try` block. If image upload succeeds but `pool.connect()` rejects (e.g. pool timeout or exhaustion), the catch block detects that no database client was acquired, avoids calling `ROLLBACK` or `release()`, and issues a compensating delete on the newly uploaded R2 object.
- **Legacy Media Migration Requirement:** While the backend router transparently resolves legacy local references (`/uploads/hotels/...`) alongside R2 references, it does **not** automatically migrate physical image files from local disk to Cloudflare R2. Existing hotel media files must be migrated or re-uploaded prior to production cloud cutover.
- **Testing & Isolation Guarantee:** All automated storage tests execute against an injectable mock S3 client (`s3ClientMock`) and a live local PostgreSQL 18.6 instance. No real Cloudflare R2 bucket, API credentials, or cloud accounts were provisioned.

---

## 9. Frontend Cloud Hosting & Vercel Configuration Architecture (Phase 5E)

### 9.1 Vercel Project Root & Build Pipeline
- **Project Root Directory:** The Vercel project is rooted in the `client` directory. This keeps the frontend build isolated from server dependencies and ensures `client/package.json` and `client/package-lock.json` govern client builds.
- **Framework Preset:** Vite.
- **Build Command:** `npm run build` (invokes `vite build`).
- **Output Directory:** `dist` (configured in `client/vite.config.js`).
- **Node.js Engine:** `>=22.0.0` aligned with `client/package.json` `engines.node`.
- **Configuration File Location:** `client/vercel.json` (using official schema `https://openapi.vercel.sh/vercel.json`). No duplicate or conflicting configuration exists at the repository root.

### 9.2 React SPA Client-Side Routing & Fallback Rewrite
- **The Routing Challenge:** In a Single Page Application (SPA) with React Router, client-side routes (`/`, `/hotels`, `/hotels/new`, `/hotels/:id`, `/hotels/:id/edit`) exist solely within browser memory via the HTML5 History API. When a user navigates directly or refreshes the page at `/hotels/42`, a traditional static web server searches for a physical `/hotels/42/index.html` file on disk. Because that file does not exist, the server returns an HTTP 404 (Not Found) error.
- **Vercel Rewrite Solution:**
  ```json
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
  ```
- **Static File Precedence:** On Vercel, physical static assets in the output directory (e.g. `/assets/index-*.js`, `/assets/index-*.css`, Leaflet marker images) take precedence over rewrite rules. When a request matches a physical file, Vercel serves it immediately. When no physical file matches, Vercel invokes the fallback rewrite, serving `/index.html` with HTTP 200, allowing React Router to hydrate and render the targeted view seamlessly.

### 9.3 Frontend vs Backend Security Headers Boundary
Security headers operate across two distinct hosting boundaries:
1. **Backend Responses (Express / Render):** Helmet middleware on the Express server protects backend API responses (`/api/*`) and locally served media.
2. **Frontend Document & Asset Responses (Vercel Edge):** Vercel edge configuration (`client/vercel.json`) attaches security headers to the initial HTML document request (`index.html`) and static assets.

Configured Vercel Edge Headers:
- **`X-Content-Type-Options: nosniff`:** Instructs browsers to strictly honor the declared MIME type, preventing MIME-confusion attacks.
- **`Referrer-Policy: strict-origin-when-cross-origin`:** Sends the full referrer URL on same-origin requests, but strips the path component and transmits only the origin on cross-origin HTTPS requests.
- **`X-Frame-Options: DENY`:** Completely prohibits embedding the application within iframes on any third-party domain, mitigating clickjacking attacks.
- **`Strict-Transport-Security: max-age=31536000`:** Instructs browsers to communicate exclusively over HTTPS for one year (31,536,000 seconds). In accordance with defensive deployment practices, `includeSubDomains` and `preload` are omitted pending verified subdomain ownership and HTTPS coverage.
- **`Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`:** Explicitly disables unused browser hardware, geolocation, payment, and peripheral APIs.
- **Obsolete Headers Omitted:** `X-XSS-Protection` is omitted as modern browsers have deprecated it and it introduces client-side vulnerabilities.

### 9.4 Content Security Policy (CSP) Analysis & Policy Template
The frontend application requires specific external resource connections:
- **`default-src 'self'`:** Restricts all unspecified resource types to same origin.
- **`script-src 'self'`:** Restricts JavaScript execution to bundled assets created by Vite. No external scripts or unbundled CDN libraries are loaded.
- **`style-src 'self' 'unsafe-inline'`:** Allows bundled stylesheets; `'unsafe-inline'` is strictly required because Leaflet dynamically injects inline style attributes on DOM elements during pan/zoom transitions (e.g., `transform`, `width`, `height`, marker positioning coordinates).
- **`img-src 'self' data: blob: https://tile.openstreetmap.org <RENDER_API_ORIGIN> <R2_PUBLIC_BASE_URL>`:**
  - `'self'`: Bundled local images and Leaflet retina marker icons.
  - `data:`: Base64 data URIs used for fallback SVG icons.
  - `blob:`: Temporary image preview blob URLs generated by `URL.createObjectURL(file)` in `HotelForm.jsx`.
  - `https://tile.openstreetmap.org`: OpenStreetMap raster map tiles consumed by `HotelLocationMap.jsx` (loaded as raster image tiles via `<img>` tags).
  - `<RENDER_API_ORIGIN>`: Backend host (e.g. `https://<service-name>.onrender.com`) for legacy local media fallback.
  - `<R2_PUBLIC_BASE_URL>`: Cloudflare R2 bucket public CDN hostname for uploaded property media.
- **`connect-src 'self' <RENDER_API_ORIGIN>`:** Allows `fetch()` and XHR requests strictly to the frontend origin and the Express backend API on Render. OpenStreetMap tile hosts are **not** included in `connect-src` because raster map tiles are fetched via standard browser `<img>` elements governed by `img-src`.
- **`font-src 'self'`:** Restricts font loading to local self-hosted fonts. No third-party font CDNs (such as Google Fonts) are permitted.
- **`object-src 'none'`:** Completely blocks Flash, Java, and other legacy plugin objects.
- **`base-uri 'self'`:** Prevents malicious `<base>` tag injection.
- **`frame-ancestors 'none'`:** Blocks framing in all contexts (aligns with `X-Frame-Options: DENY`).
- **`form-action 'self'`:** Prevents form action redirects.

#### Production CSP Policy Template
```text
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tile.openstreetmap.org https://<RENDER_API_HOST> https://<R2_PUBLIC_BASE_HOST>; connect-src 'self' https://<RENDER_API_HOST>; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self';
```

> [!IMPORTANT]
> **CSP Cloud Origin Dependency Notice:**
> The actual Render API hostname and Cloudflare R2 public base URL have not been provisioned yet. To avoid using broad insecure wildcards (such as `img-src https:`) or breaking legitimate API/media traffic with placeholder domains, full CSP header enforcement in `client/vercel.json` is marked as **pending Phase 5F/5G cloud provisioning**. Once live endpoints are established, the exact hostnames will be substituted into the header definition without wildcard HTTPS bypasses.

### 9.5 Frontend Environment Variables & Build-Time Bundling
- **Build-Time Inlining:** Vite evaluates `import.meta.env` at build time (`npm run build`) and statically replaces references with string literals in the bundled JavaScript.
- **Public Visibility:** All variables prefixed with `VITE_` are publicly visible to anyone inspecting browser network traffic or client bundles.
- **Production Validation (Phases 5E.1 & 5E.2):** In production environments (`NODE_ENV=production` or `PROD=true`), the client service layer strictly requires `VITE_API_URL` and rejects legacy fallback to `VITE_API_BASE_URL`. The URL is validated to ensure:
  - Absolute HTTPS protocol (rejecting HTTP).
  - Documented `/api` path convention suffix.
  - Zero embedded credentials (rejecting `user:pass@`).
  - Zero query parameters (rejecting `?key=val`).
  - Zero URL fragments (rejecting `#hash`).
  - Non-localhost hostname (rejecting `localhost`, `127.0.0.1`, `::1`).
  Unauthenticated localhost fallbacks and legacy `VITE_API_BASE_URL` compatibility are strictly restricted to development and test modes.
- **Safe Media URL Handling (`getImageUrl`):** In production, `getImageUrl()` strictly rejects unencrypted `http://` URLs (returning `null`) to eliminate mixed-content security warnings on HTTPS deployments. Valid HTTPS URLs, Cloudflare R2 CDN links, SVG `data:` fallbacks, and preview `blob:` URLs are preserved directly without modification, while relative legacy paths resolve against `API_ORIGIN` without appending `/api`.
- **Variables Consumed by Frontend:**
  - `VITE_API_URL`: Fully-qualified REST API base URL (e.g. `https://<service-name>.onrender.com/api`). Strictly required and enforced as HTTPS in production; only supported production API variable.
  - `VITE_API_ORIGIN`: Protocol and hostname of the Express backend without path (e.g. `https://<service-name>.onrender.com`). Optional: automatically derived from `VITE_API_URL` when omitted; validated as HTTPS in production when explicitly supplied.
  - `VITE_APP_CURRENCY`: Optional ISO 4217 currency code (e.g. `USD`). Defaults to currency-neutral numbers if unset.
- **Secrets Prohibition:** Backend secrets (`DATABASE_URL`, PostgreSQL credentials, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, JWT keys) must **never** be prefixed with `VITE_` or placed in frontend configuration.
- **Preview Deployment Warning:** Vercel Preview deployments should NOT point to production databases or backends while mutating write routes remain unauthenticated.

### 9.6 Deployment Dependencies & Manual Vercel Setup Steps
When deploying to Vercel in future phases:
1. Log into the Vercel dashboard and select **Add New Project**.
2. Import the GitHub repository: `https://github.com/elango-project/Namlatic-Hotel`.
3. In the project configuration screen:
   - **Framework Preset:** Select `Vite`.
   - **Root Directory:** Set to `client`.
   - **Build & Output Settings:** Leave default (`npm run build`, `dist`).
4. In **Environment Variables**:
   - Add `VITE_API_URL`: `https://<your-render-service>.onrender.com/api`
   - Add `VITE_API_ORIGIN`: `https://<your-render-service>.onrender.com`
   - (Optional) Add `VITE_APP_CURRENCY`: e.g. `USD`
5. Click **Deploy**. Vercel will build from `client/` and deploy the static bundle to the global edge network.
6. Verify SPA routing by refreshing on `/hotels/new` or `/hotels/:id`.

---

## 10. Authentication Architecture & Password Infrastructure (Phase 5F-A2.1)

### 10.1 Authentication Data Schema & Relational Model
Phase 5F-A2.1 establishes the database schema for owner credentials and PostgreSQL-backed session management via an incremental, transactional migration runner (`server/src/database/migrate.js`).

1. **`users` Table (Owner Account Singleton):**
   - Stores the single authorized owner account for property portfolio administration.
   - **Schema:**
     - `id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`
     - `email VARCHAR(255) NOT NULL UNIQUE`
     - `password_hash VARCHAR(255) NOT NULL` (Argon2id encoded hash)
     - `role VARCHAR(50) NOT NULL DEFAULT 'owner'`
     - `status VARCHAR(50) NOT NULL DEFAULT 'active'`
     - `created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`
     - `updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`
   - **Singleton Constraint:** Enforced via a PostgreSQL partial unique index:
     ```sql
     CREATE UNIQUE INDEX idx_users_owner_singleton ON users (role) WHERE role = 'owner';
     ```
     This strictly guarantees that at most one owner account can exist in the database, even across concurrent execution anomalies.
   - **Email Normalization Check:** `CONSTRAINT chk_users_email_normalized CHECK (email = lower(trim(email)) AND position('@' in email) > 1)`.

2. **`sessions` Table (PostgreSQL Session Store):**
   - Implements the split-token session architecture approved in Phase 5F-A1.4.
   - **Schema:**
     - `id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`
     - `user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE`
     - `token_hash VARCHAR(64) NOT NULL UNIQUE` (SHA-256 verifier hex digest)
     - `expires_at TIMESTAMPTZ NOT NULL` (7-day absolute lifetime)
     - `idle_expires_at TIMESTAMPTZ NOT NULL` (2-hour rolling inactivity timeout)
     - `created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`
     - `last_active_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`
     - `revoked_at TIMESTAMPTZ` (set on explicit logout or administrative password reset)
     - `ip_address INET` (optional audit field for network anomaly detection)
     - `user_agent VARCHAR(512)` (optional audit field for device tracking)
   - **Indexing Strategy:**
     - `token_hash` has an automatic unique B-tree index created by its `UNIQUE` constraint; no duplicate index is created.
     - `idx_sessions_user_id`: Fast lookup for user-specific sessions and foreign key cascade maintenance.
     - `idx_sessions_expires_at` & `idx_sessions_idle_expires_at` (Migration 003): Separate single-column B-tree indexes on `expires_at` and `idle_expires_at`. Replacing the legacy composite index (`idx_sessions_cleanup`), separate indexes enable PostgreSQL's query planner to optimize session cleanup queries containing disjunctions (`WHERE expires_at < NOW() OR idle_expires_at < NOW()`) via BitmapOr index scans or independent range filters.

### 10.2 Argon2id Cryptographic Configuration
Password hashing utilizes the reference `argon2` Node.js library configured to OWASP RFC 9106 standards:
- **Type:** Argon2id (resistant against both GPU side-channel attacks and cache-timing attacks)
- **Memory Cost:** `65536` KiB (64 MiB RAM per hash)
- **Time Cost:** `3` iterations
- **Parallelism:** `1` thread
- **Digest Length:** `32` bytes
- **Salt:** `16` cryptographically secure random bytes generated per hash operation.

### 10.3 Password & Email Validation Rules
- **Email Validation:** Standard syntax validation; normalized to lowercase and trimmed before storage.
- **Minimum Password Length:** Enforced using distinct **Unicode code points**:
  ```javascript
  Array.from(password).length >= 12
  ```
  Surrogate pairs (emojis, astral symbols) count as single code points. For example, 12 emojis (48 UTF-8 bytes, 24 UTF-16 units) pass validation, while 11 emojis (22 UTF-16 units) are strictly rejected.
- **Maximum Password Size:** Enforced using raw **UTF-8 bytes**:
  ```javascript
  Buffer.byteLength(password, 'utf8') <= 128
  ```
  This bounds memory and CPU consumption against malicious algorithmic complexity payloads. In `verifyPassword`, candidate passwords exceeding 128 UTF-8 bytes are rejected *before* entering the concurrency semaphore, preventing denial-of-service queue saturation.
- **Password Immutability:** Passwords are **never** trimmed (`.trim()`), normalized (`.normalize()`), lowercased, or mutated in any form. Leading, trailing, and internal whitespace characters are preserved as valid entropy.

### 10.4 Process-Local Bounded Concurrency Semaphore & Constant-Time Dummy Hash
Because Argon2id allocates 64 MiB of memory and consumes significant CPU per hash, uncontrolled concurrency could starve Node.js worker threads and block the event loop.
- **Active Operations:** Maximum `2` concurrent active Argon2id operations.
- **Queued Operations:** Maximum `5` waiting tasks.
- **Queue Timeout:** `3,000 ms` maximum wait before failing fast with `code: 'HASHING_OVERLOAD'` (suitable for HTTP 503 `Retry-After: 3`).
- **Process-Local Scope:** This concurrency limiter is process-local to the single container instance. Horizontal multi-replica deployments would coordinate via external queues or dedicated authentication services.
- **Constant-Time Timing Equalization:** `password.service.js` exports a precomputed, syntactically valid `DUMMY_HASH` (`$argon2id$v=19$m=65536,t=3,p=1$...`). In Phase 5F-A2.2, when a login attempt references a nonexistent email, `verifyPassword(DUMMY_HASH, candidatePassword)` is executed so CPU timing is indistinguishable from valid accounts, defeating user enumeration attacks.

### 10.5 One-Time Owner Account Bootstrap (`bootstrap-owner.js`)
- **Execution:** Invoked via `npm run db:bootstrap` (CLI only; no public HTTP route).
- **Credentials:** Ingested via temporary environment variables (`OWNER_EMAIL`, `OWNER_PASSWORD`) or genuine masked terminal input (`terminalPrompt.js`). Passwords are never accepted as command-line arguments or logged.
- **Terminal Masking:** When running in an interactive TTY, `terminalPrompt.js` activates raw mode (`setRawMode(true)`), echoes asterisks (`*`) for typed characters, handles backspace (`\b \b`) accurately by popping Unicode code points, handles Enter, and safely restores raw mode on all exit paths (normal completion, Ctrl+C cancellation, or errors). Falls back gracefully to standard line reading on non-TTY streams (e.g. CI/CD pipelines).
- **Transaction Safety & Advisory Locking:**
  1. Computes Argon2id hash **before** acquiring a database connection, preventing idle locks during CPU computation.
  2. Acquires connection and executes `BEGIN`.
  3. Obtains transaction-scoped non-blocking advisory lock: `SELECT pg_try_advisory_xact_lock(987654321)`.
  4. If lock is unavailable: exits cleanly with status `'locked'`.
  5. Queries existing owner (`SELECT id FROM users WHERE role = 'owner' LIMIT 1 FOR UPDATE`).
  6. If owner exists: commits and exits cleanly with status `'exists'` (never overwrites).
  7. Inserts owner with precomputed hash, commits, and automatically releases lock upon transaction termination.

### 10.6 Administrative Password Recovery (`reset-owner-password.js`)
- **Execution:** Invoked via `npm run db:reset-password` (CLI only).
- **Procedure:**
  1. Ingests new password via `NEW_OWNER_PASSWORD` or masked terminal input (`terminalPrompt.js`).
  2. Precomputes Argon2id hash.
  3. Acquires transaction and advisory lock.
  4. Verifies existing owner account (errors out if none exists).
  5. Updates owner's `password_hash` and `updated_at`.
  6. Revokes all active owner sessions atomically:
     ```sql
     UPDATE sessions SET revoked_at = statement_timestamp() WHERE user_id = $1 AND revoked_at IS NULL;
     ```
  7. Commits transaction and releases connection.

### 10.7 Migration Concurrency Protection (`migrate.js`)
To guard against race conditions and lock contention in automated deployment pipelines or multiple server start events:
- **Session Advisory Lock:** `migrate.js` acquires a session-level advisory lock (`MIGRATION_ADVISORY_LOCK_ID = 987654322`) on a pinned PostgreSQL client before reading or applying migrations.
- **Clean Skipping:** If another deployment or runner holds the lock (`pg_try_advisory_lock` returns `false`), the runner logs an informational notice and exits cleanly (`{ applied: [], skipped: [], locked: true }`) without throwing or executing duplicate migrations.
- **Guaranteed Lock Release:** The advisory lock is unlocked within a `finally` block on the pinned client, ensuring release even if a migration script throws an exception.

### 10.8 Dedicated Test Database Isolation & Safety Safeguards (Phase 5F-A2.1.1 & Phase 5F-A2.1.2)
To eliminate data destruction risks and enforce least-privilege database safety, integration tests require an isolated test database (`namlatic_hotel_test`) accessed strictly via a dedicated non-superuser role (`namlatic_test`):
- **Mandatory `TEST_DATABASE_URL`:** Integration test runs fail immediately if `TEST_DATABASE_URL` is omitted. Tests never fall back to the development `DATABASE_URL`.
- **Dedicated Non-Superuser Role (`namlatic_test`):** Integration tests run under a restricted non-superuser role possessing `NOSUPERUSER`, `NOCREATEDB`, and `NOCREATEROLE`. The role holds zero privileges on the primary development database (`namlatic_hotel`), preventing accidental modification.
- **Runtime Safety Enforcements (`testDb.js`):**
  1. Rejects execution when `NODE_ENV === 'production'`.
  2. Rejects protected databases (`namlatic_hotel`, `postgres`, `production`, `neondb`).
  3. Enforces that the database name must contain `'test'` and exactly match the designated test database (`namlatic_hotel_test` or `TEST_DB_NAME`).
  4. Enforces authorized host validation (defaulting to local loopback hosts `localhost`, `127.0.0.1`, `::1`, or explicitly configured `TEST_DB_ALLOWED_HOSTS`), preventing accidental runs against unauthorized remote databases.
  5. Strictly rejects the application database user (`namlatic_app` / `DB_USER`) and administrative superusers (`postgres`, `root`, `admin`).
  6. Enforces that the configured role matches the designated test role (`namlatic_test` or `TEST_DB_USER`).
  7. Sanitized logging outputs only the database name, host, and test role, never connection strings or credentials.
- **Non-Destructive Test Cleanup:** Broad deletion queries (such as `DELETE FROM users WHERE role = 'owner'`) are strictly eliminated. Instead, the test suite tracks all created test user IDs in memory (`createdUserIds`) and deletes only those temporary test records (`WHERE id = ANY($1::bigint[])`), completely eliminating the risk of erasing legitimate owner records.

### 10.9 Status & Scope Boundaries
Phase 5F-A2.1 and 5F-A2.1.1 implement the credential, database, testing isolation, and CLI infrastructure only.
- HTTP login/logout endpoints, session cookie management (`__Host-namlatic_session`), CSRF middleware (`X-Requested-With`), timing-safe Vercel proxy-secret validation, and route protection for `/api/hotels/*` are scheduled for **Phase 5F-A2.2**.
- The API write endpoints remain unauthenticated until Phase 5F-A2.2 is complete.
