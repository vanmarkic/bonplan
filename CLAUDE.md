# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Le Syndicat des Tox** is an anonymous peer support forum for Belgian drug addict communities. The platform prioritizes absolute anonymity, radical accessibility, and user safety.

**Core Principles:**
- 100% anonymity (no email, real names, or IP tracking)
- Session-based authentication with pseudo + 4-digit PIN
- Public forum optimized for low-spec devices and poor connectivity
- GDPR-compliant with Belgian hosting requirement
- Harm reduction focus

## Essential Commands

### Development
```bash
npm run dev              # Start development server with hot reload
npm test                 # Run all tests (unit + integration + security)
npm run test:unit        # Run only unit tests
npm run test:integration # Run only integration tests
npm run test:security    # Run only security tests
npm run lint             # Check code style
npm run lint:fix         # Fix code style issues automatically
```

### Running Individual Tests
```bash
# Run a specific test file
npm run test:unit -- tests/unit/models/User.test.js

# Run tests matching a pattern
npm run test:unit -- --testNamePattern="should validate pseudo"
```

### Production
```bash
npm start                # Start production server
npm run build            # Build CSS and JS assets
npm run build:css        # Build CSS only
npm run build:js         # Build JS only
```

### Database
```bash
npm run db:migrate       # Run database migrations
npm run db:seed          # Seed database with test data
mysql -u root -p < docs/DATABASE_SCHEMA.sql  # Initialize database
```

## Architecture

### Layer Architecture

**Express.js MVC Pattern:**
```
src/
├── server.js           # Application entry point
├── middleware/         # Express middleware (security, auth, etc.)
├── routes/            # Route handlers (auth, forum)
├── models/            # Database models (User, Thread, Reply)
├── services/          # Business logic (authService, reportService)
├── utils/             # Utilities (database, logger, redis)
└── views/             # EJS templates
```

### Request Flow

```
Request → Nginx (IP anonymization)
        → anonymizeMiddleware (strip all IP headers)
        → securityMiddleware (Helmet, CSP)
        → sessionMiddleware (Redis-backed sessions)
        → csrfMiddleware (CSRF protection)
        → rateLimiter (abuse prevention)
        → requireAuth (authentication check)
        → Route Handler → Service → Model → Database
```

### Critical Security Layers

**Anonymization (src/middleware/anonymize.js):**
- MUST be first middleware in chain
- Strips all IP-related headers (X-Forwarded-For, X-Real-IP, etc.)
- Overrides req.ip and req.ips to prevent IP logging
- Uses X-Anonymous-ID header (hashed value from Nginx) for rate limiting only
- Any code that logs request data MUST NOT log IP addresses

**Authentication (src/services/authService.js):**
- Argon2id hashing with 64MB memory cost for PINs
- Pseudo + 4-digit PIN (no email, no real names)
- Failed attempt tracking per pseudo (not by IP, preserves anonymity)
- 5 failed attempts → 30-minute lockout
- Session-based auth (NOT JWT) with 7-day rolling window

**Rate Limiting (src/middleware/rateLimiter.js):**
- Uses req.anonId (from X-Anonymous-ID header) instead of IP
- Aggressive limits to prevent abuse while preserving anonymity
- Stored in Redis with TTL

### Database Layer

**Connection Management:**
- MySQL2 connection pool (src/utils/database.js)
- 10 connections max
- Parameterized queries ONLY (SQL injection prevention)
- multipleStatements: false (security hardening)

**Models Pattern:**
- Static methods for database operations
- Use db.execute() for parameterized queries
- Transactions for multi-step operations (use getConnection() → beginTransaction() → commit/rollback)

**Example:**
```javascript
const [rows] = await db.execute('SELECT * FROM users WHERE pseudo = ?', [pseudo]);
```

### Session & State Management

**Redis (src/utils/redis.js):**
- Session storage (connect-redis)
- Rate limit counters
- Account lockout tracking
- NEVER store IP addresses

**Session Data:**
- Stored server-side only (not in cookies)
- Contains: pseudo, isModerator, preferredLanguage
- 7-day rolling window (renewed on each request)

### Multi-Language Support

**Languages:** French (fr), Dutch (nl), German (de), English (en)
- i18n module for translations
- User's preferred language stored in database
- Language selector on registration and in settings

## Testing Strategy

**Test Organization:**
```
tests/
├── unit/              # Unit tests (isolated components)
│   ├── middleware/
│   ├── models/
│   └── services/
├── integration/       # Integration tests (full request cycle)
├── security/          # Security-focused tests
└── setup.js          # Test environment setup
```

**Test Requirements:**
- All new features MUST have unit tests
- Security-critical code MUST have security tests
- Integration tests for full user flows
- Test anonymization: verify no IP leakage in logs/database

