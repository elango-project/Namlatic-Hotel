# Technical Decisions & Architecture Rationale

This document details the architectural choices, trade-offs, and alternatives considered for the Namlatic Hotel Owner Portal.

---

## 1. Database & Persistence Decisions

### PostgreSQL 18.6 vs MySQL vs MongoDB
- **Decision:** **PostgreSQL 18.6**
- **Problem Solved:** Hotel inventory requires strict tabular relationships, exact currency precision, spatial validation, ACID transactions, and robust constraints.
- **Why PostgreSQL:** Advanced indexing support (including `text_pattern_ops` for B-tree prefix searches without locale penalties), robust check constraints (range checking latitudes and longitudes), and strict adherence to SQL standards.
- **Why not MySQL?** While MySQL is relational, PostgreSQL offers superior check constraint enforcement, rich pattern-ops indexing, and robust transaction isolation semantics.
- **Why not MongoDB (NoSQL)?** Hotel inventory data is inherently structured. NoSQL lacks database-level relational constraints, exact numeric typing for financial amounts without custom BSON wrappers, and ACID cross-document transaction guarantees without complex replica sets.

### Native Parameterized SQL vs ORM (Prisma / TypeORM / Sequelize)
- **Decision:** **Native SQL via `pg.Pool`**
- **Problem Solved:** Direct execution of high-performance queries with zero overhead and full control over database interactions.
- **Why Native SQL:**
  1. Full transparency: Every SQL query executed is explicit, preventing "N+1" query problems and hidden subqueries common to ORMs.
  2. Index tuning: Direct access to specialized PostgreSQL features like `lower(title) LIKE lower($1) || '%'` with `text_pattern_ops` and `SELECT ... FOR UPDATE`.
  3. Security: Parameterization (`$1`, `$2`) strictly separates SQL command syntax from user parameters at the PostgreSQL protocol level, ensuring untrusted input is treated purely as data and cannot alter query structure.
- **What would happen without it?** An ORM introduces an abstraction layer that can obscure query performance, complicate migrations, and increase bundle footprint.

---

## 2. Backend Web Architecture

### Express.js vs Raw Node.js `http`
- **Decision:** **Express.js**
- **Problem Solved:** Routing, middleware pipelines, error propagation, and body parsing.
- **Why Express:** Minimalist, battle-tested framework providing clean middleware chaining (`uploadHotelImage` $\to$ controller $\to$ `errorHandler`) and flexible route parameter matching (`/:id`).
- **What if we used raw Node.js `http`?** Raw Node.js can handle HTTP requests, but we would be forced to reinvent URL regex routing, query string parsers, middleware dispatch pipelines, and multipart boundary parsing from scratch.

### Multer 2.5.0 vs Busboy vs Formidable
- **Decision:** **Multer 2.5.0**
- **Problem Solved:** Multipart form data parsing for simultaneous text inputs and image uploads.
- **Why Multer:** Tight Express middleware integration, built-in disk streaming with file size limits, and security updates in version 2.5.0 addressing Denial of Service vulnerabilities present in earlier versions.
- **Enhancement:** Combined with custom 12-byte binary magic byte inspection to reject spoofed MIME types.

---

## 3. Frontend Technology Decisions

### React 18.3.1 + Vite 6 vs Next.js / Create React App
- **Decision:** **React 18.3.1 + Vite 6**
- **Problem Solved:** Fast development iteration and standard Single Page Application (SPA) architecture for an internal management portal.
- **Why React 18.3.1:** Battle-tested stability, concurrent rendering features, and proven ecosystem compatibility with Redux Toolkit 2.3 and React Router 7.
- **Why Vite:** Native ES modules with sub-second hot module replacement (HMR) and optimized Rollup production bundling.
- **Why not Next.js?** The owner portal is an authenticated dashboard application. Server-Side Rendering (SSR) overhead and serverless edge functions are unnecessary for a secure inventory portal.

### Redux Toolkit (RTK) vs Context API vs Zustand
- **Decision:** **Redux Toolkit**
- **Problem Solved:** Predictable shared state management across hotel listing, filtering, pagination, creation, editing, and deletion.
- **Why RTK:** Standardized reducer logic with Immer-backed immutable updates, integrated middleware for async API calls, and excellent Redux DevTools support for debugging.

### Leaflet vs Google Maps API
- **Decision:** **Leaflet (with OpenStreetMap tiles)**
- **Problem Solved:** Rendering interactive maps to visualize hotel geographic coordinates.
- **Why Leaflet:** Lightweight (approx 40 KB), open source, requires no API billing keys, and renders coordinates cleanly across all viewports.

