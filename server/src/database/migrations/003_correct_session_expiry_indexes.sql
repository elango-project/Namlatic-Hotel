-- ============================================================================
-- Migration 003: Correct Session Expiry Indexes
-- Database: namlatic_hotel
-- Engine: PostgreSQL 18+
-- ============================================================================

-- 1. Create independent B-tree indexes for absolute and sliding idle expiration
-- Separate indexes allow PostgreSQL to perform independent range scans or combine
-- them via a BitmapOr index scan when cleaning expired/idle sessions:
-- WHERE expires_at < NOW() OR idle_expires_at < NOW()
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
    ON sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_sessions_idle_expires_at
    ON sessions (idle_expires_at);

-- 2. Safely drop the legacy composite index only after separate indexes exist
DROP INDEX IF EXISTS idx_sessions_cleanup;
