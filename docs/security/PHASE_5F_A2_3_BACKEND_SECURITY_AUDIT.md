# Backend Security Audit, Authentication Hardening & Verification Report
## Phase 5F-A2.3 — Namlatic Hotel Owner Portal

- **Repository:** `https://github.com/elango-project/Namlatic-Hotel`
- **Audit Phase:** Phase 5F-A2.3 — Backend Security Audit, Authentication Hardening & Final Verification
- **Baseline Commit:** `7abdf8f89ae62c3114193c7540f7fc6c322e0d71` (Phase 5F-A2.2)
- **Target Environment:** Node.js 22+ (v24 LTS Recommended) • Express 4.21.1 • PostgreSQL 18.6
- **Status:** **PASSED — Production-Grade Security Verified (567 / 567 Automated Tests Passing)**

---

## 1. Executive Summary

This security audit conducted a systematic, adversarial inspection of the Namlatic Hotel Owner Portal backend authentication, session management, tokenless Cross-Site Request Forgery (CSRF) defenses, reverse proxy secret verification, and hotel inventory route protection.

The system was audited against OWASP Top 10 API Security Risks (2023), RFC 6265bis cookie standards, timing attack vulnerabilities, Denial of Service (DoS) attack vectors targeting password hashing, and test database privilege isolation.

Five concrete security defects were identified and resolved during this phase without altering the approved architecture (Vercel same-origin proxy, Argon2id, PostgreSQL split-token sessions). Full adversarial and regression testing confirmed 100% test pass rates across all 567 automated tests.

---

## 2. Threat Model & Asset Inventory

### 2.1 Protected Assets
1. **Hotel Inventory Records:** Property names, descriptions, geographic coordinates (WGS 84), and pricing data in PostgreSQL `hotels` table.
2. **Financial Aggregates:** Average, minimum, and maximum property rates, portfolio counts, and analytics in `/api/hotels/stats`.
3. **Owner Credentials:** Argon2id password hash (`users.password_hash`) and owner singleton account (`role = 'owner'`).
4. **Session Credentials:** Cryptographic SHA-256 session token verifier digests stored in `sessions.token_hash`.
5. **Durable Media Storage:** Cloudflare R2 / local filesystem hotel photos and staging directories.
6. **Server Compute & Memory:** CPU and memory resources required for Argon2id hashing ($m=65536\text{ KiB}, t=3, p=1$).

### 2.2 Threat Actors & Attack Vectors
- **Public Internet Attacker:** Direct access to Render backend bypassing the Vercel edge proxy.
- **Credential Stuffer / Brute-Force Bot:** Automated dictionary attacks attempting to guess the owner's password or flood the Argon2id computation engine.
- **Malicious Third-Party Website (CSRF):** Cross-origin script or form attempting to mutate hotel inventory or hijack sessions using browser ambient credentials.
- **Session Hijacker / Network Observer:** Adversary attempting to read, forge, or reuse expired or revoked session tokens.
- **Untrusted / Compromised Test Environment:** Test runner attempting to run against production or development databases, or running with administrative superuser permissions.

---

## 3. Security Findings & Hardening Remediations

