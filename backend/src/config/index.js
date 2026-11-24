require('dotenv').config({
  path: require('path').resolve(__dirname, '../../../.env')
});

const parseTrustProxy = (value) => {
  if (value === undefined || value === null || value === '') {
    return 1;
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  const num = Number(value);
  if (!isNaN(num)) return num;
  return value;
};

const getDatabaseUrl = () => {
  if (process.env.NODE_ENV === 'test') {
    if (process.env.TEST_DATABASE_URL) {
      return process.env.TEST_DATABASE_URL;
    }
    // Safe fallback in CI where only DATABASE_URL is configured
    if (process.env.CI) {
      return process.env.DATABASE_URL;
    }
    // Safety guard / clear warning if pointing at non-test DB locally
    const dbUrl = process.env.DATABASE_URL || '';
    if (dbUrl && !dbUrl.includes('test')) {
      console.warn(
        '⚠️  WARNING: Running tests against non-test database! Set TEST_DATABASE_URL to avoid wiping development data.'
      );
    }
    return process.env.DATABASE_URL;
  }
  return process.env.DATABASE_URL;
};

module.exports = {
  port: process.env.PORT || 5000,
  databaseUrl: getDatabaseUrl(),
  testDatabaseUrl: process.env.TEST_DATABASE_URL || null,
  redisUrl: process.env.REDIS_URL,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret:
    process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod',
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),

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
    webhookPayloadLimit: process.env.JUDGE0_WEBHOOK_PAYLOAD_LIMIT || '5mb',
  },

  reconciliation: {
    enabled: process.env.RECONCILIATION_ENABLED !== 'false',
    intervalMs: parseInt(process.env.RECONCILIATION_INTERVAL_MS, 10) || 60000,
    staleThresholdMs: parseInt(process.env.RECONCILIATION_STALE_THRESHOLD_MS, 10) || 120000,
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