# Technical Interview Preparation Guide

This guide prepares you to defend every engineering decision in the Namlatic Hotel Owner Portal during technical interviews.

---

### Q1: Why did you choose PostgreSQL over MongoDB or MySQL?
> **Answer:** "For hotel inventory management, data integrity and relational constraints are paramount. PostgreSQL provides strict type enforcement, native `NUMERIC(12,2)` for exact base-10 currency arithmetic without floating-point errors, and spatial range check constraints ($-90$ to $+90$ for latitude). Furthermore, PostgreSQL's `text_pattern_ops` indexing allows high-performance B-tree prefix searching on text fields without being hindered by locale collations. MySQL could support basic relations, but PostgreSQL offers superior constraint checks and ACID transaction isolation. MongoDB was avoided because hotel records are relational and structured; using a document store would have forced us to implement integrity constraints and coordinate checks at the application level rather than in the database engine."

---

### Q2: Why did you use native SQL instead of an ORM like Prisma or Sequelize?
> **Answer:** "Using native parameterized SQL with `pg.Pool` gave us three distinct advantages:
> 1. **Complete Control:** We can leverage specific PostgreSQL features like `lower(title) text_pattern_ops`, `INSERT ... RETURNING`, and row locking with `SELECT ... FOR UPDATE` during image replacements.
> 2. **Performance & Predictability:** ORMs frequently generate inefficient subqueries or cause the 'N+1' query problem. With native SQL, every query executed is explicit, transparent, and easily optimized using `EXPLAIN ANALYZE`.
> 3. **Security:** By utilizing parameterized queries (`$1`, `$2`), user inputs are sent as parameters over the PostgreSQL binary wire protocol, ensuring 100% immunity against SQL injection without relying on ORM abstraction."

---

### Q3: Why does your backend return price as a string instead of a number in JSON?
> **Answer:** "In JavaScript, all numbers are 64-bit IEEE 754 double-precision floating-point numbers. If a high-precision decimal number or large financial calculation is parsed directly as a JavaScript `Number`, floating-point rounding errors can occur. The Node.js PostgreSQL driver (`node-pg`) intentionally returns `NUMERIC` types as strings to preserve full decimal precision and avoid silent precision degradation. In the frontend, we format and display it using `Intl.NumberFormat` for currency presentation."

---

### Q4: How do you prevent filesystem and database inconsistency during image updates and deletions?
> **Answer:** "A major challenge in full-stack architecture is that operating system filesystem mutations cannot be rolled back by database transactions. To solve this, we implemented a staged two-phase execution:
> - On `PUT`: The new photo is tentatively saved. If validation or the database transaction fails, the newly uploaded image is unlinked immediately, and the existing image remains intact. Only *after* the PostgreSQL transaction successfully commits do we delete the old image from disk.
> - On `DELETE`: We use `DELETE FROM hotels WHERE id = $1 RETURNING id, image_path;`. If the database delete succeeds, we unlink the file from disk using a path-traversal-safe utility. If the database query fails, the file is never deleted."

---

### Q5: How do you protect your upload endpoints against malicious files and directory traversal?
> **Answer:** "We implement defense-in-depth security:
> 1. **Size Limits:** Multer rejects any payload exceeding 5 MB before buffering to prevent memory exhaustion DoS.
> 2. **Magic Byte Verification:** An attacker can disguise a PHP script as `avatar.jpg` and send a spoofed `image/jpeg` MIME header. Our middleware reads the first 12 binary bytes directly from the file on disk and verifies that the file signature matches JPEG (`FF D8 FF`), PNG (`89 50 4E 47`), or WebP (`RIFF...WEBP`). If the signature doesn't match, the file is immediately unlinked and rejected with HTTP 400.
> 3. **Path Traversal Defense:** Filenames are generated on the server using `crypto.randomUUID()`. When deleting files, `safeDeleteHotelImage` uses `path.basename()` and verifies with `path.relative()` that the resolved path is strictly contained within `server/src/uploads/hotels` and never targets protected files like `.gitkeep`."

---

### Q6: What is the difference between your unit tests and integration tests?
> **Answer:** "Our **unit tests** (35 tests) test individual functions in complete isolation with zero external dependencies. They verify input validation rules (coordinates, prices, titles, pagination boundaries), binary magic byte detection, path traversal blocks, and database error mapping. They execute in under 300 ms using Node.js's native `node:test` runner.  
> Our **integration tests** (40 tests) test the entire system end-to-end: they launch an Express test server on an isolated port, issue HTTP fetch requests with multipart form data, write and delete files on disk, and execute live queries against the PostgreSQL database, asserting both database state and disk storage integrity."

---

### Q7: Where did you choose native browser / platform features instead of third-party npm packages?
> **Answer:** "To prevent dependency bloat and minimize vulnerability surface area, we prioritized native features:
> - **Image Preview:** Used native browser `URL.createObjectURL(file)` and revoked it with `URL.revokeObjectURL(url)` upon unmount, eliminating the need for an external image preview package.
> - **Unit Testing:** Used modern Node.js native `node:test` and `node:assert`, avoiding Jest/Mocha dependencies.
> - **HTTP Communication:** Native `fetch()` and `FormData`.
> - **Responsive Design:** Native CSS Grid, Flexbox, and media queries without bloated UI CSS frameworks."

---

### Q8: What are the current production limitations of this project, and how would you address them?
> **Answer:** "The primary limitation is media persistence. Currently, images are saved to the server's local filesystem. On cloud platforms like Render or AWS ECS with ephemeral containers, local files are wiped upon re-deployment. In a production environment, I would decouple file storage by streaming uploads directly to Amazon S3 or Google Cloud Storage using pre-signed URLs, storing only the CDN URLs in PostgreSQL. Second, I would add image re-encoding via `sharp` to strip malicious EXIF metadata and optimize image compression."
