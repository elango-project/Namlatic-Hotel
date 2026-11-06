# PostgreSQL Database Guide: Namlatic Hotel Portal

## 1. Database Architecture & Setup

The persistence tier is built on **PostgreSQL 18.6** using a dedicated application role and database:
- **Database:** `namlatic_hotel`
- **Application User:** `namlatic_app` (least-privilege access, table owner)
- **Host / Port:** `localhost:5432`
- **Native Driver:** `pg.Pool` (Node.js connection pool)

---

## 2. Table Definition (`hotels`)

```sql
CREATE TABLE IF NOT EXISTS hotels (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    latitude NUMERIC(9,6) NOT NULL,
    longitude NUMERIC(9,6) NOT NULL,
    price NUMERIC(12,2) NOT NULL,
    image_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Data Integrity Constraints
    CONSTRAINT chk_hotels_title_not_empty 
        CHECK (length(btrim(title)) > 0),
    CONSTRAINT chk_hotels_description_not_empty 
        CHECK (length(btrim(description)) > 0),
    CONSTRAINT chk_hotels_latitude_range 
        CHECK (latitude >= -90.000000 AND latitude <= 90.000000),
    CONSTRAINT chk_hotels_longitude_range 
        CHECK (longitude >= -180.000000 AND longitude <= 180.000000),
    CONSTRAINT chk_hotels_price_positive 
        CHECK (price > 0.00 AND price <> 'NaN'::numeric)
);
```

---

## 3. Data Type Decisions & Justifications

### 1. `BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`
- **Why BIGINT?** Standard 32-bit `INTEGER` caps at 2,147,483,647 rows. A large-scale inventory system can exhaust 32-bit integer keys. `BIGINT` provides a 64-bit signed integer space ($9.22 \times 10^{18}$ values), guaranteeing capacity will never be exceeded.
- **Why GENERATED ALWAYS AS IDENTITY?** SQL standard compliant replacement for PostgreSQL's legacy `SERIAL` pseudo-type. It prevents inadvertent manual insertions into identity columns unless `OVERRIDING SYSTEM VALUE` is explicitly provided.

### 2. `NUMERIC(12,2)` for Currency (`price`)
- **Why NUMERIC instead of FLOAT / REAL?** In IEEE 754 floating-point numbers (`FLOAT`, `DOUBLE PRECISION`), decimal numbers like `0.1` cannot be represented precisely, causing cumulative rounding errors (e.g., `0.1 + 0.2 = 0.30000000000000004`). `NUMERIC(12,2)` is an exact numeric type storing numbers in base-10,000 digits.
- **Precision (12) and Scale (2):** Allows prices up to `9,999,999,999.99` with exact 2-decimal cent precision.
- **NaN Defense:** In PostgreSQL, `'NaN'::numeric > 0` evaluates to `TRUE`. The constraint explicitly rejects `'NaN'::numeric`.

### 3. `NUMERIC(9,6)` for Coordinates (`latitude`, `longitude`)
- **Scale (6 decimals):** 6 decimal places of precision in coordinates corresponds to approximately 0.11 meters (11 cm) of spatial precision on Earth's surface—ideal for pinning hotel entrances and properties on interactive maps without floating-point inaccuracies.
- **Latitude Limits:** Valid range strictly $[-90.000000, 90.000000]$.
- **Longitude Limits:** Valid range strictly $[-180.000000, 180.000000]$.

### 4. `TIMESTAMPTZ` for Auditing (`created_at`, `updated_at`)
- **Why TIMESTAMPTZ?** Unlike `TIMESTAMP WITHOUT TIME ZONE`, `TIMESTAMPTZ` records points in absolute UTC time and automatically converts to client session time zones. This eliminates ambiguity when server, database, and client reside in different geographic regions.

---

## 4. Indexing Strategy

```sql
-- 1. Optimized Case-Insensitive Prefix Pattern Search
CREATE INDEX IF NOT EXISTS idx_hotels_title_lower 
ON hotels (lower(title) text_pattern_ops);

-- 2. Range Filtering on Hotel Price
CREATE INDEX IF NOT EXISTS idx_hotels_price 
ON hotels (price);

-- 3. Composite Stable Pagination Sorting
CREATE INDEX IF NOT EXISTS idx_hotels_created_at_id 
ON hotels (created_at DESC, id DESC);
```

### Why `text_pattern_ops` on `idx_hotels_title_lower`?
Standard B-tree indexes use the database's collation order (e.g. `en_US.UTF-8`). In non-C collations, standard B-tree indexes cannot be used for `LIKE 'prefix%'` searches because collation-aware sorting does not match byte-by-byte string prefix rules. Using `text_pattern_ops` indexes characters strictly byte-by-byte, allowing the PostgreSQL planner to perform an **Index Scan** for pattern matching (`lower(title) LIKE lower($1) || '%'`).

### Why Composite `(created_at DESC, id DESC)`?
When paginating with `LIMIT` and `OFFSET`, multiple hotels may share identical creation timestamps. Without a deterministic tiebreaker like `id DESC`, sort order is undefined across page queries, causing records to jump between pages. The composite index allows PostgreSQL to scan pre-sorted rows without executing an expensive in-memory sort (`SortMethod: quicksort`).

---

## 5. Automatic Timestamp Trigger

```sql
CREATE OR REPLACE FUNCTION fn_hotels_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = statement_timestamp();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_hotels_updated_at
BEFORE UPDATE ON hotels
FOR EACH ROW
EXECUTE FUNCTION fn_hotels_update_updated_at();
```

- **Why `statement_timestamp()`?** Returns the exact time at which the current SQL statement began execution. In multi-row batch updates, every row touched by the statement receives the identical timestamp, preserving statement-level atomicity.