| ID | Severity | Category | Component | Description & Remediation | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **VULN-01** | **High** | Access Control Bypass | `proxySecret.middleware.js` | **Health Probe Method Bypass**: Probes were exempted based on path alone without checking HTTP method, allowing non-GET methods (`POST /api/health`, `DELETE /api/ready`) to bypass reverse proxy secret verification. **Fixed:** Restricted exemption strictly to `GET` and `HEAD` methods; stripped query strings; non-GET/HEAD methods strictly require valid `x-vercel-proxy-secret` or are rejected with HTTP 403. | **Resolved** |
| **VULN-02** | **Medium** | Cryptographic Storage | `cookieHelper.js` & `auth.middleware.js` | **Strict RFC 6265bis `__Host-` Cookie Enforcement**: RFC 6265bis §5.4.1 requires that cookies prefixed with `__Host-` MUST contain `Secure`, `Path=/`, and NO `Domain`. Compliant browsers reject `__Host-` cookies on plain HTTP. **Fixed:** Defaulted to `__Host-namlatic_session` with `Secure`. Added safe dev-only opt-in fallback via `COOKIE_PLAIN_HTTP=true` (using `namlatic_session` without `Secure`) strictly forbidden in production. Production strictly rejects dev cookies. | **Resolved** |
| **VULN-03** | **Medium** | CSRF Defense | `csrf.middleware.js` | **Fetch Metadata Normalization & Allowlisting**: `Sec-Fetch-Site` header values were checked with loose string equality, risking bypass via casing or unexpected metadata values. **Fixed:** Normalized value with `.toLowerCase().trim()` and enforced a strict allowlist `Set(['same-origin', 'same-site', 'none'])`. Rejects `cross-site` and any unrecognized metadata value with HTTP 403. | **Resolved** |
| **VULN-04** | **Low** | Concurrency / Race Condition | `session.service.js` | **Throttled Idle Refresh Race Condition**: During throttled sliding idle updates (`last_active_at`, `idle_expires_at`), concurrent session revocation could be overwritten. **Fixed:** Added `WHERE id = $5 AND revoked_at IS NULL RETURNING id` and checked `rowCount === 0`. If revoked concurrently, `validateSession` detects revocation immediately and returns `null`. | **Resolved** |
| **VULN-05** | **Low** | Test Isolation / Safety | `testDb.js` | **Runtime Test Role Privilege Verification**: Test configuration previously verified role name via string regex but did not query the live PostgreSQL catalog. **Fixed:** Implemented `verifyTestRolePrivileges(pool)` querying `pg_roles` at runtime to verify `rolsuper=false`, `rolcreatedb=false`, and `rolcreaterole=false` before test execution. | **Resolved** |

---

## 4. Deep Dive: Vulnerability Remediation Details

### 4.1 VULN-01: Health Probe Method Bypass Restriction
- **Root Cause:** In Express middleware pipelines, `proxySecret.middleware.js` evaluated `isProbePath = req.path === '/api/health' || req.path === '/api/ready'`. It omitted `req.method` verification. While `health.routes.js` only defined `router.get('/health')`, any intermediate middleware or future route additions on the `/api/health` path could allow unauthenticated, un-proxied write operations.
- **Remediation:**
  ```javascript
  const cleanPath = (req.path || '').split('?')[0];
  const isProbePath = cleanPath === '/api/health' || cleanPath === '/api/ready';
  const isProbeMethod = req.method === 'GET' || req.method === 'HEAD';

  if (isProbePath && isProbeMethod) {
    return next();
  }
  ```
- **Verification:** Unit tests (`proxySecret.middleware.test.js`) and integration tests (`auth.api.test.js`) verify that `POST /api/health`, `POST /api/ready`, and `DELETE /api/health` without the proxy secret return HTTP 403 Forbidden.

### 4.2 VULN-02: RFC 6265bis `__Host-` Cookie Enforcement & Plain-HTTP Dev Fallback
- **Root Cause:** RFC 6265bis §5.4.1 specifies that a cookie starting with `__Host-` MUST satisfy three conditions:
  1. It MUST NOT contain a `Domain` attribute (host-only cookie).
  2. It MUST contain `Path=/`.
  3. It MUST contain the `Secure` flag (sent only over TLS/HTTPS).
  In non-secure plain HTTP development environments, compliant browsers reject `__Host-` cookies without `Secure`, but setting `Secure` on plain HTTP causes the browser to reject the cookie completely.
- **Remediation:**
  - Standard Production & HTTPS Development: Uses `COOKIE_NAME = '__Host-namlatic_session'` with `Secure: true`, `HttpOnly: true`, `SameSite=Lax`, `Path=/`, and NO `Domain`.
  - Development-Only Plain HTTP: If `COOKIE_PLAIN_HTTP=true` (or `plainHttpDev: true`) is explicitly configured in development/test, the server falls back to `DEV_COOKIE_NAME = 'namlatic_session'` without `Secure`.
  - Production Defense: In production (`NODE_ENV === 'production'`), `plainHttpDev` is completely disabled, and `auth.middleware.js` strictly inspects only `req.cookies['__Host-namlatic_session']`, rejecting dev cookies with HTTP 401.

### 4.3 VULN-03: Fetch Metadata Normalization & Allowlist Defense
- **Root Cause:** HTTP headers can be sent with varied casing or unexpected values. If an attacker supplied `Sec-Fetch-Site: CROSS-SITE` or forged invalid metadata, simple equality check against `'cross-site'` would fail to match, potentially bypassing metadata defenses.
- **Remediation:**
  ```javascript
  const ALLOWED_FETCH_SITES = new Set(['same-origin', 'same-site', 'none']);
  const secFetchSite = (req.headers['sec-fetch-site'] || '').toLowerCase().trim();

  if (secFetchSite) {
    if (secFetchSite === 'cross-site' || !ALLOWED_FETCH_SITES.has(secFetchSite)) {
      return res.status(403).json({
        status: 'fail',
        message: 'Cross-site request forgery protection: untrusted fetch site metadata.'
      });
    }
  }
  ```
