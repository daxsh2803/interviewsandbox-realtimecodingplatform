const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const routes = require('./routes');
const { notFoundHandler, globalErrorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(cors({
  origin: process.env.VITE_FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// API routes
app.use('/api', routes);

// Error handling
app.use(notFoundHandler);
app.use(globalErrorHandler);

module.exports = app;
