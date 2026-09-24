const redis = require('redis');
const config = require('../config');

const redisClient = redis.createClient({
  url: config.redisUrl,
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

// Connect on initialization
redisClient.connect().catch(console.error);

module.exports = redisClient;