- **Verification:** Tested with `CROSS-SITE`, `untrusted-site`, and valid metadata (`same-origin`, `none`).

### 4.4 VULN-04: Throttled Sliding Idle Expiry Race Condition
- **Root Cause:** When multiple requests arrive in parallel for a valid session, the 5-minute sliding idle update was executed via:
  `UPDATE sessions SET last_active_at = $1, idle_expires_at = $2 WHERE id = $3`.
  If an administrative revocation occurred between the `SELECT` and the `UPDATE`, the update query did not verify that `revoked_at` was still `NULL`, potentially overwriting the active state and reporting the session as valid.
- **Remediation:**
  ```javascript
  const updateResult = await pool.query(
    `UPDATE sessions
     SET last_active_at = $1, idle_expires_at = $2, ip_address = $3, user_agent = $4
     WHERE id = $5 AND revoked_at IS NULL
     RETURNING id`,
    [now, newIdleExpiry, ipAddress, userAgent, session.id]
  );
  if (updateResult.rowCount === 0) {
    return null; // Concurrently revoked in flight
  }
  ```
- **Verification:** Unit test verifies that if `updateResult.rowCount === 0`, `validateSession` immediately returns `null`.

### 4.5 VULN-05: Runtime Test Role Privilege Verification
- **Root Cause:** While database connection configuration verified that the username matched `namlatic_test`, an operator might inadvertently assign superuser privileges to `namlatic_test` in local PostgreSQL.
- **Remediation:** Added `verifyTestRolePrivileges(pool)` which runs against the PostgreSQL system catalog before tests execute:
  ```sql
  SELECT rolname, rolsuper, rolcreatedb, rolcreaterole
  FROM pg_roles
  WHERE rolname = current_user;
  ```
  If `rolsuper === true`, `rolcreatedb === true`, or `rolcreaterole === true`, test execution immediately aborts with an actionable error message.

---

## 5. Comprehensive Route Protection & Security Test Matrix

### 5.1 Hotel API Route Protection Matrix (6 Endpoints × 6 Attack Scenarios)

Every hotel inventory and analytics endpoint was tested against all 6 access control permutations:

| Endpoint | Method | Missing Secret + Missing Session | Invalid Secret + Valid Session | Valid Secret + Missing Session | Valid Secret + Invalid Session | Valid Secret + Expired Session | Valid Secret + Valid Session | Cache-Control Header |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `GET /api/hotels` | GET | **403 Forbidden** | **403 Forbidden** | **401 Unauthorized** | **401 Unauthorized** | **401 Unauthorized** | **200 OK** | `private, no-store` |
| `GET /api/hotels/stats` | GET | **403 Forbidden** | **403 Forbidden** | **401 Unauthorized** | **401 Unauthorized** | **401 Unauthorized** | **200 OK** | `private, no-store` |
| `GET /api/hotels/:id` | GET | **403 Forbidden** | **403 Forbidden** | **401 Unauthorized** | **401 Unauthorized** | **401 Unauthorized** | **200 OK** | `private, no-store` |
| `POST /api/hotels` | POST | **403 Forbidden** | **403 Forbidden** | **401 Unauthorized** | **401 Unauthorized** | **401 Unauthorized** | **201 Created** | `private, no-store` |
| `PUT /api/hotels/:id` | PUT | **403 Forbidden** | **403 Forbidden** | **401 Unauthorized** | **401 Unauthorized** | **401 Unauthorized** | **200 OK** | `private, no-store` |
| `DELETE /api/hotels/:id` | DELETE | **403 Forbidden** | **403 Forbidden** | **401 Unauthorized** | **401 Unauthorized** | **401 Unauthorized** | **200 OK** | `private, no-store` |

### 5.2 Orchestrator Health Probe Matrix

