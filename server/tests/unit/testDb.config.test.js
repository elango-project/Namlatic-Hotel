const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateTestDatabaseConfig } = require('../helpers/testDb');

describe('Unit Tests: Dedicated Test Database Safety Configuration (Phase 5F-A2.1.1)', () => {
  const originalEnv = process.env;

  const runWithEnv = (envOverrides, fn) => {
    process.env = { ...originalEnv, ...envOverrides };
    try {
      return fn();
    } finally {
      process.env = originalEnv;
    }
  };

  it('fails immediately when NODE_ENV is production regardless of URL', () => {
    runWithEnv(
      {
        NODE_ENV: 'production',
        TEST_DATABASE_URL: 'postgresql://namlatic_app:namlatic@localhost:5432/namlatic_hotel_test',
      },
      () => {
        assert.throws(() => validateTestDatabaseConfig(), {
          message: /Safety check failed: Integration tests must not run when NODE_ENV is set to "production"/,
        });
      }
    );
  });

  it('fails when TEST_DATABASE_URL is missing', () => {
    runWithEnv(
      {
        NODE_ENV: 'test',
        TEST_DATABASE_URL: '',
      },
      () => {
        assert.throws(() => validateTestDatabaseConfig(), {
          message: /TEST_DATABASE_URL environment variable is required/,
        });
      }
    );
  });

  it('fails when TEST_DATABASE_URL is whitespace only', () => {
    runWithEnv(
      {
        NODE_ENV: 'test',
        TEST_DATABASE_URL: '   ',
      },
      () => {
        assert.throws(() => validateTestDatabaseConfig(), {
          message: /TEST_DATABASE_URL environment variable is required/,
        });
      }
    );
  });

  it('rejects malformed URLs that cannot be parsed', () => {
    runWithEnv(
      {
        NODE_ENV: 'test',
        TEST_DATABASE_URL: 'not-a-valid-url',
      },
      () => {
        assert.throws(() => validateTestDatabaseConfig(), {
          message: /TEST_DATABASE_URL must be a valid PostgreSQL connection URL/,
        });
      }
    );
  });

  it('rejects non-PostgreSQL protocols', () => {
    runWithEnv(
      {
        NODE_ENV: 'test',
        TEST_DATABASE_URL: 'mysql://root:pass@localhost:3306/namlatic_hotel_test',
      },
      () => {
        assert.throws(() => validateTestDatabaseConfig(), {
          message: /TEST_DATABASE_URL must use postgres: or postgresql: protocol/,
        });
      }
    );
  });

  it('rejects connection URLs without a target database name', () => {
    runWithEnv(
      {
        NODE_ENV: 'test',
        TEST_DATABASE_URL: 'postgresql://user:pass@localhost:5432/',
      },
      () => {
        assert.throws(() => validateTestDatabaseConfig(), {
          message: /TEST_DATABASE_URL must specify a target database name in its path/,
        });
      }
    );
  });

  it('rejects primary development database "namlatic_hotel"', () => {
    runWithEnv(
      {
        NODE_ENV: 'test',
        TEST_DATABASE_URL: 'postgresql://namlatic_app:namlatic@localhost:5432/namlatic_hotel',
      },
      () => {
        assert.throws(() => validateTestDatabaseConfig(), {
          message: /Safety check failed: TEST_DATABASE_URL points to protected database "namlatic_hotel"/,
        });
      }
    );
  });

  it('rejects PostgreSQL system database "postgres"', () => {
    runWithEnv(
      {
        NODE_ENV: 'test',
        TEST_DATABASE_URL: 'postgresql://postgres:1234@localhost:5432/postgres',
      },
      () => {
        assert.throws(() => validateTestDatabaseConfig(), {
          message: /Safety check failed: TEST_DATABASE_URL points to protected database "postgres"/,
        });
      }
    );
  });

  it('rejects database names that do not contain the substring "test"', () => {
    runWithEnv(
      {
        NODE_ENV: 'test',
        TEST_DATABASE_URL: 'postgresql://namlatic_app:namlatic@localhost:5432/namlatic_staging',
      },
      () => {
        assert.throws(() => validateTestDatabaseConfig(), {
          message: /Safety check failed: Test database name "namlatic_staging" must contain "test"/,
        });
      }
    );
  });

  it('successfully validates a designated test database URL and returns sanitized dbName', () => {
    runWithEnv(
      {
        NODE_ENV: 'test',
        TEST_DATABASE_URL: 'postgresql://namlatic_app:namlatic@localhost:5432/namlatic_hotel_test',
      },
      () => {
        const config = validateTestDatabaseConfig();
        assert.equal(config.dbName, 'namlatic_hotel_test');
        assert.equal(config.connectionString, 'postgresql://namlatic_app:namlatic@localhost:5432/namlatic_hotel_test');
      }
    );
  });
});
