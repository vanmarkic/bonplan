/**
 * Forum Routes
 * Complete forum functionality with threads, replies, and moderation
 */

const express = require('express');

const router = express.Router();
const {
  body, param, query, validationResult
} = require('express-validator');

// Models
const Thread = require('../models/Thread');
const Reply = require('../models/Reply');
const User = require('../models/User');

// Services
const ReportService = require('../services/reportService');

// Database
const db = require('../utils/database');

// Middleware
const { requireAuth, checkAuth } = require('../middleware/requireAuth');
const { requireModerator, checkModerator } = require('../middleware/requireModerator');
const csrfProtection = require('../middleware/csrf')();
const { rateLimiters } = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

// Apply CSRF protection to all routes
router.use(csrfProtection.generate);
router.use(csrfProtection.verify);

// Apply general auth check to all routes
router.use(checkAuth);
router.use(checkModerator);

/**
 * Validation error handler helper
 */
const handleValidationErrors = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return errors.array().map((err) => err.msg).join(', ');
  }
  return null;
};

/**
 * Flash message helper
 */
const setFlashMessage = (req, type, message) => {
  req.session.flash = { type, message };
};

const getFlashMessage = (req) => {
  const { flash } = req.session;
  delete req.session.flash;
  return flash;
};

// ============================================================================
// PUBLIC ROUTES
// ============================================================================

/**
 * GET /
 * Home page with thread list
 */
router.get('/', rateLimiters.general, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const language = req.query.lang || req.session.language || 'fr';
    const sort = req.query.sort || 'recent';

    // Calculate offset
    const limit = 25;
    const offset = (page - 1) * limit;

    // Get threads
    const threads = await Thread.findAll({
      limit,
      offset,
      sort,
      language
    });

    // Get total count for pagination
    const totalThreads = await Thread.count({ language });
    const totalPages = Math.ceil(totalThreads / limit);

    res.render('forum/index', {
      title: 'Le Syndicat des Tox',
      threads,
      pagination: {
        current: page,
        total: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      filters: {
        language,
        sort
      },
      flash: getFlashMessage(req),
      user: req.session.user || null,
      language: req.session.language || 'fr'
    });
  } catch (error) {
    logger.error('Error loading home page', error);
    res.status(500).render('error', {
      title: 'Erreur',
      statusCode: 500,
      message: 'Erreur lors du chargement de la page',
      backUrl: '/',
      user: req.session.user || null,
      language: req.session.language || 'fr'
    });
  }
});

/**
 * GET /threads
 * Thread list with pagination and sorting
 */
router.get('/threads', rateLimiters.general, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const language = req.query.lang || req.session.language || 'fr';
    const sort = req.query.sort || 'recent';

    const limit = 25;
    const offset = (page - 1) * limit;

    const threads = await Thread.findAll({
      limit,
      offset,
      sort,
      language
    });

    const totalThreads = await Thread.count({ language });
    const totalPages = Math.ceil(totalThreads / limit);

    res.render('forum/threads', {
      title: 'Tous les fils - Le Syndicat des Tox',
      threads,
      pagination: {
        current: page,
        total: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      filters: {
        language,
        sort
      },
      flash: getFlashMessage(req),
      user: req.session.user || null,
      language: req.session.language || 'fr'
    });
  } catch (error) {
    logger.error('Error loading threads', error);
    res.status(500).render('error', {
      title: 'Erreur',
      statusCode: 500,
      message: 'Erreur lors du chargement des fils',
      backUrl: '/',
      user: req.session.user || null,
      language: req.session.language || 'fr'
    });
  }
});

/**
 * GET /threads/:id
 * View single thread with replies
 */
router.get('/threads/:id', [
  rateLimiters.general,
  param('id').isInt().withMessage('ID de fil invalide')
], async (req, res) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) {
      return res.status(400).render('error', {
        title: 'Erreur',
        statusCode: 400,
        message: validationError,
        backUrl: '/threads',
        user: req.session.user || null,
        language: req.session.language || 'fr'
      });
    }

    const threadId = parseInt(req.params.id);
    const page = parseInt(req.query.page) || 1;

    // Get thread
    const thread = await Thread.findById(threadId);

    if (!thread || thread.is_deleted) {
      return res.status(404).render('error', {
        title: 'Fil introuvable',
        statusCode: 404,
        message: 'Ce fil n\'existe pas ou a été supprimé',
        backUrl: '/threads',
        user: req.session.user || null,
        language: req.session.language || 'fr'
      });
    }

    // Check if thread is hidden (only moderators can view)
    if (thread.is_hidden && !res.locals.isModerator) {
      return res.status(403).render('error', {
        title: 'Fil masqué',
        statusCode: 403,
        message: 'Ce fil a été masqué par les modérateurs',
        backUrl: '/threads',
        user: req.session.user || null,
        language: req.session.language || 'fr'
      });
    }

    // Increment view count
    await Thread.incrementViewCount(threadId);

    // Get replies
    const limit = 50;
    const offset = (page - 1) * limit;
    const replies = await Reply.findByThreadId(threadId, { limit, offset });
    const totalReplies = await Reply.countByThreadId(threadId);
    const totalPages = Math.ceil(totalReplies / limit);

    // Check if user can edit thread (within 15 minutes)
    const canEdit = req.session.user
                   && req.session.user.pseudo === thread.author_pseudo
                   && (Date.now() - new Date(thread.created_at).getTime() < 15 * 60 * 1000);

    // Check if user can moderate
    const canModerate = res.locals.isModerator;

    res.render('forum/thread', {
      title: `${thread.title} - Le Syndicat des Tox`,
      thread,
      replies,
      pagination: {
        current: page,
        total: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      canEdit,
      canModerate,
      canReply: res.locals.isAuthenticated && !thread.is_locked,
      flash: getFlashMessage(req),
      user: req.session.user || null,
      language: req.session.language || 'fr'
    });
  } catch (error) {
    logger.error('Error loading thread', error);
    res.status(500).render('error', {
      title: 'Erreur',
      statusCode: 500,
      message: 'Erreur lors du chargement du fil',
      backUrl: '/threads',
      user: req.session.user || null,
      language: req.session.language || 'fr'
    });
  }
});

