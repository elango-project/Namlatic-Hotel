# Namlatic Hotel Owner Portal

A full-stack Hotel Inventory Management System built for hotel owners to create, view, search, update, and manage hotel properties.

The project uses React, Node.js, Express and PostgreSQL, with parameterized SQL, validated image uploads, automated testing, and documented Twelve-Factor App considerations. Cloud deployment and durable media storage are planned for Phase 5.

---

## 1. System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Client (React SPA)                        │
│ Vite 6.0 • React 18.3.1 • Redux Toolkit 2.3 • React Router 7 │
│                  Port 5173 (Development)                     │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTP / Multipart Form Data / JSON
┌──────────────────────────────▼───────────────────────────────┐
│                    Server (Express.js)                       │
│ Node.js • Express 4.21.1 • Multer 2.5.0 • Native SQL (pg)    │
│                  Port 5000 (Development)                     │
└──────────────────────────────┬───────────────────────────────┘
                               │ Parameterized SQL over TCP
┌──────────────────────────────▼───────────────────────────────┐
│                   Database (PostgreSQL)                      │
│      PostgreSQL 18.6 • Native Types • B-Tree Indexes         │
│                         Port 5432                            │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack & Key Decisions

| Layer | Selected Technology | Why This Technology? | Native Alternative Considered? |
| :--- | :--- | :--- | :--- |
| **Database** | **PostgreSQL 18.6** | Strict relational schema, exact `NUMERIC(12,2)` money precision, `text_pattern_ops` indexing. | MySQL / MongoDB evaluated; PostgreSQL selected for strict constraint enforcement. |
| **SQL Access** | **Native SQL (`pg.Pool` 8.13.1)** | Full query control, zero ORM overhead, and parameterized queries (`$1`, `$2`) that strictly separate SQL command syntax from user data, preventing SQL injection. | ORMs (Prisma, Sequelize) avoided to prevent hidden query generation and N+1 problems. |
| **Backend** | **Express.js 4.21.1 (Node.js)** | Minimalist HTTP routing, clean middleware pipelines, mature ecosystem. | Raw `node:http` was evaluated; Express chosen to avoid manual URL/middleware boilerplate. |
| **File Uploads** | **Multer 2.5.0** | Stream-based multipart parsing with strict 5 MB limits and UUID file generation. | Enhanced with native 12-byte binary magic byte inspection (rejects spoofed extensions). |
| **Frontend** | **React 18.3.1 + Vite 6.0.0** | High-performance SPA with instant Hot Module Replacement (HMR) and proven ecosystem stability with Redux Toolkit and React Router 7. | React 18.3.1 provides robust concurrent features and stable library compatibility. |
| **State Management**| **Redux Toolkit 2.3.0 (RTK)** | Centralized, predictable global state with Immer-backed immutable updates. | Native Context API is suitable for simple state, but RTK scales cleanly for complex async inventory operations. |
| **Maps** | **Leaflet 1.9.4** | Lightweight (~40 KB), open source, requires no paid Google API keys. | Native browser geolocation provides coordinates, but Leaflet is required to render the interactive map. |
| **Testing** | **Node.js `node:test` + Vitest 5.1.0** | Fast in-memory execution: built-in native runner for backend unit tests, Vitest + RTL for client components. | Jest evaluated; native node:test and Vitest chosen for performance and modern ESM support. |

---

## 3. Project Structure

```
namlatic-hotel-portal/
├── README.md                          # Main project guide
├── docs/                              # Comprehensive engineering documentation
│   ├── ARCHITECTURE.md                # Multi-tier topology and request-response flow
│   ├── DATABASE_GUIDE.md              # PostgreSQL schema, data types, indexes, and triggers
│   ├── API_DOCUMENTATION.md           # Complete REST API specifications & schemas
│   ├── TESTING_GUIDE.md               # Unit, integration, and UI testing methodologies
│   ├── TECHNICAL_DECISIONS.md         # Technology trade-offs and architectural justifications
│   ├── TWELVE_FACTOR_COMPLIANCE.md    # Twelve-Factor App considerations and durable storage notes
│   └── INTERVIEW_PREPARATION.md       # Technical interview questions and concept defense
├── client/                            # Frontend Single Page Application
│   ├── src/
│   │   ├── components/                # Reusable UI widgets
│   │   ├── pages/                     # Routed views (Dashboard, My Hotels, Landing, HotelFormPage [Add/Edit], HotelDetailsPage [Detail & Map])
│   │   ├── store/                     # Redux Toolkit store and slices
│   │   └── App.jsx                    # Routing and layout root
│   └── package.json
└── server/                            # Backend REST API Service
    ├── src/
    │   ├── config/                    # Database pool and environment configuration
    │   ├── controllers/               # Request handling and constraint error masking
    │   ├── services/                  # Business logic and parameterized SQL execution
    │   ├── validators/                # Input validation rules (ID, creation, listing)
    │   ├── middleware/                # Uploads, error handling, magic byte verification
    │   ├── routes/                    # API route definitions
    │   └── database/                  # init.sql and verify.sql
    ├── tests/
    │   ├── unit/                      # Fast in-memory unit tests (node:test)
    │   └── integration/               # Full HTTP & PostgreSQL integration tests
    ├── package.json
    └── .env.example
```

