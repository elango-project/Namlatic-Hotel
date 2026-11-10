const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const sasl = require('pg/lib/crypto/sasl');
const {
  parseDatabaseUrl,
  validateDatabaseConfig,
  parseAndValidateEnv,
} = require('../../src/config/env');
const { sanitizeDbError } = require('../../src/controllers/health.controller');

describe('Unit Tests: Database Environment & SSL Configuration (Phase 5B)', () => {
  // --------------------------------------------------------------------------
  // 1. Local Discrete Database Configuration
  // --------------------------------------------------------------------------
  describe('Local Discrete Configuration (Development)', () => {
    it('uses discrete variables with localhost defaults when DATABASE_URL is unset', () => {
      const config = validateDatabaseConfig({
        NODE_ENV: 'development',
      });

      assert.equal(config.isUsingDatabaseUrl, false);
      assert.equal(config.databaseUrl, null);
      assert.equal(config.db.host, 'localhost');
      assert.equal(config.db.port, 5432);
      assert.equal(config.db.database, 'namlatic_hotel');
      assert.equal(config.dbPoolConfig.ssl, false);
      assert.equal(config.dbPoolConfig.max, 10);
      assert.equal(config.dbPoolConfig.min, 0);
    });

    it('respects custom discrete variables in local development', () => {
      const config = validateDatabaseConfig({
        NODE_ENV: 'development',
        DB_HOST: '127.0.0.1',
        DB_PORT: '5433',
        DB_NAME: 'custom_hotel_db',
        DB_USER: 'custom_user',
        DB_PASSWORD: 'custom_password',
      });

      assert.equal(config.isUsingDatabaseUrl, false);
      assert.equal(config.db.host, '127.0.0.1');
      assert.equal(config.db.port, 5433);
      assert.equal(config.db.database, 'custom_hotel_db');
      assert.equal(config.db.user, 'custom_user');
      assert.equal(config.db.password, 'custom_password');
      assert.equal(config.dbPoolConfig.ssl, false);
    });
  });

  // --------------------------------------------------------------------------
  // 2. DATABASE_URL Configuration
  // --------------------------------------------------------------------------
  describe('DATABASE_URL Configuration', () => {
    it('gives DATABASE_URL precedence over discrete variables in development', () => {
      const config = validateDatabaseConfig({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://dev_user:dev_pass@localhost:5432/dev_db',
        DB_HOST: 'override_me',
        DB_NAME: 'override_me_too',
      });

      assert.equal(config.isUsingDatabaseUrl, true);
      assert.equal(config.databaseUrl, 'postgresql://dev_user:dev_pass@localhost:5432/dev_db');
      assert.equal(config.db.host, 'localhost');
      assert.equal(config.db.database, 'dev_db');
      assert.equal(config.db.user, 'dev_user');
      assert.equal(config.dbPoolConfig.connectionString, 'postgresql://dev_user:dev_pass@localhost:5432/dev_db');
    });

    it('successfully validates and configures a Neon cloud connection string', () => {
      const neonUrl = 'postgresql://alex:SecurePass123!@ep-cool-fog-123456.us-east-2.aws.neon.tech/neondb?sslmode=require';
      const config = validateDatabaseConfig({
        NODE_ENV: 'production',
        DATABASE_URL: neonUrl,
      });

      assert.equal(config.isUsingDatabaseUrl, true);
      assert.equal(config.databaseUrl, neonUrl);
      assert.equal(config.db.host, 'ep-cool-fog-123456.us-east-2.aws.neon.tech');
      assert.equal(config.db.database, 'neondb');
      assert.equal(config.db.user, 'alex');
      assert.equal(config.dbPoolConfig.connectionString, neonUrl);
      assert.equal(config.dbPoolConfig.max, 10);
      assert.equal(config.dbPoolConfig.min, 0);
      assert.equal(config.dbPoolConfig.idleTimeoutMillis, 30000);
      assert.equal(config.dbPoolConfig.connectionTimeoutMillis, 5000);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Production Missing DATABASE_URL
  // --------------------------------------------------------------------------
  describe('Production Missing DATABASE_URL', () => {
    it('fails immediately when NODE_ENV is production and DATABASE_URL is missing', () => {
      assert.throws(
        () => {
          validateDatabaseConfig({
            NODE_ENV: 'production',
          });
        },
        {
          name: 'Error',
          message: /in production, database_url environment variable is required/i,
        }
      );
    });

    it('fails immediately when NODE_ENV is production and DATABASE_URL is blank or whitespace', () => {
      assert.throws(
        () => {
          validateDatabaseConfig({
            NODE_ENV: 'production',
            DATABASE_URL: '   ',
          });
        },
        {
          name: 'Error',
          message: /in production, database_url environment variable is required/i,
        }
      );
    });
  });

  // --------------------------------------------------------------------------
  // 4. Invalid DATABASE_URL Validation
  // --------------------------------------------------------------------------
  describe('Invalid DATABASE_URL Rejection', () => {
    it('rejects malformed URLs that cannot be parsed', () => {
      assert.throws(
        () => parseDatabaseUrl('not_a_valid_url'),
        {
          name: 'Error',
          message: /database_url must be a valid connection url/i,
        }
      );
    });

    it('rejects unsupported protocols (e.g. http, mysql, mongodb)', () => {
      assert.throws(
        () => parseDatabaseUrl('http://ep-host.aws.neon.tech/neondb'),
        {
          name: 'Error',
          message: /protocol must be "postgres:" or "postgresql:"/i,
        }
      );
      assert.throws(
        () => parseDatabaseUrl('mysql://root:pass@localhost:3306/db'),
        {
          name: 'Error',
          message: /protocol must be "postgres:" or "postgresql:"/i,
        }
      );
    });

    it('rejects URL missing a hostname', () => {
      assert.throws(
        () => parseDatabaseUrl('postgresql:///neondb'),
        {
          name: 'Error',
          message: /must contain a valid hostname/i,
        }
      );
    });

    it('rejects URL missing a target database name', () => {
      assert.throws(
        () => parseDatabaseUrl('postgresql://user:pass@ep-host.aws.neon.tech/'),
        {
          name: 'Error',
          message: /must specify a target database name in its path/i,
        }
      );
    });
  });

  // --------------------------------------------------------------------------
  // 5. Empty Production Credentials & Localhost Defense
  // --------------------------------------------------------------------------
  describe('Production Credential & Localhost Defense', () => {
    it('rejects DATABASE_URL with missing password in production', () => {
      assert.throws(
        () => {
          validateDatabaseConfig({
            NODE_ENV: 'production',
            DATABASE_URL: 'postgresql://user@ep-cool-fog.aws.neon.tech/neondb?sslmode=require',
          });
        },
        {
          name: 'Error',
          message: /must include a non-empty database password/i,
        }
      );
    });

    it('rejects production DATABASE_URL pointing to localhost or 127.0.0.1', () => {
      assert.throws(
        () => {
          validateDatabaseConfig({
            NODE_ENV: 'production',
            DATABASE_URL: 'postgresql://user:pass@localhost:5432/neondb?sslmode=require',
          });
        },
        {
          name: 'Error',
          message: /cannot point to localhost or loopback addresses/i,
        }
      );

      assert.throws(
        () => {
          validateDatabaseConfig({
            NODE_ENV: 'production',
            DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/neondb?sslmode=require',
          });
        },
        {
          name: 'Error',
          message: /cannot point to localhost or loopback addresses/i,
        }
      );
    });
  });

  // --------------------------------------------------------------------------
  // 6. Local Development Backward Compatibility
  // --------------------------------------------------------------------------
  describe('Backward Compatibility for Local Development', () => {
    it('maintains expected environment object shape for existing server consumers', () => {
      const fullEnv = parseAndValidateEnv({
        PORT: '5000',
        NODE_ENV: 'development',
        CORS_ORIGIN: 'http://localhost:5173',
      });

      assert.equal(fullEnv.port, 5000);
      assert.equal(fullEnv.nodeEnv, 'development');
      assert.equal(fullEnv.corsOrigin, 'http://localhost:5173');
      assert.equal(fullEnv.isUsingDatabaseUrl, false);
      assert.equal(fullEnv.db.host, 'localhost');
      assert.equal(fullEnv.db.port, 5432);
      assert.equal(fullEnv.db.database, 'namlatic_hotel');
      assert.equal(typeof fullEnv.dbPoolConfig, 'object');
      assert.equal(fullEnv.dbPoolConfig.ssl, false);
    });
  });

  // --------------------------------------------------------------------------
  // 7. SSL Configuration Behavior
  // --------------------------------------------------------------------------
  describe('PostgreSQL SSL/TLS Configuration', () => {
    it('rejects unencrypted connection with sslmode=disable in production', () => {
      assert.throws(
        () => {
          validateDatabaseConfig({
            NODE_ENV: 'production',
            DATABASE_URL: 'postgresql://user:password123@ep-host.aws.neon.tech/neondb?sslmode=disable',
          });
        },
        {
          name: 'Error',
          message: /unencrypted database connections are not permitted/i,
        }
      );
    });

    it('rejects production DATABASE_URL that omits required SSL mode', () => {
      assert.throws(
        () => {
          validateDatabaseConfig({
            NODE_ENV: 'production',
            DATABASE_URL: 'postgresql://user:password123@ep-host.aws.neon.tech/neondb',
          });
        },
        {
          name: 'Error',
          message: /must explicitly specify an encrypted ssl mode/i,
        }
      );
    });

    it('accepts both sslmode=require and sslmode=verify-full in production', () => {
      const c1 = validateDatabaseConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password123@ep-host.aws.neon.tech/neondb?sslmode=require',
      });
      assert.equal(c1.isUsingDatabaseUrl, true);

      const c2 = validateDatabaseConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password123@ep-host.aws.neon.tech/neondb?sslmode=verify-full',
      });
      assert.equal(c2.isUsingDatabaseUrl, true);
    });

    it('rejects production DATABASE_URL attempting to bypass SSL with ssl=0 or ssl=false', () => {
      assert.throws(
        () => {
          validateDatabaseConfig({
            NODE_ENV: 'production',
            DATABASE_URL: 'postgresql://user:password123@ep-host.aws.neon.tech/neondb?sslmode=require&ssl=0',
          });
        },
        {
          name: 'Error',
          message: 'In production, unencrypted database connections are not permitted. DATABASE_URL cannot disable SSL.',
        }
      );

      assert.throws(
        () => {
          validateDatabaseConfig({
            NODE_ENV: 'production',
            DATABASE_URL: 'postgresql://user:password123@ep-host.aws.neon.tech/neondb?sslmode=require&ssl=false',
          });
        },
        {
          name: 'Error',
          message: 'In production, unencrypted database connections are not permitted. DATABASE_URL cannot disable SSL.',
        }
      );
    });

    it('rejects production DATABASE_URL attempting to bypass SSL with sslmode=no-verify', () => {
      assert.throws(
        () => {
          validateDatabaseConfig({
            NODE_ENV: 'production',
            DATABASE_URL: 'postgresql://user:password123@ep-host.aws.neon.tech/neondb?sslmode=no-verify',
          });
        },
        {
          name: 'Error',
          message: 'In production, unencrypted database connections are not permitted. DATABASE_URL cannot disable SSL.',
        }
      );
    });

    it('allows unencrypted localhost connections in development mode', () => {
      const config = validateDatabaseConfig({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/devdb',
      });
      assert.equal(config.isUsingDatabaseUrl, true);
      assert.equal(config.dbPoolConfig.ssl, undefined); // Handled natively by pg-connection-string
    });
  });

  // --------------------------------------------------------------------------
  // 8. SCRAM-SHA-256-PLUS Channel Binding Configuration
  // --------------------------------------------------------------------------
  describe('Channel Binding Configuration (SCRAM-SHA-256-PLUS)', () => {
    it('explicitly rejects channel_binding=require because pg 8.23.1 driver cannot strictly enforce it without fallback', () => {
      assert.throws(
        () => {
          validateDatabaseConfig({
            NODE_ENV: 'production',
            DATABASE_URL:
              'postgresql://user:password123@ep-host.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
          });
        },
        (err) => {
          assert.equal(err.name, 'Error');
          assert.match(err.message, /channel_binding=require/i);
          assert.match(err.message, /does not support strict channel binding/i);
          assert.match(err.message, /prefer.*disable/i);
          return true;
        }
      );
    });

    it('explicitly rejects PGCHANNELBINDING=require environment setting', () => {
      assert.throws(
        () => {
          validateDatabaseConfig({
            NODE_ENV: 'production',
            DATABASE_URL: 'postgresql://user:password123@ep-host.aws.neon.tech/neondb?sslmode=require',
            PGCHANNELBINDING: 'require',
          });
        },
        (err) => {
          assert.equal(err.name, 'Error');
          assert.match(err.message, /require.*not supported/i);
          return true;
        }
      );
    });

    it('enables opportunistic channel binding when channel_binding=prefer is in DATABASE_URL', () => {
      const config = validateDatabaseConfig({
        NODE_ENV: 'production',
        DATABASE_URL:
          'postgresql://user:password123@ep-host.aws.neon.tech/neondb?sslmode=require&channel_binding=prefer',
      });

      assert.equal(config.isUsingDatabaseUrl, true);
      assert.equal(config.db.channelBinding, 'prefer');
      assert.equal(config.dbPoolConfig.enableChannelBinding, true);
    });

    it('disables channel binding when channel_binding=disable is in DATABASE_URL', () => {
      const config = validateDatabaseConfig({
        NODE_ENV: 'production',
        DATABASE_URL:
          'postgresql://user:password123@ep-host.aws.neon.tech/neondb?sslmode=require&channel_binding=disable',
      });

      assert.equal(config.isUsingDatabaseUrl, true);
      assert.equal(config.db.channelBinding, 'disable');
      assert.equal(config.dbPoolConfig.enableChannelBinding, false);
    });

    it('rejects invalid channel_binding parameter in DATABASE_URL', () => {
      assert.throws(
        () => {
          validateDatabaseConfig({
            NODE_ENV: 'production',
            DATABASE_URL:
              'postgresql://user:password123@ep-host.aws.neon.tech/neondb?sslmode=require&channel_binding=invalid_mode',
          });
        },
        {
          name: 'Error',
          message: 'DATABASE_URL channel_binding parameter must be "require", "prefer", or "disable".',
        }
      );
    });

    it('respects PGCHANNELBINDING=prefer environment variable when channel_binding is absent from URL', () => {
      const config = validateDatabaseConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password123@ep-host.aws.neon.tech/neondb?sslmode=require',
        PGCHANNELBINDING: 'prefer',
      });

      assert.equal(config.isUsingDatabaseUrl, true);
      assert.equal(config.dbPoolConfig.enableChannelBinding, true);
    });

    it('respects PGCHANNELBINDING=disable environment variable when channel_binding is absent from URL', () => {
      const config = validateDatabaseConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password123@ep-host.aws.neon.tech/neondb?sslmode=require',
        PGCHANNELBINDING: 'disable',
      });

      assert.equal(config.isUsingDatabaseUrl, true);
      assert.equal(config.dbPoolConfig.enableChannelBinding, false);
    });

    it('leaves enableChannelBinding undefined when no channel binding is specified', () => {
      const config = validateDatabaseConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:password123@ep-host.aws.neon.tech/neondb?sslmode=require',
      });

      assert.equal(config.isUsingDatabaseUrl, true);
      assert.equal(config.dbPoolConfig.enableChannelBinding, undefined);
    });
  });

  // --------------------------------------------------------------------------
  // 9. Driver SASL Mechanism Negotiation Behavior (Verification)
  // --------------------------------------------------------------------------
  describe('Driver SASL Mechanism Negotiation & Channel-Binding Enforcement', () => {
    const mockTlsStream = {
      getPeerCertificate: () => ({
        raw: Buffer.from('mock-neon-tls-server-certificate-bytes'),
      }),
    };

    it('negotiates SCRAM-SHA-256-PLUS when channel binding is enabled (prefer) and server offers PLUS', () => {
      // Driver stream is present when enableChannelBinding: true
      const session = sasl.startSession(['SCRAM-SHA-256-PLUS', 'SCRAM-SHA-256'], mockTlsStream);

      assert.equal(session.mechanism, 'SCRAM-SHA-256-PLUS');
      // gs2Header 'p=tls-server-end-point' confirms channel binding is active
      assert.equal(session.response.startsWith('p=tls-server-end-point,,'), true);
    });

    it('falls back to SCRAM-SHA-256 when server only offers SCRAM-SHA-256 (proving prefer semantics, not strict require)', () => {
      // With enableChannelBinding: true, driver silently falls back to standard SCRAM-SHA-256
      const session = sasl.startSession(['SCRAM-SHA-256'], mockTlsStream);

      assert.equal(session.mechanism, 'SCRAM-SHA-256');
      // gs2Header 'y' indicates client supports channel binding, but server did not offer PLUS
      assert.equal(session.response.startsWith('y,,'), true);
    });

    it('negotiates standard SCRAM-SHA-256 when channel binding is disabled even if server offers PLUS', () => {
      // When channel binding is disabled, stream is passed as false
      const session = sasl.startSession(['SCRAM-SHA-256-PLUS', 'SCRAM-SHA-256'], false);

      assert.equal(session.mechanism, 'SCRAM-SHA-256');
      // gs2Header 'n' indicates client does not support channel binding
      assert.equal(session.response.startsWith('n,,'), true);
    });

    it('throws error when server offers unsupported authentication mechanism', () => {
      assert.throws(
        () => {
          sasl.startSession(['PLAIN', 'MD5'], mockTlsStream);
        },
        /SASL: Only mechanism\(s\) SCRAM-SHA-256-PLUS and SCRAM-SHA-256 are supported/
      );
    });

    it('throws error if SCRAM-SHA-256-PLUS is selected but stream lacks certificate', () => {
      assert.throws(
        () => {
          sasl.startSession(['SCRAM-SHA-256-PLUS'], {});
        },
        /SASL: Mechanism SCRAM-SHA-256-PLUS requires a certificate/
      );
    });
  });

  // --------------------------------------------------------------------------
  // 10. Confidentiality: No Secret Values in Errors or Logs
  // --------------------------------------------------------------------------
  describe('Error Message Confidentiality (Zero Leakage)', () => {
    it('never includes sensitive passwords or full URLs in configuration errors', () => {
      const sensitivePassword = 'UltraTopSecretP@ssword!#99';
      const dangerousUrl = `postgresql://admin:${sensitivePassword}@ep-host.aws.neon.tech/neondb?sslmode=disable`;

      try {
        validateDatabaseConfig({
          NODE_ENV: 'production',
          DATABASE_URL: dangerousUrl,
        });
        assert.fail('Expected validation to throw an error');
      } catch (err) {
        assert.equal(
          err.message.includes(sensitivePassword),
          false,
          'Error message must NOT contain the secret password!'
        );
        assert.equal(
          err.message.includes(dangerousUrl),
          false,
          'Error message must NOT contain the full connection string!'
        );
      }
    });

    it('never leaks secret password when rejecting channel_binding=require', () => {
      const sensitivePassword = 'TopSecretChannelBindingPassword#2026';
      const dangerousUrl = `postgresql://admin:${sensitivePassword}@ep-host.aws.neon.tech/neondb?sslmode=require&channel_binding=require`;

      try {
        validateDatabaseConfig({
          NODE_ENV: 'production',
          DATABASE_URL: dangerousUrl,
        });
        assert.fail('Expected validation to throw an error');
      } catch (err) {
        assert.equal(
          err.message.includes(sensitivePassword),
          false,
          'Error message must NOT contain secret password when rejecting channel_binding=require!'
        );
        assert.equal(
          err.message.includes(dangerousUrl),
          false,
          'Error message must NOT contain full URL when rejecting channel_binding=require!'
        );
      }
    });

    it('sanitizes TLS and database error codes safely in sanitizeDbError without schema leaks', () => {
      assert.equal(
        sanitizeDbError({ code: 'ECONNREFUSED' }),
        'Database connection refused (PostgreSQL server is not reachable on configured port)'
      );
      assert.equal(
        sanitizeDbError({ code: '28P01' }),
        'Database authentication failed (invalid credentials)'
      );
      assert.equal(
        sanitizeDbError({ code: 'SELF_SIGNED_CERT_IN_CHAIN' }),
        'Database TLS/SSL certificate verification failed'
      );
      assert.equal(
        sanitizeDbError({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' }),
        'Database TLS/SSL certificate verification failed'
      );
      assert.equal(
        sanitizeDbError(null),
        'Database connection unavailable'
      );
    });
  });
});
