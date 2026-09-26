const redisClient = require('../db/redis').redisClient;

// Simple distributed rate limiter using Redis
// Limits each user to a certain number of execution requests per time window
exports.executionRateLimiter = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const windowMs = 10000; // 10 seconds
    const maxRequests = 5; // 5 requests per 10 seconds
    
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
