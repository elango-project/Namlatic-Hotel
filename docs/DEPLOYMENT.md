# Namlatic Hotel Owner Portal — Production Deployment & Cloud Provisioning Guide
**Phase 5F-B: Cloud Resource Provisioning & Production Deployment Preparation**

---

## 1. Architectural Overview & Cloud Topology

The Namlatic Hotel Owner Portal follows a decoupled, cloud-native **PERN** (PostgreSQL, Express, React, Node) architecture designed for security, zero-egress asset delivery, and complete session protection.

```
+---------------------------------------------------------------------------------------------------------+
|                                    Production Deployment Topology                                       |
+---------------------------------------------------------------------------------------------------------+
|                                                                                                         |
|   [ Browser / Client ]                                                                                  |
|            │                                                                                            |
|            │ 1. HTTPS Requests & __Host- Session Cookies                                                |
|            ▼                                                                                            |
|   ┌─────────────────────────────────────────────────────────────────┐                                   |
|   │ Vercel Edge Network (Global CDN)                                │                                   |
|   │ ─────────────────────────────────                               │                                   |
|   │ • Serves React 18 SPA static assets from client/dist            │                                   |
|   │ • Enforces HSTS, CSP, nosniff, frameguard security headers      │                                   |
|   │ • Routes /api/(.*) via Same-Origin API Proxy rewrite            │                                   |
|   │ • Injects secret header: x-vercel-proxy-secret                  │                                   |
|   │ • Bypasses rewrite caching: x-vercel-enable-rewrite-caching: 0  │                                   |
|   └────────────────────────────────┬────────────────────────────────┘                                   |
|                                    │                                                                    |
|                                    │ 2. Proxied HTTPS with Proxy Secret                                 |
|                                    ▼                                                                    |
|   ┌─────────────────────────────────────────────────────────────────┐                                   |
|   │ Render Web Service (Oregon / us-west / Frankfurt)               │                                   |
|   │ ──────────────────────────────────────────────────              │                                   |
|   │ • Node.js 22 runtime running hardened Express server            │                                   |
|   │ • Validates x-vercel-proxy-secret using timing-safe comparison  │                                   |
|   │ • Enforces requireAuth session middleware with PostgreSQL store │                                   |
|   │ • Tokenless CSRF validation (X-Requested-With: XMLHttpRequest)  │                                   |
|   │ • Strips EXIF/GPS metadata & auto-orients uploaded images       │                                   |
|   │ • Enforces 5 MB file size limit and magic-byte verification     │                                   |
|   │ • Dual endpoints: Liveness (/api/health) & Readiness (/api/ready)│                                  |
|   └───────────────────┬─────────────────────────────┬───────────────┘                                   |
|                       │                             │                                                   |
|     3. Encrypted SQL  │                             │ 4. S3 PutObject / DeleteObject                    |
|        (TLS/SSL)      ▼                             ▼                                                   |
|   ┌───────────────────────────────┐     ┌───────────────────────────────────┐                           |
|   │ Neon Serverless PostgreSQL    │     │ Cloudflare R2 Object Storage      │                           |
|   │ ───────────────────────────   │     │ ─────────────────────────────     │                           |
|   │ • Dedicated production DB     │     │ • Dedicated private bucket        │                           |
|   │ • Least-privilege app user    │     │ • Bucket-scoped API token         │                           |
|   │ • Advisory lock migrations    │     │ • Zero-egress fee public CDN      │                           |
|   │ • Owner singleton constraint  │     │ • Stripped & sanitized media only │                           |
|   └───────────────────────────────┘     └───────────────────────────────────┘                           |
|                                                                                                         |
+---------------------------------------------------------------------------------------------------------+
```

---

## 2. Deployment Environment-Variable Mapping Reference

Below is the complete, canonical mapping of every environment variable across all deployment platforms.

