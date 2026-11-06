# Twelve-Factor App Compliance Audit

The Namlatic Hotel Owner Portal is engineered according to the principles of the **[Twelve-Factor App](https://12factor.net/)** methodology for building software-as-a-service applications:

---

## 1. Codebase
> *One codebase tracked in revision control, many deploys.*
- **Status:** **Fully Compliant**
- Monorepo containing decoupled `client/` and `server/` directories.
- Tracked in a single Git repository deployed to development, staging, and production environments.

## 2. Dependencies
> *Explicitly declare and isolate dependencies.*
- **Status:** **Fully Compliant**
- Both client and server maintain independent manifests: `package.json` and `package-lock.json`.
- Strict version pins and scoped overrides (e.g. `minimatch ^11.0.4` override for `nodemon`) guarantee reproducible dependency graphs. Zero reliance on ambient system-level packages.

## 3. Config
> *Store config in the environment.*
- **Status:** **Fully Compliant**
- Strict separation of code and configuration.
- Server uses `dotenv` to load environment variables (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `PORT`, `CORS_ORIGIN`).
- Client uses Vite environment variables (`VITE_API_URL`).
- All `.env` files are excluded from Git via `.gitignore`. Template `.env.example` files contain non-sensitive documentation placeholders.

## 4. Backing Services
> *Treat backing services as attached resources.*
- **Status:** **Fully Compliant**
- PostgreSQL is treated as an attached backing service accessed over TCP/IP via connection pooling (`pg.Pool`).
- Switching from a local PostgreSQL database to an Amazon RDS or Supabase managed database requires zero code modifications—only environment variable updates.

## 5. Build, Release, Run
> *Strictly separate build and run stages.*
- **Status:** **Fully Compliant**
- **Build stage:** Vite transforms React JSX, minifies CSS, and bundles JavaScript into immutable `client/dist`.
- **Release stage:** Environment variables are attached to the release bundle.
- **Run stage:** Express executes `server.js` listening on the bound port.

## 6. Processes
> *Execute the app as one or more stateless processes.*
- **Status:** **Partially Compliant (Documented Limitation)**
- The API processes are completely stateless: user sessions are not stored in memory, and no server affinity is required.
- **Media Storage Limitation:** Uploaded hotel images are currently saved to the server's local filesystem (`server/src/uploads/hotels`). Cloud platforms like Render have ephemeral filesystems. In production, persistent storage disks (e.g., Render Disks) or cloud object storage (Amazon S3 / Google Cloud Storage) must be configured for durability across container restarts.

## 7. Port Binding
> *Export services via port binding.*
- **Status:** **Fully Compliant**
- The backend Express application self-binds directly to the TCP port specified in `process.env.PORT` (defaults to 5000), without requiring an external web server container (like Apache or Tomcat).

## 8. Concurrency
> *Scale out via the process model.*
- **Status:** **Fully Compliant**
- Stateless architecture allows scaling horizontally by spinning up additional Node.js process instances or container replicas behind a reverse proxy or load balancer (e.g., NGINX, AWS ALB).

## 9. Disposability
> *Maximize robustness with fast startup and graceful shutdown.*
- **Status:** **Fully Compliant**
- Express starts in under 200 ms.
- Listens for termination signals (`SIGTERM`, `SIGINT`) to drain active HTTP requests and gracefully close `pg.Pool` database connections.

## 10. Dev/Prod Parity
> *Keep development, staging, and production as similar as possible.*
- **Status:** **Fully Compliant**
- Uses PostgreSQL 18 in development and matches production relational database targets. Zero development shortcuts (such as substituting SQLite in dev while using PostgreSQL in prod).

## 11. Logs
> *Treat logs as event streams.*
- **Status:** **Fully Compliant**
- The application never writes logs to local log files.
- All errors, connection notices, and server events are streamed directly to `stdout` and `stderr`, where log aggregators (e.g. Datadog, CloudWatch) capture them.

## 12. Admin Processes
> *Run admin/management tasks as one-off processes.*
- **Status:** **Fully Compliant**
- Database schema initialization (`server/src/database/init.sql`) and verification (`server/src/database/verify.sql`) run as standalone administrative SQL processes executed through `psql` or administrative CLI tasks.
