# Le Syndicat des Tox - Security Implementation Guide

## Critical Security Requirements

This document outlines the **mandatory** security implementations for Le Syndicat des Tox. Every measure listed here is essential for protecting user anonymity and safety.

---

## 1. Anonymity Protection (CRITICAL)

### 1.1 IP Address Handling

**NEVER store IP addresses in the database.**

```nginx
# Nginx Configuration - Strip all identifying headers
location / {
    proxy_pass http://localhost:3000;
    proxy_set_header X-Real-IP "";
    proxy_set_header X-Forwarded-For "";
    proxy_set_header CF-Connecting-IP "";
    proxy_set_header True-Client-IP "";

    # Pass anonymized identifier for rate limiting
    set $ip_hash $remote_addr;
    set_md5 $ip_hash_md5 $ip_hash$server_name;
    proxy_set_header X-Anonymous-IP $ip_hash_md5;
}

# Disable access logs
access_log off;

# Minimal error logging
error_log /var/log/nginx/error.log error;
```

### 1.2 Application-Level IP Blocking

```javascript
// middleware/anonymize.js
module.exports = (req, res, next) => {
  // Remove all IP-related headers
  delete req.headers['x-real-ip'];
  delete req.headers['x-forwarded-for'];
  delete req.headers['cf-connecting-ip'];
  delete req.headers['true-client-ip'];

  // Override Express IP detection
  Object.defineProperty(req, 'ip', {
    get: () => 'anonymous'
  });

  Object.defineProperty(req, 'ips', {
    get: () => []
  });

  next();
};
```

### 1.3 No External Resources

```html
<!-- NEVER use CDNs or external resources -->
<!-- BAD -->
<script src="https://cdn.example.com/jquery.js"></script>

<!-- GOOD - All resources self-hosted -->
<script src="/static/js/app.js"></script>
```

---

## 2. Authentication Security

### 2.1 PIN Hashing Implementation

```javascript
const argon2 = require('argon2');
const crypto = require('crypto');

class AuthService {
  async hashPIN(pin) {
    // Validate PIN format
    if (!/^[0-9]{4}$/.test(pin)) {
      throw new Error('Invalid PIN format');
    }

    // Generate salt
    const salt = crypto.randomBytes(32);

    // Hash with Argon2id
    const hash = await argon2.hash(pin, {
      type: argon2.argon2id,
      salt: salt,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 1,
      hashLength: 32
    });

    return {
      hash: hash,
      salt: salt.toString('base64')
    };
  }

  async verifyPIN(pin, storedHash, storedSalt) {
    try {
      // Add timing attack protection
      const start = process.hrtime();

      const isValid = await argon2.verify(storedHash, pin);

      // Constant time delay
      const elapsed = process.hrtime(start);
      const delay = Math.max(0, 100 - (elapsed[0] * 1000 + elapsed[1] / 1000000));
      await new Promise(resolve => setTimeout(resolve, delay));

      return isValid;
    } catch (err) {
      return false;
    }
  }
}
```

### 2.2 Brute Force Protection

```javascript
// middleware/rateLimiter.js
const Redis = require('ioredis');
const redis = new Redis(config.redis);

class LoginAttemptLimiter {
  async checkAndRecordAttempt(pseudo, success = false) {
    const key = `login:attempts:${pseudo}`;

    if (success) {
      // Clear attempts on successful login
      await redis.del(key);
      return { allowed: true };
    }

    // Get current attempts
    const attempts = await redis.incr(key);

    // Set expiry on first attempt
    if (attempts === 1) {
      await redis.expire(key, 86400); // 24 hours
    }

    // Check lockout thresholds
    const lockoutRules = [
      { attempts: 20, duration: 86400 },  // 24 hours
      { attempts: 10, duration: 1800 },   // 30 minutes
      { attempts: 5, duration: 300 },     // 5 minutes
      { attempts: 3, duration: 60 }       // 1 minute
    ];

    for (const rule of lockoutRules) {
      if (attempts >= rule.attempts) {
        const lockKey = `login:locked:${pseudo}`;
        await redis.set(lockKey, '1', 'EX', rule.duration);

        return {
          allowed: false,
          lockedUntil: Date.now() + (rule.duration * 1000),
          attempts: attempts
        };
      }
    }

    return { allowed: true, attempts: attempts };
  }

  async isLocked(pseudo) {
    const lockKey = `login:locked:${pseudo}`;
    const locked = await redis.get(lockKey);
    return !!locked;
  }
}
```

### 2.3 Session Security

```javascript
// Session configuration
const session = require('express-session');
const RedisStore = require('connect-redis')(session);

app.use(session({
  store: new RedisStore({
    client: redis,
    prefix: 'sess:',
    ttl: 7 * 24 * 60 * 60, // 7 days
    disableTouch: false
  }),

  name: 'sid',
  secret: crypto.randomBytes(32).toString('base64'),

  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  },

  resave: false,
  saveUninitialized: false,
  rolling: true,

  genid: () => {
    // Generate cryptographically secure session ID
    return crypto.randomBytes(32).toString('base64url');
  }
}));
```

