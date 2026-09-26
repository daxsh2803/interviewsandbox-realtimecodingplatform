require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

module.exports = {
  port: process.env.PORT || 5000,
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod',
  judge0: {
    baseUrl: process.env.JUDGE0_BASE_URL || 'http://localhost:2358',
    apiKey: process.env.JUDGE0_API_KEY,
    callbackUrl: process.env.JUDGE0_CALLBACK_URL || 'http://localhost:5000/api/executions/judge0/callback',
    callbackSecret: process.env.JUDGE0_CALLBACK_SECRET || 'fallback_judge0_webhook_secret',
    cpuTimeLimit: parseFloat(process.env.JUDGE0_CPU_TIME_LIMIT) || 2.0,
    wallTimeLimit: parseFloat(process.env.JUDGE0_WALL_TIME_LIMIT) || 5.0,
    memoryLimit: parseInt(process.env.JUDGE0_MEMORY_LIMIT, 10) || 128000,
  },
};
