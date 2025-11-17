/**
 * Moderator Middleware
 * Ensures user has moderator privileges before accessing admin routes
 */

const logger = require('../utils/logger');

/**
 * Require moderator privileges
 */
function requireModerator(req, res, next) {
  // Check if user is logged in
  if (!req.session || !req.session.user) {
    logger.warn('Unauthenticated moderator access attempt', {
      path: req.path,
      anonId: req.anonId
    });

    const returnUrl = encodeURIComponent(req.originalUrl);
    return res.redirect(`/auth/login?return=${returnUrl}`);
  }

  // Check if user is moderator
  if (!req.session.user.isModerator) {
    logger.warn('Unauthorized moderator access attempt', {
      path: req.path,
      user: req.session.user.pseudo,
      anonId: req.anonId
    });

    return res.status(403).render('error', {
      title: 'Accès refusé',
      statusCode: 403,
      message: 'Accès modérateur requis',
      description: 'Cette section est réservée aux modérateurs.',
      backUrl: '/',
      user: req.session.user,
      language: req.session.language || 'fr'
    });
  }

  // User is moderator, proceed
  next();
}

/**
 * Soft moderator check - doesn't redirect, just sets isModerator flag
 */
function checkModerator(req, res, next) {
  res.locals.isModerator = !!(req.session?.user?.isModerator);
  next();
}

module.exports = {
  requireModerator,
  checkModerator
};