---

## 3. Input Validation & Sanitization

### 3.1 SQL Injection Prevention

```javascript
// ALWAYS use parameterized queries
const mysql = require('mysql2/promise');

// BAD - SQL Injection vulnerable
const query = `SELECT * FROM users WHERE pseudo = '${userInput}'`;

// GOOD - Parameterized query
const [rows] = await connection.execute(
  'SELECT * FROM users WHERE pseudo = ?',
  [userInput]
);

// For multiple parameters
const [threads] = await connection.execute(
  'SELECT * FROM threads WHERE author_pseudo = ? AND created_at > ? ORDER BY created_at DESC LIMIT ?',
  [pseudo, dateFrom, limit]
);
```

### 3.2 XSS Prevention

```javascript
const DOMPurify = require('isomorphic-dompurify');
const validator = require('validator');

class ContentSanitizer {
  sanitizeForDisplay(text) {
    // First escape HTML
    let safe = validator.escape(text);

    // Allow only specific formatting
    safe = safe.replace(/\n/g, '<br>');

    // Clean with DOMPurify as extra protection
    return DOMPurify.sanitize(safe, {
      ALLOWED_TAGS: ['br'],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true,
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
      RETURN_DOM_IMPORT: false
    });
  }

  sanitizeForStorage(text) {
    // Remove any HTML tags for storage
    return validator.stripLow(text).trim();
  }

  validatePseudo(pseudo) {
    // Strict validation
    if (!pseudo || typeof pseudo !== 'string') {
      return false;
    }

    // Length check
    if (pseudo.length < 3 || pseudo.length > 20) {
      return false;
    }

    // Character check
    if (!/^[a-zA-Z0-9_-]+$/.test(pseudo)) {
      return false;
    }

    // Reserved words
    const reserved = ['admin', 'system', 'moderator', 'root'];
    if (reserved.includes(pseudo.toLowerCase())) {
      return false;
    }

    return true;
  }
}
```

### 3.3 CSRF Protection

```javascript
const csrf = require('csurf');

// Configure CSRF
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    key: '_csrf',
    path: '/'
  }
});

// Apply to all POST/PUT/DELETE routes
app.use(csrfProtection);

// Make token available in views
app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  next();
});
```

---

## 4. Security Headers

### 4.1 Helmet Configuration

```javascript
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Inline for non-JS fallback
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'none'"],
      workerSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: []
    }
  },

  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },

  frameguard: { action: 'deny' },
  xssFilter: true,
  noSniff: true,
  ieNoOpen: true,
  hidePoweredBy: true,
  referrerPolicy: { policy: 'no-referrer' },

  permissionsPolicy: {
    features: {
      geolocation: ["'none'"],
      microphone: ["'none'"],
      camera: ["'none'"],
      payment: ["'none'"],
      usb: ["'none'"],
      magnetometer: ["'none'"],
      gyroscope: ["'none'"],
      accelerometer: ["'none'"]
    }
  }
}));
```

---

## 5. Rate Limiting Implementation

### 5.1 Generic Rate Limiter

```javascript
class RateLimiter {
  constructor(redis) {
    this.redis = redis;
  }

  async checkLimit(identifier, action, limit, window) {
    const key = `rate:${action}:${identifier}`;
    const current = await this.redis.incr(key);

    if (current === 1) {
      await this.redis.expire(key, window);
    }

    if (current > limit) {
      const ttl = await this.redis.ttl(key);
      return {
        allowed: false,
        remaining: 0,
        reset: Date.now() + (ttl * 1000)
      };
    }

    return {
      allowed: true,
      remaining: limit - current,
      reset: Date.now() + (window * 1000)
    };
  }
}

// Middleware factory
function createRateLimitMiddleware(action, limit, window) {
  return async (req, res, next) => {
    // Use anonymized IP hash from Nginx
    const identifier = req.headers['x-anonymous-ip'] || 'global';

    const result = await rateLimiter.checkLimit(
      identifier,
      action,
      limit,
      window
    );

    // Set headers
    res.set('X-RateLimit-Limit', limit);
    res.set('X-RateLimit-Remaining', result.remaining);
    res.set('X-RateLimit-Reset', Math.floor(result.reset / 1000));

    if (!result.allowed) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests',
        retryAfter: Math.floor((result.reset - Date.now()) / 1000)
      });
    }

    next();
  };
}
```

---

## 6. Logging Security

### 6.1 Secure Logging