| Variable Name | Target Platform | Sensitivity | Mandatory | Environment | Description & Accepted Values |
|---|---|---|---|---|---|
| `NODE_ENV` | Render | Public | **Yes** | Production | Must be `'production'`. Enforces strict security guards, disables plain-HTTP cookies, and mandates HTTPS/R2. |
| `PORT` | Render | Public | Auto | Production | Port bound by Express. Render automatically injects `PORT` (default `10000`). |
| `HOST` | Render | Public | Optional | Production | Network interface binding. Must be `0.0.0.0` for Render container routing. |
| `DATABASE_URL` | Render | **Secret** | **Yes** | Production | Encrypted Neon PostgreSQL connection URL. Must include `?sslmode=require` and optional `channel_binding=prefer`. Must not point to localhost or test databases. |
| `DB_POOL_MAX` | Render | Public | Optional | Production | Maximum active PostgreSQL pool connections (default `10`). |
| `DB_POOL_IDLE_TIMEOUT` | Render | Public | Optional | Production | Milliseconds before idle connection is released (default `30000`). Vital for serverless compute sleep. |
| `DB_POOL_CONN_TIMEOUT` | Render | Public | Optional | Production | Milliseconds to wait before connection attempt times out (default `5000`). |
| `CORS_ORIGIN` | Render | Public | **Yes** | Production | Comma-separated list of exact allowed frontend origins (e.g. `https://namlatic-hotel.vercel.app`). Wildcards (`*`) and paths are strictly forbidden in production. |
| `TRUST_PROXY` | Render | Public | Optional | Production | Reverse proxy hops to trust. Set to `1` (or leave default) for Render's single-hop proxy topology. |
| `BACKEND_PROXY_SECRET` | Render & Vercel | **Secret** | **Yes** | Production | Cryptographically random shared secret (minimum 32 characters). Injected by Vercel into `x-vercel-proxy-secret` and verified by Render. |
| `BACKEND_PROXY_SECRET_OLD` | Render | **Secret** | Optional | Production | Secondary accepted secret for zero-downtime secret rotation. |
| `MEDIA_STORAGE_DRIVER` | Render | Public | **Yes** | Production | Must be `'r2'`. Setting `'local'` in production is rejected at startup to prevent data loss on ephemeral disks. |
| `R2_ACCOUNT_ID` | Render | **Secret** | **Yes** | Production | Cloudflare Account ID hex string (32 characters) for R2 API endpoint. |
| `R2_ACCESS_KEY_ID` | Render | **Secret** | **Yes** | Production | Bucket-scoped R2 S3 access key ID. |
| `R2_SECRET_ACCESS_KEY` | Render | **Secret** | **Yes** | Production | Bucket-scoped R2 S3 secret access key. |
| `R2_BUCKET_NAME` | Render | Public | **Yes** | Production | Dedicated bucket name (e.g. `namlatic-hotel-media`). |
| `R2_PUBLIC_BASE_URL` | Render | Public | **Yes** | Production | Public HTTPS CDN URL for the bucket (e.g. `https://pub-abc123xyz.r2.dev` or custom domain `https://assets.namlatic.com`). |
| `RATE_LIMIT_ENABLED` | Render | Public | Optional | Production | Enables rate limiting (default `true`). |
| `RATE_LIMIT_WRITE_MAX` | Render | Public | Optional | Production | Max write requests per window per IP (default `60`). |
| `RATE_LIMIT_WRITE_WINDOW_MS` | Render | Public | Optional | Production | Write rate limit window in ms (default `900000` = 15 mins). |
| `RATE_LIMIT_GENERAL_MAX` | Render | Public | Optional | Production | Max general requests per window per IP (default `300`). |
| `RATE_LIMIT_GENERAL_WINDOW_MS` | Render | Public | Optional | Production | General rate limit window in ms (default `900000` = 15 mins). |
| `BODY_LIMIT` | Render | Public | Optional | Production | Maximum allowed JSON request payload size (default `'10kb'`). |
| `BACKEND_ORIGIN` | Vercel | Public | **Yes** | Production | Full Render service URL (e.g. `https://namlatic-hotel-backend.onrender.com`) used by `client/vercel.json` rewrite destination. |
| `VITE_API_URL` | Vercel | Public | **Yes** | Production | Same-origin API URL embedded in client bundle (e.g. `https://namlatic-hotel.vercel.app/api`). Must end in `/api` and use HTTPS. |
| `VITE_API_ORIGIN` | Vercel | Public | Optional | Production | Frontend origin for resolving relative URLs (derived automatically from `VITE_API_URL` if omitted). |
| `VITE_APP_CURRENCY` | Vercel | Public | Optional | Production | Optional ISO 4217 display currency code (e.g. `USD`). Defaults to neutral decimal formatting. |
| `OWNER_EMAIL` | One-Time CLI | Sensitive | One-Time | Setup | Owner account email for `npm run db:bootstrap`. |
| `OWNER_PASSWORD` | One-Time CLI | **Secret** | One-Time | Setup | Owner password (min 12 Unicode code points, max 128 UTF-8 bytes) for `npm run db:bootstrap`. |

