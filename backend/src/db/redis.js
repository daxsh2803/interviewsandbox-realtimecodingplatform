const redis = require('redis');
const config = require('../config');

const redisClient = redis.createClient({
  url: config.redisUrl,
});

const pubClient = redisClient.duplicate();
const subClient = redisClient.duplicate();

redisClient.on('error', (err) => console.error('Redis Client Error', err));
pubClient.on('error', (err) => console.error('Redis PubClient Error', err));
subClient.on('error', (err) => console.error('Redis SubClient Error', err));

// Connect on initialization
Promise.all([
  redisClient.connect(),
  pubClient.connect(),
  subClient.connect(),
]).catch(console.error);

module.exports = {
  redisClient,
  pubClient,
  subClient,
};
