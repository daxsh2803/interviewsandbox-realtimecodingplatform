const http = require('http');
const app = require('./src/app');
const config = require('./src/config');
const { initSocket, getSocketIo } = require('./src/socket');
const db = require('./src/db');
const { closeRedis } = require('./src/db/redis');

const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

server.listen(config.port, () => {
  console.log(`Server is running on port ${config.port} in ${config.nodeEnv} mode`);
});

let isShuttingDown = false;

const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

  const forceExitTimeout = setTimeout(() => {
    console.error('Graceful shutdown timed out (10s). Forcing exit.');
    process.exit(1);
  }, 10000);
  forceExitTimeout.unref();

  try {
    // 1. Stop accepting new HTTP requests
    await new Promise((resolve) => {
      console.log('Closing HTTP server...');
      server.close((err) => {
        if (err) console.error('HTTP server close error:', err);
        else console.log('HTTP server closed.');
        resolve();
      });
    });

    // 2. Close Socket.io (which disconnects all clients)
    const io = getSocketIo();
    if (io) {
      console.log('Closing Socket.io server...');
      await new Promise((resolve) => io.close(resolve));
      console.log('Socket.io server closed.');
    }

    // 3. Close PostgreSQL pool
    console.log('Closing PostgreSQL pool...');
    await db.pool.end();
    console.log('PostgreSQL pool closed.');

    // 4. Close Redis clients
    console.log('Closing Redis clients...');
    await closeRedis();
    console.log('Redis clients closed.');

    console.log('Graceful shutdown completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Error during graceful shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
