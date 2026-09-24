const fs = require('fs');
const path = require('path');
const { pool } = require('./index'); // Uses the existing pool

async function runMigrations() {
  const client = await pool.connect();
  try {
    // 1. Ensure migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Read migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('Migrations directory does not exist. Nothing to run.');
      return;
    }
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    // 3. Apply pending migrations
    for (const file of files) {
      const { rowCount } = await client.query('SELECT id FROM migrations WHERE name = $1', [file]);
      if (rowCount === 0) {
        console.log(`Applying migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
          await client.query('COMMIT');
          console.log(`Successfully applied: ${file}`);
        } catch (error) {
          await client.query('ROLLBACK');
          console.error(`Error applying migration ${file}:`, error);
          throw error;
        }
      }
    }
    console.log('All migrations applied successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    // Close the pool so the process can exit
    await pool.end();
  }
}

runMigrations();
