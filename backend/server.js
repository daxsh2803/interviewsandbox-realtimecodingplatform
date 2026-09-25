const http = require('http');
const app = require('./src/app');
const config = require('./src/config');
const { initSocket } = require('./src/socket');

const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

server.listen(config.port, () => {
  console.log(`Server is running on port ${config.port} in ${config.nodeEnv} mode`);
});
