# Namlatic Hotel Owner Portal

A full-stack Hotel Inventory Management System built for hotel owners to create, view, search, update, and manage hotel properties.

Built in accordance with the **[Twelve-Factor App](https://12factor.net/)** methodology, featuring native PostgreSQL parameterized SQL, image binary magic byte security, and comprehensive unit and integration testing.

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
│   ├── TWELVE_FACTOR_COMPLIANCE.md    # 12-Factor App audit and persistent storage notes
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

The test suite includes **187 automated tests** across the entire full-stack architecture:
- **Backend Unit Tests:** 42 passed (`node:test`)
- **Backend Integration Tests:** 43 passed (HTTP + Live PostgreSQL 18.6)
- **Frontend Unit Tests:** 102 passed (Vitest + React Testing Library)

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

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Process liveness probe |
| `GET` | `/api/ready` | PostgreSQL readiness probe |
| `POST` | `/api/hotels` | Create hotel (multipart form data, optional photo) |
| `GET` | `/api/hotels` | List hotels with title search, price filter, and pagination |
| `GET` | `/api/hotels/stats` | Portfolio-wide statistics via PostgreSQL aggregation (`AVG`, `MIN`, `MAX`, counts) |
| `GET` | `/api/hotels/:id` | Retrieve single hotel by primary key ID |
| `PUT` | `/api/hotels/:id` | Update hotel and replace/preserve image |
| `DELETE`| `/api/hotels/:id` | Delete hotel and purge image from disk |

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
- [x] **Phase 4C: Hotel Details Page & Interactive Location Map** (Dynamic `/hotels/:id` route, PostgreSQL BIGINT string validation without trimming or precision loss, `MapViewController` with primitive numeric props preventing unnecessary map resets, hero image with zero-fake-photo fallback, WGS 84 coordinate badges, Leaflet 1.9.4 & React Leaflet 4.2.1 OpenStreetMap rendering with compliant tile URL & attribution, marker popup, SEO tags via React Helmet Async, abort signal cleanup, 43 phase-specific frontend unit tests, 0 horizontal overflow across 10 viewports. Current full-suite total: 187 automated tests passing: 42 backend unit, 43 backend integration, 102 frontend unit)
- [ ] **Phase 5: Deployment & Twelve-Factor Cloud Configuration** (Render / Cloud deployment, durable storage documentation)

---

## 8. Documentation Index

- 📘 [System Architecture](docs/ARCHITECTURE.md)
- 🗄️ [Database Guide & Data Types](docs/DATABASE_GUIDE.md)
- 🔌 [Complete API Documentation](docs/API_DOCUMENTATION.md)
- 🧪 [Testing Guide](docs/TESTING_GUIDE.md)
- 💡 [Technical Decisions & Rationale](docs/TECHNICAL_DECISIONS.md)
- ☁️ [Twelve-Factor App Compliance Audit](docs/TWELVE_FACTOR_COMPLIANCE.md)
- 🎓 [Technical Interview Preparation Guide](docs/INTERVIEW_PREPARATION.md)