**Running Tests:**
- Tests use Jest with 10-second timeout
- Setup file (tests/setup.js) initializes test database/Redis
- Use supertest for HTTP testing

## Security Requirements

**NEVER:**
- Log IP addresses (use req.anonId if needed for debugging)
- Store IP addresses in database
- Use JWT tokens (use sessions instead)
- Allow multiple SQL statements
- Trust user input (always validate and sanitize)
- Use console.log (eslint error - use logger instead)

**ALWAYS:**
- Use parameterized queries for database
- Validate all inputs (express-validator or manual validation)
- Sanitize HTML output (DOMPurify)
- Rate limit all endpoints
- Check CSRF tokens on state-changing operations
- Hash PINs with Argon2id (never bcrypt or plain storage)

**Security Headers (src/middleware/security.js):**
- Helmet for standard headers
- Strict CSP (no external resources)
- No CORS (unless explicitly required)

## Code Style

**ESLint Configuration:**
- Airbnb base style
- eslint-plugin-security enabled
- Max line length: 120 characters
- No console.log (error level)
- Comma dangle: never

**Logging:**
```javascript
const logger = require('./utils/logger');
logger.info('message');     // General information
logger.error('error', err); // Errors
logger.audit('action', { pseudo }); // User actions (no IP!)
logger.security('alert', { details }); // Security events
```

## Common Patterns

### Creating a New Route

1. Add route handler in src/routes/
2. Apply middleware: rateLimiter, requireAuth, csrf
3. Validate inputs with express-validator or custom validation
4. Call service layer for business logic
5. Return response (JSON or render view)

### Creating a New Model

1. Create static methods for database operations
2. Use db.execute() with parameterized queries
3. Handle errors and return null for not found
4. Use transactions for multi-step operations

### Adding Validation

1. Import from config/app.config.js for validation rules
2. Use express-validator or implement in service layer
3. Return consistent error messages (localized if possible)

## Performance Targets

- Initial page load: < 50KB
- LCP on 3G: < 2.5s
- FID: < 100ms
- Works without JavaScript (progressive enhancement)
- Self-hosted assets only (no CDN dependencies)

## Belgian Context

**Crisis Resources (always keep accessible):**
- Centre de Prévention du Suicide: 0800 32 123 (24/7)
- Zelfmoordlijn: 1813 (24/7)
- Druglijn: 078 15 10 20
- Infor-Drogues: 02 227 52 52

**Legal Compliance:**
- GDPR: minimal data, user rights respected
- Belgian hosting: data never leaves Belgium
- AGPL-3.0 license: keep platform free and open

## Environment Configuration

**Required Environment Variables:**
```bash
NODE_ENV=production|development
DB_HOST=localhost
DB_PORT=3306
DB_NAME=syndicat_tox
DB_USER=syndicat_app
DB_PASSWORD=***REQUIRED***
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=***RECOMMENDED***
SESSION_SECRET=***REQUIRED*** # Generate with: openssl rand -base64 32
```

**Configuration File:**
- Copy config/app.config.example.js to config/app.config.js
- Never commit app.config.js (git ignored)
- Update with production values

## Documentation

**Essential Reading:**
- docs/SPECIFICATION.md - Complete system design
- docs/SECURITY_IMPLEMENTATION.md - Security measures (MUST READ before any code changes)
- docs/API_ENDPOINTS.md - All endpoints and contracts
- docs/DATABASE_SCHEMA.sql - Complete database structure

## Deployment Checklist

**Production Requirements:**
- HTTPS only (no HTTP)
- Belgian hosting provider
- Nginx with IP anonymization configured
- Redis with password protection
- Database with minimal privileges
- Regular security updates
- Monitoring without IP logging

**Before Deploy:**
1. Run all tests: `npm test`
2. Run security audit: `npm run security:check`
3. Build assets: `npm run build`
4. Verify environment variables
5. Check logs for any IP leakage
6. Review security headers

## Common Development Tasks

### Adding a New Forum Feature
1. Check docs/SPECIFICATION.md for requirements
2. Add model methods if database access needed
3. Add service layer for business logic
4. Create route handler with proper middleware
5. Add validation and sanitization
6. Write unit + integration tests
7. Test anonymization (no IP leakage)

### Modifying Authentication
1. MUST read docs/SECURITY_IMPLEMENTATION.md first
2. Consult with team on any changes
3. Extensive security testing required
4. Verify no IP logging introduced
5. Test lockout and rate limiting

### Performance Optimization
1. Check bundle size: `npm run build`
2. Optimize database queries (use EXPLAIN)
3. Add Redis caching if appropriate
4. Test on low-spec devices (3G network)
5. Verify accessibility not compromised