| Path | Method | Proxy Secret | Session Cookie | CSRF Header | Expected HTTP Status | Exemption Granted? |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `/api/health` | GET | None | None | None | **200 OK** | Yes (Liveness probe) |
| `/api/ready` | GET | None | None | None | **200 OK** | Yes (Readiness probe) |
| `/api/health` | HEAD | None | None | None | **200 OK** | Yes (Liveness HEAD) |
| `/api/health?query=1` | GET | None | None | None | **200 OK** | Yes (Query stripped) |
| `/api/health` | **POST** | None | None | None | **403 Forbidden** | **No (Write method blocked)** |
| `/api/ready` | **POST** | None | None | None | **403 Forbidden** | **No (Write method blocked)** |
| `/api/health` | **DELETE** | None | None | None | **403 Forbidden** | **No (Write method blocked)** |
| `/api/health/subpath` | GET | None | None | None | **403 Forbidden** | **No (Subpaths blocked)** |

### 5.3 Tokenless CSRF Defense Matrix (State-Changing Requests)

| Scenario | `X-Requested-With` | `Origin` | `Referer` | `Sec-Fetch-Site` | Expected Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Legitimate Portal Request | `XMLHttpRequest` | `http://localhost:5173` | Match | `same-origin` | **Permitted (no 403)** |
| Missing Custom Header | *(None)* | `http://localhost:5173` | Match | `same-origin` | **403 Forbidden** |
| Sandboxed / Local File Origin | `XMLHttpRequest` | `null` | *(Any)* | *(Any)* | **403 Forbidden** |
| Untrusted Cross-Origin | `XMLHttpRequest` | `https://evil-hacker.com` | Match | `cross-site` | **403 Forbidden** |
| Case-Insensitive Cross-Site | `XMLHttpRequest` | `http://localhost:5173` | Match | `CROSS-SITE` | **403 Forbidden** |
| Unexpected Fetch Metadata | `XMLHttpRequest` | `http://localhost:5173` | Match | `untrusted-value` | **403 Forbidden** |
| Malformed Referer URL | `XMLHttpRequest` | *(None)* | `not-a-valid-url` | `same-origin` | **403 Forbidden** *(No 500)* |

---

## 6. Automated Test Suite Metrics & Verification

All automated tests across backend unit, backend integration, and frontend unit suites were executed and verified passing with zero failures:

```
========================================================================
NAMLATIC HOTEL OWNER PORTAL — AUTOMATED TEST VERIFICATION SUITE
========================================================================
1. Backend Unit Tests:             272 passed (15 suites, node:test)
2. Backend Integration Tests:      156 passed (3 suites, live PostgreSQL)
   - auth.database.test.js:         18 passed
   - auth.api.test.js:              75 passed
   - hotel.api.test.js:             63 passed
3. Frontend Unit Tests:            139 passed (11 suites, Vitest 5.1.0)
------------------------------------------------------------------------
TOTAL PASSING AUTOMATED TESTS:     567 / 567 PASSED (100% Pass Rate)
VULNERABILITIES (NPM AUDIT):       0 vulnerabilities (Server & Client)
========================================================================
```

---

## 7. Known Architectural Limitations & Post-Phase Roadmaps

1. **Single-Owner Portal Design:** The application enforces a singleton owner account (`WHERE role = 'owner'`). Multi-tenant role-based access control (RBAC) is out of scope for the owner portal architecture.
2. **In-Memory Abuse Throttler:** The `LoginThrottlerService` utilizes an in-memory LRU cache (10,000 entries). For multi-instance clustered or serverless deployments, rate limiting state will require a centralized store (e.g., Redis or Upstash) in Phase 5F-B.
3. **EXIF Metadata Stripping:** While file uploads are strictly verified via 12-byte magic byte binary inspection and restricted to 5 MB, EXIF metadata stripping (removing embedded GPS location and device metadata) is scheduled for implementation before public media CDN distribution.
4. **Live Cloud Header Injection:** Reverse proxy secret injection (`x-vercel-proxy-secret`) and edge rewrite caching opt-out (`x-vercel-enable-rewrite-caching: 0`) require live end-to-end cloud validation once Vercel and Render are provisioned in Phase 5F-B.

---

## 8. Conclusion & Sign-Off

The Namlatic Hotel Owner Portal backend authentication infrastructure has undergone comprehensive adversarial testing and security hardening. All identified vulnerabilities have been remediated, and route lockdown across all inventory and analytics endpoints is strictly verified.

The backend authentication layer is declared **Production-Hardened and Ready for Phase 5F-A3 (Frontend Authentication UI & Protected Routing)**.
