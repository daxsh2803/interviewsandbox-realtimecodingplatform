const redis = require('redis');
const config = require('../config');

const redisClient = redis.createClient({
  url: config.redisUrl,
});

const pubClient = redisClient.duplicate();
const subClient = redisClient.duplicate();

let isShuttingDown = false;
redisClient.on('error', (err) => { if (!isShuttingDown) console.error('Redis Client Error', err); });
pubClient.on('error', (err) => { if (!isShuttingDown) console.error('Redis PubClient Error', err); });
subClient.on('error', (err) => { if (!isShuttingDown) console.error('Redis SubClient Error', err); });

const connectPromise = Promise.all([
  redisClient.connect(),
  pubClient.connect(),
  subClient.connect(),
]).catch((err) => console.error('Redis Connect Error', err));

const closeRedis = async () => {
  isShuttingDown = true;
  const clients = [redisClient, pubClient, subClient];
  for (const client of clients) {
    if (client) {
      client.removeAllListeners('error');
      client.on('error', () => {}); // silence errors during shutdown
      try {
        if (client.isOpen) {
          await client.quit();
        } else {
          await client.disconnect();
        }
      } catch (err) {
        try {
          await client.disconnect();
        } catch (e) {}
      }
    }
  }
};

module.exports = {
  redisClient,
  pubClient,
  subClient,
  closeRedis,
};