/**
 * GET /search
 * Search form
 */
router.get('/search', rateLimiters.general, (req, res) => {
  res.render('forum/search', {
    title: 'Rechercher - Le Syndicat des Tox',
    query: '',
    results: null,
    user: req.session.user || null,
    language: req.session.language || 'fr'
  });
});

/**
 * POST /search
 * Search results
 */
router.post('/search', [
  rateLimiters.searching,
  body('q').trim().isLength({ min: 2, max: 100 })
    .withMessage('La recherche doit contenir entre 2 et 100 caractères')
], async (req, res) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) {
      return res.render('forum/search', {
        title: 'Rechercher - Le Syndicat des Tox',
        query: req.body.q || '',
        results: null,
        error: validationError,
        user: req.session.user || null,
        language: req.session.language || 'fr'
      });
    }

    const searchTerm = req.body.q;
    const page = parseInt(req.body.page) || 1;
    const language = req.body.lang || req.session.language || 'fr';

    const limit = 25;
    const offset = (page - 1) * limit;

    const results = await Thread.search(searchTerm, {
      limit,
      offset,
      language
    });

    // For pagination, we'd need a count method for search results
    // For now, estimate based on results
    const hasMore = results.length === limit;

    res.render('forum/search', {
      title: 'Résultats de recherche - Le Syndicat des Tox',
      query: searchTerm,
      results,
      pagination: {
        current: page,
        hasNext: hasMore,
        hasPrev: page > 1
      },
      filters: { language },
      user: req.session.user || null,
      language: req.session.language || 'fr'
    });
  } catch (error) {
    logger.error('Search error', error);
    res.render('forum/search', {
      title: 'Rechercher - Le Syndicat des Tox',
      query: req.body.q || '',
      results: null,
      error: 'Erreur lors de la recherche',
      user: req.session.user || null,
      language: req.session.language || 'fr'
    });
  }
});

// ============================================================================
// PROTECTED ROUTES (Authentication Required)
// ============================================================================

/**
 * GET /threads/new
 * New thread form
 */
router.get('/threads/new', requireAuth, rateLimiters.general, (req, res) => {
  res.render('forum/thread-new', {
    title: 'Nouveau fil - Le Syndicat des Tox',
    error: null,
    formData: {},
    user: req.session.user,
    language: req.session.language || 'fr'
  });
});

/**
 * POST /threads/new
 * Create thread
 */
router.post('/threads/new', [
  requireAuth,
  rateLimiters.posting,
  body('title').trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Le titre doit contenir entre 5 et 200 caractères'),
  body('body').trim()
    .isLength({ min: 10, max: 10000 })
    .withMessage('Le contenu doit contenir entre 10 et 10000 caractères'),
  body('language').isIn(['fr', 'en', 'nl', 'de']).withMessage('Langue invalide')
], async (req, res) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) {
      return res.render('forum/thread-new', {
        title: 'Nouveau fil - Le Syndicat des Tox',
        error: validationError,
        formData: req.body,
        user: req.session.user,
        language: req.session.language || 'fr'
      });
    }

    const { title, body, language } = req.body;

    // Create thread
    const thread = await Thread.create(
      title,
      body,
      req.session.user.pseudo,
      language || 'fr'
    );

    logger.info('Thread created', {
      threadId: thread.id,
      author: req.session.user.pseudo
    });

    setFlashMessage(req, 'success', 'Fil créé avec succès');
    res.redirect(`/threads/${thread.id}`);
  } catch (error) {
    logger.error('Error creating thread', error);
    res.render('forum/thread-new', {
      title: 'Nouveau fil - Le Syndicat des Tox',
      error: 'Erreur lors de la création du fil',
      formData: req.body,
      user: req.session.user,
      language: req.session.language || 'fr'
    });
  }
});

/**
 * GET /threads/:id/edit
 * Edit thread form
 */
