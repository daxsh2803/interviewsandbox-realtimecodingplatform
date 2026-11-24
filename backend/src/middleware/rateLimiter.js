const { redisClient, connectPromise } = require('../db/redis');
const config = require('../config');

// Fallback in-memory rate limiter cache for IP-based limiting when Redis is unavailable or closed
const fallbackRateLimitCache = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [k, record] of fallbackRateLimitCache.entries()) {
    if (now > record.resetTime) {
      fallbackRateLimitCache.delete(k);
    }
  }
}, 60000).unref();

/**
 * Factory for creating auth rate limiter middlewares.
 * Backed by Redis with atomic INCR and PEXPIRE.
 */
const createAuthRateLimiter = (options = {}) => {
  const getClient = () => {
    if (options.redisClient !== undefined) return options.redisClient;
    return redisClient;
  };

  return async function authRateLimiter(req, res, next) {
    const windowMs = options.windowMs || config.authRateLimit.windowMs || 15 * 60 * 1000;
    const maxRequests = options.max || config.authRateLimit.max || 10;
    const keyPrefix = options.keyPrefix || 'ratelimit:auth:';

    // Express 'trust proxy' setup correctly populates req.ip.
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${keyPrefix}${ip}`;

    try {
      const client = getClient();

      // If default Redis client is connecting, give it a moment to finish connecting
      if (client === redisClient && !client.isOpen && typeof connectPromise !== 'undefined') {
        let timeoutId;
        try {
          const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('timeout')), 500);
          });
          await Promise.race([connectPromise, timeoutPromise]);
        } catch (e) {
        } finally {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        }
      }

      if (client && client.isOpen && client.isReady) {
        const currentCount = await client.incr(key);
        let ttlMs;

        if (currentCount === 1) {
          await client.pExpire(key, windowMs);
          ttlMs = windowMs;
        } else {
          const pttl = await client.pTTL(key);
          if (pttl < 0) {
            await client.pExpire(key, windowMs);
            ttlMs = windowMs;
          } else {
            ttlMs = pttl;
          }
        }

        const resetSeconds = Math.ceil(ttlMs / 1000);

        if (typeof res.set === 'function') {
          res.set('RateLimit-Limit', String(maxRequests));
          res.set('RateLimit-Remaining', String(Math.max(0, maxRequests - currentCount)));
          res.set('RateLimit-Reset', String(resetSeconds));
        }

        if (currentCount > maxRequests) {
          if (typeof res.set === 'function') {
            res.set('Retry-After', String(resetSeconds));
          }
          return res.status(429).json({
            error: 'Too many authentication attempts. Please try again later.'
          });
        }

        return next();
      }
    } catch (error) {
      console.error('Redis auth rate limiter error:', error);
      // Fall through to in-memory fallback on Redis error
    }

    // Fallback in-memory rate limiter if Redis is unavailable or closed
    const now = Date.now();
    let record = fallbackRateLimitCache.get(key);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      fallbackRateLimitCache.set(key, record);
    } else {
      record.count++;
    }

    const resetSeconds = Math.ceil(Math.max(0, record.resetTime - now) / 1000);

    if (typeof res.set === 'function') {
      res.set('RateLimit-Limit', String(maxRequests));
      res.set('RateLimit-Remaining', String(Math.max(0, maxRequests - record.count)));
      res.set('RateLimit-Reset', String(resetSeconds));
    }

    if (record.count > maxRequests) {
      if (typeof res.set === 'function') {
        res.set('Retry-After', String(resetSeconds));
      }
      return res.status(429).json({
        error: 'Too many authentication attempts. Please try again later.'
      });
    }

    return next();
  };
};

const authRateLimiter = createAuthRateLimiter();

// Distributed rate limiter using Redis
// Limits each user to a certain number of execution requests per time window
const executionRateLimiter = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const windowMs = config.executionRateLimit.windowMs || 10000;
    const maxRequests = config.executionRateLimit.max || 5;

    const key = `ratelimit:execute:${userId}`;

    const currentCount = await redisClient.incr(key);

    if (currentCount === 1) {
      await redisClient.pExpire(key, windowMs);
    }

    if (currentCount > maxRequests) {
      return res.status(429).json({ error: 'Too many execution requests. Please wait.' });
    }

    next();
  } catch (error) {
    console.error('Rate limiter error:', error);
    // On Redis error, fail open to not block valid requests
    next();
  }
};

module.exports = {
  createAuthRateLimiter,
  authRateLimiter,
  executionRateLimiter,
  fallbackRateLimitCache
};
