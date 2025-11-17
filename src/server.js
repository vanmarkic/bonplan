/**
 * Le Syndicat des Tox - Main Server
 * Anonymous peer support forum for Belgian drug addict communities
 */

const express = require('express');
const path = require('path');
require('dotenv').config();

const logger = require('./utils/logger');
const db = require('./utils/database');
const redis = require('./utils/redis');
const i18n = require('./utils/i18n');

// Middleware
const securityMiddleware = require('./middleware/security');
const sessionMiddleware = require('./middleware/session');
const anonymizeMiddleware = require('./middleware/anonymize');
const errorHandler = require('./middleware/errorHandler');

// Routes
const authRoutes = require('./routes/auth');
const forumRoutes = require('./routes/forum');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

// Trust proxy (we're behind Nginx)
app.set('trust proxy', 1);

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Body parsing
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// i18n middleware
app.use(i18n.init);

// Security headers and CSP
app.use(securityMiddleware);

// Anonymization layer (CRITICAL: removes all IP tracking)
app.use(anonymizeMiddleware);

// Session management
app.use(sessionMiddleware);

// CSRF Protection
const csrfProtection = require('./middleware/csrf')();
app.use(csrfProtection.generate);
app.use(csrfProtection.verify);

// Static files
app.use('/public', express.static(path.join(__dirname, '../public'), {
  maxAge: '7d',
  immutable: true
}));

// Routes
app.use('/auth', authRoutes);
app.use('/', forumRoutes);

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling
app.use(errorHandler);

// Initialize database and Redis connections
async function initializeConnections() {
  try {
    // Test database connection
    await db.query('SELECT 1');
    logger.info('Database connection established');

    // Test Redis connection
    await redis.ping();
    logger.info('Redis connection established');

    return true;
  } catch (error) {
    logger.error('Failed to initialize connections:', error);
    throw error;
  }
}

// Graceful shutdown
function gracefulShutdown() {
  logger.info('Received shutdown signal, closing connections...');

  server.close(() => {
    logger.info('HTTP server closed');

    // Close database connection
    db.end((err) => {
      if (err) {
        logger.error('Error closing database connection:', err);
      } else {
        logger.info('Database connection closed');
      }

      // Close Redis connection
      redis.quit(() => {
        logger.info('Redis connection closed');
        process.exit(0);
      });
    });
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

// Start server
let server;

initializeConnections()
  .then(() => {
    server = app.listen(PORT, HOST, () => {
      logger.info(`Le Syndicat des Tox server running on http://${HOST}:${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info('Press CTRL+C to stop');
    });

    // Graceful shutdown handlers
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  })
  .catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = app;
