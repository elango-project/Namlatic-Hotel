const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { getTestPool, closeTestPool } = require('../helpers/testDb');
const { setPool, resetPool } = require('../../src/config/db');
const { runMigrations, MIGRATION_ADVISORY_LOCK_ID } = require('../../src/database/migrate');
const { bootstrapOwner } = require('../../src/scripts/bootstrap-owner');
const { resetOwnerPassword } = require('../../src/scripts/reset-owner-password');
const { hashPassword, verifyPassword } = require('../../src/services/password.service');

describe('Integration Tests: Authentication Schema, Migrations & CLI Tools (Phase 5F-A2.1.1)', () => {
  let testPool;
  let initialHotelCount = 0;
  const createdUserIds = [];

  before(async () => {
    // 1. Acquire dedicated test database pool and redirect global pool proxy
    testPool = getTestPool();
    setPool(testPool);

    // 2. Run migrations on test database
    await runMigrations(testPool);

    // 3. Record baseline hotel count to ensure zero data loss or modification
    const countRes = await testPool.query('SELECT COUNT(*) FROM hotels;');
    initialHotelCount = parseInt(countRes.rows[0].count, 10);
  });

  after(async () => {
    // Clean up created test users and associated cascaded sessions using tracked IDs only
    if (createdUserIds.length > 0) {
      await testPool.query('DELETE FROM users WHERE id = ANY($1::bigint[]);', [createdUserIds]);
    }

    // Verify hotel count remains identical to baseline
    const finalCountRes = await testPool.query('SELECT COUNT(*) FROM hotels;');
    const finalHotelCount = parseInt(finalCountRes.rows[0].count, 10);
    assert.equal(finalHotelCount, initialHotelCount, 'Hotel rows must remain completely unaffected');

    resetPool();
    await closeTestPool();
  });

  // ==========================================================================
  // 1. Migration Runner Repeat-Safety, Concurrency & Advisory Locking
  // ==========================================================================
  describe('Migration Runner Repeat-Safety & Advisory Locking', () => {
    it('executing runMigrations a second time succeeds with zero new migrations applied', async () => {
      const secondRun = await runMigrations(testPool);
      assert.equal(secondRun.applied.length, 0, 'No migrations should be re-applied');
      assert.equal(secondRun.skipped.length >= 3, true, 'At least 3 migrations should be skipped');
      assert.equal(secondRun.locked, false);
    });

    it('verifies that schema_migrations records all migration versions accurately', async () => {
      const res = await testPool.query(
        'SELECT version FROM schema_migrations ORDER BY version ASC;'
      );
      const versions = res.rows.map((r) => r.version);
      assert.equal(versions.includes('001_create_hotels_schema.sql'), true);
      assert.equal(versions.includes('002_create_auth_tables.sql'), true);
      assert.equal(versions.includes('003_correct_session_expiry_indexes.sql'), true);
    });

    it('detects when advisory lock is held and exits cleanly without running migrations', async () => {
      const client = await testPool.connect();
      try {
        // Explicitly acquire the advisory lock on a separate client
        const lockRes = await client.query('SELECT pg_try_advisory_lock($1) AS acquired;', [MIGRATION_ADVISORY_LOCK_ID]);
        assert.equal(lockRes.rows[0].acquired, true, 'Advisory lock must be acquired by holder client');

        // Attempting to run migrations concurrently should gracefully report locked: true
        const runResult = await runMigrations(testPool);
        assert.equal(runResult.locked, true);
        assert.equal(runResult.applied.length, 0);

        // Unlock
        await client.query('SELECT pg_advisory_unlock($1);', [MIGRATION_ADVISORY_LOCK_ID]);
      } finally {
        client.release();
      }

      // After release, runMigrations acquires lock normally
      const postResult = await runMigrations(testPool);
      assert.equal(postResult.locked, false);
    });
  });

  // ==========================================================================
  // 2. Session Expiry Index Verification (Migration 003)
  // ==========================================================================
  describe('Session Expiry Index Optimization (Migration 003)', () => {
    it('verifies separate single-column B-tree indexes exist for expires_at and idle_expires_at', async () => {
      const res = await testPool.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'sessions';
      `);
      const indexNames = res.rows.map((r) => r.indexname);

      assert.equal(indexNames.includes('idx_sessions_expires_at'), true, 'idx_sessions_expires_at must exist');
      assert.equal(indexNames.includes('idx_sessions_idle_expires_at'), true, 'idx_sessions_idle_expires_at must exist');
    });

    it('verifies legacy composite index idx_sessions_cleanup does not exist', async () => {
      const res = await testPool.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'sessions';
      `);
      const indexNames = res.rows.map((r) => r.indexname);

      assert.equal(
        indexNames.includes('idx_sessions_cleanup'),
        false,
        'Legacy composite index idx_sessions_cleanup must have been dropped'
      );
    });
  });

  // ==========================================================================
  // 3. Users Table Schema & Constraints
  // ==========================================================================
  describe('Users Table Schema & Constraints', () => {
    it('verifies users table columns and default values', async () => {
      const res = await testPool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'users'
        ORDER BY ordinal_position;
      `);
      const cols = res.rows.reduce((acc, row) => {
        acc[row.column_name] = row;
        return acc;
      }, {});

      assert.equal(cols.id.data_type, 'bigint');
      assert.equal(cols.email.data_type, 'character varying');
      assert.equal(cols.email.is_nullable, 'NO');
      assert.equal(cols.password_hash.is_nullable, 'NO');
      assert.equal(cols.role.column_default.includes('owner'), true);
      assert.equal(cols.status.column_default.includes('active'), true);
    });

    it('enforces email uniqueness constraint', async () => {
      const uniqueEmail = `test-unique-${Date.now()}@namlatic.com`;
      const dummyHash = await hashPassword('TestOwnerPassword123!');

      const res1 = await testPool.query(
        `INSERT INTO users (email, password_hash, role, status)
         VALUES ($1, $2, 'owner', 'active')
         RETURNING id;`,
        [uniqueEmail, dummyHash]
      );
      createdUserIds.push(res1.rows[0].id);

      // Attempt duplicate email insertion
      await assert.rejects(
        () =>
          testPool.query(
            `INSERT INTO users (email, password_hash, role, status)
             VALUES ($1, $2, 'owner', 'active');`,
            [uniqueEmail, dummyHash]
          ),
        (err) => {
          assert.equal(err.code, '23505', 'PostgreSQL error code must be 23505 unique_violation');
          return true;
        }
      );

      // Clean up this owner so subsequent owner constraint tests can test singleton
      await testPool.query('DELETE FROM users WHERE id = $1;', [res1.rows[0].id]);
      const idx = createdUserIds.indexOf(res1.rows[0].id);
      if (idx !== -1) createdUserIds.splice(idx, 1);
    });

    it('enforces partial unique index allowing strictly ONE owner account', async () => {
      const email1 = `owner1-${Date.now()}@namlatic.com`;
      const email2 = `owner2-${Date.now()}@namlatic.com`;
      const dummyHash = await hashPassword('ValidOwnerPassphrase2026!');

      const res1 = await testPool.query(
        `INSERT INTO users (email, password_hash, role, status)
         VALUES ($1, $2, 'owner', 'active')
         RETURNING id;`,
        [email1, dummyHash]
      );
      createdUserIds.push(res1.rows[0].id);

      // Second owner insert must fail due to idx_users_owner_singleton
      await assert.rejects(
        () =>
          testPool.query(
            `INSERT INTO users (email, password_hash, role, status)
             VALUES ($1, $2, 'owner', 'active');`,
            [email2, dummyHash]
          ),
        (err) => {
          assert.equal(err.code, '23505', 'Unique singleton violation');
          assert.equal(err.constraint, 'idx_users_owner_singleton');
          return true;
        }
      );

      // Clean up owner1
      await testPool.query('DELETE FROM users WHERE id = $1;', [res1.rows[0].id]);
      const idx = createdUserIds.indexOf(res1.rows[0].id);
      if (idx !== -1) createdUserIds.splice(idx, 1);
    });

    it('enforces email normalization check constraint (lower and trimmed with @)', async () => {
      const dummyHash = await hashPassword('ValidOwnerPassphrase2026!');

      // Un-lowercased email
      await assert.rejects(
        () =>
          testPool.query(
            `INSERT INTO users (email, password_hash, role, status)
             VALUES ('UpperCASE@namlatic.com', $1, 'owner', 'active');`,
            [dummyHash]
          ),
        { code: '23514' } // check_violation
      );

      // Email with leading/trailing spaces
      await assert.rejects(
        () =>
          testPool.query(
            `INSERT INTO users (email, password_hash, role, status)
             VALUES ('  spaces@namlatic.com  ', $1, 'owner', 'active');`,
            [dummyHash]
          ),
        { code: '23514' }
      );
    });
  });

  // ==========================================================================
  // 4. Sessions Table Schema & Cascade Integrity
  // ==========================================================================
  describe('Sessions Table Schema, Constraints & Cascades', () => {
    let testUserId;

    before(async () => {
      const dummyHash = await hashPassword('ValidOwnerPassphrase2026!');
      const res = await testPool.query(
        `INSERT INTO users (email, password_hash, role, status)
         VALUES ($1, $2, 'owner', 'active')
         RETURNING id;`,
        [`session-test-${Date.now()}@namlatic.com`, dummyHash]
      );
      testUserId = res.rows[0].id;
      createdUserIds.push(testUserId);
    });

    after(async () => {
      if (testUserId) {
        await testPool.query('DELETE FROM users WHERE id = $1;', [testUserId]);
        const idx = createdUserIds.indexOf(testUserId);
        if (idx !== -1) createdUserIds.splice(idx, 1);
      }
    });

    it('enforces token_hash uniqueness in sessions table', async () => {
      const tokenHash = crypto.randomBytes(32).toString('hex');
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const idleExpiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);

      await testPool.query(
        `INSERT INTO sessions (user_id, token_hash, expires_at, idle_expires_at, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, '127.0.0.1', 'Mozilla/5.0');`,
        [testUserId, tokenHash, expiresAt, idleExpiresAt]
      );

      // Duplicate token_hash insert
      await assert.rejects(
        () =>
          testPool.query(
            `INSERT INTO sessions (user_id, token_hash, expires_at, idle_expires_at, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, '127.0.0.1', 'Mozilla/5.0');`,
            [testUserId, tokenHash, expiresAt, idleExpiresAt]
          ),
        { code: '23505' }
      );
    });

    it('enforces check constraint chk_sessions_expires_after_created', async () => {
      const tokenHash = crypto.randomBytes(32).toString('hex');
      const past = new Date(Date.now() - 3600000); // 1 hour in the past

      await assert.rejects(
        () =>
          testPool.query(
            `INSERT INTO sessions (user_id, token_hash, expires_at, idle_expires_at)
             VALUES ($1, $2, $3, NOW());`,
            [testUserId, tokenHash, past]
          ),
        { code: '23514' } // check_violation
      );
    });

    it('cascades deletion of user to all associated sessions (ON DELETE CASCADE)', async () => {
      const dummyHash = await hashPassword('ValidOwnerPassphrase2026!');
      // Clean up previous testUserId first so we can insert new owner
      if (testUserId) {
        await testPool.query('DELETE FROM users WHERE id = $1;', [testUserId]);
        const idx = createdUserIds.indexOf(testUserId);
        if (idx !== -1) createdUserIds.splice(idx, 1);
        testUserId = null;
      }

      const tempUserRes = await testPool.query(
        `INSERT INTO users (email, password_hash, role, status)
         VALUES ($1, $2, 'owner', 'active')
         RETURNING id;`,
        [`cascade-owner-${Date.now()}@namlatic.com`, dummyHash]
      );

      const tempId = tempUserRes.rows[0].id;
      createdUserIds.push(tempId);

      const tokenHash = crypto.randomBytes(32).toString('hex');
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const idleExpiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);

      await testPool.query(
        `INSERT INTO sessions (user_id, token_hash, expires_at, idle_expires_at)
         VALUES ($1, $2, $3, $4);`,
        [tempId, tokenHash, expiresAt, idleExpiresAt]
      );

      // Check session exists
      const beforeDel = await testPool.query('SELECT COUNT(*) FROM sessions WHERE user_id = $1;', [tempId]);
      assert.equal(parseInt(beforeDel.rows[0].count, 10), 1);

      // Delete user specifically by ID
      await testPool.query('DELETE FROM users WHERE id = $1;', [tempId]);
      const idx = createdUserIds.indexOf(tempId);
      if (idx !== -1) createdUserIds.splice(idx, 1);

      // Verify sessions automatically removed
      const afterDel = await testPool.query('SELECT COUNT(*) FROM sessions WHERE user_id = $1;', [tempId]);
      assert.equal(parseInt(afterDel.rows[0].count, 10), 0);
    });
  });

  // ==========================================================================
  // 5. One-Time Owner Bootstrap & Concurrency
  // ==========================================================================
  describe('One-Time Owner Bootstrap CLI & Concurrency', () => {
    let bootstrappedOwnerId;

    it('successfully bootstraps an owner account and validates password hash', async () => {
      const email = `bootstrap-${Date.now()}@namlatic.com`;
      const password = 'BootstrapOwnerSecretPassword2026!';

      const result = await bootstrapOwner({ email, password, pool: testPool });
      assert.equal(result.status, 'created');
      assert.equal(result.created, true);
      assert.equal(result.user.email, email);
      bootstrappedOwnerId = result.user.id;
      createdUserIds.push(bootstrappedOwnerId);

      // Verify stored password hash
      const dbCheck = await testPool.query('SELECT password_hash FROM users WHERE id = $1;', [bootstrappedOwnerId]);
      const storedHash = dbCheck.rows[0].password_hash;
      const isMatch = await verifyPassword(storedHash, password);
      assert.equal(isMatch, true, 'Stored password hash must verify against original password');
    });

    it('does not overwrite or alter an existing owner on subsequent bootstrap attempts', async () => {
      const initialOwner = (await testPool.query("SELECT id, email, password_hash FROM users WHERE role = 'owner' LIMIT 1;")).rows[0];

      const secondRun = await bootstrapOwner(
        {
          email: 'attacker@evil.com',
          password: 'AttackerNewPassword123!',
          pool: testPool,
        }
      );

      assert.equal(secondRun.status, 'exists');
      assert.equal(secondRun.created, false);

      const dbCheck = (await testPool.query("SELECT id, email, password_hash FROM users WHERE role = 'owner' LIMIT 1;")).rows[0];
      assert.equal(dbCheck.id, initialOwner.id);
      assert.equal(dbCheck.email, initialOwner.email);
      assert.equal(dbCheck.password_hash, initialOwner.password_hash);
    });

    it('handles two concurrent bootstrap executions safely creating at most one owner', async () => {
      // Safely delete only the bootstrapped test owner by ID
      if (bootstrappedOwnerId) {
        await testPool.query('DELETE FROM users WHERE id = $1;', [bootstrappedOwnerId]);
        const idx = createdUserIds.indexOf(bootstrappedOwnerId);
        if (idx !== -1) createdUserIds.splice(idx, 1);
        bootstrappedOwnerId = null;
      }

      const emailA = `concurrent-a-${Date.now()}@namlatic.com`;
      const emailB = `concurrent-b-${Date.now()}@namlatic.com`;
      const pwd = 'ConcurrentPassword12345!';

      // Run two bootstrapOwner calls concurrently against testPool
      const [resA, resB] = await Promise.all([
        bootstrapOwner({ email: emailA, password: pwd, pool: testPool }),
        bootstrapOwner({ email: emailB, password: pwd, pool: testPool }),
      ]);

      const outcomes = [resA.status, resB.status];
      // One must be created, and the other must be 'exists' or 'locked'
      assert.equal(outcomes.includes('created'), true, 'Exactly one process must create the owner');
      const createdCount = outcomes.filter((s) => s === 'created').length;
      assert.equal(createdCount, 1, 'Never more than one owner created');

      const ownerRows = await testPool.query("SELECT id, email FROM users WHERE role = 'owner';");
      assert.equal(ownerRows.rows.length, 1, 'Database must contain exactly 1 owner record');
      bootstrappedOwnerId = ownerRows.rows[0].id;
      createdUserIds.push(bootstrappedOwnerId);
    });
  });

  // ==========================================================================
  // 6. Administrative Password Recovery & Session Revocation
  // ==========================================================================
  describe('Administrative Password Recovery CLI', () => {
    let ownerId;
    let oldHash;

    before(async () => {
      const ownerRes = await testPool.query("SELECT id, password_hash FROM users WHERE role = 'owner' LIMIT 1;");
      if (ownerRes.rows.length === 0) {
        const dummyHash = await hashPassword('BaselineOwnerPassword2026!');
        const insertRes = await testPool.query(
          `INSERT INTO users (email, password_hash, role, status)
           VALUES ($1, $2, 'owner', 'active')
           RETURNING id, password_hash;`,
          [`recovery-owner-${Date.now()}@namlatic.com`, dummyHash]
        );
        ownerId = insertRes.rows[0].id;
        oldHash = insertRes.rows[0].password_hash;
        createdUserIds.push(ownerId);
      } else {
        ownerId = ownerRes.rows[0].id;
        oldHash = ownerRes.rows[0].password_hash;
      }

      // Create 2 active sessions for this owner
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const idleExpiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);

      await testPool.query(
        `INSERT INTO sessions (user_id, token_hash, expires_at, idle_expires_at)
         VALUES ($1, $2, $3, $4), ($1, $5, $3, $4);`,
        [
          ownerId,
          crypto.randomBytes(32).toString('hex'),
          expiresAt,
          idleExpiresAt,
          crypto.randomBytes(32).toString('hex'),
        ]
      );
    });

    it('updates owner password hash and revokes all active sessions', async () => {
      const newPassword = 'NewlyResetOwnerPassword2026!';

      const result = await resetOwnerPassword({ newPassword, pool: testPool });
      assert.equal(result.status, 'success');
      assert.equal(result.reset, true);
      assert.equal(result.revokedCount, 2);

      // Verify database updated
      const updatedUser = (await testPool.query('SELECT password_hash FROM users WHERE id = $1;', [ownerId])).rows[0];
      assert.notEqual(updatedUser.password_hash, oldHash);

      const verifiesNew = await verifyPassword(updatedUser.password_hash, newPassword);
      assert.equal(verifiesNew, true, 'New password verifies against updated hash');

      // Verify sessions are marked revoked (revoked_at IS NOT NULL)
      const sessions = await testPool.query('SELECT revoked_at FROM sessions WHERE user_id = $1;', [ownerId]);
      assert.equal(sessions.rows.length, 2);
      for (const row of sessions.rows) {
        assert.notEqual(row.revoked_at, null, 'Session must have non-null revoked_at');
      }
    });

    it('rejects password reset when no owner account exists', async () => {
      // Safely delete only the test owner by specific ID
      await testPool.query('DELETE FROM users WHERE id = $1;', [ownerId]);
      const idx = createdUserIds.indexOf(ownerId);
      if (idx !== -1) createdUserIds.splice(idx, 1);

      const res = await resetOwnerPassword({ newPassword: 'AnyValidPassword12345!', pool: testPool });
      assert.equal(res.status, 'not_found');
      assert.equal(res.reset, false);
    });
  });
});
