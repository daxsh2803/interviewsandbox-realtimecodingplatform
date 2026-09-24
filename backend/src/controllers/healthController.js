const db = require('../db');
const redisClient = require('../db/redis');

const checkHealth = async (req, res, next) => {
  let dbStatus = 'disconnected';
  let redisStatus = 'disconnected';

  try {
    const dbRes = await db.query('SELECT 1');
    if (dbRes.rowCount === 1) dbStatus = 'connected';
  } catch (err) {
    dbStatus = `error: ${err.message}`;
  }

  try {
    const redisPing = await redisClient.ping();
    if (redisPing === 'PONG') redisStatus = 'connected';
  } catch (err) {
    redisStatus = `error: ${err.message}`;
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    postgres: dbStatus,
    redis: redisStatus
  });
};

module.exports = {
  checkHealth,
};
