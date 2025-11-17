/**
 * CSRF Protection Tests
 * Tests Cross-Site Request Forgery protection
 */

const request = require('supertest');
const app = require('../../src/server');
const testDb = require('../helpers/testDb');
const testRedis = require('../helpers/testRedis');
const fixtures = require('../helpers/fixtures');
const Thread = require('../../src/models/Thread');

describe('CSRF Protection', () => {
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

    // Get CSRF token from a form
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

  describe('POST requests without CSRF token', () => {
    it('should reject thread creation without CSRF token', async () => {
      const response = await agent
        .post('/threads/new')
        .send({
          title: 'Test Thread',
          body: 'Test Body',
          language: 'fr'
          // No _csrf token
        });

      expect(response.status).toBe(403);
      expect(response.text).toContain('Invalid CSRF token');

      const threads = await Thread.findAll();
      expect(threads).toHaveLength(1); // Only the pre-created test thread
    });

    it('should reject reply creation without CSRF token', async () => {
      const response = await agent
        .post(`/threads/${testThread.id}/reply`)
        .send({
          body: 'Test Reply'
          // No _csrf token
        });

      expect(response.status).toBe(403);
      expect(response.text).toContain('Invalid CSRF token');
    });

    it('should reject thread editing without CSRF token', async () => {
      const response = await agent
        .post(`/threads/${testThread.id}/edit`)
        .send({
          title: 'Edited Title',
          body: 'Edited Body'
          // No _csrf token
        });

      expect(response.status).toBe(403);

      const thread = await Thread.findById(testThread.id);
      expect(thread.title).toBe('Test Thread 1'); // Unchanged
    });

    it('should reject thread deletion without CSRF token', async () => {
      const response = await agent
        .post(`/threads/${testThread.id}/delete`)
        .send({}); // No _csrf token

      expect(response.status).toBe(403);

      const thread = await Thread.findById(testThread.id);
      expect(thread.is_deleted).toBe(0); // Not deleted
    });

    it('should reject profile updates without CSRF token', async () => {
      const response = await agent
        .post('/profile/update')
        .send({
          language: 'nl'
          // No _csrf token
        });

      expect(response.status).toBe(403);
    });

    it('should reject logout without CSRF token', async () => {
      const response = await agent
        .post('/auth/logout')
        .send({}); // No _csrf token

      expect(response.status).toBe(403);

      // Should still be logged in
      const profileRes = await agent.get('/profile');
      expect(profileRes.status).toBe(200);
      expect(profileRes.text).toContain('testuser1');
    });
  });

  describe('GET requests work without CSRF token', () => {
    it('should allow GET requests without token', async () => {
      const responses = await Promise.all([
        agent.get('/'),
        agent.get('/threads'),
        agent.get(`/threads/${testThread.id}`),
        agent.get('/search'),
        agent.get('/profile')
      ]);

      responses.forEach(response => {
        expect(response.status).toBeLessThan(400); // All successful
      });
    });

    it('should allow static assets without token', async () => {
      const responses = await Promise.all([
        agent.get('/static/css/style.css'),
        agent.get('/static/js/main.js'),
        agent.get('/favicon.ico')
      ]);

      responses.forEach(response => {
        expect([200, 304, 404]).toContain(response.status); // OK, Not Modified, or Not Found
      });
    });
  });

  describe('Valid CSRF token accepted', () => {
    it('should accept valid CSRF token for thread creation', async () => {
      const response = await agent
        .post('/threads/new')
        .send({
          title: 'New Thread with CSRF',
          body: 'Body content',
          language: 'fr',
          _csrf: csrfToken
        });

      expect(response.status).toBe(302); // Redirect on success
      expect(response.headers.location).toMatch(/^\/threads\/\d+$/);

      const threads = await Thread.findAll();
      expect(threads).toHaveLength(2); // Test thread + new thread
    });

    it('should accept valid CSRF token for reply', async () => {
      const response = await agent
        .post(`/threads/${testThread.id}/reply`)
        .send({
          body: 'Reply with CSRF',
          _csrf: csrfToken
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`/threads/${testThread.id}#replies`);
    });

    it('should accept valid CSRF token in different formats', async () => {
      // Test form-urlencoded
      const formResponse = await agent
        .post(`/threads/${testThread.id}/reply`)
        .type('form')
        .send(`body=Form Reply&_csrf=${csrfToken}`);

      expect(formResponse.status).toBe(302);

      // Test JSON
      const jsonResponse = await agent
        .post('/api/threads/report')
        .set('Content-Type', 'application/json')
        .send({
          threadId: testThread.id,
          reason: 'Test',
          _csrf: csrfToken
        });

      expect(jsonResponse.status).not.toBe(403);
    });
  });

  describe('Invalid CSRF token rejected', () => {
    it('should reject invalid CSRF token', async () => {
      const response = await agent
        .post('/threads/new')
        .send({
          title: 'Thread with Bad Token',
          body: 'Body',
          language: 'fr',
          _csrf: 'invalid-token-12345'
        });

      expect(response.status).toBe(403);
      expect(response.text).toContain('Invalid CSRF token');
    });

    it('should reject modified CSRF token', async () => {
      const modifiedToken = csrfToken.slice(0, -1) + 'X'; // Change last character

      const response = await agent
        .post('/threads/new')
        .send({
          title: 'Thread with Modified Token',
          body: 'Body',
          language: 'fr',
          _csrf: modifiedToken
        });

      expect(response.status).toBe(403);
    });

    it('should reject expired CSRF token', async () => {
      // Simulate token expiration by clearing session
      await testRedis.flushDatabase();

      const response = await agent
        .post('/threads/new')
        .send({
          title: 'Thread with Expired Token',
          body: 'Body',
          language: 'fr',
          _csrf: csrfToken
        });

      expect(response.status).toBe(403);
    });

    it('should reject CSRF token from different session', async () => {
      // Create another agent (different session)
      const otherAgent = request.agent(app);

      await otherAgent
        .post('/auth/login')
        .send({
          pseudo: 'testuser2',
          pin: '5678'
        });

      // Try to use first user's CSRF token with second user's session
      const response = await otherAgent
        .post('/threads/new')
        .send({
          title: 'Cross-session Token',
          body: 'Body',
          language: 'fr',
          _csrf: csrfToken // Token from first user
        });

      expect(response.status).toBe(403);
    });
  });

  describe('CSRF token rotation', () => {
    it('should generate new token per session', async () => {
      // Get token from first form
      const form1 = await agent.get('/threads/new');
      const token1Match = form1.text.match(/<input[^>]*name="_csrf"[^>]*value="([^"]+)"/);
      const token1 = token1Match ? token1Match[1] : null;

      // Logout and login again (new session)
      await agent
        .post('/auth/logout')
        .send({ _csrf: token1 });

      await agent
        .post('/auth/login')
        .send({
          pseudo: 'testuser1',
          pin: '1234'
        });

      // Get token from second form
      const form2 = await agent.get('/threads/new');
      const token2Match = form2.text.match(/<input[^>]*name="_csrf"[^>]*value="([^"]+)"/);
      const token2 = token2Match ? token2Match[1] : null;

      expect(token1).toBeDefined();
      expect(token2).toBeDefined();
      expect(token1).not.toBe(token2); // Different tokens
    });

    it('should maintain same token within session', async () => {
      // Get token from multiple forms in same session
      const form1 = await agent.get('/threads/new');
      const token1Match = form1.text.match(/<input[^>]*name="_csrf"[^>]*value="([^"]+)"/);
      const token1 = token1Match ? token1Match[1] : null;

      const form2 = await agent.get('/threads/new');
      const token2Match = form2.text.match(/<input[^>]*name="_csrf"[^>]*value="([^"]+)"/);
      const token2 = token2Match ? token2Match[1] : null;

      const form3 = await agent.get('/profile');
      const token3Match = form3.text.match(/<input[^>]*name="_csrf"[^>]*value="([^"]+)"/);
      const token3 = token3Match ? token3Match[1] : null;

      expect(token1).toBeDefined();
      expect(token2).toBeDefined();
      expect(token3).toBeDefined();
      expect(token1).toBe(token2); // Same token
      expect(token2).toBe(token3); // Same token
    });
  });

  describe('CSRF with AJAX requests', () => {
    it('should protect AJAX POST requests', async () => {
      const response = await agent
        .post('/api/threads/vote')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          threadId: testThread.id,
          vote: 'up'
          // No CSRF token
        });

      expect(response.status).toBe(403);
    });

    it('should accept CSRF token in AJAX headers', async () => {
      const response = await agent
        .post('/api/threads/vote')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('X-CSRF-Token', csrfToken)
        .send({
          threadId: testThread.id,
          vote: 'up'
        });

      expect(response.status).not.toBe(403);
    });

    it('should accept CSRF token in AJAX body', async () => {
      const response = await agent
        .post('/api/threads/vote')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          threadId: testThread.id,
          vote: 'up',
          _csrf: csrfToken
        });

      expect(response.status).not.toBe(403);
    });
  });

  describe('CSRF exemptions', () => {
    it('should exempt login from CSRF protection', async () => {
      const newAgent = request.agent(app);

      // Login should work without CSRF token
      const response = await newAgent
        .post('/auth/login')
        .send({
          pseudo: 'testuser2',
          pin: '5678'
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/');
    });

    it('should exempt registration from CSRF protection', async () => {
      const newAgent = request.agent(app);

      // Registration should work without CSRF token
      const response = await newAgent
        .post('/auth/register')
        .send({
          pseudo: 'newuser',
          pin: '9876',
          language: 'fr'
        });

      expect(response.status).toBe(302);
    });

    it('should not exempt password change from CSRF', async () => {
      const response = await agent
        .post('/auth/change-pin')
        .send({
          currentPin: '1234',
          newPin: '5678'
          // No CSRF token
        });

      expect(response.status).toBe(403);
    });
  });

  describe('Double submit cookie pattern', () => {
    it('should set CSRF cookie', async () => {
      const response = await agent.get('/');

      const cookies = response.headers['set-cookie'];
      const csrfCookie = cookies?.find(c => c.includes('_csrf'));

      expect(csrfCookie).toBeDefined();
      expect(csrfCookie).toContain('HttpOnly');
      expect(csrfCookie).toContain('SameSite=Strict');
    });

    it('should validate cookie matches token', async () => {
      // Tamper with the CSRF cookie
      agent.jar.setCookie('_csrf=tampered-value');

      const response = await agent
        .post('/threads/new')
        .send({
          title: 'Test',
          body: 'Body',
          language: 'fr',
          _csrf: csrfToken // Valid token but cookie tampered
        });

      expect(response.status).toBe(403);
    });
  });

  describe('CSRF error handling', () => {
    it('should show user-friendly error for CSRF failures', async () => {
      const response = await agent
        .post('/threads/new')
        .send({
          title: 'Test',
          body: 'Body',
          language: 'fr'
          // No CSRF token
        });

      expect(response.status).toBe(403);
      expect(response.text).toContain('Security validation failed');
      expect(response.text).toContain('Please refresh the page');
    });

    it('should redirect to form on CSRF failure with referer', async () => {
      const response = await agent
        .post('/threads/new')
        .set('Referer', '/threads/new')
        .send({
          title: 'Test',
          body: 'Body',
          language: 'fr'
          // No CSRF token
        });

      expect(response.status).toBe(403);
      expect(response.text).toContain('form');
      expect(response.text).toContain('_csrf');
    });

    it('should return JSON error for AJAX CSRF failures', async () => {
      const response = await agent
        .post('/api/threads/vote')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Accept', 'application/json')
        .send({
          threadId: testThread.id,
          vote: 'up'
          // No CSRF token
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('CSRF');
    });
  });

  describe('CSRF token persistence', () => {
    it('should persist token across page navigation', async () => {
      // Navigate through multiple pages
      await agent.get('/');
      await agent.get('/threads');
      await agent.get(`/threads/${testThread.id}`);
      await agent.get('/profile');

      // Token should still be valid
      const response = await agent
        .post('/threads/new')
        .send({
          title: 'After Navigation',
          body: 'Body',
          language: 'fr',
          _csrf: csrfToken
        });

      expect(response.status).toBe(302);
    });

    it('should invalidate token after logout', async () => {
      // Logout properly with CSRF
      await agent
        .post('/auth/logout')
        .send({ _csrf: csrfToken });

      // Old token should no longer work
      const response = await agent
        .post('/threads/new')
        .send({
          title: 'After Logout',
          body: 'Body',
          language: 'fr',
          _csrf: csrfToken
        });

      expect(response.status).toBe(401); // Not authenticated
    });
  });
});