const { redisClient } = require('../db/redis');
const config = require('../config');

// In-memory rate limiter cache for IP-based limiting (Auth routes)
// Limitations: Limits are reset on process restart. Does not sync across multiple instances.
const rateLimitCache = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitCache.entries()) {
    if (now > record.resetTime) {
      rateLimitCache.delete(ip);
    }
  }
}, 60000).unref();

exports.authRateLimiter = (req, res, next) => {
  const windowMs = config.authRateLimit.windowMs || 15 * 60 * 1000;
  const maxRequests = config.authRateLimit.max || 10;

  // Express 'trust proxy' setup correctly populates req.ip.
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  if (!rateLimitCache.has(ip)) {
    rateLimitCache.set(ip, { count: 1, resetTime: now + windowMs });
    return next();
  }

  const record = rateLimitCache.get(ip);
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
    return next();
  }

  if (record.count >= maxRequests) {
    return res.status(429).json({ error: 'Too many authentication attempts. Please try again later.' });
  }

  record.count++;
  next();
};

// Distributed rate limiter using Redis
// Limits each user to a certain number of execution requests per time window
exports.executionRateLimiter = async (req, res, next) => {
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