---

## 3. Cloud Provider Provisioning Specifications

### 3.1 Target Service 1: Neon Serverless PostgreSQL

Neon provides managed, serverless PostgreSQL with scale-to-zero compute and instant point-in-time recovery.

#### A. Region Selection
- Select **US East (N. Virginia, `aws-us-east-1`)** or **US West (Oregon, `aws-us-west-2`)** to align with Render's Oregon/Ohio regions, keeping inter-service roundtrip latency under $10\text{ms}$.

#### B. Dedicated Production Database & Isolation
- Database Name: `namlatic_prod` (or default `neondb`).
- **Safety Rule:** Never use `namlatic_hotel_test` as the production database name. The backend configuration strictly refuses to run under `NODE_ENV=production` if the database name contains `test`.

#### C. Least-Privilege Application Database User
Do not connect the Render backend using the default PostgreSQL superuser (`postgres`). Create a dedicated application user with restricted privileges:

```sql
-- Connect to Neon console as admin/superuser:
CREATE ROLE namlatic_app WITH LOGIN PASSWORD 'your_secure_application_password';

-- Grant connection to the production database:
GRANT CONNECT ON DATABASE namlatic_prod TO namlatic_app;

-- Connect into the namlatic_prod database:
\c namlatic_prod

-- Grant schema permissions:
GRANT USAGE, CREATE ON SCHEMA public TO namlatic_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO namlatic_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO namlatic_app;

-- Ensure future migration tables and sequences inherit privileges:
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO namlatic_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO namlatic_app;
```

#### D. Connection String Formatting & Channel Binding
Neon connection URLs look like:
`postgresql://namlatic_app:your_password@ep-cool-butterfly-123456.us-east-1.aws.neon.tech/namlatic_prod?sslmode=require&channel_binding=prefer`

- **`sslmode=require`:** Mandatory in production. TLS certificate verification is performed using Node.js's built-in trusted CA bundle.
- **`channel_binding=prefer`:** Installed driver (`pg` 8.13.1) supports opportunistic channel binding (`enableChannelBinding: true`). If Neon defaults to `channel_binding=require`, change it to `prefer` or omit it. The application explicitly fails fast if `channel_binding=require` is present to prevent false security assumptions.

---

### 3.2 Target Service 2: Render Web Service (Express Backend)

Render hosts the containerized Node.js backend with automated Git deploys, zero-downtime rolling deploys, and free SSL certificates.

#### A. Service Specifications
- **Service Type:** Web Service
- **Runtime:** Node.js (`>=22.0.0` as specified in `server/package.json` engines)
- **Root Directory:** `server`
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Health Check Path:** `/api/health` (Exempt from auth and proxy secrets; reports 200 OK for liveness).

#### B. Dynamic Port & Host Binding
- Express binds to `process.env.PORT || 5000` on `0.0.0.0`. Render dynamically assigns `PORT=10000`.

#### C. Reverse Proxy Topology
- Render runs behind a single NGINX edge reverse proxy hop. `TRUST_PROXY=1` allows Express to derive true client IP from `X-Forwarded-For` without permitting spoofed upstream hops.

#### D. Render Infrastructure Blueprint (`render.yaml`)
A complete `render.yaml` configuration is located at the repository root, declaring the service topology and linking environment variables.

---

### 3.3 Target Service 3: Cloudflare R2 (Object Storage)

Cloudflare R2 provides S3-compatible object storage with **zero egress fees**, delivering hotel images cost-effectively.

#### A. Bucket Setup
- **Bucket Name:** `namlatic-hotel-media`
- **Location Hint:** Automatic (or matching the database region, e.g. North America).

#### B. Least-Privilege API Token
In Cloudflare Dashboard > R2 > Manage R2 API Tokens:
- **Permissions:** `Object Read & Write` (Never assign Admin or Account-level tokens).
- **TTL:** Unlimited or enterprise rotation schedule.
- **Bucket Scope:** Restrict strictly to `namlatic-hotel-media`.

