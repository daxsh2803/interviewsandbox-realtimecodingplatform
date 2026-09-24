const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const redis = require('redis');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Initialize PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Initialize Redis client
const redisClient = redis.createClient({
  url: process.env.REDIS_URL
});
redisClient.connect().catch(console.error);

// Health check endpoint
app.get('/api/health', async (req, res) => {
  let dbStatus = 'disconnected';
  let redisStatus = 'disconnected';
  
  try {
    const dbRes = await pool.query('SELECT 1');
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
});

// 404 Handler
app.use((req, res, next) => {
  res.status(404).json({ error: 'Not Found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
