/**
 * Authentication Integration Tests
 * Tests full authentication flow including HTTP requests
 */

const request = require('supertest');
const app = require('../../src/server');
const testDb = require('../helpers/testDb');
const testRedis = require('../helpers/testRedis');
const fixtures = require('../helpers/fixtures');

describe('Authentication Integration', () => {
  let agent;

  beforeAll(async () => {
    await testDb.createTestDatabase();
    await testDb.createTables();
    await testRedis.createClient();
  });

  beforeEach(async () => {
    await testDb.cleanDatabase();
    await testRedis.flushDatabase();
    agent = request.agent(app); // Maintains cookies between requests
  });

  afterAll(async () => {
    await testDb.disconnect();
    await testRedis.disconnect();
  });

  describe('POST /auth/register', () => {
    it('should register new user successfully', async () => {
      const response = await agent
        .post('/auth/register')
        .send({
          pseudo: 'newuser',
          pin: '1234',
          language: 'fr'
        });

      expect(response.status).toBe(302); // Redirect
      expect(response.headers.location).toBe('/');
      expect(response.headers['set-cookie']).toBeDefined();
    });

    it('should auto-login after registration', async () => {
      await agent
        .post('/auth/register')
        .send({
          pseudo: 'newuser',
          pin: '1234',
          language: 'fr'
        });

      // Check if we can access protected routes
      const homeResponse = await agent.get('/');
      expect(homeResponse.text).toContain('newuser');
    });

    it('should reject duplicate pseudo', async () => {
      // Register first user
      await agent
        .post('/auth/register')
        .send({
          pseudo: 'testuser',
          pin: '1234',
          language: 'fr'
        });

      // Try to register same pseudo
      const response = await request(app)
        .post('/auth/register')
        .send({
          pseudo: 'testuser',
          pin: '5678',
          language: 'fr'
        });

      expect(response.status).toBe(200); // Returns form with error
      expect(response.text).toContain('déjà pris');
    });

    it('should reject invalid pseudo', async () => {
      const response = await agent
        .post('/auth/register')
        .send({
          pseudo: 'ab', // Too short
          pin: '1234',
          language: 'fr'
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('trop court');
    });

    it('should reject invalid PIN', async () => {
      const response = await agent
        .post('/auth/register')
        .send({
          pseudo: 'validuser',
          pin: '123', // Too short
          language: 'fr'
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('invalide');
    });

    it('should reject reserved pseudo', async () => {
      const response = await agent
        .post('/auth/register')
        .send({
          pseudo: 'admin',
          pin: '1234',
          language: 'fr'
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('réservé');
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      // Create test user before each login test
      const db = await testDb.connect();
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
    });

    it('should login with correct credentials', async () => {
      const response = await agent
        .post('/auth/login')
        .send({
          pseudo: 'testuser1',
          pin: '1234'
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/');
      expect(response.headers['set-cookie']).toBeDefined();
    });

    it('should maintain session after login', async () => {
      await agent
        .post('/auth/login')
        .send({
          pseudo: 'testuser1',
          pin: '1234'
        });

      const homeResponse = await agent.get('/');
      expect(homeResponse.text).toContain('testuser1');
    });

    it('should reject incorrect PIN', async () => {
      const response = await agent
        .post('/auth/login')
        .send({
          pseudo: 'testuser1',
          pin: '9999'
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('incorrect');
      expect(response.text).toContain('tentative'); // Shows attempts remaining
    });

    it('should lock account after 5 failed attempts', async () => {
      // Attempt 5 times with wrong PIN
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/auth/login')
          .send({
            pseudo: 'testuser1',
            pin: '9999'
          });
      }

      // 6th attempt
      const response = await request(app)
        .post('/auth/login')
        .send({
          pseudo: 'testuser1',
          pin: '9999'
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('verrouillé');
    });

    it('should reject correct PIN when account is locked', async () => {
      // Lock the account
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/auth/login')
          .send({
            pseudo: 'testuser1',
            pin: '9999'
          });
      }

      // Try with correct PIN
      const response = await request(app)
        .post('/auth/login')
        .send({
          pseudo: 'testuser1',
          pin: '1234'
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('verrouillé');
    });

    it('should reject non-existent user', async () => {
      const response = await agent
        .post('/auth/login')
        .send({
          pseudo: 'nonexistent',
          pin: '1234'
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('incorrect');
    });
  });

  describe('POST /auth/logout', () => {
    beforeEach(async () => {
      const db = await testDb.connect();
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);

      // Login first
      await agent
        .post('/auth/login')
        .send({
          pseudo: 'testuser1',
          pin: '1234'
        });
    });

    it('should logout and destroy session', async () => {
      const response = await agent
        .post('/auth/logout');

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/');
    });

    it('should not be logged in after logout', async () => {
      await agent.post('/auth/logout');

      const homeResponse = await agent.get('/');
      expect(homeResponse.text).not.toContain('testuser1');
      expect(homeResponse.text).toContain('Connexion'); // Shows login link
    });
  });

  describe('GET /auth/register', () => {
    it('should show registration form', async () => {
      const response = await agent.get('/auth/register');

      expect(response.status).toBe(200);
      expect(response.text).toContain('Créer un compte anonyme');
      expect(response.text).toContain('pseudo');
      expect(response.text).toContain('PIN');
    });

    it('should redirect if already logged in', async () => {
      const db = await testDb.connect();
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);

      await agent
        .post('/auth/login')
        .send({
          pseudo: 'testuser1',
          pin: '1234'
        });

      const response = await agent.get('/auth/register');
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/');
    });
  });

  describe('GET /auth/login', () => {
    it('should show login form', async () => {
      const response = await agent.get('/auth/login');

      expect(response.status).toBe(200);
      expect(response.text).toContain('Connexion');
      expect(response.text).toContain('pseudo');
      expect(response.text).toContain('PIN');
    });

    it('should redirect if already logged in', async () => {
      const db = await testDb.connect();
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);

      await agent
        .post('/auth/login')
        .send({
          pseudo: 'testuser1',
          pin: '1234'
        });

      const response = await agent.get('/auth/login');
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/');
    });
  });

  describe('Session Persistence', () => {
    beforeEach(async () => {
      const db = await testDb.connect();
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
    });

    it('should maintain session across multiple requests', async () => {
      await agent
        .post('/auth/login')
        .send({
          pseudo: 'testuser1',
          pin: '1234'
        });

      // Make multiple requests
      const responses = await Promise.all([
        agent.get('/'),
        agent.get('/about'),
        agent.get('/privacy')
      ]);

      responses.forEach(response => {
        expect(response.text).toContain('testuser1');
      });
    });

    it('should have secure cookie settings', async () => {
      const response = await agent
        .post('/auth/login')
        .send({
          pseudo: 'testuser1',
          pin: '1234'
        });

      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();

      const sessionCookie = cookies.find(c => c.startsWith('sid='));
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toContain('HttpOnly');
      expect(sessionCookie).toContain('SameSite=Strict');
    });
  });
});
