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

  describe('production validation', () => {
    let exitSpy;
    let errorSpy;

    beforeEach(() => {
      exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.JWT_SECRET = 'secure_secret_key';
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
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('CRITICAL'), expect.stringContaining('DATABASE_URL'));
    });

    it('should exit if REDIS_URL is missing', () => {
      delete process.env.REDIS_URL;
      require('../config');
      expect(exitSpy).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('CRITICAL'), expect.stringContaining('REDIS_URL'));
    });

    it('should exit if JWT_SECRET is missing', () => {
      delete process.env.JWT_SECRET;
      require('../config');
      expect(exitSpy).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('CRITICAL'), expect.stringContaining('JWT_SECRET'));
    });

    it('should exit if JWT_SECRET is the fallback', () => {
      process.env.JWT_SECRET = 'fallback_secret_do_not_use_in_prod';
      require('../config');
      expect(exitSpy).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('CRITICAL'), expect.stringContaining('JWT_SECRET'));
    });

    it('should not exit if all production variables are present', () => {
      require('../config');
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });
});
