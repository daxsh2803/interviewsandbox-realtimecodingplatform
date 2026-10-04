const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const routes = require('./routes');
const { notFoundHandler, globalErrorHandler } = require('./middleware/errorHandler');
const path = require('path');
const config = require('./config');

const app = express();
app.set('trust proxy', 1); // Trust the Nginx reverse proxy

app.use(cors({
  origin: process.env.VITE_FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// API routes
app.use('/api', routes);

// Serve frontend in production
if (config.nodeEnv === 'production') {
  const frontendDist = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDist));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || !req.accepts('html')) {
      return next();
    }
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Error handling
app.use(notFoundHandler);
app.use(globalErrorHandler);

module.exports = app;
