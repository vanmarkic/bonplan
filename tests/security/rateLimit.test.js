/**
 * Rate Limiting Tests
 * Tests rate limiting for various forum operations
 */

const request = require('supertest');
const app = require('../../src/server');
const testDb = require('../helpers/testDb');
const testRedis = require('../helpers/testRedis');
const fixtures = require('../helpers/fixtures');
const Thread = require('../../src/models/Thread');
const Reply = require('../../src/models/Reply');

describe('Rate Limiting', () => {
  let agent;
  let csrfToken;
  let db;
  let testThread;

  beforeAll(async () => {
    await testDb.createTestDatabase();
    await testDb.createTables();
    await testRedis.createClient();
    db = await testDb.connect();
  });

  beforeEach(async () => {
    await testDb.cleanDatabase();
    await testRedis.flushDatabase();

    agent = request.agent(app);

    // Create and login test user
    await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
    await fixtures.createTestUser(db, fixtures.validUsers.testuser2);

    await agent
      .post('/auth/login')
      .send({
        pseudo: 'testuser1',
        pin: '1234'
      });

    // Get CSRF token
    const formRes = await agent.get('/threads/new');
    const csrfMatch = formRes.text.match(/<input[^>]*name="_csrf"[^>]*value="([^"]+)"/);
    csrfToken = csrfMatch ? csrfMatch[1] : null;

    // Create test thread
    testThread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);
  });

  afterAll(async () => {
    await testDb.disconnect();
    await testRedis.disconnect();
  });

  describe('Posting rate limits (3 per 5 minutes)', () => {
    it('should allow 3 posts within 5 minutes', async () => {
      const responses = [];

      for (let i = 1; i <= 3; i++) {
        const response = await agent
          .post('/threads/new')
          .send({
            title: `Thread ${i}`,
            body: `Body ${i}`,
            language: 'fr',
            _csrf: csrfToken
          });
        responses.push(response);
      }

      // All 3 should succeed
      responses.forEach(response => {
        expect(response.status).toBe(302);
      });

      const threads = await Thread.findAll();
      expect(threads).toHaveLength(4); // 1 test thread + 3 new threads
    });

    it('should block 4th post within 5 minutes', async () => {
      // Create 3 threads
      for (let i = 1; i <= 3; i++) {
        await agent
          .post('/threads/new')
          .send({
            title: `Thread ${i}`,
            body: `Body ${i}`,
            language: 'fr',
            _csrf: csrfToken
          });
      }

      // 4th should be rate limited
      const response = await agent
        .post('/threads/new')
        .send({
          title: 'Thread 4',
          body: 'Body 4',
          language: 'fr',
          _csrf: csrfToken
        });

      expect(response.status).toBe(429);
      expect(response.text).toContain('Too many requests');
      expect(response.text).toContain('Please wait');

      const threads = await Thread.findAll();
      expect(threads).toHaveLength(4); // Only 3 new + 1 test thread
    });

    it('should apply rate limit to replies', async () => {
      const responses = [];

      // Create 3 replies
      for (let i = 1; i <= 3; i++) {
        const response = await agent
          .post(`/threads/${testThread.id}/reply`)
          .send({
            body: `Reply ${i}`,
            _csrf: csrfToken
          });
        responses.push(response);
      }

      // All 3 should succeed
      responses.forEach(response => {
        expect(response.status).toBe(302);
      });

      // 4th reply should be rate limited
      const limitedResponse = await agent
        .post(`/threads/${testThread.id}/reply`)
        .send({
          body: 'Reply 4',
          _csrf: csrfToken
        });

      expect(limitedResponse.status).toBe(429);

      const replies = await Reply.findByThreadId(testThread.id);
      expect(replies).toHaveLength(3);
    });

    it('should track rate limit per user', async () => {
      // User 1 creates 3 posts
      for (let i = 1; i <= 3; i++) {
        await agent
          .post('/threads/new')
          .send({
            title: `User1 Thread ${i}`,
            body: 'Body',
            language: 'fr',
            _csrf: csrfToken
          });
      }

      // User 2 should still be able to post
      const agent2 = request.agent(app);
      await agent2
        .post('/auth/login')
        .send({
          pseudo: 'testuser2',
          pin: '5678'
        });

      const form2Res = await agent2.get('/threads/new');
      const csrf2Match = form2Res.text.match(/<input[^>]*name="_csrf"[^>]*value="([^"]+)"/);
      const csrfToken2 = csrf2Match ? csrf2Match[1] : null;

      const response = await agent2
        .post('/threads/new')
        .send({
          title: 'User2 Thread',
          body: 'Body',
          language: 'fr',
          _csrf: csrfToken2
        });

      expect(response.status).toBe(302); // Success

      const threads = await Thread.findAll();
      expect(threads).toHaveLength(5); // 1 test + 3 user1 + 1 user2
    });

    it('should reset rate limit after 5 minutes', async () => {
      // Create 3 posts
      for (let i = 1; i <= 3; i++) {
        await agent
          .post('/threads/new')
          .send({
            title: `Thread ${i}`,
            body: 'Body',
            language: 'fr',
            _csrf: csrfToken
          });
      }

      // Clear rate limit cache (simulating time passage)
      await testRedis.flushDatabase();

      // Re-login to get new session
      await agent
        .post('/auth/login')
        .send({
          pseudo: 'testuser1',
          pin: '1234'
        });

      const newFormRes = await agent.get('/threads/new');
      const newCsrfMatch = newFormRes.text.match(/<input[^>]*name="_csrf"[^>]*value="([^"]+)"/);
      const newCsrfToken = newCsrfMatch ? newCsrfMatch[1] : null;

      // Should be able to post again
      const response = await agent
        .post('/threads/new')
        .send({
          title: 'After Reset',
          body: 'Body',
          language: 'fr',
          _csrf: newCsrfToken
        });

      expect(response.status).toBe(302);
    });
  });

  describe('Editing rate limits (5 per minute)', () => {
    let editableThreads = [];

    beforeEach(async () => {
      // Create multiple threads for editing
      for (let i = 1; i <= 6; i++) {
        const thread = await fixtures.createTestThread(db, {
          title: `Editable ${i}`,
          body: 'Body',
          authorPseudo: 'testuser1'
        });
        editableThreads.push(thread);
      }
    });

    it('should allow 5 edits within 1 minute', async () => {
      const responses = [];

      for (let i = 0; i < 5; i++) {
        const response = await agent
          .post(`/threads/${editableThreads[i].id}/edit`)
          .send({
            title: `Edited ${i}`,
            body: 'Edited body',
            _csrf: csrfToken
          });
        responses.push(response);
      }

      // All 5 should succeed
      responses.forEach(response => {
        expect(response.status).toBe(302);
      });
    });

    it('should block 6th edit within 1 minute', async () => {
      // Make 5 edits
      for (let i = 0; i < 5; i++) {
        await agent
          .post(`/threads/${editableThreads[i].id}/edit`)
          .send({
            title: `Edited ${i}`,
            body: 'Edited body',
            _csrf: csrfToken
          });
      }

      // 6th edit should be rate limited
      const response = await agent
        .post(`/threads/${editableThreads[5].id}/edit`)
        .send({
          title: 'Edited 6',
          body: 'Should fail',
          _csrf: csrfToken
        });

      expect(response.status).toBe(429);
      expect(response.text).toContain('Too many edit attempts');
    });

    it('should apply edit rate limit to replies', async () => {
      const editableReplies = [];

      // Create 6 replies
      for (let i = 1; i <= 6; i++) {
        const reply = await Reply.create(testThread.id, `Reply ${i}`, 'testuser1');
        editableReplies.push(reply);
      }

      // Edit 5 replies
      for (let i = 0; i < 5; i++) {
        const response = await agent
          .post(`/replies/${editableReplies[i].id}/edit`)
          .send({
            body: `Edited Reply ${i}`,
            _csrf: csrfToken
          });
        expect(response.status).toBe(302);
      }

      // 6th edit should be rate limited
      const response = await agent
        .post(`/replies/${editableReplies[5].id}/edit`)
        .send({
          body: 'Should fail',
          _csrf: csrfToken
        });

      expect(response.status).toBe(429);
    });
  });

  describe('Reporting rate limits (3 per minute)', () => {
    let reportableThreads = [];

    beforeEach(async () => {
      // Create multiple threads to report
      for (let i = 1; i <= 4; i++) {
        const thread = await fixtures.createTestThread(db, {
          title: `Reportable ${i}`,
          body: 'Body',
          authorPseudo: 'testuser2'
        });
        reportableThreads.push(thread);
      }
    });

    it('should allow 3 reports within 1 minute', async () => {
      const responses = [];

      for (let i = 0; i < 3; i++) {
        const response = await agent
          .post(`/threads/${reportableThreads[i].id}/report`)
          .send({
            reason: `Report ${i}`,
            _csrf: csrfToken
          });
        responses.push(response);
      }

      // All 3 should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    it('should block 4th report within 1 minute', async () => {
      // Make 3 reports
      for (let i = 0; i < 3; i++) {
        await agent
          .post(`/threads/${reportableThreads[i].id}/report`)
          .send({
            reason: `Report ${i}`,
            _csrf: csrfToken
          });
      }

      // 4th report should be rate limited
      const response = await agent
        .post(`/threads/${reportableThreads[3].id}/report`)
        .send({
          reason: 'Report 4',
          _csrf: csrfToken
        });

      expect(response.status).toBe(429);
      expect(response.body.error).toContain('Too many reports');
    });

    it('should apply reporting rate limit to replies', async () => {
      const reportableReplies = [];

      // Create 4 replies
      for (let i = 1; i <= 4; i++) {
        const reply = await Reply.create(testThread.id, `Reply ${i}`, 'testuser2');
        reportableReplies.push(reply);
      }

      // Report 3 replies
      for (let i = 0; i < 3; i++) {
        const response = await agent
          .post(`/replies/${reportableReplies[i].id}/report`)
          .send({
            reason: `Report ${i}`,
            _csrf: csrfToken
          });
        expect(response.status).toBe(200);
      }

      // 4th report should be rate limited
      const response = await agent
        .post(`/replies/${reportableReplies[3].id}/report`)
        .send({
          reason: 'Report 4',
          _csrf: csrfToken
        });

      expect(response.status).toBe(429);
    });
  });

  describe('Search rate limits (10 per minute)', () => {
    it('should allow 10 searches within 1 minute', async () => {
      const responses = [];

      for (let i = 1; i <= 10; i++) {
        const response = await agent
          .post('/search')
          .send({
            query: `search term ${i}`
          });
        responses.push(response);
      }

      // All 10 should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    it('should block 11th search within 1 minute', async () => {
      // Make 10 searches
      for (let i = 1; i <= 10; i++) {
        await agent
          .post('/search')
          .send({
            query: `search term ${i}`
          });
      }

      // 11th search should be rate limited
      const response = await agent
        .post('/search')
        .send({
          query: 'search term 11'
        });

      expect(response.status).toBe(429);
      expect(response.text).toContain('Too many searches');
      expect(response.text).toContain('Please wait');
    });

    it('should apply search rate limit per IP for unauthenticated users', async () => {
      const unauthAgent = request.agent(app);

      // Make 10 searches without authentication
      for (let i = 1; i <= 10; i++) {
        const response = await unauthAgent
          .post('/search')
          .send({
            query: `search ${i}`
          });
        expect(response.status).toBe(200);
      }

      // 11th search should be rate limited
      const response = await unauthAgent
        .post('/search')
        .send({
          query: 'search 11'
        });

      expect(response.status).toBe(429);
    });
  });

  describe('Login rate limits', () => {
    it('should limit failed login attempts', async () => {
      const agent = request.agent(app);

      // Make 5 failed login attempts
      for (let i = 1; i <= 5; i++) {
        await agent
          .post('/auth/login')
          .send({
            pseudo: 'testuser1',
            pin: 'wrong'
          });
      }

      // 6th attempt should be rate limited
      const response = await agent
        .post('/auth/login')
        .send({
          pseudo: 'testuser1',
          pin: '1234' // Even correct PIN should be blocked
        });

      expect(response.status).toBe(429);
      expect(response.text).toContain('Too many login attempts');
    });

    it('should track failed logins per user', async () => {
      const agent1 = request.agent(app);
      const agent2 = request.agent(app);

      // User1: 5 failed attempts
      for (let i = 1; i <= 5; i++) {
        await agent1
          .post('/auth/login')
          .send({
            pseudo: 'testuser1',
            pin: 'wrong'
          });
      }

      // User2 should still be able to attempt login
      const response = await agent2
        .post('/auth/login')
        .send({
          pseudo: 'testuser2',
          pin: '5678'
        });

      expect(response.status).toBe(302); // Success
    });
  });

  describe('Registration rate limits', () => {
    it('should limit registrations per IP', async () => {
      const responses = [];

      // Create 3 accounts from same IP
      for (let i = 1; i <= 3; i++) {
        const agent = request.agent(app);
        const response = await agent
          .post('/auth/register')
          .send({
            pseudo: `newuser${i}`,
            pin: '1234',
            language: 'fr'
          });
        responses.push(response);
      }

      // All 3 should succeed
      responses.forEach(response => {
        expect(response.status).toBe(302);
      });

      // 4th registration should be rate limited
      const agent = request.agent(app);
      const response = await agent
        .post('/auth/register')
        .send({
          pseudo: 'newuser4',
          pin: '1234',
          language: 'fr'
        });

      expect(response.status).toBe(429);
      expect(response.text).toContain('Too many registrations');
      expect(response.text).toContain('same network');
    });
  });

  describe('API rate limits', () => {
    it('should apply stricter limits to API endpoints', async () => {
      // API endpoints typically have lower limits
      const responses = [];

      // Assuming API has limit of 60 per minute
      for (let i = 1; i <= 60; i++) {
        const response = await agent
          .get('/api/threads')
          .set('Accept', 'application/json');
        responses.push(response);
      }

      // 61st request should be rate limited
      const response = await agent
        .get('/api/threads')
        .set('Accept', 'application/json');

      expect(response.status).toBe(429);
      expect(response.body.error).toContain('Rate limit exceeded');
      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBe('0');
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });
  });

  describe('Rate limit headers', () => {
    it('should include rate limit headers in responses', async () => {
      const response = await agent
        .post('/threads/new')
        .send({
          title: 'Test',
          body: 'Body',
          language: 'fr',
          _csrf: csrfToken
        });

      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });

    it('should decrement remaining count', async () => {
      const response1 = await agent
        .post('/threads/new')
        .send({
          title: 'Thread 1',
          body: 'Body',
          language: 'fr',
          _csrf: csrfToken
        });

      const response2 = await agent
        .post('/threads/new')
        .send({
          title: 'Thread 2',
          body: 'Body',
          language: 'fr',
          _csrf: csrfToken
        });

      const remaining1 = parseInt(response1.headers['x-ratelimit-remaining']);
      const remaining2 = parseInt(response2.headers['x-ratelimit-remaining']);

      expect(remaining2).toBe(remaining1 - 1);
    });

    it('should show retry-after header when rate limited', async () => {
      // Exhaust rate limit
      for (let i = 1; i <= 3; i++) {
        await agent
          .post('/threads/new')
          .send({
            title: `Thread ${i}`,
            body: 'Body',
            language: 'fr',
            _csrf: csrfToken
          });
      }

      // Rate limited request
      const response = await agent
        .post('/threads/new')
        .send({
          title: 'Over limit',
          body: 'Body',
          language: 'fr',
          _csrf: csrfToken
        });

      expect(response.status).toBe(429);
      expect(response.headers['retry-after']).toBeDefined();

      const retryAfter = parseInt(response.headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(300); // Max 5 minutes
    });
  });

  describe('Rate limit bypass for moderators', () => {
    let modAgent;
    let modCsrfToken;

    beforeEach(async () => {
      modAgent = request.agent(app);

      await fixtures.createTestUser(db, fixtures.validUsers.moderator);

      await modAgent
        .post('/auth/login')
        .send({
          pseudo: 'moderator1',
          pin: '9999'
        });

      const formRes = await modAgent.get('/threads/new');
      const csrfMatch = formRes.text.match(/<input[^>]*name="_csrf"[^>]*value="([^"]+)"/);
      modCsrfToken = csrfMatch ? csrfMatch[1] : null;
    });

    it('should allow moderators higher rate limits', async () => {
      // Moderators might get 10 posts per 5 minutes instead of 3
      const responses = [];

      for (let i = 1; i <= 6; i++) {
        const response = await modAgent
          .post('/threads/new')
          .send({
            title: `Mod Thread ${i}`,
            body: 'Body',
            language: 'fr',
            _csrf: modCsrfToken
          });
        responses.push(response);
      }

      // All should succeed for moderator
      responses.forEach(response => {
        expect(response.status).toBe(302);
      });

      const threads = await Thread.findAll();
      expect(threads.length).toBeGreaterThanOrEqual(6);
    });

    it('should not rate limit moderation actions', async () => {
      // Create threads to moderate
      const threadsToModerate = [];
      for (let i = 1; i <= 10; i++) {
        const thread = await fixtures.createTestThread(db, {
          title: `Moderate ${i}`,
          body: 'Body',
          authorPseudo: 'testuser2'
        });
        threadsToModerate.push(thread);
      }

      // Moderate all threads rapidly (hide them)
      for (const thread of threadsToModerate) {
        const response = await modAgent
          .post(`/threads/${thread.id}/hide`)
          .send({
            _csrf: modCsrfToken
          });
        expect(response.status).toBe(302); // Should all succeed
      }
    });
  });
});