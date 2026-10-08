require('dotenv').config({
  path: require('path').resolve(__dirname, '../../../.env')
});

module.exports = {
  port: process.env.PORT || 5000,
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret:
    process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod',

  judge0: {
    baseUrl: process.env.JUDGE0_BASE_URL || 'http://localhost:2358',
    apiKey: process.env.JUDGE0_API_KEY,
    callbackUrl:
      process.env.JUDGE0_CALLBACK_URL ||
      'http://localhost:5000/api/executions/judge0/callback',
    callbackSecret:
      process.env.JUDGE0_CALLBACK_SECRET ||
      'fallback_judge0_webhook_secret',
    cpuTimeLimit: parseFloat(process.env.JUDGE0_CPU_TIME_LIMIT) || 2.0,
    wallTimeLimit: parseFloat(process.env.JUDGE0_WALL_TIME_LIMIT) || 5.0,
    memoryLimit:
      parseInt(process.env.JUDGE0_MEMORY_LIMIT, 10) || 128000,
  },

  authRateLimit: {
    windowMs:
      parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10) ||
      15 * 60 * 1000,
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 10,
  },

  executionRateLimit: {
    windowMs:
      parseInt(process.env.EXEC_RATE_LIMIT_WINDOW_MS, 10) || 10000,
    max: parseInt(process.env.EXEC_RATE_LIMIT_MAX, 10) || 5,
  },

  yjsUpdateRateLimit: {
    windowMs:
      parseInt(process.env.YJS_UPDATE_RATE_LIMIT_WINDOW_MS, 10) ||
      1000,
    max:
      parseInt(process.env.YJS_UPDATE_RATE_LIMIT_MAX, 10) || 60,
  },
};

if (module.exports.nodeEnv === 'production') {
  const missing = [];

  if (!process.env.DATABASE_URL) {
    missing.push('DATABASE_URL');
  }

  if (!process.env.REDIS_URL) {
    missing.push('REDIS_URL');
  } else if (!process.env.REDIS_URL.startsWith('rediss://')) {
    missing.push('REDIS_URL (must use rediss:// in production)');
  }

  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET === 'fallback_secret_do_not_use_in_prod'
  ) {
    missing.push('JWT_SECRET (must be securely set)');
  }

  // Required in production because Judge0 callbacks must be authenticated.
  if (
    !process.env.JUDGE0_CALLBACK_SECRET ||
    process.env.JUDGE0_CALLBACK_SECRET ===
      'fallback_judge0_webhook_secret'
  ) {
    missing.push('JUDGE0_CALLBACK_SECRET (must be securely set)');
  }

  if (missing.length > 0) {
    console.error(
      'CRITICAL: Missing required production environment variables:',
      missing.join(', ')
    );

    process.exit(1);
  }
}