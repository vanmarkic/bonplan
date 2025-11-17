/**
 * Error Handler Middleware
 * Centralized error handling with security considerations
 */

const logger = require('../utils/logger');

module.exports = (err, req, res, next) => {
  // Log error (logger will redact sensitive data)
  logger.error('Application error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Determine status code
  const statusCode = err.statusCode || err.status || 500;

  // Never expose internal error details in production
  const isProduction = process.env.NODE_ENV === 'production';

  const response = {
    success: false,
    error: isProduction ? 'An error occurred' : err.message,
    timestamp: new Date().toISOString()
  };

  // Add stack trace in development only
  if (!isProduction && err.stack) {
    response.stack = err.stack;
  }

  // Send appropriate response based on Accept header
  if (req.accepts('html')) {
    res.status(statusCode).render('error', {
      title: 'Erreur',
      statusCode,
      message: response.error,
      backUrl: req.headers.referer || '/'
    });
  } else {
    res.status(statusCode).json(response);
  }
};
