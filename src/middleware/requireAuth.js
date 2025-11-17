/**
 * Authentication Middleware
 * Ensures user is logged in before accessing protected routes
 */

const logger = require('../utils/logger');

/**
 * Require authenticated user
 */
function requireAuth(req, res, next) {
  // Check if user is in session
  if (!req.session || !req.session.user) {
    logger.warn('Unauthorized access attempt', {
      path: req.path,
      anonId: req.anonId
    });

    // Preserve the original URL for redirect after login
    const returnUrl = encodeURIComponent(req.originalUrl);
    return res.redirect(`/auth/login?return=${returnUrl}`);
  }

  // User is authenticated, proceed
  next();
}

/**
 * Soft auth check - doesn't redirect, just sets isAuthenticated flag
 */
function checkAuth(req, res, next) {
  res.locals.isAuthenticated = !!(req.session && req.session.user);
  res.locals.user = req.session?.user || null;
  next();
}

module.exports = {
  requireAuth,
  checkAuth
};