---

## 4. Native Browser Features vs External Libraries

Whenever native browser or runtime capabilities adequately fulfill requirements, native features were selected to reduce dependency bloat:

| Requirement | Native Feature Used | Why Avoid External Library? |
| :--- | :--- | :--- |
| **Image Preview** | `URL.createObjectURL(file)` + `URL.revokeObjectURL()` | Instant client-side preview with zero memory leaks; no file-reader libraries needed. |
| **HTTP Communication** | Modern native `fetch()` | Built into all modern browsers; eliminates the need for Axios. |
| **Multipart Form Submission** | Native `FormData` | Handles binary streams and text boundaries natively. |
| **Responsive Layout** | Native CSS Grid, Flexbox & `@media` queries | Clean, semantic styling without framework overhead. |
| **Unit Testing** | Native Node.js `node:test` + `node:assert` | Built-in since Node.js 18/20/22; fast execution with zero npm devDependencies. |

---

## 5. Dashboard Aggregates: PostgreSQL Server-Side Aggregation vs Client-Side Paginated Calculation

### Decision: Dedicated `GET /api/hotels/stats` powered by PostgreSQL Aggregation
- **Problem:** In earlier client iterations, dashboard KPIs (Average Nightly Rate, Rate Range, Properties with Images) were computed in the browser by mapping over `state.hotels.items` (the paginated collection).
- **Why This Was Incorrect:**
  1. **Pagination Slicing:** The hotel inventory endpoint (`GET /api/hotels?limit=6&offset=0`) returns only a single page slice (6 records) out of the entire database. Calculating averages or rate bounds over 6 items produces invalid metrics that misrepresent the owner's true portfolio.
  2. **Filtering Distortion:** If a user navigates to `/hotels` and applies a price or title filter, the items in Redux reflect only the filtered subset. Computing portfolio KPIs from filtered items yields erroneous global metrics.
  3. **Memory & Bandwidth Waste:** Fetching all hundreds or thousands of hotel records to the browser just to compute a sum and average in JavaScript wastes network bandwidth, increases client memory consumption, and degrades mobile battery life.
- **Why PostgreSQL Server-Side Aggregation is Superior:**
  1. **Single-Pass Aggregation:** PostgreSQL calculates `COUNT(*)`, `AVG(price)`, `MIN(price)`, `MAX(price)`, and `COUNT(image_path)` in a single optimized sequential scan or index scan directly inside the database engine.
  2. **Exact Decimal Precision:** PostgreSQL's `ROUND(COALESCE(AVG(price), 0), 2)` operates on native arbitrary-precision `NUMERIC` types, eliminating floating-point rounding distortion before returning the result.
  3. **Zero In-Memory Overhead:** The database returns a tiny, fixed JSON payload (~150 bytes) regardless of whether the table contains 10 hotels or 1,000,000 hotels:
     ```sql
     SELECT
       COUNT(*)::bigint AS total_properties,
       ROUND(COALESCE(AVG(price), 0), 2) AS average_price,
       COALESCE(MIN(price), 0)::numeric(12,2) AS min_price,
       COALESCE(MAX(price), 0)::numeric(12,2) AS max_price,
       COUNT(image_path)::bigint AS properties_with_images
     FROM hotels;
     ```
  4. **Strict Architectural Decoupling:** The dashboard fetches `GET /api/hotels/stats` independently of the paginated list, allowing each view to retain its own lifecycle, caching, and refresh intervals.

---

## 6. Project-Wide Currency Standard: USD ($)

- **Decision:** **United States Dollar (USD, `$`)**
- **Architecture Standard:**
  1. **Database:** Nightly rates are stored as PostgreSQL `NUMERIC(12,2)` (supporting values up to 9,999,999,999.99 with exact 2-decimal fractional scale).
  2. **API:** Returns financial values as exact decimal strings (e.g. `"270.75"`) to prevent IEEE 754 precision loss during JSON serialization.
  3. **Frontend:** Centralized in [`client/src/config/currency.js`](file:///d:/project/Namlatic%20Hotel/client/src/config/currency.js) with `APP_CURRENCY = 'USD'` and `APP_CURRENCY_SYMBOL = '$'`. All components (Dashboard, Hotel Cards, Filter Toolbar, Detail views) format currency through `formatCurrency()`, guaranteeing consistent display across the application.