#### C. EXIF & GPS Metadata Sanitization Pipeline
Before any photo is saved or uploaded to R2, it passes through the image sanitization pipeline in `server/src/middleware/upload.middleware.js`:
1. **Magic-Byte Signature Verification:** Verifies binary file headers for JPEG (`FF D8 FF`), PNG (`89 50 4E 47`), or WebP (`RIFF...WEBP`). Spoofed text or script files are rejected immediately (HTTP 400).
2. **Sharp EXIF Stripping:** Processes the image through `sharp.rotate()`, auto-orienting pixels according to camera rotation tags and stripping all EXIF, GPS, camera model, and personal metadata.
3. **Format-Specific Re-encoding:** Re-encodes JPEG with MozJPEG ($85\%$ quality), PNG ($level=8$), and WebP ($85\%$ quality).
4. **File Size Enforcement:** Maximum file size strictly enforced at $5\text{ MB}$ (`LIMIT_FILE_SIZE`).
5. **Corrupt Image Protection:** If decoding fails on corrupt or truncated payloads, the temporary file is unlinked immediately and HTTP 400 is returned.

#### D. Public Media Delivery
- Enable **R2 Public Access** or connect a custom domain:
  - Default R2 Managed Subdomain: `https://pub-xxxxxxxxxxxxxxxx.r2.dev`
  - Custom Domain: `https://assets.namlatic.com`
- Set `R2_PUBLIC_BASE_URL` to this HTTPS URL. The backend stores references as `r2:hotels/<uuid>.<ext>` and formats public URLs as `${R2_PUBLIC_BASE_URL}/hotels/<uuid>.<ext>`.

---

### 3.4 Target Service 4: Vercel (Frontend & Same-Origin Proxy)

Vercel hosts the React 18 / Vite Single Page Application on its global Edge Network and acts as the secure reverse proxy for backend API calls.

#### A. Project Settings
- **Framework Preset:** Vite
- **Root Directory:** `client`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

#### B. Same-Origin API Proxy Architecture (`client/vercel.json`)
Browser requests are directed to `https://namlatic-hotel.vercel.app/api/...`:
- Vercel routes `/api/(.*)` to `${BACKEND_ORIGIN}/api/$1`.
- Vercel sets request header `x-vercel-proxy-secret` to `$BACKEND_PROXY_SECRET`.
- Vercel disables rewrite caching via `x-vercel-enable-rewrite-caching: 0`.
- Browser treats cookies (`__Host-namlatic_session`) as first-party, same-origin cookies with `SameSite=Strict`.

#### C. Security Headers
Configured in `client/vercel.json` for all routes:
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security: max-age=31536000`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`

---

## 4. Step-by-Step Production Initialization Runbook

Follow this strict chronological order during initial production setup:

### Step 1: Provision Neon Database
1. Create a Neon account at `https://console.neon.tech`.
2. Create project `namlatic-hotel` in region `aws-us-east-1` or `aws-us-west-2`.
3. Create database `namlatic_prod`.
4. Run the SQL script from Section 3.1 to create the `namlatic_app` non-superuser role.
5. Copy the connection string and adjust channel binding to `channel_binding=prefer`:
   `postgresql://namlatic_app:password@ep-host.aws.neon.tech/namlatic_prod?sslmode=require&channel_binding=prefer`

### Step 2: Provision Cloudflare R2 Bucket
1. Log in to Cloudflare Dashboard > R2.
2. Create bucket `namlatic-hotel-media`.
3. Create an API Token scoped to `namlatic-hotel-media` with `Object Read & Write` permissions.
4. Record `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
5. Enable Public Access (R2.dev subdomain or custom domain) and record `R2_PUBLIC_BASE_URL`.

### Step 3: Provision Render Web Service
1. Log in to Render Dashboard at `https://dashboard.render.com`.
2. Click **New +** > **Web Service** and link repository `elango-project/Namlatic-Hotel`.
3. Set **Root Directory** to `server`.
4. Configure Build Command: `npm install`, Start Command: `npm start`.
5. Under **Environment Variables**, add the variables specified in Section 2:
   - `NODE_ENV=production`
   - `DATABASE_URL=<your-neon-connection-string>`
   - `BACKEND_PROXY_SECRET=<generate-32-char-random-secret>`
   - `MEDIA_STORAGE_DRIVER=r2`
   - `R2_ACCOUNT_ID=...`
   - `R2_ACCESS_KEY_ID=...`
   - `R2_SECRET_ACCESS_KEY=...`
   - `R2_BUCKET_NAME=namlatic-hotel-media`
   - `R2_PUBLIC_BASE_URL=...`
   - `CORS_ORIGIN=https://namlatic-hotel.vercel.app`