---

## 4. Getting Started

### Prerequisites
- **Node.js:** v22.0.0 or higher (v24 LTS or another currently supported LTS release recommended)
  > **Note:** React Router 7 has a Node.js 20 compatibility minimum, but Node.js 20 reached End-of-Life (EOL) in March 2026. This project establishes Node.js 22+ as its supported runtime baseline to avoid deploying on an unsupported EOL environment, while recommending Node.js 24 LTS or newer supported LTS releases.
- **PostgreSQL:** v16.0 or higher (v18.6 verified)
- **npm:** v9.0.0 or higher

---

### Step 1: Database Setup
1. Launch the PostgreSQL server and create the application role and database using `psql` or pgAdmin:
   ```sql
   CREATE USER namlatic_app WITH PASSWORD 'your_secure_password';
   CREATE DATABASE namlatic_hotel OWNER namlatic_app;
   ```
2. Initialize the schema:
   ```powershell
   psql -U namlatic_app -d namlatic_hotel -f server/src/database/init.sql
   ```

---

### Step 2: Backend Configuration & Startup
1. Navigate to the `server/` directory:
   ```powershell
   cd server
   npm install
   ```
2. Create your `.env` configuration file:
   ```powershell
   cp .env.example .env
   ```
3. Update `.env` with your database credentials:
   ```env
   PORT=5000
   NODE_ENV=development
   CORS_ORIGIN=http://localhost:5173
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=namlatic_hotel
   DB_USER=namlatic_app
   DB_PASSWORD=your_secure_password
   ```
4. Start the backend development server:
   ```powershell
   npm run dev
   ```
   The API will listen on `http://localhost:5000`.

---

### Step 3: Frontend Setup & Startup
1. In a separate terminal, navigate to the `client/` directory:
   ```powershell
   cd client
   npm install
   ```
2. Start the Vite development server:
   ```powershell
   npm run dev
   ```
   The application will be available at `http://localhost:5173`.
3. *(Optional)* Configure `VITE_APP_CURRENCY` in `client/.env` (e.g. `VITE_APP_CURRENCY=USD`). By default, prices are displayed in a clean, currency-neutral numeric format (e.g. `250.00`) without assuming any currency.

---

## 5. Running Automated Tests

The test suite includes **614 automated tests** across the entire full-stack architecture:
- **Backend Unit Tests:** 272 passed (`node:test`, 15 test suites)
- **Backend Integration Tests:** 156 passed (HTTP + Live PostgreSQL 18.6: 18 auth database tests + 75 auth API tests + 63 hotel API tests)
- **Frontend Unit Tests:** 186 passed (Vitest + React Testing Library, 15 test suites)

```powershell
# 1. Run all backend tests (server directory)
cd server
npm test

# 2. Run only backend unit tests (lightning fast, in-memory)
npm run test:unit

# 3. Run only backend integration tests (full HTTP + live database)
npm run test:integration

# 4. Run all frontend unit tests (client directory)
cd ../client
npm test
```

---

## 6. API Overview

| Method | Endpoint | Description | Rate Limit |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Process liveness probe | Exempt (unthrottled) |
| `GET` | `/api/ready` | PostgreSQL readiness probe | Exempt (unthrottled) |
| `POST` | `/api/hotels` | Create hotel (multipart form data, optional photo) | 60 writes / 15 min |
| `GET` | `/api/hotels` | List hotels with title search, price filter, and pagination | 300 requests / 15 min |
| `GET` | `/api/hotels/stats` | Portfolio-wide statistics via PostgreSQL aggregation (`AVG`, `MIN`, `MAX`, counts) | 300 requests / 15 min |
| `GET` | `/api/hotels/:id` | Retrieve single hotel by primary key ID | 300 requests / 15 min |
| `PUT` | `/api/hotels/:id` | Update hotel and replace/preserve image | 60 writes / 15 min |
| `DELETE`| `/api/hotels/:id` | Delete hotel and purge image from disk | 60 writes / 15 min |

