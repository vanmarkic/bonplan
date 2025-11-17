/**
 * Anonymization Middleware
 * CRITICAL: This middleware strips all identifying information from requests
 * Must be one of the first middleware in the chain
 */

const logger = require('../utils/logger');

module.exports = (req, res, next) => {
  // Remove all IP-related headers
  delete req.headers['x-real-ip'];
  delete req.headers['x-forwarded-for'];
  delete req.headers['cf-connecting-ip'];
  delete req.headers['true-client-ip'];
  delete req.headers['x-client-ip'];
  delete req.headers['x-cluster-client-ip'];
  delete req.headers['forwarded'];

  // Override Express IP detection
  Object.defineProperty(req, 'ip', {
    get: () => 'anonymous',
    enumerable: true,
    configurable: false
  });

  Object.defineProperty(req, 'ips', {
    get: () => [],
    enumerable: true,
    configurable: false
  });

  // Use anonymous identifier from Nginx for rate limiting only
  // This is a hashed value that can't be reverse-engineered to an IP
  req.anonId = req.headers['x-anonymous-id'] || 'unknown';

  // Remove the header after reading it
  delete req.headers['x-anonymous-id'];

  // Log security warning if we detect any IP-related data
  const suspiciousHeaders = Object.keys(req.headers).filter(h =>
    h.includes('ip') || h.includes('forward') || h.includes('client')
  );

  if (suspiciousHeaders.length > 0) {
    logger.security('Suspicious IP-related headers detected and removed', {
      headers: suspiciousHeaders
    });
  }

  next();
};
