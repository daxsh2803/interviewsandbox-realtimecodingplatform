const { Pool } = require('pg');
const config = require('../config');

const poolConfig = {
  connectionString: config.databaseUrl,
};

if (config.nodeEnv === 'production') {
  poolConfig.ssl = {
    rejectUnauthorized: true,
  };
  if (config.databaseCaCert) {
    poolConfig.ssl.ca = config.databaseCaCert;
  }
}

const pool = new Pool(poolConfig);

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