router.get('/threads/:id/edit', [
  requireAuth,
  rateLimiters.general,
  param('id').isInt().withMessage('ID de fil invalide')
], async (req, res) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) {
      return res.status(400).render('error', {
        title: 'Erreur',
        statusCode: 400,
        message: validationError,
        backUrl: '/threads',
        user: req.session.user,
        language: req.session.language || 'fr'
      });
    }

    const thread = await Thread.findById(parseInt(req.params.id));

    if (!thread || thread.is_deleted) {
      return res.status(404).render('error', {
        title: 'Fil introuvable',
        statusCode: 404,
        message: 'Ce fil n\'existe pas ou a été supprimé',
        backUrl: '/threads',
        user: req.session.user,
        language: req.session.language || 'fr'
      });
    }

    // Check ownership
    if (thread.author_pseudo !== req.session.user.pseudo) {
      return res.status(403).render('error', {
        title: 'Accès refusé',
        statusCode: 403,
        message: 'Vous ne pouvez modifier que vos propres fils',
        backUrl: `/threads/${thread.id}`,
        user: req.session.user,
        language: req.session.language || 'fr'
      });
    }

    // Check edit window (15 minutes)
    const canEdit = (Date.now() - new Date(thread.created_at).getTime()) < 15 * 60 * 1000;
    if (!canEdit) {
      return res.status(403).render('error', {
        title: 'Délai expiré',
        statusCode: 403,
        message: 'Le délai de modification (15 minutes) est dépassé',
        backUrl: `/threads/${thread.id}`,
        user: req.session.user,
        language: req.session.language || 'fr'
      });
    }

    res.render('forum/thread-edit', {
      title: 'Modifier le fil - Le Syndicat des Tox',
      thread,
      error: null,
      user: req.session.user,
      language: req.session.language || 'fr'
    });
  } catch (error) {
    logger.error('Error loading thread edit form', error);
    res.status(500).render('error', {
      title: 'Erreur',
      statusCode: 500,
      message: 'Erreur lors du chargement du formulaire',
      backUrl: '/threads',
      user: req.session.user,
      language: req.session.language || 'fr'
    });
  }
});

/**
 * POST /threads/:id/edit
 * Update thread
 */
router.post('/threads/:id/edit', [
  requireAuth,
  rateLimiters.editing,
  param('id').isInt().withMessage('ID de fil invalide'),
  body('title').trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Le titre doit contenir entre 5 et 200 caractères'),
  body('body').trim()
    .isLength({ min: 10, max: 10000 })
    .withMessage('Le contenu doit contenir entre 10 et 10000 caractères')
], async (req, res) => {
  try {
    const validationError = handleValidationErrors(req, res);
    const threadId = parseInt(req.params.id);

    if (validationError) {
      const thread = await Thread.findById(threadId);
      return res.render('forum/thread-edit', {
        title: 'Modifier le fil - Le Syndicat des Tox',
        thread,
        error: validationError,
        user: req.session.user,
        language: req.session.language || 'fr'
      });
    }

    const thread = await Thread.findById(threadId);

    if (!thread || thread.is_deleted) {
      return res.status(404).render('error', {
        title: 'Fil introuvable',
        statusCode: 404,
        message: 'Ce fil n\'existe pas ou a été supprimé',
        backUrl: '/threads',
        user: req.session.user,
        language: req.session.language || 'fr'
      });
    }

    // Check ownership
    if (thread.author_pseudo !== req.session.user.pseudo) {
      return res.status(403).render('error', {
        title: 'Accès refusé',
        statusCode: 403,
        message: 'Vous ne pouvez modifier que vos propres fils',
        backUrl: `/threads/${thread.id}`,
        user: req.session.user,
        language: req.session.language || 'fr'
      });
    }

    // Update thread
    const success = await Thread.update(threadId, req.body.title, req.body.body);

    if (!success) {
      return res.render('forum/thread-edit', {
        title: 'Modifier le fil - Le Syndicat des Tox',
        thread,
        error: 'Le délai de modification est dépassé',
        user: req.session.user,
        language: req.session.language || 'fr'
      });
    }

    logger.info('Thread edited', {
      threadId: thread.id,
      editor: req.session.user.pseudo
    });

    setFlashMessage(req, 'success', 'Fil modifié avec succès');
    res.redirect(`/threads/${thread.id}`);
  } catch (error) {
    logger.error('Error updating thread', error);
    const thread = await Thread.findById(parseInt(req.params.id));
    res.render('forum/thread-edit', {
      title: 'Modifier le fil - Le Syndicat des Tox',
      thread,
      error: 'Erreur lors de la modification',
      user: req.session.user,
      language: req.session.language || 'fr'
    });
  }
});

/**
 * POST /threads/:id/delete
 * Soft delete thread
 */
router.post('/threads/:id/delete', [
  requireAuth,
  rateLimiters.general,
  param('id').isInt().withMessage('ID de fil invalide')
], async (req, res) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) {
      setFlashMessage(req, 'error', validationError);
      return res.redirect('/threads');
    }

    const threadId = parseInt(req.params.id);
    const thread = await Thread.findById(threadId);

    if (!thread || thread.is_deleted) {
      setFlashMessage(req, 'error', 'Fil introuvable');
      return res.redirect('/threads');
    }

    // Check ownership (only author or moderator can delete)
    if (thread.author_pseudo !== req.session.user.pseudo && !res.locals.isModerator) {
      setFlashMessage(req, 'error', 'Vous ne pouvez supprimer que vos propres fils');
      return res.redirect(`/threads/${thread.id}`);
    }

    // Soft delete
    await Thread.softDelete(threadId, 'Supprimé par l\'utilisateur');

    logger.info('Thread deleted', {
      threadId: thread.id,
      deletedBy: req.session.user.pseudo
    });

    setFlashMessage(req, 'success', 'Fil supprimé avec succès');
    res.redirect('/threads');
  } catch (error) {
    logger.error('Error deleting thread', error);
    setFlashMessage(req, 'error', 'Erreur lors de la suppression');
    res.redirect('/threads');
  }
});

/**
 * POST /threads/:id/reply
 * Create reply
 */