```javascript
const winston = require('winston');

// Custom format to redact sensitive data
const redactFormat = winston.format((info) => {
  const redactFields = ['pin', 'password', 'token', 'session'];

  // Deep clone to avoid modifying original
  const sanitized = JSON.parse(JSON.stringify(info));

  function redact(obj) {
    for (const key in obj) {
      if (redactFields.includes(key.toLowerCase())) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        redact(obj[key]);
      }
    }
  }

  redact(sanitized);

  // Never log IPs
  delete sanitized.ip;
  delete sanitized.ips;
  delete sanitized.remoteAddress;

  return sanitized;
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    redactFormat(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: 'logs/app.log',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    })
  ]
});

// Never log to console in production
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}
```

---

## 7. Data Sanitization

### 7.1 Database Cleanup Job

```javascript
// Scheduled job to remove old data
const CronJob = require('cron').CronJob;

// Run daily at 3 AM
const cleanupJob = new CronJob('0 3 * * *', async () => {
  try {
    // Remove old login attempts
    await db.execute(
      'DELETE FROM login_attempts WHERE attempt_time < DATE_SUB(NOW(), INTERVAL 24 HOUR)'
    );

    // Remove orphaned reports
    await db.execute(`
      DELETE r FROM reports r
      LEFT JOIN threads t ON r.content_type = 'thread' AND r.content_id = t.id
      LEFT JOIN replies p ON r.content_type = 'reply' AND r.content_id = p.id
      WHERE t.id IS NULL AND p.id IS NULL
    `);

    // Clean expired sessions in Redis
    // (Redis handles this automatically with TTL)

    logger.info('Daily cleanup completed');
  } catch (error) {
    logger.error('Cleanup job failed:', error);
  }
});

cleanupJob.start();
```

---

## 8. Emergency Procedures

### 8.1 Security Incident Response

```javascript
class SecurityIncidentHandler {
  async handleSuspiciousActivity(type, details) {
    // Log incident
    logger.warn('Security incident', { type, details });

    switch (type) {
      case 'sql_injection_attempt':
        // Block identifier temporarily
        await this.blockTemporary(details.identifier, 3600);
        break;

      case 'xss_attempt':
        // Increase scrutiny on user
        await this.flagUserForReview(details.pseudo);
        break;

      case 'massive_reporting':
        // Potential brigade attack
        await this.enterDefensiveMode();
        break;

      case 'rate_limit_abuse':
        // Extended block
        await this.blockTemporary(details.identifier, 86400);
        break;
    }
  }

  async enterDefensiveMode() {
    // Temporarily increase all rate limits
    // Disable registration
    // Alert moderators
  }

  async blockTemporary(identifier, duration) {
    await redis.set(`blocked:${identifier}`, '1', 'EX', duration);
  }
}
```

### 8.2 Data Breach Protocol

```javascript
class DataBreachProtocol {
  async execute() {
    // 1. Immediately disable all sessions
    await redis.flushdb();

    // 2. Force password reset (impossible with PINs - accounts lost)
    await db.execute('UPDATE users SET pin_hash = "RESET_REQUIRED"');

    // 3. Log incident
    logger.error('DATA BREACH PROTOCOL ACTIVATED');

    // 4. Notify users on homepage
    await this.setMaintenanceMode(
      'Security incident detected. All accounts have been reset for your safety.'
    );

    // 5. No personal data to report under GDPR
    // But still document incident
  }
}
```

---

## 9. Security Checklist

### Pre-Deployment

- [ ] All dependencies updated to latest secure versions
- [ ] No development dependencies in production
- [ ] Environment variables properly set
- [ ] Database user has minimal required permissions
- [ ] Redis password configured
- [ ] Session secret is cryptographically random
- [ ] HTTPS certificates valid and configured
- [ ] Nginx anonymization configured
- [ ] CSP headers tested
- [ ] Rate limiting tested
- [ ] Input validation on all endpoints
- [ ] No console.log statements in production
- [ ] Error messages don't leak system information
- [ ] File upload disabled (if not needed)

### Post-Deployment

- [ ] Security headers verified (securityheaders.com)
- [ ] SSL configuration verified (ssllabs.com)
- [ ] Rate limiting monitored
- [ ] Log files rotating properly
- [ ] No sensitive data in logs
- [ ] Automated backups configured (encrypted)
- [ ] Incident response plan documented
- [ ] Moderator training completed
- [ ] Regular security updates scheduled
- [ ] Penetration testing scheduled

---

## 10. Security Contacts

```javascript
// security.js
module.exports = {
  // Security report email (create separate inbox)
  securityEmail: 'security@bonplan.be',

  // Emergency contacts (encrypted)
  emergencyContacts: {
    primary: process.env.EMERGENCY_CONTACT_PRIMARY,
    secondary: process.env.EMERGENCY_CONTACT_SECONDARY
  },

  // External security services
  services: {
    ddosProtection: 'Cloudflare',
    sslCertificates: 'Let\'s Encrypt',
    penetrationTesting: 'TBD',
    securityAudit: 'TBD'
  }
};
```

---

**Remember: User anonymity and safety are the top priorities. When in doubt, choose the more secure option.**