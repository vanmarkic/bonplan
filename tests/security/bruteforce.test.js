/**
 * Brute Force Protection Tests
 */

const request = require('supertest');
const app = require('../../src/server');
const testDb = require('../helpers/testDb');
const testRedis = require('../helpers/testRedis');
const fixtures = require('../helpers/fixtures');
const User = require('../../src/models/User');

describe('Brute Force Protection', () => {
  beforeAll(async () => {
    await testDb.createTestDatabase();
    await testDb.createTables();
    await testRedis.createClient();
  });

  beforeEach(async () => {
    await testDb.cleanDatabase();
    await testRedis.flushDatabase();

    // Create test user
    const db = await testDb.connect();
    await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
  });

  afterAll(async () => {
    await testDb.disconnect();
    await testRedis.disconnect();
  });

  describe('Login Attempt Limiting', () => {
    it('should allow up to 5 failed attempts', async () => {
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post('/auth/login')
          .send({
            pseudo: 'testuser1',
            pin: '9999'
          });

        if (i < 4) {
          expect(response.text).toContain('tentative'); // Shows attempts remaining
        }
      }

      // 5th attempt should succeed without lockout
      const user = await User.findByPseudo('testuser1');
      expect(user.failed_attempts).toBe(5);
    });

    it('should lock account after 5 failed attempts', async () => {
      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/auth/login')
          .send({
            pseudo: 'testuser1',
            pin: '9999'
          });
      }

      // 6th attempt should be blocked
      const response = await request(app)
        .post('/auth/login')
        .send({
          pseudo: 'testuser1',
          pin: '9999'
        });

      expect(response.text).toContain('verrouillé');
    });

    it('should lockout for 30 minutes', async () => {
      // Trigger lockout
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/auth/login')
          .send({
            pseudo: 'testuser1',
            pin: '9999'
          });
      }

      // Check lockout timestamp
      const user = await User.findByPseudo('testuser1');
      const lockoutTime = new Date(user.locked_until);
      const now = new Date();
      const diffMinutes = (lockoutTime - now) / 60000;

      expect(diffMinutes).toBeGreaterThan(29);
      expect(diffMinutes).toBeLessThan(31);
    });

    it('should reset counter on successful login', async () => {
      // Make 2 failed attempts
      await request(app)
        .post('/auth/login')
        .send({
          pseudo: 'testuser1',
          pin: '9999'
        });

      await request(app)
        .post('/auth/login')
        .send({
          pseudo: 'testuser1',
          pin: '9999'
        });

      // Successful login
      await request(app)
        .post('/auth/login')
        .send({
          pseudo: 'testuser1',
          pin: '1234'
        });

      // Check counter is reset
      const user = await User.findByPseudo('testuser1');
      expect(user.failed_attempts).toBe(0);
      expect(user.locked_until).toBeNull();
    });

    it('should block even correct PIN when locked', async () => {
      // Trigger lockout
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

      expect(response.text).toContain('verrouillé');
    });
  });

  describe('Per-User Limiting', () => {
    beforeEach(async () => {
      // Create second test user
      const db = await testDb.connect();
      await fixtures.createTestUser(db, fixtures.validUsers.testuser2);
    });

    it('should track attempts independently per user', async () => {
      // Fail on testuser1
      await request(app)
        .post('/auth/login')
        .send({
          pseudo: 'testuser1',
          pin: '9999'
        });

      await request(app)
        .post('/auth/login')
        .send({
          pseudo: 'testuser1',
          pin: '9999'
        });

      // testuser2 should still have 0 failed attempts
      const user1 = await User.findByPseudo('testuser1');
      const user2 = await User.findByPseudo('testuser2');

      expect(user1.failed_attempts).toBe(2);
      expect(user2.failed_attempts).toBe(0);
    });

    it('should not lock user2 when user1 is locked', async () => {
      // Lock testuser1
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/auth/login')
          .send({
            pseudo: 'testuser1',
            pin: '9999'
          });
      }

      // testuser2 should still be able to login
      const response = await request(app)
        .post('/auth/login')
        .send({
          pseudo: 'testuser2',
          pin: '5678'
        });

      expect(response.status).toBe(302); // Successful redirect
    });
  });

  describe('Timing Attack Protection', () => {
    it('should take similar time for existing and non-existing users', async () => {
      const startExisting = Date.now();
      await request(app)
        .post('/auth/login')
        .send({
          pseudo: 'testuser1',
          pin: '9999'
        });
      const timeExisting = Date.now() - startExisting;

      const startNonExisting = Date.now();
      await request(app)
        .post('/auth/login')
        .send({
          pseudo: 'nonexistent',
          pin: '9999'
        });
      const timeNonExisting = Date.now() - startNonExisting;

      // Times should be within 500ms of each other (Argon2id is slow)
      const diff = Math.abs(timeExisting - timeNonExisting);
      expect(diff).toBeLessThan(500);
    });
  });
});
