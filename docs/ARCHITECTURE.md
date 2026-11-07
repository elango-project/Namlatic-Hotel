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
│   │   │   └── currency.js            # Standard USD currency formatting & symbols
│   │   ├── components/                # Reusable UI components
│   │   │   ├── HotelCard.jsx          # Property card with image fallback & actions
│   │   │   ├── HotelCardSkeleton.jsx  # Shimmer loading placeholder
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
│   │   │   ├── LandingPage.jsx        # Landing hero and portal overview
│   │   │   └── MyHotelsPage.jsx       # Inventory grid, filter toolbar & pagination
│   │   ├── services/
│   │   │   └── api.js                 # Centralized fetch wrapper & URL builder
│   │   ├── styles/
│   │   │   ├── index.css              # Design tokens, reset, typography
│   │   │   └── App.css                # Layout, components, and responsive rules
│   │   ├── test/                      # Vitest unit test suites (27 tests)
│   │   │   ├── setup.js
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
                          │     ├── <StatCard> (Average Nightly Rate from DB: AVG(price))
                          │     ├── <StatCard> (Rate Range from DB: MIN(price) - MAX(price))
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
