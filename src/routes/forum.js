/**
 * Forum Routes
 * Main forum pages and thread viewing
 */

const express = require('express');
const router = express.Router();

/**
 * GET /
 * Home page - list of threads
 */
router.get('/', (req, res) => {
  res.render('forum/index', {
    title: 'Le Syndicat des Tox',
    user: req.session.user || null,
    language: req.session.language || 'fr'
  });
});

/**
 * GET /about
 * About page with information and crisis resources
 */
router.get('/about', (req, res) => {
  res.render('forum/about', {
    title: 'À propos - Le Syndicat des Tox',
    user: req.session.user || null,
    language: req.session.language || 'fr'
  });
});

/**
 * GET /privacy
 * Privacy policy
 */
router.get('/privacy', (req, res) => {
  res.render('forum/privacy', {
    title: 'Vie privée - Le Syndicat des Tox',
    user: req.session.user || null,
    language: req.session.language || 'fr'
  });
});

module.exports = router;
