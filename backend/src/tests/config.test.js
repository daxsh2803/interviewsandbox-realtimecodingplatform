jest.mock('dotenv', () => ({ config: jest.fn() }));

describe('Production Config Validation', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  it('should not throw in development mode', () => {
    process.env.NODE_ENV = 'development';

    expect(() => {
      require('../config');
    }).not.toThrow();
  });

  describe('test database configuration', () => {
    it('should use TEST_DATABASE_URL when NODE_ENV is test', () => {
      process.env.NODE_ENV = 'test';
      process.env.TEST_DATABASE_URL = 'postgresql://localhost:5433/interview_sandbox_test';
      process.env.DATABASE_URL = 'postgresql://localhost:5433/interview_db';

      const config = require('../config');
      expect(config.databaseUrl).toBe('postgresql://localhost:5433/interview_sandbox_test');
    });

    it('should fall back to DATABASE_URL in CI when TEST_DATABASE_URL is unset', () => {
      process.env.NODE_ENV = 'test';
      delete process.env.TEST_DATABASE_URL;
      process.env.CI = 'true';
      process.env.DATABASE_URL = 'postgresql://localhost:5433/interview_db';

      const config = require('../config');
      expect(config.databaseUrl).toBe('postgresql://localhost:5433/interview_db');
    });

    it('should warn when running tests against a non-test database without TEST_DATABASE_URL outside CI', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      process.env.NODE_ENV = 'test';
      delete process.env.TEST_DATABASE_URL;
      delete process.env.CI;
      process.env.DATABASE_URL = 'postgresql://localhost:5433/interview_db';

      const config = require('../config');
      expect(config.databaseUrl).toBe('postgresql://localhost:5433/interview_db');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('WARNING: Running tests against non-test database')
      );
      warnSpy.mockRestore();
    });
  });

  describe('production validation', () => {
    let exitSpy;
    let errorSpy;

    beforeEach(() => {
      exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
      process.env.REDIS_URL = 'rediss://localhost:6379';
      process.env.JWT_SECRET = 'secure_secret_key';
      process.env.JUDGE0_CALLBACK_SECRET = 'secure_callback_secret';
    });

    afterEach(() => {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should exit if DATABASE_URL is missing', () => {
      delete process.env.DATABASE_URL;

      require('../config');

      expect(exitSpy).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('CRITICAL'),
        expect.stringContaining('DATABASE_URL')
      );
    });

    it('should exit if REDIS_URL is missing', () => {
      delete process.env.REDIS_URL;

      require('../config');

      expect(exitSpy).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('CRITICAL'),
        expect.stringContaining('REDIS_URL')
      );
    });

    it('should exit if REDIS_URL is not rediss:// in production', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';

      require('../config');

      expect(exitSpy).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('CRITICAL'),
        expect.stringContaining('REDIS_URL (must use rediss:// in production)')
      );
    });

    it('should exit if JWT_SECRET is missing', () => {
      delete process.env.JWT_SECRET;

      require('../config');

      expect(exitSpy).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('CRITICAL'),
        expect.stringContaining('JWT_SECRET')
      );
    });

    it('should exit if JWT_SECRET is the fallback', () => {
      process.env.JWT_SECRET = 'fallback_secret_do_not_use_in_prod';

      require('../config');

      expect(exitSpy).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('CRITICAL'),
        expect.stringContaining('JWT_SECRET')
      );
    });

    it('should exit if JUDGE0_CALLBACK_SECRET is missing', () => {
      delete process.env.JUDGE0_CALLBACK_SECRET;

      require('../config');

      expect(exitSpy).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('CRITICAL'),
        expect.stringContaining('JUDGE0_CALLBACK_SECRET')
      );
    });

    it('should not exit if all production variables are present', () => {
      require('../config');

      expect(exitSpy).not.toHaveBeenCalled();
    });
  });
});