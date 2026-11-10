-- ============================================================================
-- Migration 001: Initial Hotels Schema
-- Database: namlatic_hotel
-- Engine: PostgreSQL 18+
-- Repeat-safe baseline migration for hotel inventory management
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helper Trigger Function
-- ----------------------------------------------------------------------------
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
CREATE INDEX IF NOT EXISTS idx_hotels_title_lower
    ON hotels (lower(title) text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_hotels_price
    ON hotels (price);

CREATE INDEX IF NOT EXISTS idx_hotels_created_at_id
    ON hotels (created_at DESC, id DESC);

-- ----------------------------------------------------------------------------
-- 4. Triggers
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_hotels_updated_at ON hotels;

CREATE TRIGGER trg_hotels_updated_at
    BEFORE UPDATE ON hotels
    FOR EACH ROW
    EXECUTE FUNCTION fn_hotels_update_updated_at();
