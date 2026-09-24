const app = require('./src/app');
const config = require('./src/config');

app.listen(config.port, () => {
  console.log(`Server is running on port ${config.port} in ${config.nodeEnv} mode`);
});
