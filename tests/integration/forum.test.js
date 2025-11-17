/**
 * Forum Integration Tests
 * Tests full forum functionality including HTTP requests
 */

const request = require('supertest');
const app = require('../../src/server');
const testDb = require('../helpers/testDb');
const testRedis = require('../helpers/testRedis');
const fixtures = require('../helpers/fixtures');
const Thread = require('../../src/models/Thread');
const Reply = require('../../src/models/Reply');

describe('Forum Integration', () => {
  let agent;
  let authenticatedAgent;
  let csrfToken;
  let db;

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
    authenticatedAgent = request.agent(app);

    // Create test user and authenticate
    await fixtures.createTestUser(db, fixtures.validUsers.testuser1);

    // Login with authenticated agent
    const loginRes = await authenticatedAgent
      .post('/auth/login')
      .send({
        pseudo: 'testuser1',
        pin: '1234'
      });

    expect(loginRes.status).toBe(302);

    // Get CSRF token from a form page
    const formRes = await authenticatedAgent.get('/threads/new');
    const csrfMatch = formRes.text.match(/<input[^>]*name="_csrf"[^>]*value="([^"]+)"/);
    csrfToken = csrfMatch ? csrfMatch[1] : null;
  });

  afterAll(async () => {
    await testDb.disconnect();
    await testRedis.disconnect();
  });

  describe('GET /', () => {
    it('should display home page with recent threads', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser2);
      await fixtures.createTestThread(db, fixtures.validThreads.thread1);
      await fixtures.createTestThread(db, fixtures.validThreads.thread2);

      const response = await agent.get('/');

      expect(response.status).toBe(200);
      expect(response.text).toContain('Le Syndicat des Tox');
      expect(response.text).toContain('Test Thread 1');
      expect(response.text).toContain('Test Thread 2');
    });

    it('should show language selector', async () => {
      const response = await agent.get('/');

      expect(response.status).toBe(200);
      expect(response.text).toContain('lang=fr');
      expect(response.text).toContain('lang=nl');
      expect(response.text).toContain('lang=de');
      expect(response.text).toContain('lang=en');
    });
  });

  describe('GET /threads', () => {
    beforeEach(async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser2);
    });

    it('should list threads with pagination', async () => {
      // Create 25 threads
      for (let i = 1; i <= 25; i++) {
        await fixtures.createTestThread(db, {
          title: `Thread ${i}`,
          body: `Body ${i}`,
          authorPseudo: i % 2 ? 'testuser1' : 'testuser2',
          language: 'fr'
        });
      }

      const page1 = await agent.get('/threads?page=1');
      const page2 = await agent.get('/threads?page=2');

      expect(page1.status).toBe(200);
      expect(page2.status).toBe(200);

      // Page 1 should show threads 25-6 (20 per page, newest first)
      expect(page1.text).toContain('Thread 25');
      expect(page1.text).toContain('Thread 6');
      expect(page1.text).not.toContain('Thread 5');

      // Page 2 should show threads 5-1
      expect(page2.text).toContain('Thread 5');
      expect(page2.text).toContain('Thread 1');
    });

    it('should filter threads by language', async () => {
      await fixtures.createTestThread(db, { ...fixtures.validThreads.thread1, language: 'fr' });
      await fixtures.createTestThread(db, { ...fixtures.validThreads.thread2, language: 'nl' });

      const frenchThreads = await agent.get('/threads?lang=fr');
      const dutchThreads = await agent.get('/threads?lang=nl');

      expect(frenchThreads.status).toBe(200);
      expect(frenchThreads.text).toContain('Test Thread 1');
      expect(frenchThreads.text).not.toContain('Test Thread 2');

      expect(dutchThreads.status).toBe(200);
      expect(dutchThreads.text).toContain('Test Thread 2');
      expect(dutchThreads.text).not.toContain('Test Thread 1');
    });

    it('should sort threads', async () => {
      const thread1 = await fixtures.createTestThread(db, fixtures.validThreads.thread1);
      await new Promise(resolve => setTimeout(resolve, 10));
      const thread2 = await fixtures.createTestThread(db, fixtures.validThreads.thread2);

      // Update thread1 to have more replies
      await db.execute('UPDATE threads SET reply_count = 10 WHERE id = ?', [thread1.id]);

      const byRecent = await agent.get('/threads?sort=recent');
      const byReplies = await agent.get('/threads?sort=replies');
      const byNewest = await agent.get('/threads?sort=newest');

      expect(byRecent.status).toBe(200);
      expect(byReplies.status).toBe(200);
      expect(byNewest.status).toBe(200);

      // Verify sorting logic via order in HTML
      const recentMatch = byRecent.text.indexOf('Test Thread 2') < byRecent.text.indexOf('Test Thread 1');
      const repliesMatch = byReplies.text.indexOf('Test Thread 1') < byReplies.text.indexOf('Test Thread 2');
      const newestMatch = byNewest.text.indexOf('Test Thread 2') < byNewest.text.indexOf('Test Thread 1');

      expect(recentMatch).toBe(true);
      expect(repliesMatch).toBe(true);
      expect(newestMatch).toBe(true);
    });

    it('should show pinned threads first', async () => {
      const thread1 = await fixtures.createTestThread(db, fixtures.validThreads.thread1);
      const thread2 = await fixtures.createTestThread(db, fixtures.validThreads.thread2);

      await Thread.pin(thread1.id);

      const response = await agent.get('/threads');

      expect(response.status).toBe(200);

      // Pinned thread should appear before unpinned
      const thread1Index = response.text.indexOf('Test Thread 1');
      const thread2Index = response.text.indexOf('Test Thread 2');

      expect(thread1Index).toBeLessThan(thread2Index);
      expect(response.text).toContain('📌'); // Pin indicator
    });
  });

  describe('GET /threads/:id', () => {
    it('should display thread detail with replies', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser2);
      const thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);

      await Reply.create(thread.id, 'First reply', 'testuser2');
      await Reply.create(thread.id, 'Second reply', 'testuser1');

      const response = await agent.get(`/threads/${thread.id}`);

      expect(response.status).toBe(200);
      expect(response.text).toContain('Test Thread 1');
      expect(response.text).toContain('This is the body of test thread 1');
      expect(response.text).toContain('First reply');
      expect(response.text).toContain('Second reply');
    });

    it('should increment view count', async () => {
      const thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);

      await agent.get(`/threads/${thread.id}`);
      await agent.get(`/threads/${thread.id}`);
      await agent.get(`/threads/${thread.id}`);

      const updated = await Thread.findById(thread.id);
      expect(updated.view_count).toBe(3);
    });

    it('should show reply form for authenticated users', async () => {
      const thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);

      const unauthResponse = await agent.get(`/threads/${thread.id}`);
      const authResponse = await authenticatedAgent.get(`/threads/${thread.id}`);

      expect(unauthResponse.text).toContain('login');
      expect(authResponse.text).toContain('form');
      expect(authResponse.text).toContain('name="body"');
      expect(authResponse.text).toContain('name="_csrf"');
    });

    it('should not show reply form for locked threads', async () => {
      const thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);
      await Thread.lock(thread.id);

      const response = await authenticatedAgent.get(`/threads/${thread.id}`);

      expect(response.status).toBe(200);
      expect(response.text).toContain('🔒'); // Lock indicator
      expect(response.text).toContain('locked');
      expect(response.text).not.toContain('name="body"'); // No reply form
    });

    it('should return 404 for non-existent thread', async () => {
      const response = await agent.get('/threads/99999');

      expect(response.status).toBe(404);
    });

    it('should return 404 for deleted thread', async () => {
      const thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);
      await Thread.softDelete(thread.id);

      const response = await agent.get(`/threads/${thread.id}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /threads/new', () => {
    it('should create new thread when authenticated', async () => {
      const response = await authenticatedAgent
        .post('/threads/new')
        .send({
          title: 'New Thread Title',
          body: 'New thread body content',
          language: 'fr',
          _csrf: csrfToken
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toMatch(/^\/threads\/\d+$/);

      const threads = await Thread.findAll();
      expect(threads).toHaveLength(1);
      expect(threads[0].title).toBe('New Thread Title');
    });

    it('should require authentication', async () => {
      const response = await agent
        .post('/threads/new')
        .send({
          title: 'New Thread',
          body: 'Body',
          language: 'fr'
        });

      expect(response.status).toBe(401);
    });

    it('should validate thread title', async () => {
      const response = await authenticatedAgent
        .post('/threads/new')
        .send({
          title: '', // Empty title
          body: 'Body content',
          language: 'fr',
          _csrf: csrfToken
        });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Title is required');
    });

    it('should validate thread body', async () => {
      const response = await authenticatedAgent
        .post('/threads/new')
        .send({
          title: 'Valid Title',
          body: '', // Empty body
          language: 'fr',
          _csrf: csrfToken
        });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Body is required');
    });

    it('should validate title length', async () => {
      const response = await authenticatedAgent
        .post('/threads/new')
        .send({
          title: 'a'.repeat(256), // Too long
          body: 'Body',
          language: 'fr',
          _csrf: csrfToken
        });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Title too long');
    });

    it('should validate body length', async () => {
      const response = await authenticatedAgent
        .post('/threads/new')
        .send({
          title: 'Title',
          body: 'a'.repeat(10001), // Too long (assuming 10000 char limit)
          language: 'fr',
          _csrf: csrfToken
        });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Body too long');
    });
  });

  describe('POST /threads/:id/edit', () => {
    let thread;

    beforeEach(async () => {
      thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);
    });

    it('should edit thread within 15 minute window', async () => {
      const response = await authenticatedAgent
        .post(`/threads/${thread.id}/edit`)
        .send({
          title: 'Edited Title',
          body: 'Edited body content',
          _csrf: csrfToken
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`/threads/${thread.id}`);

      const updated = await Thread.findById(thread.id);
      expect(updated.title).toBe('Edited Title');
      expect(updated.body).toBe('Edited body content');
      expect(updated.edited_at).not.toBeNull();
    });

    it('should require ownership', async () => {
      // Create another user and login
      await fixtures.createTestUser(db, fixtures.validUsers.testuser2);

      const otherAgent = request.agent(app);
      await otherAgent
        .post('/auth/login')
        .send({
          pseudo: 'testuser2',
          pin: '5678'
        });

      const formRes = await otherAgent.get('/threads/new');
      const otherCsrfMatch = formRes.text.match(/<input[^>]*name="_csrf"[^>]*value="([^"]+)"/);
      const otherCsrf = otherCsrfMatch ? otherCsrfMatch[1] : null;

      const response = await otherAgent
        .post(`/threads/${thread.id}/edit`)
        .send({
          title: 'Hacked Title',
          body: 'Hacked body',
          _csrf: otherCsrf
        });

      expect(response.status).toBe(403);

      const unchanged = await Thread.findById(thread.id);
      expect(unchanged.title).toBe('Test Thread 1');
    });

    it('should fail after 15 minute window', async () => {
      // Set thread created_at to 20 minutes ago
      await db.execute(
        'UPDATE threads SET created_at = DATE_SUB(NOW(), INTERVAL 20 MINUTE) WHERE id = ?',
        [thread.id]
      );

      const response = await authenticatedAgent
        .post(`/threads/${thread.id}/edit`)
        .send({
          title: 'Too Late Edit',
          body: 'Should fail',
          _csrf: csrfToken
        });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Edit window expired');
    });

    it('should not edit deleted thread', async () => {
      await Thread.softDelete(thread.id);

      const response = await authenticatedAgent
        .post(`/threads/${thread.id}/edit`)
        .send({
          title: 'Edit Deleted',
          body: 'Should fail',
          _csrf: csrfToken
        });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /threads/:id/delete', () => {
    let thread;

    beforeEach(async () => {
      thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);
    });

    it('should delete own thread', async () => {
      const response = await authenticatedAgent
        .post(`/threads/${thread.id}/delete`)
        .send({
          _csrf: csrfToken
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/threads');

      const deleted = await Thread.findById(thread.id);
      expect(deleted.is_deleted).toBe(1);
      expect(deleted.deleted_at).not.toBeNull();
    });

    it('should require ownership', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser2);

      const otherAgent = request.agent(app);
      await otherAgent
        .post('/auth/login')
        .send({
          pseudo: 'testuser2',
          pin: '5678'
        });

      const formRes = await otherAgent.get('/threads/new');
      const otherCsrfMatch = formRes.text.match(/<input[^>]*name="_csrf"[^>]*value="([^"]+)"/);
      const otherCsrf = otherCsrfMatch ? otherCsrfMatch[1] : null;

      const response = await otherAgent
        .post(`/threads/${thread.id}/delete`)
        .send({
          _csrf: otherCsrf
        });

      expect(response.status).toBe(403);

      const unchanged = await Thread.findById(thread.id);
      expect(unchanged.is_deleted).toBe(0);
    });
  });

  describe('POST /threads/:id/reply', () => {
    let thread;

    beforeEach(async () => {
      thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);
    });

    it('should create reply when authenticated', async () => {
      const response = await authenticatedAgent
        .post(`/threads/${thread.id}/reply`)
        .send({
          body: 'This is my reply',
          _csrf: csrfToken
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`/threads/${thread.id}#replies`);

      const replies = await Reply.findByThreadId(thread.id);
      expect(replies).toHaveLength(1);
      expect(replies[0].body).toBe('This is my reply');
      expect(replies[0].author_pseudo).toBe('testuser1');
    });

    it('should require authentication', async () => {
      const response = await agent
        .post(`/threads/${thread.id}/reply`)
        .send({
          body: 'Anonymous reply'
        });

      expect(response.status).toBe(401);
    });

    it('should validate reply body', async () => {
      const response = await authenticatedAgent
        .post(`/threads/${thread.id}/reply`)
        .send({
          body: '', // Empty
          _csrf: csrfToken
        });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Reply cannot be empty');
    });

    it('should not allow reply to locked thread', async () => {
      await Thread.lock(thread.id);

      const response = await authenticatedAgent
        .post(`/threads/${thread.id}/reply`)
        .send({
          body: 'Reply to locked',
          _csrf: csrfToken
        });

      expect(response.status).toBe(403);
      expect(response.text).toContain('Thread is locked');
    });

    it('should not allow reply to deleted thread', async () => {
      await Thread.softDelete(thread.id);

      const response = await authenticatedAgent
        .post(`/threads/${thread.id}/reply`)
        .send({
          body: 'Reply to deleted',
          _csrf: csrfToken
        });

      expect(response.status).toBe(404);
    });

    it('should update thread reply count and last activity', async () => {
      const beforeThread = await Thread.findById(thread.id);

      await new Promise(resolve => setTimeout(resolve, 10));

      await authenticatedAgent
        .post(`/threads/${thread.id}/reply`)
        .send({
          body: 'New reply',
          _csrf: csrfToken
        });

      const afterThread = await Thread.findById(thread.id);

      expect(afterThread.reply_count).toBe(beforeThread.reply_count + 1);
      expect(new Date(afterThread.last_activity).getTime()).toBeGreaterThan(
        new Date(beforeThread.last_activity).getTime()
      );
    });
  });

  describe('POST /replies/:id/edit', () => {
    let thread;
    let reply;

    beforeEach(async () => {
      thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);
      reply = await Reply.create(thread.id, 'Original reply', 'testuser1');
    });

    it('should edit reply within 15 minute window', async () => {
      const response = await authenticatedAgent
        .post(`/replies/${reply.id}/edit`)
        .send({
          body: 'Edited reply content',
          _csrf: csrfToken
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`/threads/${thread.id}#reply-${reply.id}`);

      const updated = await Reply.findById(reply.id);
      expect(updated.body).toBe('Edited reply content');
      expect(updated.edited_at).not.toBeNull();
    });

    it('should require ownership', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser2);

      const otherAgent = request.agent(app);
      await otherAgent
        .post('/auth/login')
        .send({
          pseudo: 'testuser2',
          pin: '5678'
        });

      const formRes = await otherAgent.get('/threads/new');
      const otherCsrfMatch = formRes.text.match(/<input[^>]*name="_csrf"[^>]*value="([^"]+)"/);
      const otherCsrf = otherCsrfMatch ? otherCsrfMatch[1] : null;

      const response = await otherAgent
        .post(`/replies/${reply.id}/edit`)
        .send({
          body: 'Hacked reply',
          _csrf: otherCsrf
        });

      expect(response.status).toBe(403);

      const unchanged = await Reply.findById(reply.id);
      expect(unchanged.body).toBe('Original reply');
    });

    it('should fail after 15 minute window', async () => {
      await db.execute(
        'UPDATE replies SET created_at = DATE_SUB(NOW(), INTERVAL 20 MINUTE) WHERE id = ?',
        [reply.id]
      );

      const response = await authenticatedAgent
        .post(`/replies/${reply.id}/edit`)
        .send({
          body: 'Too late',
          _csrf: csrfToken
        });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Edit window expired');
    });
  });

  describe('POST /replies/:id/delete', () => {
    let thread;
    let reply;

    beforeEach(async () => {
      thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);
      reply = await Reply.create(thread.id, 'Reply to delete', 'testuser1');
    });

    it('should delete own reply', async () => {
      const response = await authenticatedAgent
        .post(`/replies/${reply.id}/delete`)
        .send({
          _csrf: csrfToken
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`/threads/${thread.id}`);

      const deleted = await Reply.findById(reply.id);
      expect(deleted.is_deleted).toBe(1);
      expect(deleted.deleted_at).not.toBeNull();
    });

    it('should require ownership', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser2);

      const otherAgent = request.agent(app);
      await otherAgent
        .post('/auth/login')
        .send({
          pseudo: 'testuser2',
          pin: '5678'
        });

      const formRes = await otherAgent.get('/threads/new');
      const otherCsrfMatch = formRes.text.match(/<input[^>]*name="_csrf"[^>]*value="([^"]+)"/);
      const otherCsrf = otherCsrfMatch ? otherCsrfMatch[1] : null;

      const response = await otherAgent
        .post(`/replies/${reply.id}/delete`)
        .send({
          _csrf: otherCsrf
        });

      expect(response.status).toBe(403);

      const unchanged = await Reply.findById(reply.id);
      expect(unchanged.is_deleted).toBe(0);
    });
  });

  describe('GET /search', () => {
    it('should display search form', async () => {
      const response = await agent.get('/search');

      expect(response.status).toBe(200);
      expect(response.text).toContain('Search');
      expect(response.text).toContain('name="query"');
      expect(response.text).toContain('type="search"');
    });
  });

  describe('POST /search', () => {
    beforeEach(async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser2);
      await fixtures.createTestThread(db, fixtures.validThreads.thread1);
      await fixtures.createTestThread(db, fixtures.validThreads.thread2);
      await fixtures.createTestThread(db, fixtures.validThreads.longThread);

      const thread = await Thread.findAll();
      await Reply.create(thread[0].id, 'Reply with keyword', 'testuser2');
    });

    it('should search threads and replies', async () => {
      const response = await agent
        .post('/search')
        .send({
          query: 'functionality'
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('Search Results');
      expect(response.text).toContain('Search Functionality'); // Thread title
    });

    it('should handle empty search query', async () => {
      const response = await agent
        .post('/search')
        .send({
          query: ''
        });

      expect(response.status).toBe(400);
      expect(response.text).toContain('Search query required');
    });

    it('should filter search by language', async () => {
      const response = await agent
        .post('/search')
        .send({
          query: 'Test',
          language: 'nl'
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('Test Thread 2'); // Dutch thread
      expect(response.text).not.toContain('Test Thread 1'); // French thread
    });

    it('should paginate search results', async () => {
      // Create many searchable threads
      for (let i = 1; i <= 25; i++) {
        await fixtures.createTestThread(db, {
          title: `Searchable Thread ${i}`,
          body: 'Content',
          authorPseudo: i % 2 ? 'testuser1' : 'testuser2'
        });
      }

      const page1 = await agent
        .post('/search')
        .send({
          query: 'Searchable',
          page: 1
        });

      const page2 = await agent
        .post('/search')
        .send({
          query: 'Searchable',
          page: 2
        });

      expect(page1.status).toBe(200);
      expect(page2.status).toBe(200);

      // Verify different content on each page
      expect(page1.text).toContain('Page 1');
      expect(page2.text).toContain('Page 2');
    });

    it('should highlight search terms', async () => {
      const response = await agent
        .post('/search')
        .send({
          query: 'functionality'
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('<mark>functionality</mark>');
    });
  });

  describe('Thread reporting', () => {
    let thread;

    beforeEach(async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser2);
      thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);
    });

    it('should report a thread when authenticated', async () => {
      const response = await authenticatedAgent
        .post(`/threads/${thread.id}/report`)
        .send({
          reason: 'Inappropriate content',
          _csrf: csrfToken
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const updated = await Thread.findById(thread.id);
      expect(updated.report_count).toBe(1);
    });

    it('should prevent duplicate reports', async () => {
      await authenticatedAgent
        .post(`/threads/${thread.id}/report`)
        .send({
          reason: 'First report',
          _csrf: csrfToken
        });

      const response = await authenticatedAgent
        .post(`/threads/${thread.id}/report`)
        .send({
          reason: 'Second report',
          _csrf: csrfToken
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already reported');
    });

    it('should require authentication to report', async () => {
      const response = await agent
        .post(`/threads/${thread.id}/report`)
        .send({
          reason: 'Anonymous report'
        });

      expect(response.status).toBe(401);
    });
  });

  describe('Reply reporting', () => {
    let thread;
    let reply;

    beforeEach(async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser2);
      thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);
      reply = await Reply.create(thread.id, 'Reply content', 'testuser2');
    });

    it('should report a reply when authenticated', async () => {
      const response = await authenticatedAgent
        .post(`/replies/${reply.id}/report`)
        .send({
          reason: 'Spam',
          _csrf: csrfToken
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const updated = await Reply.findById(reply.id);
      expect(updated.report_count).toBe(1);
    });

    it('should prevent duplicate reports', async () => {
      await authenticatedAgent
        .post(`/replies/${reply.id}/report`)
        .send({
          reason: 'First report',
          _csrf: csrfToken
        });

      const response = await authenticatedAgent
        .post(`/replies/${reply.id}/report`)
        .send({
          reason: 'Second report',
          _csrf: csrfToken
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already reported');
    });
  });
});