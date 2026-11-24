const { authRateLimiter, createAuthRateLimiter } = require('../middleware/rateLimiter');
const { redisClient, connectPromise, closeRedis } = require('../db/redis');

describe('Rate Limiter Middleware', () => {
  let req, res, next;

  beforeAll(async () => {
    if (connectPromise) {
      await connectPromise;
    }
  });

  beforeEach(async () => {
    req = {
      ip: '192.168.1.1',
      headers: {},
      socket: { remoteAddress: '192.168.1.1' }
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      set: jest.fn().mockReturnThis()
    };
    next = jest.fn();

    // Clean up test keys from Redis
    try {
      if (redisClient && redisClient.isOpen) {
        const keys = await redisClient.keys('ratelimit:auth:*');
        if (keys.length > 0) {
          await redisClient.del(keys);
        }
      }
    } catch (e) {}
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    try {
      if (redisClient && redisClient.isOpen) {
        const keys = await redisClient.keys('ratelimit:auth:*');
        if (keys.length > 0) {
          await redisClient.del(keys);
        }
      }
    } catch (e) {}
    await closeRedis();
  });

  it('should allow requests under the limit and set standard rate limit headers', async () => {
    const uniqueIp = `10.1.0.${Math.floor(Math.random() * 250) + 1}-${Date.now()}`;
    req.ip = uniqueIp;

    await authRateLimiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith('RateLimit-Limit', '10');
    expect(res.set).toHaveBeenCalledWith('RateLimit-Remaining', '9');
    expect(res.set).toHaveBeenCalledWith('RateLimit-Reset', expect.any(String));
  });

  it('should block requests over the limit with a 429 status, clear error message, and rate-limit headers', async () => {
    const uniqueIp = `10.2.0.${Math.floor(Math.random() * 250) + 1}-${Date.now()}`;
    req.ip = uniqueIp;

    // Default limit is 10
    for (let i = 0; i < 10; i++) {
      await authRateLimiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(i + 1);
    }

    // The 11th request should be blocked
    await authRateLimiter(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Too many authentication attempts. Please try again later.'
    });
    expect(res.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
    expect(res.set).toHaveBeenCalledWith('RateLimit-Remaining', '0');
    expect(next).toHaveBeenCalledTimes(10);
  });

  it('should persist rate-limit counters in Redis across multiple middleware instances', async () => {
    const uniqueIp = `10.3.0.${Math.floor(Math.random() * 250) + 1}-${Date.now()}`;
    req.ip = uniqueIp;

    // Simulate two independent backend instances sharing the same Redis client and state
    const instanceA = createAuthRateLimiter({ redisClient, max: 4, windowMs: 60000 });
    const instanceB = createAuthRateLimiter({ redisClient, max: 4, windowMs: 60000 });

    // Instance A processes 2 requests
    await instanceA(req, res, next);
    await instanceA(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);

    // Instance B processes next 2 requests (reaches limit of 4)
    await instanceB(req, res, next);
    await instanceB(req, res, next);
    expect(next).toHaveBeenCalledTimes(4);

    // 5th request to Instance B should be blocked by shared Redis counter
    await instanceB(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Too many authentication attempts. Please try again later.'
    });
    expect(next).toHaveBeenCalledTimes(4);

    // Verify key in Redis
    const key = `ratelimit:auth:${uniqueIp}`;
    const count = await redisClient.get(key);
    expect(Number(count)).toBe(5);

    const ttl = await redisClient.pTTL(key);
    expect(ttl).toBeGreaterThan(0);
  });

  it('should fall back gracefully to in-memory limiting when Redis client is closed or unavailable', async () => {
    const uniqueIp = `10.4.0.${Math.floor(Math.random() * 250) + 1}-${Date.now()}`;
    req.ip = uniqueIp;

    // Simulate an instance with a closed/disconnected Redis client
    const disconnectedLimiter = createAuthRateLimiter({
      redisClient: { isOpen: false, isReady: false },
      max: 2,
      windowMs: 60000
    });

    await disconnectedLimiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    await disconnectedLimiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);

    // 3rd request exceeds limit of 2
    await disconnectedLimiter(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Too many authentication attempts. Please try again later.'
    });
    expect(next).toHaveBeenCalledTimes(2);
  });
});