router.post('/threads/:id/reply', [
  requireAuth,
  rateLimiters.posting,
  param('id').isInt().withMessage('ID de fil invalide'),
  body('body').trim()
    .isLength({ min: 2, max: 5000 })
    .withMessage('La réponse doit contenir entre 2 et 5000 caractères')
], async (req, res) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) {
      setFlashMessage(req, 'error', validationError);
      return res.redirect(`/threads/${req.params.id}`);
    }

    const threadId = parseInt(req.params.id);
    const thread = await Thread.findById(threadId);

    if (!thread || thread.is_deleted || thread.is_hidden) {
      setFlashMessage(req, 'error', 'Impossible de répondre à ce fil');
      return res.redirect('/threads');
    }

    if (thread.is_locked) {
      setFlashMessage(req, 'error', 'Ce fil est verrouillé');
      return res.redirect(`/threads/${thread.id}`);
    }

    // Create reply
    const reply = await Reply.create(
      threadId,
      req.body.body,
      req.session.user.pseudo
    );

    logger.info('Reply created', {
      replyId: reply.id,
      threadId: thread.id,
      author: req.session.user.pseudo
    });

    setFlashMessage(req, 'success', 'Réponse ajoutée avec succès');
    res.redirect(`/threads/${thread.id}#reply-${reply.id}`);
  } catch (error) {
    logger.error('Error creating reply', error);
    setFlashMessage(req, 'error', error.message || 'Erreur lors de l\'ajout de la réponse');
    res.redirect(`/threads/${req.params.id}`);
  }
});

/**
 * GET /replies/:id/edit
 * Edit reply form
 */
router.get('/replies/:id/edit', [
  requireAuth,
  rateLimiters.general,
  param('id').isInt().withMessage('ID de réponse invalide')
], async (req, res) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) {
      return res.status(400).render('error', {
        title: 'Erreur',
        statusCode: 400,
        message: validationError,
        backUrl: '/',
        user: req.session.user,
        language: req.session.language || 'fr'
      });
    }

    const reply = await Reply.findByIdWithContext(parseInt(req.params.id));

    if (!reply || reply.is_deleted) {
      return res.status(404).render('error', {
        title: 'Réponse introuvable',
        statusCode: 404,
        message: 'Cette réponse n\'existe pas ou a été supprimée',
        backUrl: '/',
        user: req.session.user,
        language: req.session.language || 'fr'
      });
    }

    // Check ownership
    if (reply.author_pseudo !== req.session.user.pseudo) {
      return res.status(403).render('error', {
        title: 'Accès refusé',
        statusCode: 403,
        message: 'Vous ne pouvez modifier que vos propres réponses',
        backUrl: `/threads/${reply.thread_id}`,
        user: req.session.user,
        language: req.session.language || 'fr'
      });
    }

    // Check edit window
    const canEdit = (Date.now() - new Date(reply.created_at).getTime()) < 15 * 60 * 1000;
    if (!canEdit) {
      return res.status(403).render('error', {
        title: 'Délai expiré',
        statusCode: 403,
        message: 'Le délai de modification (15 minutes) est dépassé',
        backUrl: `/threads/${reply.thread_id}`,
        user: req.session.user,
        language: req.session.language || 'fr'
      });
    }

    res.render('forum/reply-edit', {
      title: 'Modifier la réponse - Le Syndicat des Tox',
      reply,
      error: null,
      user: req.session.user,
      language: req.session.language || 'fr'
    });
  } catch (error) {
    logger.error('Error loading reply edit form', error);
    res.status(500).render('error', {
      title: 'Erreur',
      statusCode: 500,
      message: 'Erreur lors du chargement du formulaire',
      backUrl: '/',
      user: req.session.user,
      language: req.session.language || 'fr'
    });
  }
});

/**
 * POST /replies/:id/edit
 * Update reply
 */
router.post('/replies/:id/edit', [
  requireAuth,
  rateLimiters.editing,
  param('id').isInt().withMessage('ID de réponse invalide'),
  body('body').trim()
    .isLength({ min: 2, max: 5000 })
    .withMessage('La réponse doit contenir entre 2 et 5000 caractères')
], async (req, res) => {
  try {
    const validationError = handleValidationErrors(req, res);
    const replyId = parseInt(req.params.id);

    if (validationError) {
      const reply = await Reply.findByIdWithContext(replyId);
      return res.render('forum/reply-edit', {
        title: 'Modifier la réponse - Le Syndicat des Tox',
        reply,
        error: validationError,
        user: req.session.user,
        language: req.session.language || 'fr'
      });
    }

    const reply = await Reply.findByIdWithContext(replyId);

    if (!reply || reply.is_deleted) {
      return res.status(404).render('error', {
        title: 'Réponse introuvable',
        statusCode: 404,
        message: 'Cette réponse n\'existe pas ou a été supprimée',
        backUrl: '/',
        user: req.session.user,
        language: req.session.language || 'fr'
      });
    }

    // Check ownership
    if (reply.author_pseudo !== req.session.user.pseudo) {
      return res.status(403).render('error', {
        title: 'Accès refusé',
        statusCode: 403,
        message: 'Vous ne pouvez modifier que vos propres réponses',
        backUrl: `/threads/${reply.thread_id}`,
        user: req.session.user,
        language: req.session.language || 'fr'
      });
    }

    // Update reply
    const success = await Reply.update(replyId, req.body.body);

    if (!success) {
      return res.render('forum/reply-edit', {
        title: 'Modifier la réponse - Le Syndicat des Tox',
        reply,
        error: 'Le délai de modification est dépassé',
        user: req.session.user,
        language: req.session.language || 'fr'
      });
    }

    logger.info('Reply edited', {
      replyId: reply.id,
      editor: req.session.user.pseudo
    });

    setFlashMessage(req, 'success', 'Réponse modifiée avec succès');
    res.redirect(`/threads/${reply.thread_id}#reply-${reply.id}`);
  } catch (error) {
    logger.error('Error updating reply', error);
    const reply = await Reply.findByIdWithContext(parseInt(req.params.id));
    res.render('forum/reply-edit', {
      title: 'Modifier la réponse - Le Syndicat des Tox',
      reply,
      error: 'Erreur lors de la modification',
      user: req.session.user,
      language: req.session.language || 'fr'
    });
  }
});

