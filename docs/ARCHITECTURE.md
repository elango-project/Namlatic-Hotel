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
│   │   │   ├── HotelFormPage.jsx      # Page container for Create and Edit routes
│   │   │   ├── LandingPage.jsx        # Landing hero and portal overview
│   │   │   └── MyHotelsPage.jsx       # Inventory grid, filter toolbar & pagination
│   │   ├── services/
│   │   │   └── api.js                 # Centralized fetch wrapper & URL builder
│   │   ├── styles/
│   │   │   ├── index.css              # Design tokens, reset, typography
│   │   │   └── App.css                # Layout, components, and responsive rules
│   │   ├── test/                      # Vitest unit test suites (52 tests)
│   │   │   ├── setup.js
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
                          └── Route: "/hotels" ──> <MyHotelsPage>
                                ├── <FilterToolbar> (Debounced search, min/max price)
                                ├── Status: loading ──> <HotelCardSkeleton> (x6 shimmer)
                                ├── Status: error   ──> <ErrorAlert> (retry trigger)
                                ├── Status: empty   ──> <EmptyState> (zero results)
                                ├── Status: success ──> <HotelCardGrid>
                                │     └── <HotelCard> (xN responsive grid)
                                ├── <Pagination> (Page numbers, records range, prev/next)
                                └── <DeleteConfirmModal> (Accessible modal with focus trap)
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
