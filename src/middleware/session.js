/**
 * Session Middleware
 * Redis-backed session storage
 */

const session = require('express-session');
const RedisStore = require('connect-redis').default;
const redis = require('../utils/redis');

const sessionMiddleware = session({
  store: new RedisStore({
    client: redis,
    prefix: 'sess:',
    ttl: 7 * 24 * 60 * 60 // 7 days in seconds
  }),
  name: 'sid',
  secret: process.env.SESSION_SECRET || 'CHANGE_THIS_SECRET',
  resave: false,
  saveUninitialized: false,
  rolling: true, // Reset expiry on each request
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    path: '/'
  }
});

module.exports = sessionMiddleware;
