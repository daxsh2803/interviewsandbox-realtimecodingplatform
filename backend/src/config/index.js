require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

module.exports = {
  port: process.env.PORT || 5000,
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  nodeEnv: process.env.NODE_ENV || 'development',
};
