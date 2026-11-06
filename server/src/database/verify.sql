-- ============================================================================
-- Namlatic Hotel Owner Portal – Schema Verification & Sanity Test Script
-- Database: namlatic_hotel
-- Engine: PostgreSQL 18+
-- ============================================================================
-- NOTE: This script verifies the hotels schema, constraints, triggers, and
-- indexing without assuming hardcoded IDs or relying on non-unique titles.
-- All operations are performed using dynamically captured IDs.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Step 1: Explicit Temporary Table Creation & CTE Data-Modifying Insert
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE tmp_test_state (
    id BIGINT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
) ON COMMIT DROP;

WITH inserted AS (
    INSERT INTO hotels (
        title, 
        description, 
        latitude, 
        longitude, 
        price, 
        image_path
    )
    VALUES (
        '__Test Verification Hotel__',
        'A comprehensive description verifying the mandatory non-empty constraint.',
        12.971598,
        77.594562,
        149.50,
        '/uploads/hotels/verify-sample.webp'
    )
    RETURNING id, created_at, updated_at
)
INSERT INTO tmp_test_state (id, created_at, updated_at)
SELECT id, created_at, updated_at
FROM inserted;

-- Output inserted record info
SELECT 
    '1. INSERT SUCCESS' AS step,
    id AS captured_id, 
    created_at, 
    updated_at
FROM tmp_test_state;

-- ----------------------------------------------------------------------------
-- Step 2: Retrieve Record Using Dynamically Captured ID
-- ----------------------------------------------------------------------------
SELECT 
    '2. SELECT BY ID SUCCESS' AS step,
    h.id, 
    h.title, 
    h.price, 
    h.latitude, 
    h.longitude
FROM hotels h
JOIN tmp_test_state t ON h.id = t.id;

-- ----------------------------------------------------------------------------
-- Step 3: Update Record & Verify updated_at Timestamp Advance
-- ----------------------------------------------------------------------------
-- Introduce brief micro-sleep so statement_timestamp advances measurably
SELECT pg_sleep(0.05);

-- Update the test hotel using the captured ID
UPDATE hotels
SET price = 189.99
WHERE id = (SELECT id FROM tmp_test_state)
RETURNING 
    '3. UPDATE SUCCESS' AS step,
    id, 
    price AS updated_price, 
    created_at, 
    updated_at;

-- Verify that the updated_at timestamp advanced compared to initial created/updated time
SELECT 
    '3b. TIMESTAMP ADVANCE VERIFIED' AS step,
    h.id,
    t.updated_at AS initial_updated_at,
    h.updated_at AS new_updated_at,
    (h.updated_at > t.updated_at) AS is_timestamp_advanced
FROM hotels h
JOIN tmp_test_state t ON h.id = t.id;

-- ----------------------------------------------------------------------------
-- Step 4: Verify Prefix Index Compatibility (Explain Query Plan)
-- ----------------------------------------------------------------------------
EXPLAIN (COSTS OFF)
SELECT id, title, price
FROM hotels
WHERE lower(title) LIKE lower('__Test') || '%';

-- ----------------------------------------------------------------------------
-- Step 5: Verify Deterministic Ordering Index Compatibility (Explain Query Plan)
-- ----------------------------------------------------------------------------
EXPLAIN (COSTS OFF)
SELECT id, title, created_at
FROM hotels
ORDER BY created_at DESC, id DESC
LIMIT 10 OFFSET 0;

-- ----------------------------------------------------------------------------
-- Step 6: Verify Negative Constraints via Isolated Subtransactions
-- ----------------------------------------------------------------------------

-- Test 6A: Reject NaN Price
SAVEPOINT sp_nan;
DO $$
BEGIN
    INSERT INTO hotels (title, description, latitude, longitude, price)
    VALUES ('NaN Hotel', 'Valid Desc', 10, 10, 'NaN'::numeric);
    RAISE EXCEPTION 'Constraint failure: NaN price was incorrectly accepted';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE 'Constraint verified: NaN price was correctly rejected (chk_hotels_price_positive)';
END;
$$;
ROLLBACK TO SAVEPOINT sp_nan;

-- Test 6B: Reject Zero Price
SAVEPOINT sp_zero;
DO $$
BEGIN
    INSERT INTO hotels (title, description, latitude, longitude, price)
    VALUES ('Zero Hotel', 'Valid Desc', 10, 10, 0.00);
    RAISE EXCEPTION 'Constraint failure: Zero price was incorrectly accepted';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE 'Constraint verified: Zero price was correctly rejected (chk_hotels_price_positive)';
END;
$$;
ROLLBACK TO SAVEPOINT sp_zero;

-- Test 6C: Reject Blank Description
SAVEPOINT sp_blank_desc;
DO $$
BEGIN
    INSERT INTO hotels (title, description, latitude, longitude, price)
    VALUES ('Blank Desc Hotel', '   ', 10, 10, 100.00);
    RAISE EXCEPTION 'Constraint failure: Blank description was incorrectly accepted';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE 'Constraint verified: Blank description was correctly rejected (chk_hotels_description_not_empty)';
END;
$$;
ROLLBACK TO SAVEPOINT sp_blank_desc;

-- Test 6D: Reject Out-of-Range Latitude
SAVEPOINT sp_lat;
DO $$
BEGIN
    INSERT INTO hotels (title, description, latitude, longitude, price)
    VALUES ('Invalid Lat Hotel', 'Valid Desc', 91.500000, 10, 100.00);
    RAISE EXCEPTION 'Constraint failure: Out-of-range latitude was incorrectly accepted';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE 'Constraint verified: Out-of-range latitude was correctly rejected (chk_hotels_latitude_range)';
END;
$$;
ROLLBACK TO SAVEPOINT sp_lat;

-- ----------------------------------------------------------------------------
-- Step 7: Delete Test Hotel Using Dynamically Captured ID
-- ----------------------------------------------------------------------------
DELETE FROM hotels
WHERE id = (SELECT id FROM tmp_test_state)
RETURNING 
    '7. DELETE SUCCESS' AS step,
    id AS deleted_id;

-- Confirm cleanup
SELECT 
    '8. CLEANUP VERIFIED' AS step,
    COUNT(*) AS remaining_matching_rows
FROM hotels
WHERE id = (SELECT id FROM tmp_test_state);

COMMIT;
