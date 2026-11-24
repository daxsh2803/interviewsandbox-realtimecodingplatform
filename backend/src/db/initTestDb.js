const { Pool } = require('pg');
const config = require('../config');
const { runMigrations } = require('./migrate');

async function initTestDb() {
  const testDbUrl = process.env.TEST_DATABASE_URL || config.testDatabaseUrl;

  if (!testDbUrl) {
    if (process.env.CI) {
      console.log('CI environment detected without TEST_DATABASE_URL; using default DATABASE_URL.');
      return;
    }
    console.warn('⚠️  No TEST_DATABASE_URL configured. Falling back to default database.');
    return;
  }

  const url = new URL(testDbUrl);
  const targetDbName = url.pathname.slice(1);

  if (!/^[a-zA-Z0-9_]+$/.test(targetDbName)) {
    throw new Error(`Invalid test database name: "${targetDbName}"`);
  }

  // Connect to postgres default maintenance database to check / create the target database
  const adminUrl = new URL(testDbUrl);
  adminUrl.pathname = '/postgres';

  const adminPool = new Pool({ connectionString: adminUrl.toString() });
  const adminClient = await adminPool.connect();

  try {
    const res = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [targetDbName]
    );

    if (res.rowCount === 0) {
      console.log(`Creating test database "${targetDbName}"...`);
      await adminClient.query(`CREATE DATABASE ${targetDbName}`);
      console.log(`Test database "${targetDbName}" created successfully.`);
    } else {
      console.log(`Test database "${targetDbName}" already exists.`);
    }
  } finally {
    adminClient.release();
    await adminPool.end();
  }

  // Run migrations against the test database
  console.log(`Running migrations against "${targetDbName}"...`);
  const testPool = new Pool({ connectionString: testDbUrl });
  try {
    await runMigrations(testPool);
    console.log(`Test database "${targetDbName}" is ready for testing.`);
  } finally {
    await testPool.end();
  }
}

if (require.main === module) {
  initTestDb()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Failed to initialize test database:', err);
      process.exit(1);
    });
}

module.exports = { initTestDb };
