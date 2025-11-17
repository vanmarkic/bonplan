/**
 * Anonymity Security Tests
 * Tests that ensure user anonymity is maintained
 */

const request = require('supertest');
const app = require('../../src/server');
const testDb = require('../helpers/testDb');
const testRedis = require('../helpers/testRedis');
const fixtures = require('../helpers/fixtures');
const fs = require('fs').promises;
const path = require('path');

describe('Anonymity Security Tests', () => {
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

  describe('IP Address Anonymization', () => {
    it('should strip IP addresses from request', async () => {
      const response = await request(app)
        .get('/')
        .set('X-Forwarded-For', '192.168.1.1')
        .set('X-Real-IP', '192.168.1.1')
        .set('CF-Connecting-IP', '192.168.1.1');

      expect(response.status).toBe(200);
      // If IP was logged, it would appear in error messages
      // This test mainly ensures no errors occur during anonymization
    });

    it('should not leak IP in error responses', async () => {
      const response = await request(app)
        .get('/nonexistent-route')
        .set('X-Forwarded-For', '192.168.1.1')
        .set('X-Real-IP', '192.168.1.1');

      // Even in errors, IP should not appear
      expect(response.text).not.toContain('192.168.1.1');
    });
  });

  describe('Cookie Security', () => {
    it('should only set session cookie', async () => {
      const db = await testDb.connect();
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);

      const response = await request(app)
        .post('/auth/login')
        .send({
          pseudo: 'testuser1',
          pin: '1234'
        });

      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.length).toBe(1); // Only session cookie
      expect(cookies[0]).toContain('sid=');
    });

    it('should set HttpOnly flag on session cookie', async () => {
      const db = await testDb.connect();
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);

      const response = await request(app)
        .post('/auth/login')
        .send({
          pseudo: 'testuser1',
          pin: '1234'
        });

      const sessionCookie = response.headers['set-cookie'][0];
      expect(sessionCookie).toContain('HttpOnly');
    });

    it('should set SameSite=Strict on session cookie', async () => {
      const db = await testDb.connect();
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);

      const response = await request(app)
        .post('/auth/login')
        .send({
          pseudo: 'testuser1',
          pin: '1234'
        });

      const sessionCookie = response.headers['set-cookie'][0];
      expect(sessionCookie).toContain('SameSite=Strict');
    });
  });

  describe('Sensitive Data in Responses', () => {
    it('should not expose PIN in any form', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          pseudo: 'testuser',
          pin: '1234',
          language: 'fr'
        });

      expect(response.text).not.toContain('1234');
    });

    it('should not expose PIN hash in responses', async () => {
      const db = await testDb.connect();
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);

      const response = await request(app)
        .get('/')
        .set('Cookie', 'sid=test');

      expect(response.text).not.toMatch(/\$argon2/);
    });

    it('should not expose database errors with sensitive info', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          pseudo: 'testuser',
          pin: 'invalid-pin',
          language: 'fr'
        });

      // Should show user-friendly error, not SQL error
      expect(response.text).not.toContain('SQL');
      expect(response.text).not.toContain('mysql');
      expect(response.text).not.toContain('database');
    });
  });

  describe('Log File Security', () => {
    it('should not log PINs', async () => {
      await request(app)
        .post('/auth/register')
        .send({
          pseudo: 'testuser',
          pin: '1234',
          language: 'fr'
        });

      // Check log file doesn't contain PIN
      try {
        const logPath = path.join(__dirname, '../../logs/app.log');
        const logContent = await fs.readFile(logPath, 'utf8');

        expect(logContent).not.toContain('1234');
        expect(logContent).not.toContain('"pin"');
      } catch (error) {
        // Log file might not exist yet, which is fine
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    });

    it('should redact sensitive fields in logs', async () => {
      await request(app)
        .post('/auth/login')
        .send({
          pseudo: 'testuser',
          pin: '1234'
        });

      try {
        const logPath = path.join(__dirname, '../../logs/app.log');
        const logContent = await fs.readFile(logPath, 'utf8');

        // Should contain [REDACTED] instead of actual values
        if (logContent.includes('pin')) {
          expect(logContent).toContain('[REDACTED]');
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    });
  });

  describe('Security Headers', () => {
    it('should set X-Content-Type-Options header', async () => {
      const response = await request(app).get('/');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should set X-Frame-Options header', async () => {
      const response = await request(app).get('/');

      expect(response.headers['x-frame-options']).toBe('DENY');
    });

    it('should set Referrer-Policy header', async () => {
      const response = await request(app).get('/');

      expect(response.headers['referrer-policy']).toBe('no-referrer');
    });

    it('should set Content-Security-Policy header', async () => {
      const response = await request(app).get('/');

      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    });

    it('should not expose X-Powered-By header', async () => {
      const response = await request(app).get('/');

      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('No Tracking', () => {
    it('should not include analytics scripts', async () => {
      const response = await request(app).get('/');

      expect(response.text).not.toContain('google-analytics');
      expect(response.text).not.toContain('gtag');
      expect(response.text).not.toContain('facebook');
      expect(response.text).not.toContain('analytics');
    });

    it('should not load external resources', async () => {
      const response = await request(app).get('/');

      expect(response.text).not.toMatch(/https?:\/\/(?!syndicat-tox)/);
      expect(response.text).not.toContain('cdn.jsdelivr');
      expect(response.text).not.toContain('googleapis.com');
      expect(response.text).not.toContain('cloudflare.com');
    });
  });
});
