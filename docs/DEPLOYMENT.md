# Namlatic Hotel Owner Portal — Production Deployment & Cloud Provisioning Guide
**Phase 5F-B.1: Production Deployment Configuration & Security Hardening**

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
|   │ Vercel Edge Network & Serverless Function Proxy                 │                                   |
|   │ ───────────────────────────────────────────────────             │                                   |
|   │ • Serves React 18 SPA static assets from client/dist            │                                   |
|   │ • Enforces HSTS, CSP, nosniff, frameguard security headers      │                                   |
|   │ • Routes /api/* via Serverless Function Proxy (client/api/)     │                                   |
|   │ • Injects server-side secret header: x-vercel-proxy-secret      │                                   |
|   │ • Streams multipart uploads directly without buffering          │                                   |
|   │ • Enforces no-store caching: Cache-Control: private, no-store   │                                   |
|   └────────────────────────────────┬────────────────────────────────┘                                   |
|                                    │                                                                    |
|                                    │ 2. Proxied HTTPS with Proxy Secret                                 |
|                                    ▼                                                                    |
|   ┌─────────────────────────────────────────────────────────────────┐                                   |
|   │ Render Web Service (Node.js 22 Express Backend)                 │                                   |
|   │ ──────────────────────────────────────────────────              │                                   |
|   │ • Validates x-vercel-proxy-secret using timing-safe comparison  │                                   |
|   │ • Enforces requireAuth session middleware with PostgreSQL store │                                   |
|   │ • Tokenless CSRF validation (X-Requested-With: XMLHttpRequest)  │                                   |
|   │ • Mandatory Sharp EXIF/GPS stripping & auto-orientation        │                                   |
|   │ • Enforces 5 MB file size limit and magic-byte verification     │                                   |
|   │ • Dual endpoints: Liveness (/api/health) & Readiness (/api/ready)│                                  |
|   └───────────────────┬─────────────────────────────┬───────────────┘                                   |
|                       │                             │                                                   |
|     3. Encrypted SQL  │                             │ 4. Signed Image Upload / Destroy                  |
|        (TLS/SSL)      ▼                             ▼                                                   |
|   ┌───────────────────────────────┐     ┌───────────────────────────────────┐                           |
|   │ Neon Serverless PostgreSQL    │     │ Cloudinary Media Storage (Active) │                           |
|   │ ───────────────────────────   │     │ (or Cloudflare R2 Compatible)     │                           |
|   │ • Dedicated production DB     │     │ ─────────────────────────────     │                           |
|   │ • Least-privilege app role    │     │ • Public HTTPS image delivery     │                           |
|   │   (namlatic_app: DML only)    │     │   via Cloudinary Global CDN       │                           |
|   │ • Dedicated migration role    │     │ • Signed backend upload & delete  │                           |
|   │   (namlatic_migrator: DDL)    │     │   via official Node.js SDK        │                           |
|   │ • Owner singleton constraint  │     │ • Generous 25 credit free tier    │                           |
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
| `DATABASE_URL` | Render | **Secret** | **Yes** | Production | Encrypted Neon PostgreSQL connection URL for the **restricted runtime role** (`namlatic_app`). Must include `?sslmode=require` and optional `channel_binding=prefer`. Must not point to localhost or test databases. |
| `MIGRATION_DATABASE_URL` | Protected CI / Operator Workstation (NEVER Render) | **Secret** | **Yes** (Prod Migrations) | Production | Encrypted Neon PostgreSQL connection URL for the **schema migration role** (`namlatic_migrator`). Permitted to execute DDL. Required when running production migrations (`npm run db:migrate`); fails closed if missing. MUST NEVER be injected into the Render web service environment. Falls back to `DATABASE_URL` in local development. |
| `DB_POOL_MAX` | Render | Public | Optional | Production | Maximum active PostgreSQL pool connections (default `10`). |
| `DB_POOL_IDLE_TIMEOUT` | Render | Public | Optional | Production | Milliseconds before idle connection is released (default `30000`). Vital for serverless compute sleep. |
| `DB_POOL_CONN_TIMEOUT` | Render | Public | Optional | Production | Milliseconds to wait before connection attempt times out (default `5000`). |
| `CORS_ORIGIN` | Render | Public | **Yes** | Production | Comma-separated list of exact allowed frontend origins (e.g. `https://namlatic-hotel.vercel.app`). Wildcards (`*`) and paths are strictly forbidden in production. |
| `TRUST_PROXY` | Render | Public | Optional | Production | Number of upstream proxy hops to trust (e.g. `1` or `2`). Must be verified empirically on live infrastructure before final release. |
| `BACKEND_PROXY_SECRET` | Render & Vercel | **Secret** | **Yes** | Production | Cryptographically random shared secret (minimum 32 characters, no default values). Injected by Vercel into `x-vercel-proxy-secret` and verified by Render. |
| `BACKEND_PROXY_SECRET_OLD` | Render | **Secret** | Optional | Production | Secondary accepted secret for zero-downtime secret rotation. |
| `MEDIA_STORAGE_DRIVER` | Render | Public | **Yes** | Production | Must be `'cloudinary'` (recommended active production provider) or `'r2'`. Setting `'local'` in production is rejected at startup to prevent data loss on ephemeral disks. |
| `CLOUDINARY_CLOUD_NAME` | Render | **Secret** | **Yes** (if driver=cloudinary) | Production | Cloudinary cloud name for signed backend uploads and delivery. |
| `CLOUDINARY_API_KEY` | Render | **Secret** | **Yes** (if driver=cloudinary) | Production | Cloudinary API key for signed backend upload and destroy requests. |
| `CLOUDINARY_API_SECRET` | Render | **Secret** | **Yes** (if driver=cloudinary) | Production | Cloudinary API secret (held exclusively by backend on Render, never exposed to client). |
| `CLOUDINARY_FOLDER` | Render | Public | Optional | Production | Cloudinary organized folder name (default: `namlatic-hotel/hotels`). |
| `R2_ACCOUNT_ID` | Render | **Secret** | **Yes** (if driver=r2) | Production | Cloudflare Account ID hex string (32 characters) for R2 API endpoint. |
| `R2_ACCESS_KEY_ID` | Render | **Secret** | **Yes** (if driver=r2) | Production | Bucket-scoped R2 S3 access key ID (backend only). |
| `R2_SECRET_ACCESS_KEY` | Render | **Secret** | **Yes** (if driver=r2) | Production | Bucket-scoped R2 S3 secret access key (backend only). |
| `R2_BUCKET_NAME` | Render | Public | **Yes** (if driver=r2) | Production | Dedicated bucket name (e.g. `namlatic-hotel-media`). |
| `R2_PUBLIC_BASE_URL` | Render | Public | **Yes** (if driver=r2) | Production | Public HTTPS CDN URL for sanitized image delivery (e.g. `https://pub-abc123xyz.r2.dev` or custom domain `https://assets.namlatic.com`). |
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

### 3.1 Target Service 1: Neon Serverless PostgreSQL (Least-Privilege Database Roles)

Neon provides managed, serverless PostgreSQL with scale-to-zero compute and point-in-time recovery.

#### A. Region Selection
- Select **US East (N. Virginia, `aws-us-east-1`)** or **US West (Oregon, `aws-us-west-2`)** to align with Render's regions, keeping inter-service roundtrip latency under $10\text{ms}$.

#### B. Dedicated Production Database & Isolation
- Database Name: `namlatic_prod` (or default `neondb`).
- **Safety Rule:** Never use `namlatic_hotel_test` as the production database name. The backend configuration strictly refuses to run under `NODE_ENV=production` if the database name contains `test`.

#### C. Database Role Separation Architecture (Least Privilege)
To prevent SQL injection or application vulnerabilities from executing destructive DDL commands (`DROP TABLE`, `ALTER TABLE`, `TRUNCATE`), database permissions are strictly separated between two distinct roles:

1. **`namlatic_migrator` (Migration Role):**
   - Holds schema DDL permissions (`USAGE, CREATE` on schema `public`).
   - Owns application tables and manages the `schema_migrations` tracking table.
   - Executed exclusively by `npm run db:migrate` using `MIGRATION_DATABASE_URL`.
   - Never used for normal web server traffic.

2. **`namlatic_app` (Runtime Application Role):**
   - Strictly restricted to Data Manipulation Language (DML) operations: `SELECT, INSERT, UPDATE, DELETE` on application tables.
   - Holds `USAGE, SELECT, UPDATE` on sequences.
   - **Has NO `CREATE` permission on schema `public`** (cannot create or alter tables).
   - Has NO DDL privileges and cannot modify database schema.
   - Used by the Express web server via `DATABASE_URL`.

#### D. Exact Neon SQL Setup Script
Execute the following script in the Neon SQL Console (logged in as admin/superuser):

```sql
-- 1. Create the dedicated schema migration role:
CREATE ROLE namlatic_migrator WITH LOGIN PASSWORD 'your_secure_migrator_password';
GRANT CONNECT ON DATABASE namlatic_prod TO namlatic_migrator;

-- Connect into the production database:
\c namlatic_prod

-- Grant schema creation rights to the migration role:
GRANT USAGE, CREATE ON SCHEMA public TO namlatic_migrator;

-- 2. Create the restricted runtime application role:
CREATE ROLE namlatic_app WITH LOGIN PASSWORD 'your_secure_app_password';
GRANT CONNECT ON DATABASE namlatic_prod TO namlatic_app;

-- Grant USAGE only on schema public (NO CREATE PRIVILEGE!):
GRANT USAGE ON SCHEMA public TO namlatic_app;

-- 3. Configure default privileges:
-- Ensure that any tables and sequences created by namlatic_migrator
-- automatically grant DML privileges to namlatic_app:
ALTER DEFAULT PRIVILEGES FOR ROLE namlatic_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO namlatic_app;

ALTER DEFAULT PRIVILEGES FOR ROLE namlatic_migrator IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO namlatic_app;
```

#### E. Connection String Formatting & Channel Binding
- **Runtime Application (`DATABASE_URL`):**
  `postgresql://namlatic_app:your_app_password@ep-cool-butterfly-123456.us-east-1.aws.neon.tech/namlatic_prod?sslmode=require&channel_binding=prefer`
- **Schema Migrations (`MIGRATION_DATABASE_URL`):**
  `postgresql://namlatic_migrator:your_migrator_password@ep-cool-butterfly-123456.us-east-1.aws.neon.tech/namlatic_prod?sslmode=require&channel_binding=prefer`

- **`sslmode=require`:** Mandatory in production. TLS certificate verification is performed using Node.js's built-in trusted CA bundle.
- **`channel_binding=prefer`:** Installed driver (`pg` 8.13.1) supports opportunistic channel binding (`enableChannelBinding: true`). If Neon defaults to `channel_binding=require`, change it to `prefer` or omit it. The application explicitly fails fast if `channel_binding=require` is present to prevent false security assumptions.

---

### 3.2 Target Service 2: Render Web Service (Express Backend)

#### A. Service Specifications
- **Service Type:** Web Service
- **Runtime:** Node.js (`>=22.0.0` as specified in `server/package.json` engines)
- **Root Directory:** `server`
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Health Check Path:** `/api/health` (Exempt from auth and proxy secrets; reports 200 OK for liveness).

#### B. Accurate Render Free-Tier Limitations
When deploying on Render's Free Plan, note the following platform characteristics:
1. **Sleep After Inactivity:** Free Web Services automatically spin down (sleep) after 15 minutes of inactivity. When a new incoming request arrives (e.g. from Vercel proxy), the service spins up, causing an initial cold-start latency of $50\text{ to }90\text{ seconds}$.
2. **Ephemeral Container Disks:** Files written to local disk (e.g., in `/uploads`) are deleted whenever the container restarts, sleeps, or redeploys. **This is why `MEDIA_STORAGE_DRIVER=r2` is strictly enforced in production.**
3. **Usage Quota:** Free accounts receive 750 free instance hours per month shared across all free services.
4. **Development vs Production Tier Recommendation:**
   - **Free Plan:** Suitable for development, staging, evaluation, and portfolio demonstration.
   - **Starter / Standard Plan ($7+/month):** Required for production hospitality operations where 24/7 continuous availability, zero cold starts, and custom persistent disks or SLAs are needed.
   - **Cost Safety Rule:** Do not upgrade or enable paid billing without explicit user approval.

#### C. Reverse Proxy Verification Procedure (`TRUST_PROXY`)
In production, the request path travels through two proxy layers:
`Browser` $\to$ `Vercel Edge Network` $\to$ `Render Reverse Proxy` $\to$ `Express Container`

Setting `TRUST_PROXY=1` trusts only Render's internal proxy. If Vercel also injects a hop, `req.ip` might reflect Vercel's edge IP rather than the true client IP.
**Mandatory Empirical Verification Procedure:**
1. During initial deployment or staging, deploy a temporary route or inspect request logs from a known client IP.
2. Log diagnostic headers:
   ```javascript
   console.log({
     clientIp: req.ip,
     ipsArray: req.ips,
     forwardedFor: req.headers['x-forwarded-for'],
     remoteAddress: req.socket.remoteAddress
   });
   ```
3. Send a test request: `curl https://<render-url>/api/health`.
4. If `req.ip` matches your true public IP, `TRUST_PROXY=1` is correct.
5. If `req.ip` matches Vercel's edge IP and your client IP is at index 0 of `req.ips`, configure `TRUST_PROXY=2`.
6. Test spoofing resistance: Send `curl -H "X-Forwarded-For: 8.8.8.8" https://<render-url>/...` and confirm `req.ip` is NOT fooled by the injected header.
7. Remove all diagnostic routes before public cutover.

---

### 3.3 Target Service 3: Cloudinary Media Storage (Primary Production Provider — Phase 5G-A)

Cloudinary is the active production media storage provider for the Namlatic Hotel Owner Portal, providing enterprise-grade asset management, global CDN image delivery, and signed backend operations without requiring cloud infrastructure credit cards on its free plan.

#### A. Cloudinary Account Setup & Credential Retrieval
1. Register for a free Cloudinary account at [https://cloudinary.com/users/register_free](https://cloudinary.com/users/register_free).
2. Upon logging in, navigate to the **Cloudinary Console Dashboard** ([https://console.cloudinary.com/](https://console.cloudinary.com/)).
3. Under **Product Environment Credentials**, locate the three required variables:
   - **Cloud Name:** (e.g. `dxy123456`) $\to$ `CLOUDINARY_CLOUD_NAME`
   - **API Key:** (e.g. `987654321098765`) $\to$ `CLOUDINARY_API_KEY`
   - **API Secret:** Click the eye icon to reveal the secret string $\to$ `CLOUDINARY_API_SECRET`
4. Set `MEDIA_STORAGE_DRIVER=cloudinary` in your Render backend environment variables.

#### B. Backend-Only Credential Handling & Least-Privilege Policy
- **Strict Isolation:** `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` must **ONLY** be configured as environment variables in the Render backend web service.
- **Client Zero-Trust:** These credentials must NEVER be placed in the React client code (`client/`), injected into Vercel build variables, or committed to Git.
- **Signed Upload Architecture:** All media uploads originate server-side from Render using the official `cloudinary` Node.js SDK (`cloudinary.v2.uploader.upload`), ensuring client browsers never directly upload unvetted files to Cloudinary.
- **Controlled Asset Deletion:** Deletions are signed backend requests (`cloudinary.v2.uploader.destroy`) triggered only after authenticated hotel deletions or replacement rollbacks.

#### C. Free-Plan Usage Limitations & Capacity Guidance
- **Generous Monthly Quota:** Cloudinary's free plan provides **25 monthly credits**.
  - $1\text{ credit} = 1,000\text{ transformations}$, or $1\text{ GB of managed storage}$, or $1\text{ GB of net bandwidth}$.
- **Storage & Bandwidth:** The quota supports up to $25\text{ GB}$ of stored images and $25\text{ GB}$ of monthly CDN delivery bandwidth—more than ample for standard hotel owner portfolio operations with zero recurring subscription costs.
- **File Size Limit:** Cloudinary free tier supports single image uploads up to $10\text{ MB}$. Namlatic Hotel enforces an even stricter $5\text{ MB}$ limit with Sharp sanitization.
- **Cost Safety Rule:** Do not upgrade or enable paid add-ons without explicit user approval.

#### D. Mandatory Sharp Pre-Upload Sanitization Pipeline
Cloudinary receives exclusively sanitized image files—never raw client uploads. The backend execution flow is:
1. Multer receives multipart form upload and saves temporarily to `server/src/uploads/hotels/`.
2. Binary magic bytes verified (JPEG, PNG, WebP).
3. `sanitizeImage` runs `sharp` to strip all EXIF, GPS coordinates, device serials, and camera metadata.
4. `CloudinaryStorageAdapter` uploads the sanitized file buffer to Cloudinary using an unpredictable server-generated UUID (`namlatic-hotel/hotels/<uuid>`).
5. Staged local disk file is immediately unlinked upon upload success or failure.

#### E. Production Deployment & Verification Checklist
1. In the Render Dashboard under **Environment Variables**, configure:
   - `MEDIA_STORAGE_DRIVER=cloudinary`
   - `CLOUDINARY_CLOUD_NAME=<your-cloud-name>`
   - `CLOUDINARY_API_KEY=<your-api-key>`
   - `CLOUDINARY_API_SECRET=<your-api-secret>`
2. Deploy the Render backend service.
3. Open the Namlatic Hotel portal, log in, and create or update a hotel with a property photo.
4. Verify the image appears in the hotel cards and hotel details page with a secure URL:
   `https://res.cloudinary.com/<your-cloud-name>/image/upload/v.../namlatic-hotel/hotels/<uuid>`
5. In Cloudinary Console > **Media Library**, verify that the image exists in the folder `namlatic-hotel/hotels/`.
6. Delete the hotel property in the portal and confirm the asset is cleanly removed from the Cloudinary Media Library.

---

### 3.4 Target Service 4: Cloudflare R2 (Alternative / Legacy Object Storage Architecture)

Cloudflare R2 provides S3-compatible object storage with **zero egress fees**, retained as an alternative supported production driver (`MEDIA_STORAGE_DRIVER=r2`).

#### A. Bucket Access & Security Model
- **Public Read Access:** The bucket has public object read access enabled via custom domain (`https://assets.namlatic.com`) or R2 managed subdomain (`https://pub-xxxxxxxx.r2.dev`). Anyone with the exact object key can retrieve the image file over HTTPS GET.
- **Bucket Listing Disabled:** Public bucket listing (`ListObjectsV2`) is disabled to prevent attackers from scraping all stored assets.
- **Private Authenticated Write/Delete:** Uploads (`PutObject`) and deletions (`DeleteObject`) strictly require authenticated S3 API requests using private credentials (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) held exclusively by the backend server.
- **Strict Data Segregation:** **Only sanitized hotel image objects are stored in this bucket.** Database backups, customer personal data, session tokens, and configuration files are strictly forbidden from this bucket.

#### B. Least-Privilege API Token
In Cloudflare Dashboard > R2 > Manage R2 API Tokens:
- **Permissions:** `Object Read & Write` (Never assign Admin or Account-level tokens).
- **TTL:** Unlimited or enterprise rotation schedule.
- **Bucket Scope:** Restrict strictly to `namlatic-hotel-media`.

---

### 3.5 Target Service 5: Vercel (Frontend & Same-Origin Proxy)

Vercel hosts the React 18 / Vite Single Page Application on its global Edge Network and acts as the secure reverse proxy for backend API calls.

#### A. Vercel Plan Terms & Commercial Usage Restrictions
- **Hobby Plan Terms:** Vercel's Terms of Service strictly restrict the Hobby plan to **personal, non-commercial use**.
- **Commercial Usage Requirement:** Operating the Namlatic Hotel Owner Portal for commercial hospitality operations requires a **Vercel Pro plan** ($20/seat/month).
- **Evaluation / Demonstration:** For testing, candidate evaluation, portfolio demonstration, and personal development, the Hobby plan is fully compliant and functional.
- **Cost Safety Rule:** Do not upgrade or purchase plans without explicit user approval.

#### B. Same-Origin API Proxy Architecture (Vercel Serverless Function — `client/api/`)

Browser requests are directed to `https://namlatic-hotel.vercel.app/api/...`:
- **Serverless Function Proxy (`client/api/[...path].js` & `client/api/index.js`):**
  Vercel automatically routes all `/api/*` requests to the Node.js Serverless Function proxy handler (`client/api/proxyHandler.js`).
- **Server-Side Environment Variables:**
  - `BACKEND_ORIGIN`: Target Render backend service URL (e.g. `https://namlatic-hotel-backend.onrender.com`). Validated strictly as an HTTPS URL in production.
  - `BACKEND_PROXY_SECRET`: Cryptographically random secret header injected server-side as `x-vercel-proxy-secret`. **Never bundled into client JavaScript or exposed to browsers.**
- **Request Streaming & Multipart Preservation (`bodyParser: false`):**
  Vercel function configuration disables automatic body parsing (`bodyParser: false`), allowing hotel photo upload streams (`multipart/form-data`) and JSON payloads to be piped directly into the upstream request to Render without memory buffering or parser errors.
- **Session & Cookie Preservation:**
  The proxy forwards backend status codes, response streams, and all `Set-Cookie` headers (`__Host-auth_token=...; Path=/; Secure; HttpOnly; SameSite=Lax`), guaranteeing full PostgreSQL-backed authentication session persistence. The browser treats authentication sessions as first-party, same-origin cookies with `SameSite=Lax`.
- **Cache Prevention:**
  API responses unconditionally carry `Cache-Control: private, no-store, no-cache, max-age=0, must-revalidate`.
- **SPA Fallback Routing (`client/vercel.json`):**
  Static non-API routes (e.g. `/`, `/hotels`, `/login`) fall back to `/index.html` to serve the React Single Page App, while `/api/*` is handled exclusively by the serverless function.

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
4. Run the SQL script from Section 3.1 to create `namlatic_migrator` (DDL) and `namlatic_app` (DML).
5. Copy the connection strings and adjust channel binding to `channel_binding=prefer`:
   - Runtime: `postgresql://namlatic_app:password@ep-...aws.neon.tech/namlatic_prod?sslmode=require&channel_binding=prefer`
   - Migrations: `postgresql://namlatic_migrator:password@ep-...aws.neon.tech/namlatic_prod?sslmode=require&channel_binding=prefer`

### Step 2: Provision Cloudflare R2 Bucket
1. Log in to Cloudflare Dashboard > R2.
2. Create bucket `namlatic-hotel-media`.
3. Create an API Token scoped to `namlatic-hotel-media` with `Object Read & Write` permissions.
4. Record `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
5. Enable Public Access (R2.dev subdomain or custom domain) and record `R2_PUBLIC_BASE_URL`.

### Step 3: Secure Production Migration Execution Workflow

Database migrations execute DDL statements (`CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`, etc.) and require the elevated `namlatic_migrator` role. To maintain the least-privilege boundary, **`MIGRATION_DATABASE_URL` must NEVER be declared or stored in the long-running Render web service environment**.

Two independent database connections govern production operations:
- **`DATABASE_URL`:** Restricted runtime connection for `namlatic_app` (DML only: `SELECT`, `INSERT`, `UPDATE`, `DELETE`). Stored in Render Web Service environment.
- **`MIGRATION_DATABASE_URL`:** Elevated schema migration connection for `namlatic_migrator` (DDL privileges). Supplied strictly to an isolated, ephemeral execution environment.

#### Production Migration Procedure:
Migrations must be executed either via a **protected CI/CD pipeline** (recommended for production) or from an **authorized, secure operator workstation**.

**Option A: Protected CI/CD Pipeline (Automated Deployments):**
In GitHub Actions or your deployment pipeline, configure `MIGRATION_DATABASE_URL` as a protected environment secret. An ephemeral migration job runs prior to web-service deployment:
```bash
npm run db:migrate
```
The runner terminates immediately upon completion, ensuring DDL credentials are never accessible to the long-running web process.

**Option B: Secure Operator Workstation (Manual / Initial Setup):**
When running initial setup or hotfix migrations manually from a workstation:
1. **Never commit credentials to Git or save them in repository files.**
2. **Never print connection strings to standard output or logs.**
3. **Avoid saving raw credentials in terminal history files.** Use interactive prompts or transient variables:

*In Bash / Linux:*
```bash
# Note: leading space prevents command from being recorded in bash history:
 read -s -p "Enter MIGRATION_DATABASE_URL: " MIGRATION_DATABASE_URL; echo ""
 export MIGRATION_DATABASE_URL
 npm run db:migrate
 unset MIGRATION_DATABASE_URL
```

*In Windows PowerShell:*
```powershell
# Prompt securely without echoing password to screen or persistent command history:
$migUrl = Read-Host "Enter MIGRATION_DATABASE_URL" -AsSecureString
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($migUrl)
$plainMigUrl = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
$env:MIGRATION_DATABASE_URL = $plainMigUrl
npm run db:migrate
$env:MIGRATION_DATABASE_URL = $null
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

> [!CAUTION]
> **Production Fail-Closed Enforcement:** If `MIGRATION_DATABASE_URL` is omitted when `NODE_ENV=production`, `server/src/database/migrate.js` **fails closed immediately** with an error:
> `In production, MIGRATION_DATABASE_URL is required to execute database migrations. Production migrations cannot fall back to the restricted application runtime role (DATABASE_URL).`
> It will never silently fall back to `DATABASE_URL` or attempt DDL under the restricted runtime role.

### Step 4: Bootstrap the Singleton Owner Account
Bootstrap the single authorized hotel owner account:
```bash
DATABASE_URL="postgresql://namlatic_app:password@ep-host.aws.neon.tech/namlatic_prod?sslmode=require&channel_binding=prefer" node server/src/scripts/bootstrap-owner.js
# Enter owner email: owner@namlatic.com
# Enter owner password (min 12 Unicode chars): ************
```
Expected output:
```
[BOOTSTRAP] Precomputing Argon2id hash for owner password...
[BOOTSTRAP] Successfully bootstrapped owner account: owner@namlatic.com
```

### Step 5: Provision Render Web Service
1. Log in to Render Dashboard at `https://dashboard.render.com`.
2. Click **New +** > **Web Service** and link repository `elango-project/Namlatic-Hotel`.
3. Set **Root Directory** to `server`.
4. Configure Build Command: `npm install`, Start Command: `npm start`.
5. Under **Environment Variables**, add:
   - `NODE_ENV=production`
   - `DATABASE_URL=<neon-runtime-connection-string-for-namlatic_app>`
   - `BACKEND_PROXY_SECRET=<generate-32-char-random-secret>`
   - `MEDIA_STORAGE_DRIVER=cloudinary` (or `r2`)
   - If using Cloudinary:
     * `CLOUDINARY_CLOUD_NAME=<your-cloud-name>`
     * `CLOUDINARY_API_KEY=<your-api-key>`
     * `CLOUDINARY_API_SECRET=<your-api-secret>`
   - If using Cloudflare R2:
     * `R2_ACCOUNT_ID=...`
     * `R2_ACCESS_KEY_ID=...`
     * `R2_SECRET_ACCESS_KEY=...`
     * `R2_BUCKET_NAME=namlatic-hotel-media`
     * `R2_PUBLIC_BASE_URL=...`
   - `CORS_ORIGIN=https://namlatic-hotel.vercel.app`
6. Deploy the service and record the generated URL (e.g. `https://namlatic-hotel-backend.onrender.com`).

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

## 5. Security Decision Record (SDR — Phases 5F-B.1 & 5F-B.2)

| Decision Item | Chosen Approach | Rejected Alternative | Security Rationale |
|---|---|---|---|
| **Database Roles** | Two separate roles: `namlatic_migrator` (DDL) and `namlatic_app` (DML only) | Single application user with full DDL/schema privileges | Eliminates risk of SQL injection or runtime exploits creating, dropping, or altering tables or stored procedures. |
| **Migration Credential Isolation (Phase 5F-B.2)** | `MIGRATION_DATABASE_URL` strictly isolated to ephemeral migration runners (CI/workstation); completely removed from Render web service environment | Injecting DDL credentials into long-running Render web service container | Long-running web processes must never hold elevated DDL privileges in memory. Prevents application exploits from acquiring DDL capabilities. |
| **Migration Fail-Closed Policy (Phase 5F-B.2)** | Production migrations strictly require `MIGRATION_DATABASE_URL` and fail closed if absent; never falls back to `DATABASE_URL` | Silently falling back to `DATABASE_URL` in production | Prevents execution of schema migrations under the unprivileged runtime role, ensuring predictable deployments and immediate failure signaling. |
| **Cookie SameSite Policy** | `SameSite=Lax` with `__Host-` prefix and tokenless CSRF defense | Claiming `SameSite=Strict` in documentation | Reflects actual implementation in `cookieHelper.js` where `SameSite=Lax` ensures top-level navigation reliability while CSRF defense is guaranteed by Fetch Metadata and `X-Requested-With`. |
| **R2 Storage Access** | Public object read delivery via custom domain; authenticated backend write/delete | Describing bucket as "private" | Accurately describes access topology: bucket is read-accessible for sanitized images with known keys; private credentials used strictly for S3 operations. |
| **Image Sanitization** | Mandatory Sharp EXIF/GPS stripping before PutObject | Storing raw client uploads directly in R2 | Prevents exfiltration of owner/guest GPS coordinates, device serial numbers, and metadata leakage to the public internet. |
| **Reverse Proxy Topology** | Configurable `TRUST_PROXY` verified empirically via live request evidence | Hardcoded `trust proxy: 1` assumption | Multi-hop proxy chains (Vercel + Render) may require 2 hops; blind assumption could enable IP spoofing or break rate limiting. |
| **Vercel / Render Tiers** | Documented Free/Hobby constraints with clear upgrade paths | Silently selecting paid plans or claiming free tier has 24/7 SLA | Adheres to cost safety, non-commercial Terms of Service compliance, and transparent operational uptime expectations. |
| **Cloudinary Media Storage (Phase 5G-A)** | Cloudinary Node.js SDK signed uploads with unpredictable server-side UUIDs (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`) | Requiring payment cards or unsigned frontend uploads | Eliminates barrier to cloud deployment with generous 25-credit free tier. Signed server-side uploads prevent unauthorized client direct writes. Retains seamless fallback and compatibility with Cloudflare R2 and local filesystem. |
| **Vercel API Proxy Architecture** | Node.js Serverless Function proxy (`client/api/proxyHandler.js`) with server-side `BACKEND_PROXY_SECRET` injection and raw streaming (`bodyParser: false`) | Static `vercel.json` rewrite rules with runtime env interpolation `${BACKEND_ORIGIN}` | Static `vercel.json` rewrites cannot interpolate environment variables at runtime and lack server-side secret header injection capabilities, causing silent fallback to `index.html`. Serverless function guarantees reliable HTTPS proxying, secret isolation, and streaming integrity. |