/**
 * POST /replies/:id/delete
 * Soft delete reply
 */
router.post('/replies/:id/delete', [
  requireAuth,
  rateLimiters.general,
  param('id').isInt().withMessage('ID de réponse invalide')
], async (req, res) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) {
      setFlashMessage(req, 'error', validationError);
      return res.redirect('/');
    }

    const replyId = parseInt(req.params.id);
    const reply = await Reply.findByIdWithContext(replyId);

    if (!reply || reply.is_deleted) {
      setFlashMessage(req, 'error', 'Réponse introuvable');
      return res.redirect('/');
    }

    // Check ownership (only author or moderator can delete)
    if (reply.author_pseudo !== req.session.user.pseudo && !res.locals.isModerator) {
      setFlashMessage(req, 'error', 'Vous ne pouvez supprimer que vos propres réponses');
      return res.redirect(`/threads/${reply.thread_id}`);
    }

    // Soft delete
    await Reply.softDelete(replyId, 'Supprimé par l\'utilisateur');

    logger.info('Reply deleted', {
      replyId: reply.id,
      deletedBy: req.session.user.pseudo
    });

    setFlashMessage(req, 'success', 'Réponse supprimée avec succès');
    res.redirect(`/threads/${reply.thread_id}`);
  } catch (error) {
    logger.error('Error deleting reply', error);
    setFlashMessage(req, 'error', 'Erreur lors de la suppression');
    res.redirect('/');
  }
});

/**
 * POST /threads/:id/report
 * Report thread
 */
router.post('/threads/:id/report', [
  requireAuth,
  rateLimiters.reporting,
  param('id').isInt().withMessage('ID de fil invalide'),
  body('reason').trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('La raison doit contenir entre 10 et 500 caractères')
], async (req, res) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) {
      setFlashMessage(req, 'error', validationError);
      return res.redirect(`/threads/${req.params.id}`);
    }

    const threadId = parseInt(req.params.id);
    const thread = await Thread.findById(threadId);

    if (!thread || thread.is_deleted) {
      setFlashMessage(req, 'error', 'Fil introuvable');
      return res.redirect('/threads');
    }

    // Add report through service
    const reported = await ReportService.reportThread(
      threadId,
      req.session.user.pseudo,
      req.body.reason
    );

    if (!reported) {
      setFlashMessage(req, 'error', 'Vous avez déjà signalé ce fil');
    } else {
      // Check if thread needs to be auto-hidden
      const reportCount = await ReportService.getThreadReportCount(threadId);
      if (reportCount >= 10) {
        await Thread.hide(threadId);
        logger.info('Thread auto-hidden after 10 reports', { threadId });
      }

      logger.info('Thread reported', {
        threadId: thread.id,
        reportedBy: req.session.user.pseudo,
        reportCount
      });

      setFlashMessage(req, 'success', 'Signalement enregistré');
    }

    res.redirect(`/threads/${thread.id}`);
  } catch (error) {
    logger.error('Error reporting thread', error);
    setFlashMessage(req, 'error', 'Erreur lors du signalement');
    res.redirect(`/threads/${req.params.id}`);
  }
});

/**
 * POST /replies/:id/report
 * Report reply
 */
router.post('/replies/:id/report', [
  requireAuth,
  rateLimiters.reporting,
  param('id').isInt().withMessage('ID de réponse invalide'),
  body('reason').trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('La raison doit contenir entre 10 et 500 caractères')
], async (req, res) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) {
      setFlashMessage(req, 'error', validationError);
      return res.redirect('/');
    }

    const replyId = parseInt(req.params.id);
    const reply = await Reply.findByIdWithContext(replyId);

    if (!reply || reply.is_deleted) {
      setFlashMessage(req, 'error', 'Réponse introuvable');
      return res.redirect('/');
    }

    // Add report through service
    const reported = await ReportService.reportReply(
      replyId,
      req.session.user.pseudo,
      req.body.reason
    );

    if (!reported) {
      setFlashMessage(req, 'error', 'Vous avez déjà signalé cette réponse');
    } else {
      // Check if reply needs to be auto-hidden
      const reportCount = await ReportService.getReplyReportCount(replyId);
      if (reportCount >= 10) {
        await Reply.hide(replyId);
        logger.info('Reply auto-hidden after 10 reports', { replyId });
      }

      logger.info('Reply reported', {
        replyId: reply.id,
        reportedBy: req.session.user.pseudo,
        reportCount
      });

      setFlashMessage(req, 'success', 'Signalement enregistré');
    }

    res.redirect(`/threads/${reply.thread_id}#reply-${reply.id}`);
  } catch (error) {
    logger.error('Error reporting reply', error);
    setFlashMessage(req, 'error', 'Erreur lors du signalement');
    res.redirect('/');
  }
});