*For complete request/response schemas, status codes, and error formats, see [API Documentation](docs/API_DOCUMENTATION.md).*

---

## 7. Development Progress Tracker

- [x] **Phase 1: Project Scaffold & Security Hardening** (Vite, React, Express, npm audit 0 vulnerabilities)
- [x] **Phase 2A & 2B: PostgreSQL 18.6 Database Infrastructure** (Dedicated role, check constraints, B-Tree indexes, updated_at trigger)
- [x] **Phase 3A: Hotel Collection APIs** (`POST /api/hotels`, `GET /api/hotels`, search, filters, pagination)
- [x] **Phase 3B: Hotel Single-Record APIs** (`GET /api/hotels/:id`, `PUT /api/hotels/:id`, `DELETE /api/hotels/:id`, transactional file rotation)
- [x] **Phase 3 Standards Update:** 35 Unit Tests (`node:test`) + 40 Integration Tests = 75 passing tests, full documentation suite (`docs/`)
- [x] **Phase 4A: Frontend Redux Toolkit Dashboard & Hotel Listing** (Owner dashboard, real DB metrics, debounced search, responsive card grid, visual identity tokens)
- [x] **Phase 4A Review & Corrections:** Added `GET /api/hotels/stats` (PostgreSQL server aggregation), corrected terminology ("Total Properties", "Properties with Images"), verified browser search (`?title=sea`), established neutral default currency formatting (configurable via `VITE_APP_CURRENCY`), tested across 10 viewports (360px to 1440px), 108 automated tests passing at phase completion.
- [x] **Phase 4B: Hotel Creation & Editing with Live Image Upload** (Reusable `HotelForm` for `/hotels/new` and `/hotels/:id/edit`, `URL.createObjectURL` lifecycle management, memory leak prevention, field validation matching backend rules, existing image preservation, 30 phase-specific frontend unit tests, verified across 10 viewports)
- [x] **Phase 4C: Hotel Details Page & Interactive Location Map** (Dynamic `/hotels/:id` route, PostgreSQL BIGINT string validation without trimming or precision loss, `MapViewController` with primitive numeric props preventing unnecessary map resets, hero image with zero-fake-photo fallback, WGS 84 coordinate badges, Leaflet 1.9.4 & React Leaflet 4.2.1 OpenStreetMap rendering with compliant tile URL & attribution, marker popup, SEO tags via React Helmet Async, abort signal cleanup, 43 phase-specific frontend unit tests, 0 horizontal overflow across 10 viewports. 187 automated tests passing)
- [x] **Phase 5A: Deployment Readiness & Twelve-Factor Audit** (Full-stack audit of Render, Neon, Vercel, and ephemeral filesystem boundaries)
- [x] **Phase 5B: Backend Environment Configuration & PostgreSQL Cloud Connectivity** (`DATABASE_URL` parsing, fail-fast production defense, Neon TLS enforcement, SASL mechanism negotiation verification, shutdown idempotency, 225 automated tests passing)
- [x] **Phase 5C: Express Backend Production Hardening for Render** (Binding to 0.0.0.0, Render `trust proxy: 1` IP anti-spoofing, strict CORS allowlist without wildcards, Helmet backend response security headers with cross-origin CORP for Leaflet/media, mutating write rate limiter, body size limits, production 500 error sanitization, 254 automated tests passing)
- [x] **Phase 5D: Persistent Cloud Media Storage with Cloudflare R2** (Provider-neutral storage abstraction, Local and Cloudflare R2 adapters with AWS SDK v3, stable server-generated keys `hotels/<uuid>.<ext>`, unambiguous `r2:` references in PostgreSQL `image_path` TEXT column without schema migrations, dynamic CDN public URL resolution in API response layer, compensating rollback deletes on DB failure, safe asynchronous delete tolerance, 289 automated tests passing)
- [x] **Phase 5D.1: Storage Failure-Path and Production Configuration Corrections** (Enforced `MEDIA_STORAGE_DRIVER=r2` in production while rejecting missing driver or `local`, added HTTPS/credential/query/fragment validation for `R2_PUBLIC_BASE_URL`, best-effort staged-file cleanup on read failures, protected database connection acquisition failure path in `updateHotel` with compensating R2 delete, clarified local media migration requirement and test mock isolation, 303 automated tests passing)
- [x] **Phase 5E: Vercel Routing & Frontend Cloud Configuration** (Vercel project root `client/vercel.json` with official schema, Vite SPA fallback rewrite `/(.*) -> /index.html` supporting deep link refresh, baseline security headers `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=31536000`, `Permissions-Policy`, CSP compatibility analysis for OpenStreetMap/Leaflet/preview blobs with production template, authoritative `client/.env.example` with secrets exclusion, automated validation tests, 314 automated tests passing)
- [x] **Phase 5E.1: Frontend Production Environment Validation** (Strict production `VITE_API_URL` validation enforcing HTTPS and `/api` path convention, automatic origin derivation reducing duplicate configuration, HTTPS production origin validation, media URL preservation without appending `/api`, CSP architecture documentation corrections omitting OpenStreetMap from `connect-src`, 331 automated tests passing)
- [x] **Phase 5E.2: Final Frontend Environment and Media URL Safety** (Made `VITE_API_URL` strictly mandatory in production while rejecting legacy `VITE_API_BASE_URL` fallback, hardened URL validation rejecting embedded credentials, query strings, URL fragments, and localhost, implemented mixed-content defense in `getImageUrl()` rejecting HTTP images in production while permitting them in development, 340 automated tests passing)
- [x] **Phase 5F-A1: Owner Authentication Architecture & Security Design** (Comprehensive read-only architectural specification for same-origin Vercel proxy, Argon2id credentials, tokenless CSRF with `X-Requested-With`, PostgreSQL-backed sessions, and DoS-resilient abuse throttling without account lockout)
- [x] **Phase 5F-A2.1: Authentication Database & Password Infrastructure** (Incremental PostgreSQL migration `002_create_auth_tables.sql` establishing `users` singleton and `sessions` tables, transactional `migrate.js` runner, Argon2id password service with process-local bounded concurrency semaphore, strict Unicode code-point validation, one-time owner bootstrap CLI, and administrative password recovery CLI. 379 automated tests passing)
- [x] **Phase 5F-A2.1.1: Authentication Infrastructure Safety Corrections** (Dedicated `TEST_DATABASE_URL` test isolation, runtime safety guards rejecting production and non-test databases, temporary test record ID tracking eliminating broad owner deletions, native TTY masked input tooling with raw mode and Unicode backspace support, pre-semaphore 128-byte limit enforcement in `verifyPassword`, incremental migration `003_correct_session_expiry_indexes.sql` creating separate B-tree indexes for `expires_at` and `idle_expires_at`, migration concurrency advisory locking with clean skip, constant-time dummy hash verification. 402 automated tests passing)
- [x] **Phase 5F-A2.1.2: Dedicated Test Role and Database Safety** (Created dedicated non-superuser test role `namlatic_test` with least privileges on `namlatic_hotel_test` and zero permissions on development database `namlatic_hotel`, strengthened test database validation with exact expected test database name matching, explicit allowed-host enforcement rejecting unauthorized remote hosts while supporting custom CI hosts via `TEST_DB_ALLOWED_HOSTS`, strict rejection of application user `namlatic_app` and administrative superusers `postgres`/`root`/`admin`, replaced all unit test fixtures with fictional credentials. 414 automated tests passing)
- [x] **Phase 5F-A2.2: Backend Authentication Middleware & Route Lockdown** (PostgreSQL-backed split-token sessions storing SHA-256 verifier hashes, `__Host-namlatic_session` HttpOnly cookie, timing-safe reverse proxy secret verification with zero-downtime rotation, tokenless CSRF defense with `X-Requested-With` and Fetch Metadata, bounded LRU abuse throttler with progressive delays and IP rate limiting, dummy Argon2 verification timing equalization, complete route protection locking down all hotel endpoints `GET /api/hotels`, `GET /api/hotels/stats`, `GET /api/hotels/:id`, `POST /api/hotels`, `PUT /api/hotels/:id`, `DELETE /api/hotels/:id`, narrow orchestrator health probe exemptions. 512 automated tests passing)
- [x] **Phase 5F-A2.3: Backend Security Audit, Authentication Hardening & Final Verification** (Systematic security audit across all authentication, session management, and route protection modules; strict RFC 6265bis `__Host-` cookie enforcement with safe dev plain-HTTP fallback; health probe method bypass restriction limiting exemptions strictly to GET/HEAD; fetch metadata lowercase normalization and strict site allowlisting; throttled sliding idle refresh race condition mitigation; runtime PostgreSQL catalog verification of dedicated test role least privileges; comprehensive 6x6 hotel route protection matrix; 567 automated tests passing)
- [x] **Phase 5F-A3: Frontend Authentication UI & Protected Routing** (Owner login page with Argon2id credentials, Redux Toolkit authSlice, persistent HttpOnly session restoration via `GET /api/auth/me`, `ProtectedRoute` route protection wrapper preventing flash of private content, session expiration interceptor with unauthorized event subscription, accessible show/hide password toggle, header and sidebar logout controls with loading feedback, responsive design verified across 8 viewports, 614 automated tests passing)
- [x] **Phase 5F-A3.1: Frontend Authentication Reliability Fixes & Documentation Consistency** (Resolved connection-error handling in ProtectedRoute and LoginPage, differentiated invalid credentials, rate limiting, and network/server outages, added recoverable retry actions, corrected session lifecycle documentation to 7-day absolute lifetime / 2-hour idle timeout / 5-minute activity throttle with database and cookie agreement, improved screenshot script portability with project-relative output and dynamic browser resolution, added 22 new regression tests across 3 suites, 636 automated tests passing)
- [ ] **Phase 5F-B: Cloud Resource Provisioning** (Neon PostgreSQL, Render Web Service, Cloudflare R2 bucket, Vercel proxy configuration)
- [ ] **Phase 5G: Production End-to-End & Security Verification** (Live cloud verification, CORS validation, SSL audit, probe monitoring)

