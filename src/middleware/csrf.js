/**
 * CSRF Protection Middleware
 * Protects against Cross-Site Request Forgery attacks
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Generate CSRF token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * CSRF middleware factory
 */
function csrfProtection(options = {}) {
  const {
    sessionKey = '_csrf',
    paramKey = '_csrf',
    headerKey = 'x-csrf-token',
    skipPaths = []
  } = options;

  return {
    // Generate and store token
    generate: (req, res, next) => {
      if (!req.session[sessionKey]) {
        req.session[sessionKey] = generateToken();
      }

      // Make token available to views
      res.locals.csrfToken = req.session[sessionKey];

      next();
    },

    // Verify token on state-changing requests
    verify: (req, res, next) => {
      // Skip GET and HEAD requests
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
      }

      // Skip specified paths
      if (skipPaths.some((path) => req.path.startsWith(path))) {
        return next();
      }

      const sessionToken = req.session[sessionKey];
      if (!sessionToken) {
        logger.warn('CSRF token missing in session', {
          path: req.path,
          anonId: req.anonId
        });

        return res.status(403).render('error', {
          title: 'Erreur de sécurité',
          statusCode: 403,
          message: 'Token de sécurité invalide',
          description: 'Veuillez rafraîchir la page et réessayer.',
          backUrl: req.get('Referrer') || '/',
          user: req.session?.user || null,
          language: req.session?.language || 'fr'
        });
      }

      // Check token from body, query, or header
      const requestToken = req.body[paramKey]
                          || req.query[paramKey]
                          || req.get(headerKey);

      if (!requestToken || requestToken !== sessionToken) {
        logger.warn('CSRF token mismatch', {
          path: req.path,
          anonId: req.anonId,
          user: req.session?.user?.pseudo
        });

        return res.status(403).render('error', {
          title: 'Erreur de sécurité',
          statusCode: 403,
          message: 'Token de sécurité invalide',
          description: 'Veuillez rafraîchir la page et réessayer.',
          backUrl: req.get('Referrer') || '/',
          user: req.session?.user || null,
          language: req.session?.language || 'fr'
        });
      }

      next();
    }
  };
}

module.exports = csrfProtection;