// ============================================================================
// MODERATOR ROUTES
// ============================================================================

/**
 * GET /moderation
 * Moderation dashboard
 */
router.get('/moderation', requireModerator, rateLimiters.general, async (req, res) => {
  try {
    // Get reported content from ReportService
    const reportedThreads = await ReportService.getReportedThreads({ minReports: 5 });
    const reportedReplies = await ReportService.getReportedReplies({ minReports: 5 });

    // Get auto-hidden content count
    const autoHiddenStats = await ReportService.getAutoHiddenStats();

    res.render('forum/moderation', {
      title: 'Modération - Le Syndicat des Tox',
      reportedThreads,
      reportedReplies,
      autoHiddenStats,
      user: req.session.user,
      language: req.session.language || 'fr'
    });
  } catch (error) {
    logger.error('Error loading moderation dashboard', error);
    res.status(500).render('error', {
      title: 'Erreur',
      statusCode: 500,
      message: 'Erreur lors du chargement du tableau de bord',
      backUrl: '/',
      user: req.session.user,
      language: req.session.language || 'fr'
    });
  }
});

/**
 * POST /threads/:id/pin
 * Pin/unpin thread
 */
router.post('/threads/:id/pin', [
  requireModerator,
  rateLimiters.general,
  param('id').isInt().withMessage('ID de fil invalide')
], async (req, res) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) {
      setFlashMessage(req, 'error', validationError);
      return res.redirect('/moderation');
    }

    const threadId = parseInt(req.params.id);
    const thread = await Thread.findById(threadId);

    if (!thread || thread.is_deleted) {
      setFlashMessage(req, 'error', 'Fil introuvable');
      return res.redirect('/moderation');
    }

    // Toggle pin status
    const success = thread.is_pinned
      ? await Thread.unpin(threadId)
      : await Thread.pin(threadId);

    if (success) {
      logger.info('Thread pin toggled', {
        threadId: thread.id,
        isPinned: !thread.is_pinned,
        moderator: req.session.user.pseudo
      });

      setFlashMessage(req, 'success', thread.is_pinned ? 'Fil désépinglé' : 'Fil épinglé');
    } else {
      setFlashMessage(req, 'error', 'Erreur lors de l\'opération');
    }

    res.redirect(`/threads/${thread.id}`);
  } catch (error) {
    logger.error('Error toggling thread pin', error);
    setFlashMessage(req, 'error', 'Erreur lors de l\'opération');
    res.redirect('/moderation');
  }
});

/**
 * POST /threads/:id/lock
 * Lock/unlock thread
 */
router.post('/threads/:id/lock', [
  requireModerator,
  rateLimiters.general,
  param('id').isInt().withMessage('ID de fil invalide')
], async (req, res) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) {
      setFlashMessage(req, 'error', validationError);
      return res.redirect('/moderation');
    }

    const threadId = parseInt(req.params.id);
    const thread = await Thread.findById(threadId);

    if (!thread || thread.is_deleted) {
      setFlashMessage(req, 'error', 'Fil introuvable');
      return res.redirect('/moderation');
    }

    // Toggle lock status
    const success = thread.is_locked
      ? await Thread.unlock(threadId)
      : await Thread.lock(threadId);

    if (success) {
      logger.info('Thread lock toggled', {
        threadId: thread.id,
        isLocked: !thread.is_locked,
        moderator: req.session.user.pseudo
      });

      setFlashMessage(req, 'success', thread.is_locked ? 'Fil déverrouillé' : 'Fil verrouillé');
    } else {
      setFlashMessage(req, 'error', 'Erreur lors de l\'opération');
    }

    res.redirect(`/threads/${thread.id}`);
  } catch (error) {
    logger.error('Error toggling thread lock', error);
    setFlashMessage(req, 'error', 'Erreur lors de l\'opération');
    res.redirect('/moderation');
  }
});

/**
 * POST /threads/:id/hide
 * Hide/unhide thread
 */
router.post('/threads/:id/hide', [
  requireModerator,
  rateLimiters.general,
  param('id').isInt().withMessage('ID de fil invalide'),
  body('reason').optional().trim()
], async (req, res) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) {
      setFlashMessage(req, 'error', validationError);
      return res.redirect('/moderation');
    }

    const threadId = parseInt(req.params.id);
    const thread = await Thread.findById(threadId);

    if (!thread || thread.is_deleted) {
      setFlashMessage(req, 'error', 'Fil introuvable');
      return res.redirect('/moderation');
    }

    // Toggle hide status
    const success = thread.is_hidden
      ? await Thread.unhide(threadId)
      : await Thread.hide(threadId);

    if (success) {
      // Clear reports if unhiding
      if (thread.is_hidden) {
        await ReportService.clearThreadReports(threadId);
      }

      logger.info('Thread visibility toggled', {
        threadId: thread.id,
        isHidden: !thread.is_hidden,
        moderator: req.session.user.pseudo,
        reason: req.body.reason
      });

      setFlashMessage(req, 'success', thread.is_hidden ? 'Fil réactivé' : 'Fil masqué');
    } else {
      setFlashMessage(req, 'error', 'Erreur lors de l\'opération');
    }

    res.redirect('/moderation');
  } catch (error) {
    logger.error('Error toggling thread visibility', error);
    setFlashMessage(req, 'error', 'Erreur lors de l\'opération');
    res.redirect('/moderation');
  }
});

