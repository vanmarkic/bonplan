/**
 * Rate Limiting Middleware
 * Prevents spam and abuse by limiting request frequency
 */

const logger = require('../utils/logger');

// In-memory store for rate limiting (consider using Redis in production)
const rateLimitStore = new Map();

/**
 * Clean up expired entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (data.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Clean every minute

/**
 * Create rate limiter middleware
 */
function createRateLimiter(options = {}) {
  const {
    windowMs = 60000,       // Time window in milliseconds (default: 1 minute)
    max = 5,                // Max requests per window
    message = 'Trop de requêtes, veuillez réessayer plus tard',
    keyGenerator = (req) => `${req.session?.user?.pseudo || req.ip}`,
    skipSuccessfulRequests = false
  } = options;

  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();

    // Get or create rate limit data for this key
    let limitData = rateLimitStore.get(key);

    if (!limitData || limitData.resetAt < now) {
      // Create new window
      limitData = {
        count: 0,
        resetAt: now + windowMs,
        firstRequest: now
      };
      rateLimitStore.set(key, limitData);
    }

    // Increment counter
    limitData.count++;

    // Check if limit exceeded
    if (limitData.count > max) {
      logger.warn('Rate limit exceeded', {
        key,
        path: req.path,
        count: limitData.count,
        max
      });

      const retryAfter = Math.ceil((limitData.resetAt - now) / 1000);

      res.set({
        'Retry-After': retryAfter,
        'X-RateLimit-Limit': max,
        'X-RateLimit-Remaining': 0,
        'X-RateLimit-Reset': new Date(limitData.resetAt).toISOString()
      });

      return res.status(429).render('error', {
        title: 'Trop de requêtes',
        statusCode: 429,
        message,
        description: `Veuillez attendre ${retryAfter} secondes avant de réessayer.`,
        backUrl: req.get('Referrer') || '/',
        user: req.session?.user || null,
        language: req.session?.language || 'fr'
      });
    }

    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': max,
      'X-RateLimit-Remaining': Math.max(0, max - limitData.count),
      'X-RateLimit-Reset': new Date(limitData.resetAt).toISOString()
    });

    // Call next with option to decrement on success if configured
    if (skipSuccessfulRequests) {
      const originalSend = res.send;
      res.send = function(...args) {
        // Decrement counter if response is successful (2xx)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          limitData.count--;
        }
        return originalSend.apply(res, args);
      };
    }

    next();
  };
}

/**
 * Pre-configured rate limiters for different scenarios
 */
const rateLimiters = {
  // For thread/reply creation - strict limits
  posting: createRateLimiter({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 3,                   // 3 posts per 5 minutes
    message: 'Limite de publication atteinte. Attendez quelques minutes.'
  }),

  // For editing - moderate limits
  editing: createRateLimiter({
    windowMs: 60000,          // 1 minute
    max: 5,                   // 5 edits per minute
    message: 'Trop de modifications. Veuillez patienter.'
  }),

  // For reporting - prevent abuse
  reporting: createRateLimiter({
    windowMs: 60000,          // 1 minute
    max: 3,                   // 3 reports per minute
    message: 'Limite de signalements atteinte.'
  }),

  // For search - prevent excessive queries
  searching: createRateLimiter({
    windowMs: 60000,          // 1 minute
    max: 10,                  // 10 searches per minute
    message: 'Trop de recherches. Veuillez patienter.'
  }),

  // For general API/page requests - lenient
  general: createRateLimiter({
    windowMs: 60000,          // 1 minute
    max: 60,                  // 60 requests per minute
    message: 'Trop de requêtes. Veuillez ralentir.'
  })
};

module.exports = {
  createRateLimiter,
  rateLimiters
};