const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const { notFoundHandler, globalErrorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());

// API routes
app.use('/api', routes);

// Error handling
app.use(notFoundHandler);
app.use(globalErrorHandler);

module.exports = app;
