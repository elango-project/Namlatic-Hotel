const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateTestDatabaseConfig, verifyTestRolePrivileges } = require('../helpers/testDb');

describe('Unit Tests: Dedicated Test Database Safety Configuration (Phase 5F-A2.1.2)', () => {
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
        TEST_DATABASE_URL: 'postgresql://namlatic_test:fictional_test_password_placeholder@localhost:5432/namlatic_hotel_test',
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
        TEST_DATABASE_URL: 'mysql://namlatic_test:fictional_dummy_pass@localhost:3306/namlatic_hotel_test',
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
        TEST_DATABASE_URL: 'postgresql://namlatic_test:fictional_dummy_pass@localhost:5432/',
      },
      () => {
        assert.throws(() => validateTestDatabaseConfig(), {
          message: /TEST_DATABASE_URL must specify a target database name in its path/,
        });
      }
    );
  });

  it('rejects connection URLs without a database user', () => {
    runWithEnv(
      {
        NODE_ENV: 'test',
        TEST_DATABASE_URL: 'postgresql://localhost:5432/namlatic_hotel_test',
      },
      () => {
        assert.throws(() => validateTestDatabaseConfig(), {
          message: /TEST_DATABASE_URL must specify a dedicated test database user/,
        });
      }
    );
  });

  it('rejects normal application database user "namlatic_app"', () => {
    runWithEnv(
      {
        NODE_ENV: 'test',
        TEST_DATABASE_URL: 'postgresql://namlatic_app:fictional_app_pass_placeholder@localhost:5432/namlatic_hotel_test',
      },
      () => {
        assert.throws(() => validateTestDatabaseConfig(), {
          message: /Safety check failed: TEST_DATABASE_URL uses application database user "namlatic_app"/,
        });
      }
    );
  });

  it('rejects custom application database user configured in DB_USER', () => {
    runWithEnv(
      {
        NODE_ENV: 'test',
        DB_USER: 'custom_hotel_app_user',
        TEST_DATABASE_URL: 'postgresql://custom_hotel_app_user:fictional_app_pass@localhost:5432/namlatic_hotel_test',
      },
      () => {
        assert.throws(() => validateTestDatabaseConfig(), {
          message: /Safety check failed: TEST_DATABASE_URL uses application database user "custom_hotel_app_user"/,
        });
      }
    );
  });

  it('rejects administrative superuser role "postgres"', () => {
    runWithEnv(
      {
        NODE_ENV: 'test',
        TEST_DATABASE_URL: 'postgresql://postgres:fictional_super_pass_placeholder@localhost:5432/namlatic_hotel_test',
      },
      () => {
        assert.throws(() => validateTestDatabaseConfig(), {
          message: /Safety check failed: TEST_DATABASE_URL uses administrative\/superuser role "postgres"/,
        });
      }
    );
  });

  it('rejects administrative superuser role "root"', () => {
    runWithEnv(
      {
        NODE_ENV: 'test',
        TEST_DATABASE_URL: 'postgresql://root:fictional_root_pass@localhost:5432/namlatic_hotel_test',
      },
      () => {
        assert.throws(() => validateTestDatabaseConfig(), {
          message: /Safety check failed: TEST_DATABASE_URL uses administrative\/superuser role "root"/,
        });
      }
    );
  });

  it('rejects database roles that do not match designated test role', () => {
    runWithEnv(
      {
        NODE_ENV: 'test',
        TEST_DATABASE_URL: 'postgresql://arbitrary_test_user:fictional_pass@localhost:5432/namlatic_hotel_test',
      },
      () => {
        assert.throws(() => validateTestDatabaseConfig(), {
          message: /Safety check failed: Database role "arbitrary_test_user" in TEST_DATABASE_URL does not match designated test role "namlatic_test"/,
        });
      }
    );
  });

  it('rejects primary development database "namlatic_hotel"', () => {
    runWithEnv(
      {
        NODE_ENV: 'test',
        TEST_DATABASE_URL: 'postgresql://namlatic_test:fictional_test_pass@localhost:5432/namlatic_hotel',
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
        TEST_DATABASE_URL: 'postgresql://namlatic_test:fictional_test_pass@localhost:5432/postgres',
      },
      () => {
        assert.throws(() => validateTestDatabaseConfig(), {
          message: /Safety check failed: TEST_DATABASE_URL points to protected database "postgres"/,
        });
      }
    );
  });

  it('rejects cloud production database name "neondb"', () => {
    runWithEnv(
      {
        NODE_ENV: 'test',
        TEST_DATABASE_URL: 'postgresql://namlatic_test:fictional_test_pass@localhost:5432/neondb',
      },
      () => {
        assert.throws(() => validateTestDatabaseConfig(), {
          message: /Safety check failed: TEST_DATABASE_URL points to protected database "neondb"/,
        });
      }
    );
  });

  it('rejects database names that do not contain the substring "test"', () => {
    runWithEnv(
      {
        NODE_ENV: 'test',
        TEST_DATABASE_URL: 'postgresql://namlatic_test:fictional_test_pass@localhost:5432/namlatic_staging',
      },
      () => {
        assert.throws(() => validateTestDatabaseConfig(), {
          message: /Safety check failed: Test database name "namlatic_staging" must contain "test"/,
        });
      }
    );
  });

  it('rejects database names that differ from exact expected test database name', () => {
    runWithEnv(
      {
        NODE_ENV: 'test',
        TEST_DATABASE_URL: 'postgresql://namlatic_test:fictional_test_pass@localhost:5432/other_test_db',
      },
      () => {
        assert.throws(() => validateTestDatabaseConfig(), {
          message: /Safety check failed: Test database name "other_test_db" does not match exact expected test database name "namlatic_hotel_test"/,
        });
      }
    );
  });

  it('rejects unauthorized remote hosts by default', () => {
    runWithEnv(
      {
        NODE_ENV: 'test',
        TEST_DATABASE_URL: 'postgresql://namlatic_test:fictional_test_pass@remote-cloud-db.internal:5432/namlatic_hotel_test',
      },
      () => {
        assert.throws(() => validateTestDatabaseConfig(), {
          message: /Safety check failed: Host "remote-cloud-db.internal" is not an authorized test database host/,
        });
      }
    );
  });

  it('accepts explicitly configured remote CI host via TEST_DB_ALLOWED_HOSTS', () => {
    runWithEnv(
      {
        NODE_ENV: 'test',
        TEST_DB_ALLOWED_HOSTS: 'ci-runner-db.internal,postgres-test.corp',
        TEST_DATABASE_URL: 'postgresql://namlatic_test:fictional_test_pass@ci-runner-db.internal:5432/namlatic_hotel_test',
      },
      () => {
        const config = validateTestDatabaseConfig();
        assert.equal(config.dbHost, 'ci-runner-db.internal');
        assert.equal(config.dbName, 'namlatic_hotel_test');
        assert.equal(config.dbUser, 'namlatic_test');
      }
    );
  });

  it('accepts custom test database name when explicitly configured via TEST_DB_NAME', () => {
    runWithEnv(
      {
        NODE_ENV: 'test',
        TEST_DB_NAME: 'namlatic_ci_test_shard_1',
        TEST_DATABASE_URL: 'postgresql://namlatic_test:fictional_test_pass@localhost:5432/namlatic_ci_test_shard_1',
      },
      () => {
        const config = validateTestDatabaseConfig();
        assert.equal(config.dbName, 'namlatic_ci_test_shard_1');
      }
    );
  });

  it('accepts custom test role when explicitly configured via TEST_DB_USER', () => {
    runWithEnv(
      {
        NODE_ENV: 'test',
        TEST_DB_USER: 'ci_test_runner_role',
        TEST_DATABASE_URL: 'postgresql://ci_test_runner_role:fictional_test_pass@localhost:5432/namlatic_hotel_test',
      },
      () => {
        const config = validateTestDatabaseConfig();
        assert.equal(config.dbUser, 'ci_test_runner_role');
      }
    );
  });

  it('successfully validates a designated test database URL on localhost with designated role and returns sanitized metadata', () => {
    runWithEnv(
      {
        NODE_ENV: 'test',
        TEST_DATABASE_URL: 'postgresql://namlatic_test:fictional_test_password_placeholder@localhost:5432/namlatic_hotel_test',
      },
      () => {
        const config = validateTestDatabaseConfig();
        assert.equal(config.dbName, 'namlatic_hotel_test');
        assert.equal(config.dbHost, 'localhost');
        assert.equal(config.dbUser, 'namlatic_test');
        assert.equal(
          config.connectionString,
          'postgresql://namlatic_test:fictional_test_password_placeholder@localhost:5432/namlatic_hotel_test'
        );
      }
    );
  });

  describe('Runtime Test Role Privilege Verification (verifyTestRolePrivileges)', () => {
    it('passes when role has rolsuper=false, rolcreatedb=false, rolcreaterole=false', async () => {
      const mockPool = {
        query: async (sql) => {
          assert.equal(sql.includes('pg_roles'), true);
          return {
            rows: [{ rolname: 'namlatic_test', rolsuper: false, rolcreatedb: false, rolcreaterole: false }],
          };
        },
      };

      const result = await verifyTestRolePrivileges(mockPool);
      assert.equal(result.rolname, 'namlatic_test');
      assert.equal(result.rolsuper, false);
      assert.equal(result.rolcreatedb, false);
      assert.equal(result.rolcreaterole, false);
    });

    it('rejects role with rolsuper=true', async () => {
      const mockPool = {
        query: async () => ({
          rows: [{ rolname: 'namlatic_test', rolsuper: true, rolcreatedb: false, rolcreaterole: false }],
        }),
      };

      await assert.rejects(
        async () => verifyTestRolePrivileges(mockPool),
        { message: /Connected test role "namlatic_test" is a PostgreSQL superuser/ }
      );
    });

    it('rejects role with rolcreatedb=true', async () => {
      const mockPool = {
        query: async () => ({
          rows: [{ rolname: 'namlatic_test', rolsuper: false, rolcreatedb: true, rolcreaterole: false }],
        }),
      };

      await assert.rejects(
        async () => verifyTestRolePrivileges(mockPool),
        { message: /has CREATEDB privilege/ }
      );
    });

    it('rejects role with rolcreaterole=true', async () => {
      const mockPool = {
        query: async () => ({
          rows: [{ rolname: 'namlatic_test', rolsuper: false, rolcreatedb: false, rolcreaterole: true }],
        }),
      };

      await assert.rejects(
        async () => verifyTestRolePrivileges(mockPool),
        { message: /has CREATEROLE privilege/ }
      );
    });

    it('rejects when pg_roles query returns no rows', async () => {
      const mockPool = {
        query: async () => ({
          rows: [],
        }),
      };

      await assert.rejects(
        async () => verifyTestRolePrivileges(mockPool),
        { message: /Unable to inspect current database role in pg_roles/ }
      );
    });
  });
});
