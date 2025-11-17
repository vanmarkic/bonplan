# Test Suite - Le Syndicat des Tox

Comprehensive test suite for Phase 1 authentication and security features.

## Test Coverage

### Unit Tests
- ✅ **User Model** - 11 tests
  - CRUD operations
  - Failed attempt tracking
  - Account locking
  - Stats and deletion

- ✅ **AuthService** - 15 tests
  - Pseudo validation
  - PIN validation
  - PIN hashing and verification
  - Registration flow
  - Login flow with lockout

- ✅ **Anonymization Middleware** - 8 tests
  - IP header removal
  - req.ip override
  - Anonymous ID handling

### Integration Tests
- ✅ **Authentication Flow** - 18 tests
  - Registration (success, validation, duplicates)
  - Login (success, failures, lockout)
  - Logout (session destruction)
  - Session persistence
  - Cookie security

### Security Tests
- ✅ **Anonymity Protection** - 12 tests
  - IP anonymization
  - Cookie security (HttpOnly, SameSite)
  - No sensitive data in responses
  - Log file security
  - Security headers
  - No tracking scripts

- ✅ **Injection Protection** - 15 tests
  - SQL injection attempts
  - XSS attempts
  - Command injection
  - Path traversal
  - NoSQL injection
  - Input validation

- ✅ **Brute Force Protection** - 10 tests
  - Login attempt limiting (5 attempts)
  - 30-minute lockout
  - Per-user tracking
  - Counter reset on success
  - Timing attack protection

**Total: 89 tests**

## Prerequisites

### Test Database Setup

```bash
# Create test database
sudo mysql -u root -p

CREATE DATABASE syndicat_tox_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'test_user'@'localhost' IDENTIFIED BY 'test_password';
GRANT ALL PRIVILEGES ON syndicat_tox_test.* TO 'test_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### Test Redis Setup

Tests use Redis DB 1 (not default DB 0) to avoid conflicts with development data.

```bash
# Verify Redis is running
sudo systemctl status redis-server
```

## Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests Only
```bash
npm run test:integration
```

### Security Tests Only
```bash
npm run test:security
```

### Watch Mode (Development)
```bash
npm test -- --watch
```

### Coverage Report
```bash
npm test -- --coverage
```

## Test Structure

```
tests/
├── setup.js                      # Test configuration
├── helpers/
│   ├── testDb.js                # Database test helpers
│   ├── testRedis.js             # Redis test helpers
│   └── fixtures.js              # Test data fixtures
├── unit/
│   ├── models/
│   │   └── User.test.js         # User model tests
│   ├── services/
│   │   └── authService.test.js  # Auth service tests
│   └── middleware/
│       └── anonymize.test.js    # Anonymization tests
├── integration/
│   └── auth.test.js             # Authentication flow tests
└── security/
    ├── anonymity.test.js        # Anonymity protection tests
    ├── injection.test.js        # Injection attack tests
    └── bruteforce.test.js       # Brute force tests
```

## Writing New Tests

### Test Template

```javascript
const testDb = require('../helpers/testDb');
const testRedis = require('../helpers/testRedis');

describe('Feature Name', () => {
  beforeAll(async () => {
    await testDb.createTestDatabase();
    await testDb.createTables();
    await testRedis.createClient();
  });

  beforeEach(async () => {
    await testDb.cleanDatabase();
    await testRedis.flushDatabase();
  });

  afterAll(async () => {
    await testDb.disconnect();
    await testRedis.disconnect();
  });

  it('should do something', async () => {
    // Your test here
    expect(result).toBe(expected);
  });
});
```

### Using Fixtures

```javascript
const fixtures = require('../helpers/fixtures');

// Create test user
const db = await testDb.connect();
await fixtures.createTestUser(db, fixtures.validUsers.testuser1);

// Use predefined data
console.log(fixtures.validUsers.testuser1); // { pseudo: 'testuser1', pin: '1234', language: 'fr' }
console.log(fixtures.invalidPseudos); // ['', 'ab', 'too-long-pseudo', ...]
```

## Test Environment

Tests run with:
- `NODE_ENV=test`
- `LOG_LEVEL=error` (quiet logs)
- Redis DB 1 (separate from development)
- Test database: `syndicat_tox_test`
- Port 3001 (different from development)

## Coverage Goals

- **Unit Tests:** 90%+ coverage
- **Integration Tests:** Cover all user flows
- **Security Tests:** Cover OWASP Top 10

Current coverage (Phase 1):
- User Model: 100%
- AuthService: 95%
- Middleware: 100%
- Routes: 85%

## Common Issues

### "Cannot connect to database"
```bash
# Check test database exists
mysql -u test_user -ptest_password syndicat_tox_test -e "SELECT 1;"

# Recreate if needed
mysql -u root -p < tests/setup.sql
```

### "Redis connection failed"
```bash
# Check Redis is running
sudo systemctl status redis-server

# Check Redis accepts connections
redis-cli ping
```

### "Tests hanging"
- Check for unclosed database connections
- Verify `afterAll` hooks are called
- Increase Jest timeout in tests/setup.js

### "Permission denied on logs/"
```bash
# Create logs directory
mkdir -p logs
chmod 755 logs
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Test Suite
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      mariadb:
        image: mariadb:10.11
        env:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: syndicat_tox_test
          MYSQL_USER: test_user
          MYSQL_PASSWORD: test_password
        options: >-
          --health-cmd="mysqladmin ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=3

      redis:
        image: redis:7
        options: >-
          --health-cmd="redis-cli ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=3

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test
        env:
          DB_HOST: 127.0.0.1
          DB_PORT: 3306
          DB_NAME: syndicat_tox_test
          DB_USER: test_user
          DB_PASSWORD: test_password
          REDIS_HOST: 127.0.0.1
          REDIS_PORT: 6379

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

## Security Testing Best Practices

### What We Test
✅ IP anonymization
✅ Cookie security
✅ SQL injection
✅ XSS attacks
✅ Command injection
✅ Path traversal
✅ Brute force protection
✅ Timing attacks
✅ Input validation
✅ No data leaks

### What We Don't Test (Yet)
- ⏳ CSRF protection (Phase 2)
- ⏳ Rate limiting (Phase 2)
- ⏳ Content filtering (Phase 2)
- ⏳ Load testing (Phase 5)
- ⏳ Penetration testing (Phase 5)

## Performance Benchmarks

Tests should complete in:
- Unit tests: < 5 seconds
- Integration tests: < 15 seconds
- Security tests: < 20 seconds
- **Total: < 40 seconds**

Slow tests indicate:
- Too many database operations
- Missing test data cleanup
- Network timeouts
- Inefficient Argon2id settings (use lower cost for tests)

## Debugging Tests

### Verbose Output
```bash
npm test -- --verbose
```

### Run Single Test File
```bash
npm test -- tests/unit/models/User.test.js
```

### Run Single Test
```bash
npm test -- -t "should create a new user"
```

### Debug in VS Code
```json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Debug",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

## Continuous Improvement

### Adding Tests
1. Write test for new feature
2. Ensure test fails (red)
3. Implement feature
4. Ensure test passes (green)
5. Refactor if needed

### Maintaining Tests
- Review test failures weekly
- Update fixtures when models change
- Keep tests independent
- Avoid test interdependencies
- Clean up test data properly

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [Node.js Testing Best Practices](https://github.com/goldbergyoni/nodebestpractices#6-testing-best-practices)

---

**Remember:** These tests protect vulnerable users. Every test matters.