---

## 8. Important Security Notice: Owner Authentication Status

> [!NOTE]
> **Owner Authentication & Protected Routing Fully Implemented (Phases 5F-A2.2, 5F-A2.3, 5F-A3 & 5F-A3.1):**
> All hotel inventory and analytics endpoints (`GET /api/hotels`, `GET /api/hotels/stats`, `GET /api/hotels/:id`, `POST /api/hotels`, `PUT /api/hotels/:id`, `DELETE /api/hotels/:id`) are strictly locked down behind mandatory owner session authentication (`requireAuth`), tokenless CSRF verification (`verifyTokenlessCsrf`), and reverse proxy secret validation (`verifyProxySecret`).
>
> On the frontend, `ProtectedRoute` guards all owner routes (`/`, `/dashboard`, `/hotels`, `/hotels/new`, `/hotels/:id`, `/hotels/:id/edit`), restoring sessions automatically from the HttpOnly session cookie on startup without exposing credentials to JavaScript. Unauthenticated users are redirected to the responsive `/login` screen. If a network outage or server error occurs during startup, a recoverable error screen with a "Retry Session Verification" action is displayed instead of exposing protected data or showing misleading credential errors.
>
> Session Security Policy:
> - **Hard Absolute Lifetime:** 7 days (`Max-Age=604800` s on `__Host-namlatic_session` cookie; `expires_at = created_at + 7 days` in PostgreSQL `sessions` table). Cookie and database agree.
> - **Rolling Inactivity Timeout:** 2 hours of inactivity (`idle_expires_at = last_active_at + 2 hours`).
> - **Activity Refresh Throttling:** Database write updates to sliding idle expiration are throttled to at most once per 5 minutes.
> - **Absolute Ceiling:** Sliding idle extensions are bounded by the hard absolute lifetime (`Math.min(now + 2h, expires_at)`).
>
> Probes (`GET /api/health` and `GET /api/ready`) remain unauthenticated and unthrottled for platform orchestrators. Single-owner portal architecture is fully operational and verified across 636 automated tests.

---

## 9. Documentation Index

- 📘 [System Architecture](docs/ARCHITECTURE.md)
- 🔒 [Backend Security Audit Report (Phase 5F-A2.3)](docs/security/PHASE_5F_A2_3_BACKEND_SECURITY_AUDIT.md)
- 🗄️ [Database Guide & Data Types](docs/DATABASE_GUIDE.md)
- 🔌 [Complete API Documentation](docs/API_DOCUMENTATION.md)
- 🧪 [Testing Guide](docs/TESTING_GUIDE.md)
- 💡 [Technical Decisions & Rationale](docs/TECHNICAL_DECISIONS.md)
- ☁️ [Twelve-Factor App Considerations](docs/TWELVE_FACTOR_COMPLIANCE.md)
- 🎓 [Technical Interview Preparation Guide](docs/INTERVIEW_PREPARATION.md)
- 📖 [Comprehensive Project Interview Guide](docs/NAMLATIC_HOTEL_PROJECT_INTERVIEW_GUIDE.md)