6. Deploy the service and record the generated URL (e.g. `https://namlatic-hotel-backend.onrender.com`).

### Step 4: Run Production Database Migrations
Run the versioned migrations against Neon using the Render Shell or locally via:
```bash
DATABASE_URL="postgresql://namlatic_app:password@ep-host.aws.neon.tech/namlatic_prod?sslmode=require&channel_binding=prefer" node server/src/database/migrate.js
```
Expected output:
```
[MIGRATE] Starting database migrations...
[MIGRATE] Applying migration: 001_create_hotels_schema.sql...
[MIGRATE] Successfully applied: 001_create_hotels_schema.sql
[MIGRATE] Applying migration: 002_create_auth_tables.sql...
[MIGRATE] Successfully applied: 002_create_auth_tables.sql
[MIGRATE] Applying migration: 003_correct_session_expiry_indexes.sql...
[MIGRATE] Successfully applied: 003_correct_session_expiry_indexes.sql
[MIGRATE] Completed. Applied: 3, Skipped (Already applied): 0
```

### Step 5: Bootstrap the Singleton Owner Account
Bootstrap the single authorized hotel owner account:
```bash
DATABASE_URL="postgresql://..." OWNER_EMAIL="owner@namlatic.com" OWNER_PASSWORD="your_secure_password" node server/src/scripts/bootstrap-owner.js
```
Or run interactively without passing the password in environment variables:
```bash
DATABASE_URL="postgresql://..." node server/src/scripts/bootstrap-owner.js
# Enter owner email: owner@namlatic.com
# Enter owner password (min 12 Unicode chars): ************
```
Expected output:
```
[BOOTSTRAP] Precomputing Argon2id hash for owner password...
[BOOTSTRAP] Successfully bootstrapped owner account: owner@namlatic.com
```

### Step 6: Deploy Vercel Frontend
1. Log in to Vercel at `https://vercel.com`.
2. Click **Add New...** > **Project** and import `elango-project/Namlatic-Hotel`.
3. In **Project Settings**:
   - Set **Root Directory** to `client`.
   - Framework: **Vite**.
4. In **Environment Variables**:
   - `BACKEND_ORIGIN=https://namlatic-hotel-backend.onrender.com`
   - `BACKEND_PROXY_SECRET=<same-32-char-random-secret-used-on-render>`
   - `VITE_API_URL=https://namlatic-hotel.vercel.app/api`
5. Click **Deploy**.

### Step 7: Live Verification
1. Verify Liveness: `curl -I https://namlatic-hotel-backend.onrender.com/api/health` $\to$ `HTTP/1.1 200 OK`.
2. Verify Readiness: `curl -I https://namlatic-hotel-backend.onrender.com/api/ready` $\to$ `HTTP/1.1 200 OK`.
3. Verify Proxy Rejection: `curl -I https://namlatic-hotel-backend.onrender.com/api/hotels` (without proxy secret header) $\to$ `HTTP/1.1 403 Forbidden`.
4. Verify Same-Origin Proxy: Open `https://namlatic-hotel.vercel.app` in browser, log in with bootstrapped owner credentials, add a hotel with photo, and verify EXIF metadata is stripped and image displays via R2 CDN URL.

---

## 5. Security & Isolation Checklists

### Pre-Deployment Verification
- [x] EXIF/GPS metadata stripping implemented and tested for JPEG, PNG, WebP (`imageSanitization.test.js`).
- [x] Maximum upload size limit ($5\text{ MB}$) verified with magic-byte validation.
- [x] `requireAuth` protects all mutating hotel CRUD endpoints and private inventory queries.
- [x] Timing-safe comparison enforced on `x-vercel-proxy-secret`.
- [x] `__Host-` cookie attributes (`Secure; HttpOnly; SameSite=Strict; Path=/`) enforced in production.
- [x] Native parameterized SQL utilized across all database queries to prevent SQL injection.
- [x] Zero backend secrets exposed in `client/` or client-side JavaScript bundles.
- [x] Dedicated test database harness (`namlatic_hotel_test`) and test role (`namlatic_test`) isolated from production.
