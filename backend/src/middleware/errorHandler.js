const config = require('../config');

const notFoundHandler = (req, res, next) => {
  res.status(404).json({ error: 'Not Found' });
};

const globalErrorHandler = (err, req, res, next) => {
  console.error(err.stack);
  
  // Do not leak stack traces or internal DB errors in production
  const response = {
    error: 'Internal Server Error'
  };
  
  if (config.nodeEnv !== 'production') {
    response.message = err.message;
    response.stack = err.stack;
  }

  res.status(500).json(response);
};

module.exports = {
  notFoundHandler,
  globalErrorHandler,
};
