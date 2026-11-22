const config = require('../config');

const notFoundHandler = (req, res, next) => {
  res.status(404).json({ error: 'Not Found' });
};

const globalErrorHandler = (err, req, res, next) => {
  console.error(err.stack);
  
  const status = err.status || err.statusCode || 500;

  // Do not leak stack traces or internal DB errors in production
  const response = {
    error: status === 500 ? 'Internal Server Error' : err.message
  };
  
  if (config.nodeEnv !== 'production' && status === 500) {
    response.message = err.message;
    response.stack = err.stack;
  }

  res.status(status).json(response);
};

module.exports = {
  notFoundHandler,
  globalErrorHandler,
};
