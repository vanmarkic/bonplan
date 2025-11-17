/**
 * Application Configuration
 * Copy to app.config.js and update with your values
 */

module.exports = {
  // Environment
  env: process.env.NODE_ENV || 'development',

  // Server Configuration
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '127.0.0.1',
    trustProxy: true, // Behind Nginx/Cloudflare

    // CORS - Generally disabled for security
    cors: {
      enabled: false,
      origins: []
    }
  },

  // Database Configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    database: process.env.DB_NAME || 'syndicat_tox',
    user: process.env.DB_USER || 'syndicat_app',
    password: process.env.DB_PASSWORD || '', // REQUIRED - Set in environment

    // Connection Pool
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 0,

    // MariaDB specific
    charset: 'utf8mb4',
    timezone: 'Z',
    multipleStatements: false, // Security: prevent SQL injection

    // Timeouts
    connectTimeout: 10000,
    acquireTimeout: 10000,
    timeout: 10000
  },

  // Redis Configuration (Sessions & Cache)
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || null,
    db: process.env.REDIS_DB || 0,

    // Timeouts
    connectTimeout: 10000,
    commandTimeout: 5000,

    // Retry strategy
    retryStrategy: (times) => {
      if (times > 3) return null; // Stop retrying
      return Math.min(times * 100, 3000);
    }
  },

  // Session Configuration
  session: {
    secret: process.env.SESSION_SECRET || '', // REQUIRED - Generate with: openssl rand -base64 32
    name: 'sid', // Cookie name

    // Cookie settings
    cookie: {
      httpOnly: true,
      secure: true, // HTTPS only
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/'
    },

    // Session settings
    resave: false,
    saveUninitialized: false,
    rolling: true, // Reset expiry on activity

    // Redis store prefix
    prefix: 'sess:'
  },

  // Authentication Configuration
  auth: {
    // Argon2 settings for PIN hashing
    argon2: {
      type: 2, // Argon2id
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 1,
      saltLength: 32
    },

    // Lockout policy
    lockout: {
      maxAttempts: {
        3: 60,        // 3 attempts = 1 minute
        5: 300,       // 5 attempts = 5 minutes
        10: 1800,     // 10 attempts = 30 minutes
        20: 86400     // 20 attempts = 24 hours
      }
    },

    // Username (pseudo) validation
    pseudo: {
      minLength: 3,
      maxLength: 20,
      pattern: /^[a-zA-Z0-9_-]+$/,
      reservedWords: ['admin', 'system', 'moderator', 'mod', 'root', 'anonymous']
    },

    // PIN validation
    pin: {
      pattern: /^[0-9]{4}$/
    }
  },

  // Rate Limiting Configuration
  rateLimit: {
    // Window size in seconds
    windowMs: 60,

    // Limits per action
    limits: {
      registration: { window: 3600, max: 2 },
      login: { window: 3600, max: 10 },
      threadCreate: { window: 3600, max: 5 },
      replyCreate: { window: 3600, max: 20 },
      search: { window: 60, max: 30 },
      general: { window: 60, max: 100 }
    },

    // Headers
    headers: true,

    // Skip successful requests
    skipSuccessfulRequests: false
  },

  // Content Configuration
  content: {
    thread: {
      title: {
        minLength: 5,
        maxLength: 200
      },
      body: {
        minLength: 10,
        maxLength: 10000
      },
      editWindow: 15 * 60 * 1000 // 15 minutes
    },

    reply: {
      body: {
        minLength: 1,
        maxLength: 5000
      },
      editWindow: 15 * 60 * 1000 // 15 minutes
    },

    // Auto-moderation
    autoModeration: {
      enabled: true,
      hideThreshold: 10, // Hide after 10 reports
      checkBannedWords: true
    }
  },

  // Pagination
  pagination: {
    defaultLimit: 25,
    maxLimit: 50,
    minLimit: 10
  },

  // Language Configuration
  i18n: {
    defaultLanguage: 'fr',
    supportedLanguages: ['fr', 'nl', 'de', 'en'],

    // Language detection order
    detection: [
      'query',      // ?lang=fr
      'cookie',     // lang cookie
      'header',     // Accept-Language
      'default'     // fallback
    ]
  },

  // Security Configuration
  security: {
    // Content Security Policy
    csp: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Inline for progressive enhancement
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: []
      }
    },

    // Security headers
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
    },

    // HTTPS enforcement
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',

    // Console logging
    console: {
      enabled: true,
      colorize: true,
      timestamp: true
    },

    // File logging
    file: {
      enabled: true,
      filename: 'logs/app.log',
      maxSize: '10m',
      maxFiles: 7,
      compress: true
    },

    // Error logging
    error: {
      filename: 'logs/error.log',
      maxSize: '10m',
      maxFiles: 30
    },

    // Never log these fields
    redactFields: [
      'pin',
      'password',
      'token',
      'session',
      'cookie',
      'authorization'
    ]
  },

  // Performance Configuration
  performance: {
    // Compression
    compression: {
      enabled: true,
      level: 6,
      threshold: 1024 // 1kb
    },

    // Static file caching
    staticCache: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      immutable: true
    },

    // View caching
    viewCache: {
      enabled: true,
      ttl: 60 // 1 minute
    }
  },

  // External Resources
  resources: {
    crisis: {
      fr: [
        {
          name: 'Centre de Prévention du Suicide',
          number: '0800 32 123',
          hours: '24/7'
        },
        {
          name: 'Infor-Drogues',
          number: '02 227 52 52',
          hours: 'Lu-Ve 8h-22h, Sa 10h-14h'
        }
      ],
      nl: [
        {
          name: 'Zelfmoordlijn',
          number: '1813',
          hours: '24/7'
        },
        {
          name: 'Druglijn',
          number: '078 15 10 20',
          hours: 'Ma-Vr 10h-20h'
        }
      ],
      de: [
        {
          name: 'Telefonhilfe',
          number: '108',
          hours: '24/7'
        }
      ]
    }
  },

  // Feature Flags
  features: {
    registration: true,
    search: true,
    reporting: true,
    moderation: true,
    userExport: true,
    userDeletion: true,
    editingEnabled: true,
    privateMessages: false, // Future feature
    notifications: false,   // Future feature
    emailVerification: false, // Never - anonymity
    twoFactor: false        // Never - anonymity
  },

  // Maintenance Mode
  maintenance: {
    enabled: false,
    message: {
      fr: 'Le site est en maintenance. Nous revenons bientôt.',
      nl: 'De site is in onderhoud. We zijn snel terug.',
      de: 'Die Seite wird gewartet. Wir sind bald zurück.',
      en: 'The site is under maintenance. We\'ll be back soon.'
    },
    allowedIPs: [] // IPs that can access during maintenance
  }
};