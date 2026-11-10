-- ============================================================================
-- Migration 002: Authentication Schema (Users & Sessions)
-- Database: namlatic_hotel
-- Engine: PostgreSQL 18+
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helper Trigger Function for Users
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_users_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = statement_timestamp();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 2. Users Table Schema (Owner Account)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    -- Primary Key: 64-bit auto-incrementing integer (SQL-standard identity)
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Owner Email: unique, non-empty, normalized (lowercase and trimmed)
    email VARCHAR(255) NOT NULL UNIQUE,

    -- Encoded Argon2id password hash string
    password_hash VARCHAR(255) NOT NULL,

    -- Role: defaults to 'owner'; system supports single owner administration
    role VARCHAR(50) NOT NULL DEFAULT 'owner',

    -- Account status: 'active', 'suspended', or 'disabled'
    status VARCHAR(50) NOT NULL DEFAULT 'active',

    -- Audit Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Domain Constraints
    CONSTRAINT chk_users_email_normalized CHECK (email = lower(trim(email)) AND position('@' in email) > 1),
    CONSTRAINT chk_users_role             CHECK (role IN ('owner')),
    CONSTRAINT chk_users_status           CHECK (status IN ('active', 'suspended', 'disabled'))
);

-- Partial unique index ensuring strictly at most ONE owner account across the database
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_owner_singleton
    ON users (role)
    WHERE role = 'owner';

-- Auto-update updated_at on users row modifications
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION fn_users_update_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Sessions Table Schema (PostgreSQL-Backed Session Store)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    -- Primary Key: 64-bit auto-incrementing integer (SQL-standard identity)
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Foreign Key to User (cascades on user deletion)
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Cryptographic token verifier: SHA-256 hash (64 hex characters) of client token
    -- UNIQUE constraint automatically creates a B-tree index in PostgreSQL; no duplicate index needed
    token_hash VARCHAR(64) NOT NULL UNIQUE,

    -- Absolute expiration timestamp (7-day maximum lifetime)
    expires_at TIMESTAMPTZ NOT NULL,

    -- Sliding idle expiration timestamp (2-hour rolling inactivity timeout)
    idle_expires_at TIMESTAMPTZ NOT NULL,

    -- Session audit timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Explicit session revocation timestamp (null if active)
    revoked_at TIMESTAMPTZ,

    -- Optional audit fields: client IP address and user-agent for security audits
    ip_address INET,
    user_agent VARCHAR(512),

    -- Domain Constraints
    CONSTRAINT chk_sessions_expires_after_created CHECK (expires_at > created_at),
    CONSTRAINT chk_sessions_idle_after_created    CHECK (idle_expires_at >= created_at)
);

-- ----------------------------------------------------------------------------
-- 4. Indexes for Session Queries & Maintenance
-- ----------------------------------------------------------------------------

-- Index 1: Fast user session lookup (for listing active sessions, revoking sessions on password reset)
CREATE INDEX IF NOT EXISTS idx_sessions_user_id
    ON sessions (user_id);

-- Index 2: Composite index for expired and idle session sweeping/cleanup
-- Efficiently supports queries: WHERE expires_at < NOW() OR idle_expires_at < NOW()
CREATE INDEX IF NOT EXISTS idx_sessions_cleanup
    ON sessions (expires_at, idle_expires_at);
