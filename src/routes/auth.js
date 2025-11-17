/**
 * Authentication Routes
 * Registration and login endpoints
 */

const express = require('express');

const router = express.Router();
const AuthService = require('../services/authService');
const logger = require('../utils/logger');

/**
 * GET /auth/register
 * Display registration form
 */
router.get('/register', (req, res) => {
  // If already logged in, redirect to home
  if (req.session && req.session.user) {
    return res.redirect('/');
  }

  res.render('auth/register', {
    title: 'Inscription - Le Syndicat des Tox',
    error: null,
    language: req.session.language || 'fr'
  });
});

/**
 * POST /auth/register
 * Handle registration
 */
router.post('/register', async (req, res) => {
  try {
    const { pseudo, pin, language } = req.body;

    // Register user
    const result = await AuthService.register(pseudo, pin, language || 'fr');

    // Auto-login after registration
    req.session.user = {
      pseudo: result.pseudo,
      isModerator: false,
      preferredLanguage: language || 'fr'
    };

    logger.info('New user registered and logged in', { pseudo: result.pseudo });

    res.redirect('/');
  } catch (error) {
    logger.warn('Registration failed', { error: error.message });

    res.render('auth/register', {
      title: 'Inscription - Le Syndicat des Tox',
      error: error.message,
      pseudo: req.body.pseudo || '',
      language: req.body.language || 'fr'
    });
  }
});

/**
 * GET /auth/login
 * Display login form
 */
router.get('/login', (req, res) => {
  // If already logged in, redirect to home
  if (req.session && req.session.user) {
    return res.redirect('/');
  }

  res.render('auth/login', {
    title: 'Connexion - Le Syndicat des Tox',
    error: null,
    language: req.session.language || 'fr'
  });
});

/**
 * POST /auth/login
 * Handle login
 */
router.post('/login', async (req, res) => {
  try {
    const { pseudo, pin } = req.body;

    // Login user
    const user = await AuthService.login(pseudo, pin);

    // Set session
    req.session.user = user;

    logger.info('User logged in', { pseudo: user.pseudo });

    // Redirect to home or return path
    const returnTo = req.query.return || '/';
    res.redirect(returnTo);
  } catch (error) {
    logger.warn('Login failed', { error: error.message });

    res.render('auth/login', {
      title: 'Connexion - Le Syndicat des Tox',
      error: error.message,
      pseudo: req.body.pseudo || '',
      language: req.session.language || 'fr'
    });
  }
});

/**
 * POST /auth/logout
 * Handle logout
 */
router.post('/logout', (req, res) => {
  const pseudo = req.session.user?.pseudo;

  req.session.destroy((err) => {
    if (err) {
      logger.error('Session destruction error', err);
      return res.redirect('/');
    }

    if (pseudo) {
      logger.info('User logged out', { pseudo });
    }

    res.redirect('/');
  });
});

/**
 * GET /auth/logout (for convenience, but POST is preferred)
 */
router.get('/logout', (req, res) => {
  res.render('auth/logout', {
    title: 'Déconnexion - Le Syndicat des Tox',
    language: req.session.language || 'fr'
  });
});

module.exports = router;