/**
 * POST /replies/:id/hide
 * Hide/unhide reply
 */
router.post('/replies/:id/hide', [
  requireModerator,
  rateLimiters.general,
  param('id').isInt().withMessage('ID de réponse invalide'),
  body('reason').optional().trim()
], async (req, res) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) {
      setFlashMessage(req, 'error', validationError);
      return res.redirect('/moderation');
    }

    const replyId = parseInt(req.params.id);
    const reply = await Reply.findById(replyId);

    if (!reply || reply.is_deleted) {
      setFlashMessage(req, 'error', 'Réponse introuvable');
      return res.redirect('/moderation');
    }

    // Toggle hide status
    const success = reply.is_hidden
      ? await Reply.unhide(replyId)
      : await Reply.hide(replyId);

    if (success) {
      // Clear reports if unhiding
      if (reply.is_hidden) {
        await ReportService.clearReplyReports(replyId);
      }

      logger.info('Reply visibility toggled', {
        replyId: reply.id,
        isHidden: !reply.is_hidden,
        moderator: req.session.user.pseudo,
        reason: req.body.reason
      });

      setFlashMessage(req, 'success', reply.is_hidden ? 'Réponse réactivée' : 'Réponse masquée');
    } else {
      setFlashMessage(req, 'error', 'Erreur lors de l\'opération');
    }

    res.redirect('/moderation');
  } catch (error) {
    logger.error('Error toggling reply visibility', error);
    setFlashMessage(req, 'error', 'Erreur lors de l\'opération');
    res.redirect('/moderation');
  }
});

// ============================================================================
// STATIC PAGES
// ============================================================================

/**
 * GET /about
 * About page with information and crisis resources
 */
router.get('/about', rateLimiters.general, (req, res) => {
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
router.get('/privacy', rateLimiters.general, (req, res) => {
  res.render('forum/privacy', {
    title: 'Vie privée - Le Syndicat des Tox',
    user: req.session.user || null,
    language: req.session.language || 'fr'
  });
});

/**
 * GET /forum/resources
 * Belgian crisis resources and help services
 */
router.get('/forum/resources', rateLimiters.general, (req, res) => {
  res.render('forum/resources', {
    title: 'Ressources d\'aide - Le Syndicat des Tox',
    user: req.session.user || null,
    language: req.session.language || 'fr'
  });
});

// ============================================================================
// USER SETTINGS AND ACCOUNT MANAGEMENT
// ============================================================================

/**
 * GET /forum/settings
 * User settings page
 */
router.get('/forum/settings', requireAuth, rateLimiters.general, async (req, res) => {
  try {
    // Get user stats
    const stats = await User.getStats(req.session.user.pseudo);

    // Get full user data
    const user = await User.findByPseudo(req.session.user.pseudo);

    res.render('forum/settings', {
      title: 'Paramètres - Le Syndicat des Tox',
      user: {
        pseudo: user.pseudo,
        createdAt: user.created_at,
        preferredLanguage: user.preferred_language,
        isModerator: user.is_moderator
      },
      stats: {
        threadCount: stats ? stats.post_count : 0,
        replyCount: stats ? stats.reply_count : 0
      },
      error: null,
      success: getFlashMessage(req)?.message || null,
      csrfToken: req.csrfToken,
      language: req.session.language || 'fr'
    });
  } catch (error) {
    logger.error('Error loading settings page', error);
    res.status(500).render('error', {
      title: 'Erreur',
      statusCode: 500,
      message: 'Erreur lors du chargement des paramètres',
      backUrl: '/',
      user: req.session.user,
      language: req.session.language || 'fr'
    });
  }
});

/**
 * POST /forum/settings/language
 * Update user's preferred language
 */
router.post('/forum/settings/language', [
  requireAuth,
  rateLimiters.general,
  body('language').isIn(['fr', 'en', 'nl', 'de']).withMessage('Langue invalide')
], async (req, res) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) {
      setFlashMessage(req, 'error', validationError);
      return res.redirect('/forum/settings');
    }

    const { language } = req.body;

    // Update language in database
    const query = 'UPDATE users SET preferred_language = ? WHERE pseudo = ?';
    await db.execute(query, [language, req.session.user.pseudo]);

    // Update session
    req.session.user.preferredLanguage = language;
    req.session.language = language;

    logger.info('User language updated', {
      pseudo: req.session.user.pseudo,
      language
    });

    setFlashMessage(req, 'success', 'Langue mise à jour avec succès');
    res.redirect('/forum/settings');
  } catch (error) {
    logger.error('Error updating language', error);
    setFlashMessage(req, 'error', 'Erreur lors de la mise à jour de la langue');
    res.redirect('/forum/settings');
  }
});

/**
 * GET /forum/export
 * Display data export page (GDPR right to data portability)
 */
router.get('/forum/export', requireAuth, rateLimiters.general, (req, res) => {
  res.render('forum/export', {
    title: 'Exporter mes données - Le Syndicat des Tox',
    error: null,
    success: null,
    csrfToken: req.csrfToken,
    user: req.session.user,
    language: req.session.language || 'fr'
  });
});

/**
 * POST /forum/export
 * Generate and download user data export (GDPR)
 */
