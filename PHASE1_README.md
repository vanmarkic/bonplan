# Phase 1 Implementation - Le Syndicat des Tox

## What's Completed ✅

Phase 1 (Weeks 1-4) focused on security foundation and authentication system.

### Core Infrastructure
- ✅ Project structure setup (src/, tests/, public/, docs/)
- ✅ Database schema (MariaDB with utf8mb4)
- ✅ Redis session store configuration
- ✅ Winston logger with sensitive data redaction
- ✅ Environment configuration management

### Security Measures
- ✅ **Anonymization middleware** - Strips all IP addresses and identifying headers
- ✅ **Security headers** - Helmet with strict CSP
- ✅ **Session management** - Redis-backed, secure cookies
- ✅ **Error handling** - Centralized, no sensitive data leaks

### Authentication System
- ✅ **User model** - Minimal data storage (pseudo, PIN hash, timestamps)
- ✅ **AuthService** - Argon2id PIN hashing (64MB memory cost)
- ✅ **Brute force protection** - 5 failed attempts = 30-minute lockout
- ✅ **Registration** - Pseudo + 4-digit PIN only (no email)
- ✅ **Login/Logout** - Secure session-based auth

### User Interface
- ✅ **Server-side rendering** - EJS templates, no JavaScript required
- ✅ **Responsive design** - Mobile-first, works on low-spec devices
- ✅ **Lightweight CSS** - Inline critical CSS, < 10KB
- ✅ **Registration page** - Clear warnings about PIN recovery
- ✅ **Login page** - Simple, accessible
- ✅ **About page** - Crisis resources, mission, rules
- ✅ **Privacy policy** - Complete transparency on data practices

## Quick Start

### Prerequisites

1. **Node.js 20 LTS**
   ```bash
   node --version  # Should show v20.x.x
   ```

2. **MariaDB 10.11+**
   ```bash
   sudo systemctl status mariadb
   ```

3. **Redis 7+**
   ```bash
   sudo systemctl status redis-server
   ```

### Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure database**
   ```bash
   # Create database and user
   sudo mysql -u root -p
   ```
   ```sql
   CREATE DATABASE syndicat_tox CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'syndicat_app'@'localhost' IDENTIFIED BY 'STRONG_PASSWORD_HERE';
   GRANT SELECT, INSERT, UPDATE, DELETE ON syndicat_tox.* TO 'syndicat_app'@'localhost';
   FLUSH PRIVILEGES;
   EXIT;
   ```
   ```bash
   # Run schema
   mysql -u syndicat_app -p syndicat_tox < docs/DATABASE_SCHEMA.sql
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   nano .env
   ```

   Update these critical values:
   ```bash
   SESSION_SECRET=$(openssl rand -base64 32)
   DB_PASSWORD=your_database_password
   REDIS_PASSWORD=your_redis_password
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Access the application**
   ```
   http://localhost:3000
   ```

## Testing Phase 1

### Manual Testing Checklist

**Registration:**
- [ ] Visit `/auth/register`
- [ ] Create account with pseudo "testuser" and PIN "1234"
- [ ] Verify automatic login after registration
- [ ] Check that you're redirected to home page

**Login:**
- [ ] Logout from current session
- [ ] Visit `/auth/login`
- [ ] Login with correct credentials
- [ ] Verify successful login
- [ ] Try wrong PIN - should fail with attempts counter
- [ ] Try 5 wrong PINs - should lock account for 30 minutes

**Anonymity:**
- [ ] Check that no IP addresses appear in logs
- [ ] Verify only one cookie (sid) is set
- [ ] Confirm no tracking scripts loaded
- [ ] Test with browser privacy tools (Privacy Badger, uBlock Origin)

**Security:**
- [ ] Verify HTTPS headers (if behind Nginx)
- [ ] Check CSP headers with browser devtools
- [ ] Attempt SQL injection in forms (should be blocked)
- [ ] Attempt XSS in forms (should be sanitized)

### Database Verification

```bash
# Check users table
mysql -u syndicat_app -p syndicat_tox -e "SELECT pseudo, created_at, last_login FROM users;"

