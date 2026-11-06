-- ============================================================================
-- Namlatic Hotel Owner Portal – Database Initialization Script
-- Database: namlatic_hotel
-- Engine: PostgreSQL 18+
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helper Trigger Function
-- ----------------------------------------------------------------------------

-- Application-specific trigger function to maintain accurate updated_at timestamps.
-- Uses statement_timestamp() to guarantee a consistent time across all rows
-- affected within the same SQL statement.
CREATE OR REPLACE FUNCTION fn_hotels_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = statement_timestamp();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 2. Hotels Table Schema
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hotels (
    -- Primary Key: 64-bit auto-incrementing integer (SQL-standard identity)
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Property Name: mandatory, non-empty trimmed string up to 255 chars
    title VARCHAR(255) NOT NULL,

    -- Description: mandatory detailed text describing the property and amenities
    description TEXT NOT NULL,

    -- Geolocation: WGS 84 coordinates with 6 decimal places (~0.11m precision)
    latitude NUMERIC(9, 6) NOT NULL,
    longitude NUMERIC(9, 6) NOT NULL,

    -- Pricing: exact numeric representation for monetary values (strictly positive, non-NaN)
    price NUMERIC(12, 2) NOT NULL,

    -- Media: relative path to uploaded image file (nullable to allow updates without re-upload)
    image_path TEXT,

    -- Audit Timestamps: UTC timestamps with timezone tracking
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Domain Constraints
    CONSTRAINT chk_hotels_title_not_empty       CHECK (length(trim(title)) > 0),
    CONSTRAINT chk_hotels_description_not_empty CHECK (length(trim(description)) > 0),
    CONSTRAINT chk_hotels_latitude_range        CHECK (latitude >= -90.0 AND latitude <= 90.0),
    CONSTRAINT chk_hotels_longitude_range       CHECK (longitude >= -180.0 AND longitude <= 180.0),
    CONSTRAINT chk_hotels_price_positive        CHECK (price > 0.00 AND price <> 'NaN'::numeric)
);

-- ----------------------------------------------------------------------------
-- 3. Indexes for Query Performance
-- ----------------------------------------------------------------------------

-- Index 1: Case-Insensitive Prefix Title Search
-- Expression index on lower(title) using text_pattern_ops to bypass locale collation
-- and allow B-tree index range scans for queries matching: lower(title) LIKE lower($1) || '%'
CREATE INDEX IF NOT EXISTS idx_hotels_title_lower 
    ON hotels (lower(title) text_pattern_ops);

-- Index 2: Price Range Filtering
-- Supports min_price and max_price range queries: price >= $1 AND price <= $2
CREATE INDEX IF NOT EXISTS idx_hotels_price 
    ON hotels (price);

-- Index 3: Deterministic List Ordering & Pagination
-- Composite index on (created_at DESC, id DESC) to guarantee stable, deterministic
-- pagination even when multiple records share identical creation timestamps.
CREATE INDEX IF NOT EXISTS idx_hotels_created_at_id 
    ON hotels (created_at DESC, id DESC);

-- ----------------------------------------------------------------------------
-- 4. Triggers
-- ----------------------------------------------------------------------------

-- Automatically update updated_at timestamp when a hotel record is modified
DROP TRIGGER IF EXISTS trg_hotels_updated_at ON hotels;

CREATE TRIGGER trg_hotels_updated_at
    BEFORE UPDATE ON hotels
    FOR EACH ROW
    EXECUTE FUNCTION fn_hotels_update_updated_at();