router.post('/forum/export', [
  requireAuth,
  rateLimiters.general,
  body('confirm').equals('on').withMessage('Vous devez confirmer l\'export')
], async (req, res) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) {
      return res.render('forum/export', {
        title: 'Exporter mes données - Le Syndicat des Tox',
        error: validationError,
        success: null,
        csrfToken: req.csrfToken,
        user: req.session.user,
        language: req.session.language || 'fr'
      });
    }

    const { pseudo } = req.session.user;

    // Get user data
    const user = await User.findByPseudo(pseudo);

    // Get all user's threads
    const threadsQuery = `
      SELECT id, title, body, created_at, updated_at, edited_at,
             reply_count, view_count, language, is_pinned, is_locked
      FROM threads
      WHERE author_pseudo = ? AND is_deleted = 0
      ORDER BY created_at DESC
    `;
    const [threads] = await db.execute(threadsQuery, [pseudo]);

    // Get all user's replies
    const repliesQuery = `
      SELECT r.id, r.thread_id, r.body, r.created_at, r.updated_at, r.edited_at,
             t.title as thread_title
      FROM replies r
      JOIN threads t ON r.thread_id = t.id
      WHERE r.author_pseudo = ? AND r.is_deleted = 0
      ORDER BY r.created_at DESC
    `;
    const [replies] = await db.execute(repliesQuery, [pseudo]);

    // Prepare export data
    const exportData = {
      user: {
        pseudo: user.pseudo,
        createdAt: user.created_at,
        preferredLanguage: user.preferred_language,
        isModerator: user.is_moderator,
        postCount: user.post_count,
        replyCount: user.reply_count
      },
      threads: threads.map((t) => ({
        id: t.id,
        title: t.title,
        body: t.body,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        editedAt: t.edited_at,
        replyCount: t.reply_count,
        viewCount: t.view_count,
        language: t.language,
        isPinned: t.is_pinned,
        isLocked: t.is_locked
      })),
      replies: replies.map((r) => ({
        id: r.id,
        threadId: r.thread_id,
        threadTitle: r.thread_title,
        body: r.body,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        editedAt: r.edited_at
      })),
      exportDate: new Date().toISOString(),
      exportVersion: '1.0'
    };

    logger.audit('User data exported', { pseudo });

    // Set headers for download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="syndicat-export-${pseudo}-${Date.now()}.json"`);

    // Send JSON file
    res.send(JSON.stringify(exportData, null, 2));
  } catch (error) {
    logger.error('Error exporting user data', error);
    res.render('forum/export', {
      title: 'Exporter mes données - Le Syndicat des Tox',
      error: 'Erreur lors de l\'export des données',
      success: null,
      csrfToken: req.csrfToken,
      user: req.session.user,
      language: req.session.language || 'fr'
    });
  }
});

/**
 * GET /forum/delete-account
 * Display account deletion page (GDPR right to erasure)
 */
router.get('/forum/delete-account', requireAuth, rateLimiters.general, (req, res) => {
  res.render('forum/delete-account', {
    title: 'Supprimer mon compte - Le Syndicat des Tox',
    error: null,
    csrfToken: req.csrfToken,
    user: req.session.user,
    language: req.session.language || 'fr'
  });
});

/**
 * POST /forum/delete-account
 * Permanently delete user account and all data (GDPR)
 */
router.post('/forum/delete-account', [
  requireAuth,
  rateLimiters.general,
  body('confirmation').equals('DELETE MY ACCOUNT')
    .withMessage('La phrase de confirmation doit être exactement: DELETE MY ACCOUNT'),
  body('pin').matches(/^[0-9]{4}$/).withMessage('Code PIN invalide'),
  body('understand').equals('on').withMessage('Vous devez confirmer avoir compris')
], async (req, res) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) {
      return res.render('forum/delete-account', {
        title: 'Supprimer mon compte - Le Syndicat des Tox',
        error: validationError,
        csrfToken: req.csrfToken,
        user: req.session.user,
        language: req.session.language || 'fr'
      });
    }

    const { pin } = req.body;
    const { pseudo } = req.session.user;

    // Verify PIN
    const user = await User.findByPseudo(pseudo);
    const AuthService = require('../services/authService');
    const validPin = await AuthService.verifyPin(pin, user.pin_hash);

    if (!validPin) {
      return res.render('forum/delete-account', {
        title: 'Supprimer mon compte - Le Syndicat des Tox',
        error: 'Code PIN incorrect',
        csrfToken: req.csrfToken,
        user: req.session.user,
        language: req.session.language || 'fr'
      });
    }

    // Delete account (cascades to threads and replies due to foreign keys)
    await User.deleteAccount(pseudo);

    logger.audit('User account deleted', { pseudo });
    logger.security('Account deletion completed', { pseudo });

    // Destroy session
    req.session.destroy((err) => {
      if (err) {
        logger.error('Session destruction error during account deletion', err);
      }
    });

    // Redirect to goodbye page or home with message
    res.render('forum/account-deleted', {
      title: 'Compte supprimé - Le Syndicat des Tox',
      user: null,
      language: 'fr'
    });
  } catch (error) {
    logger.error('Error deleting account', error);
    res.render('forum/delete-account', {
      title: 'Supprimer mon compte - Le Syndicat des Tox',
      error: 'Erreur lors de la suppression du compte',
      csrfToken: req.csrfToken,
      user: req.session.user,
      language: req.session.language || 'fr'
    });
  }
});

module.exports = router;
