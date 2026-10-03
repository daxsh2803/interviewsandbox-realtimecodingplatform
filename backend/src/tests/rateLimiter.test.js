const { authRateLimiter } = require('../middleware/rateLimiter');

describe('Rate Limiter Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      ip: '192.168.1.1',
      headers: {},
      socket: { remoteAddress: '192.168.1.1' }
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await require('../db/redis').closeRedis();
  });

  it('should allow requests under the limit', () => {
    // Override config values if we were testing the exact threshold,
    // but the default is 10. So sending 1 request should pass.
    authRateLimiter(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should block requests over the limit with a 429 status', () => {
    // Generate a strictly unique IP to avoid global rateLimitCache collisions between test runs
    const uniqueIp = `10.0.0.${Math.floor(Math.random() * 255) + 1}-${Date.now()}`;
    req.ip = uniqueIp;
    req.socket.remoteAddress = uniqueIp;

    // Default limit is 10
    for (let i = 0; i < 10; i++) {
      authRateLimiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(i + 1);
    }

    // The 11th request should be blocked
    authRateLimiter(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ error: 'Too many authentication attempts. Please try again later.' });
    expect(next).toHaveBeenCalledTimes(10);
  });
});