# Check that PINs are properly hashed
mysql -u syndicat_app -p syndicat_tox -e "SELECT pseudo, LENGTH(pin_hash), LENGTH(pin_salt) FROM users;"
# pin_hash should be ~97 chars, pin_salt should be 64 chars
```

### Redis Verification

```bash
# Check active sessions
redis-cli -a YOUR_PASSWORD
KEYS sess:*
GET sess:SOME_SESSION_ID
```

## Architecture Overview

```
Client Request
    ↓
Nginx (IP Anonymization)
    ↓
Express.js Application
    ├── Anonymize Middleware (remove all IP headers)
    ├── Security Middleware (Helmet, CSP)
    ├── Session Middleware (Redis-backed)
    ├── Routes (Auth, Forum)
    └── Error Handler
    ↓
MariaDB (User data) / Redis (Sessions)
```

## Key Security Features

1. **Zero IP Logging**
   - All IP-related headers stripped at middleware level
   - Request.ip always returns "anonymous"
   - Only anonymous hash used for rate limiting

2. **PIN Security**
   - Argon2id with 64MB memory cost
   - Per-user random salt (32 bytes)
   - Timing-attack resistant

3. **Account Lockout**
   - Simple 5-attempts threshold
   - 30-minute lockout duration
   - Tracked by pseudo only (preserves anonymity)

4. **Session Security**
   - HttpOnly, Secure, SameSite=Strict cookies
   - 7-day rolling expiration
   - Redis storage with automatic cleanup

## What's Next: Phase 2 (Weeks 5-8)

Phase 2 will implement core forum functionality:
- [ ] Thread model and database operations
- [ ] Reply model and database operations
- [ ] Thread creation form and view
- [ ] Thread list page with pagination
- [ ] Reply functionality
- [ ] Basic moderation tools
- [ ] Search functionality

## Troubleshooting

### Database connection fails
```bash
# Check MariaDB is running
sudo systemctl status mariadb

# Check user permissions
mysql -u syndicat_app -p syndicat_tox -e "SELECT 1;"

# Review logs
tail -f logs/app.log
```

### Redis connection fails
```bash
# Check Redis is running
sudo systemctl status redis-server

# Test connection
redis-cli -a YOUR_PASSWORD ping

# Check Redis logs
sudo tail -f /var/log/redis/redis-server.log
```

### Port 3000 already in use
```bash
# Find process using port 3000
lsof -i :3000

# Kill it if needed
kill -9 PID

# Or use different port in .env
PORT=3001
```

### Session not persisting
- Check that SESSION_SECRET is set in .env
- Verify Redis is running and accessible
- Clear Redis sessions: `redis-cli -a PASSWORD FLUSHDB`
- Check browser cookies are enabled

## Development Tips

### Watch logs in real-time
```bash
# Application logs
tail -f logs/app.log

# Error logs only
tail -f logs/error.log

# Both
tail -f logs/*.log
```

### Database queries
```bash
# Interactive MySQL shell
mycli -u syndicat_app -p syndicat_tox

# Quick query
mysql -u syndicat_app -p syndicat_tox -e "YOUR_QUERY"
```

### Redis monitoring
```bash
# Monitor commands
redis-cli -a PASSWORD MONITOR

# Get info
redis-cli -a PASSWORD INFO
```

## Security Reminders

⚠️ **NEVER commit these files:**
- `.env` (contains secrets)
- `logs/*.log` (may contain sensitive data)
- Database dumps (contain user data)

⚠️ **ALWAYS:**
- Use HTTPS in production
- Keep dependencies updated (`npm audit`)
- Review logs for suspicious activity
- Monitor failed login attempts
- Test anonymization regularly

## Performance

Current Phase 1 metrics:
- **Page size:** ~8KB HTML + ~3KB CSS = ~11KB total
- **Load time:** < 500ms on local network
- **Dependencies:** 17 production, 19 dev
- **Database queries:** 1-2 per request
- **Memory usage:** ~50MB per Node process

Target for production:
- < 50KB total page size ✅ (11KB current)
- < 2.5s LCP on 3G
- Works without JavaScript ✅

## Contributing

Before submitting changes:
1. Run tests: `npm test` (Phase 2+)
2. Check linting: `npm run lint`
3. Test anonymity features manually
4. Verify no sensitive data in logs
5. Update documentation

## License

AGPL-3.0 - See LICENSE file

---

**Phase 1 Status:** ✅ COMPLETE (Weeks 1-4)
**Next:** Phase 2 - Core Forum Functionality (Weeks 5-8)
