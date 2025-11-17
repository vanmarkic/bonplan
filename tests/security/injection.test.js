/**
 * Injection Attack Security Tests
 * Tests protection against SQL injection, XSS, etc.
 */

const request = require('supertest');
const app = require('../../src/server');
const testDb = require('../helpers/testDb');
const testRedis = require('../helpers/testRedis');
const User = require('../../src/models/User');

describe('Injection Attack Security Tests', () => {
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

  describe('SQL Injection Protection', () => {
    it('should prevent SQL injection in pseudo field', async () => {
      const maliciousPseudo = "admin' OR '1'='1";

      const response = await request(app)
        .post('/auth/register')
        .send({
          pseudo: maliciousPseudo,
          pin: '1234',
          language: 'fr'
        });

      // Should reject due to invalid characters
      expect(response.status).toBe(200);
      expect(response.text).toContain('invalide');
    });

    it('should prevent SQL injection in login', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          pseudo: "admin' OR '1'='1'--",
          pin: '1234'
        });

      // Should reject, not bypass authentication
      expect(response.status).toBe(200);
      expect(response.text).toContain('incorrect');
    });

    it('should use parameterized queries', async () => {
      // Try to inject SQL through PIN field
      const db = await testDb.connect();

      const testPseudo = 'testuser';
      const { hash, salt } = await require('../../src/services/authService').hashPin('1234');
      await User.create(testPseudo, hash, salt, 'fr');

      // Try SQL injection in findByPseudo
      const result = await User.findByPseudo("testuser' OR '1'='1");

      // Should return null, not all users
      expect(result).toBeNull();
    });

    it('should handle SQL special characters safely', async () => {
      const specialChars = ["test'user", "test\"user", "test`user", "test;user"];

      for (const pseudo of specialChars) {
        const response = await request(app)
          .post('/auth/register')
          .send({
            pseudo,
            pin: '1234',
            language: 'fr'
          });

        // Should reject due to invalid format, not cause SQL error
        expect(response.status).toBe(200);
        expect(response.text).not.toContain('SQL');
        expect(response.text).not.toContain('syntax error');
      }
    });
  });

  describe('XSS Protection', () => {
    it('should sanitize script tags in pseudo', async () => {
      const xssPseudo = '<script>alert("xss")</script>';

      const response = await request(app)
        .post('/auth/register')
        .send({
          pseudo: xssPseudo,
          pin: '1234',
          language: 'fr'
        });

      // Should reject due to invalid characters
      expect(response.status).toBe(200);
      expect(response.text).toContain('invalide');
    });

    it('should not execute JavaScript in responses', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          pseudo: '<img src=x onerror=alert(1)>',
          pin: '1234',
          language: 'fr'
        });

      // Response should not contain unescaped HTML
      expect(response.text).not.toContain('<img src=x onerror=alert(1)>');
    });

    it('should escape HTML entities in error messages', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          pseudo: '<b>bold</b>',
          pin: '1234',
          language: 'fr'
        });

      // Should show escaped version or reject
      expect(response.status).toBe(200);
      if (response.text.includes('bold')) {
        expect(response.text).not.toContain('<b>bold</b>');
      }
    });
  });

  describe('Command Injection Protection', () => {
    it('should not execute shell commands in pseudo', async () => {
      const commandInjection = 'test; rm -rf /';

      const response = await request(app)
        .post('/auth/register')
        .send({
          pseudo: commandInjection,
          pin: '1234',
          language: 'fr'
        });

      // Should reject due to invalid characters
      expect(response.status).toBe(200);
      expect(response.text).toContain('invalide');
    });

    it('should not execute system commands via backticks', async () => {
      const commandInjection = '`whoami`';

      const response = await request(app)
        .post('/auth/register')
        .send({
          pseudo: commandInjection,
          pin: '1234',
          language: 'fr'
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('invalide');
    });
  });

  describe('Path Traversal Protection', () => {
    it('should not allow directory traversal in routes', async () => {
      const response = await request(app)
        .get('/../../../etc/passwd');

      expect(response.status).not.toBe(200);
      expect(response.text).not.toContain('root:');
    });

    it('should not serve files outside public directory', async () => {
      const response = await request(app)
        .get('/public/../../package.json');

      expect(response.status).toBe(404);
    });
  });

  describe('NoSQL Injection Protection (Redis)', () => {
    it('should handle malicious session IDs safely', async () => {
      const maliciousSessionId = '{"$gt":""}';

      const response = await request(app)
        .get('/')
        .set('Cookie', `sid=${maliciousSessionId}`);

      // Should handle gracefully without error
      expect(response.status).toBe(200);
    });
  });

  describe('Input Validation', () => {
    it('should enforce maximum length limits', async () => {
      const longPseudo = 'a'.repeat(1000);

      const response = await request(app)
        .post('/auth/register')
        .send({
          pseudo: longPseudo,
          pin: '1234',
          language: 'fr'
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('trop long');
    });

    it('should enforce type validation on PIN', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          pseudo: 'testuser',
          pin: { $ne: null }, // Object instead of string
          language: 'fr'
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('invalide');
    });

    it('should reject null bytes in input', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          pseudo: 'test\0user',
          pin: '1234',
          language: 'fr'
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('invalide');
    });
  });
});
