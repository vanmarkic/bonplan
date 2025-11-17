/**
 * Moderation Integration Tests
 * Tests moderation functionality including HTTP requests
 */

const request = require('supertest');
const app = require('../../src/server');
const testDb = require('../helpers/testDb');
const testRedis = require('../helpers/testRedis');
const fixtures = require('../helpers/fixtures');
const Thread = require('../../src/models/Thread');
const Reply = require('../../src/models/Reply');
const ReportService = require('../../src/services/reportService');

describe('Moderation Integration', () => {
  let userAgent;
  let moderatorAgent;
  let userCsrfToken;
  let modCsrfToken;
  let db;
  let testThread;
  let testReply;

  beforeAll(async () => {
    await testDb.createTestDatabase();
    await testDb.createTables();
    await testRedis.createClient();
    db = await testDb.connect();
  });

  beforeEach(async () => {
    await testDb.cleanDatabase();
    await testRedis.flushDatabase();

    userAgent = request.agent(app);
    moderatorAgent = request.agent(app);

    // Create test users
    await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
    await fixtures.createTestUser(db, fixtures.validUsers.testuser2);
    await fixtures.createTestUser(db, fixtures.validUsers.moderator);

    // Login as regular user
    await userAgent
      .post('/auth/login')
      .send({
        pseudo: 'testuser1',
        pin: '1234'
      });

    // Login as moderator
    await moderatorAgent
      .post('/auth/login')
      .send({
        pseudo: 'moderator1',
        pin: '9999'
      });

    // Get CSRF tokens
    const userFormRes = await userAgent.get('/threads/new');
    const userCsrfMatch = userFormRes.text.match(/<input[^>]*name="_csrf"[^>]*value="([^"]+)"/);
    userCsrfToken = userCsrfMatch ? userCsrfMatch[1] : null;

    const modFormRes = await moderatorAgent.get('/threads/new');
    const modCsrfMatch = modFormRes.text.match(/<input[^>]*name="_csrf"[^>]*value="([^"]+)"/);
    modCsrfToken = modCsrfMatch ? modCsrfMatch[1] : null;

    // Create test content
    testThread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);
    testReply = await Reply.create(testThread.id, 'Test reply', 'testuser2');
  });

  afterAll(async () => {
    await testDb.disconnect();
    await testRedis.disconnect();
  });

  describe('GET /moderation', () => {
    it('should display moderation dashboard for moderators', async () => {
      // Create some reported content
      for (let i = 3; i <= 7; i++) {
        await fixtures.createTestUser(db, {
          pseudo: `testuser${i}`,
          pin: '1234'
        });
        await ReportService.reportThread(testThread.id, `testuser${i}`, 'Spam');
      }

      const response = await moderatorAgent.get('/moderation');

      expect(response.status).toBe(200);
      expect(response.text).toContain('Moderation Dashboard');
      expect(response.text).toContain('Reported Content');
      expect(response.text).toContain('Test Thread 1');
      expect(response.text).toContain('5 reports'); // 5 reports from users 3-7
    });

    it('should reject non-moderators', async () => {
      const response = await userAgent.get('/moderation');

      expect(response.status).toBe(403);
      expect(response.text).toContain('Forbidden');
    });

    it('should reject unauthenticated users', async () => {
      const response = await request(app).get('/moderation');

      expect(response.status).toBe(401);
    });

    it('should show auto-hidden content stats', async () => {
      // Create content with high report counts
      await db.execute(
        'UPDATE threads SET report_count = 10, is_hidden = TRUE WHERE id = ?',
        [testThread.id]
      );
      await db.execute(
        'UPDATE replies SET report_count = 10, is_hidden = TRUE WHERE id = ?',
        [testReply.id]
      );

      const response = await moderatorAgent.get('/moderation');

      expect(response.status).toBe(200);
      expect(response.text).toContain('Auto-Hidden');
      expect(response.text).toContain('1 thread');
      expect(response.text).toContain('1 reply');
    });

    it('should paginate reported content', async () => {
      // Create many reported threads
      for (let i = 1; i <= 25; i++) {
        const thread = await fixtures.createTestThread(db, {
          title: `Thread ${i}`,
          body: 'Body',
          authorPseudo: 'testuser1'
        });

        // Report each thread 5 times
        for (let j = 1; j <= 5; j++) {
          await fixtures.createTestUser(db, {
            pseudo: `reporter${i}_${j}`,
            pin: '1234'
          });
          await ReportService.reportThread(thread.id, `reporter${i}_${j}`, 'Spam');
        }
      }

      const page1 = await moderatorAgent.get('/moderation?page=1');
      const page2 = await moderatorAgent.get('/moderation?page=2');

      expect(page1.status).toBe(200);
      expect(page2.status).toBe(200);
      expect(page1.text).toContain('Page 1');
      expect(page2.text).toContain('Page 2');
    });
  });

  describe('POST /threads/:id/pin', () => {
    it('should pin thread as moderator', async () => {
      const response = await moderatorAgent
        .post(`/threads/${testThread.id}/pin`)
        .send({
          _csrf: modCsrfToken
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`/threads/${testThread.id}`);

      const pinned = await Thread.findById(testThread.id);
      expect(pinned.is_pinned).toBe(1);
    });

    it('should unpin thread as moderator', async () => {
      await Thread.pin(testThread.id);

      const response = await moderatorAgent
        .post(`/threads/${testThread.id}/unpin`)
        .send({
          _csrf: modCsrfToken
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`/threads/${testThread.id}`);

      const unpinned = await Thread.findById(testThread.id);
      expect(unpinned.is_pinned).toBe(0);
    });

    it('should reject non-moderators', async () => {
      const response = await userAgent
        .post(`/threads/${testThread.id}/pin`)
        .send({
          _csrf: userCsrfToken
        });

      expect(response.status).toBe(403);

      const thread = await Thread.findById(testThread.id);
      expect(thread.is_pinned).toBe(0);
    });

    it('should handle non-existent thread', async () => {
      const response = await moderatorAgent
        .post('/threads/99999/pin')
        .send({
          _csrf: modCsrfToken
        });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /threads/:id/lock', () => {
    it('should lock thread as moderator', async () => {
      const response = await moderatorAgent
        .post(`/threads/${testThread.id}/lock`)
        .send({
          _csrf: modCsrfToken
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`/threads/${testThread.id}`);

      const locked = await Thread.findById(testThread.id);
      expect(locked.is_locked).toBe(1);
    });

    it('should unlock thread as moderator', async () => {
      await Thread.lock(testThread.id);

      const response = await moderatorAgent
        .post(`/threads/${testThread.id}/unlock`)
        .send({
          _csrf: modCsrfToken
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`/threads/${testThread.id}`);

      const unlocked = await Thread.findById(testThread.id);
      expect(unlocked.is_locked).toBe(0);
    });

    it('should reject non-moderators', async () => {
      const response = await userAgent
        .post(`/threads/${testThread.id}/lock`)
        .send({
          _csrf: userCsrfToken
        });

      expect(response.status).toBe(403);

      const thread = await Thread.findById(testThread.id);
      expect(thread.is_locked).toBe(0);
    });

    it('should prevent replies to locked thread', async () => {
      await Thread.lock(testThread.id);

      const response = await userAgent
        .post(`/threads/${testThread.id}/reply`)
        .send({
          body: 'Reply to locked thread',
          _csrf: userCsrfToken
        });

      expect(response.status).toBe(403);
      expect(response.text).toContain('locked');
    });
  });

  describe('POST /threads/:id/hide', () => {
    it('should hide thread as moderator', async () => {
      const response = await moderatorAgent
        .post(`/threads/${testThread.id}/hide`)
        .send({
          _csrf: modCsrfToken
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/moderation');

      const hidden = await Thread.findById(testThread.id);
      expect(hidden.is_hidden).toBe(1);
    });

    it('should unhide thread as moderator', async () => {
      await Thread.hide(testThread.id);

      const response = await moderatorAgent
        .post(`/threads/${testThread.id}/unhide`)
        .send({
          _csrf: modCsrfToken
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`/threads/${testThread.id}`);

      const unhidden = await Thread.findById(testThread.id);
      expect(unhidden.is_hidden).toBe(0);
    });

    it('should reject non-moderators', async () => {
      const response = await userAgent
        .post(`/threads/${testThread.id}/hide`)
        .send({
          _csrf: userCsrfToken
        });

      expect(response.status).toBe(403);

      const thread = await Thread.findById(testThread.id);
      expect(thread.is_hidden).toBe(0);
    });

    it('should clear reports when hiding', async () => {
      // Add some reports
      await ReportService.reportThread(testThread.id, 'testuser2', 'Spam');

      const beforeThread = await Thread.findById(testThread.id);
      expect(beforeThread.report_count).toBe(1);

      await moderatorAgent
        .post(`/threads/${testThread.id}/hide`)
        .send({
          clearReports: true,
          _csrf: modCsrfToken
        });

      const afterThread = await Thread.findById(testThread.id);
      expect(afterThread.is_hidden).toBe(1);
      expect(afterThread.report_count).toBe(0);
    });
  });

  describe('POST /replies/:id/hide', () => {
    it('should hide reply as moderator', async () => {
      const response = await moderatorAgent
        .post(`/replies/${testReply.id}/hide`)
        .send({
          _csrf: modCsrfToken
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`/threads/${testThread.id}`);

      const hidden = await Reply.findById(testReply.id);
      expect(hidden.is_hidden).toBe(1);
    });

    it('should unhide reply as moderator', async () => {
      await Reply.hide(testReply.id);

      const response = await moderatorAgent
        .post(`/replies/${testReply.id}/unhide`)
        .send({
          _csrf: modCsrfToken
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`/threads/${testThread.id}#reply-${testReply.id}`);

      const unhidden = await Reply.findById(testReply.id);
      expect(unhidden.is_hidden).toBe(0);
    });

    it('should reject non-moderators', async () => {
      const response = await userAgent
        .post(`/replies/${testReply.id}/hide`)
        .send({
          _csrf: userCsrfToken
        });

      expect(response.status).toBe(403);

      const reply = await Reply.findById(testReply.id);
      expect(reply.is_hidden).toBe(0);
    });
  });

  describe('POST /threads/:id/delete (moderator)', () => {
    it('should allow moderator to delete any thread', async () => {
      const response = await moderatorAgent
        .post(`/threads/${testThread.id}/delete`)
        .send({
          reason: 'Violates community guidelines',
          _csrf: modCsrfToken
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/moderation');

      const deleted = await Thread.findById(testThread.id);
      expect(deleted.is_deleted).toBe(1);
      expect(deleted.deleted_reason).toBe('Violates community guidelines');
    });

    it('should reject regular users deleting others threads', async () => {
      const response = await userAgent
        .post(`/threads/${testThread.id}/delete`)
        .send({
          _csrf: userCsrfToken
        });

      expect(response.status).toBe(403);

      const thread = await Thread.findById(testThread.id);
      expect(thread.is_deleted).toBe(0);
    });
  });

  describe('POST /replies/:id/delete (moderator)', () => {
    it('should allow moderator to delete any reply', async () => {
      const response = await moderatorAgent
        .post(`/replies/${testReply.id}/delete`)
        .send({
          reason: 'Spam',
          _csrf: modCsrfToken
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`/threads/${testThread.id}`);

      const deleted = await Reply.findById(testReply.id);
      expect(deleted.is_deleted).toBe(1);
      expect(deleted.deleted_reason).toBe('Spam');
    });

    it('should reject regular users deleting others replies', async () => {
      const response = await userAgent
        .post(`/replies/${testReply.id}/delete`)
        .send({
          _csrf: userCsrfToken
        });

      expect(response.status).toBe(403);

      const reply = await Reply.findById(testReply.id);
      expect(reply.is_deleted).toBe(0);
    });
  });

  describe('POST /users/:pseudo/ban', () => {
    it('should ban user as moderator', async () => {
      const response = await moderatorAgent
        .post('/users/testuser2/ban')
        .send({
          reason: 'Repeated violations',
          duration: 7, // 7 days
          _csrf: modCsrfToken
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/moderation/users');

      const [users] = await db.execute(
        'SELECT is_banned, ban_reason, ban_until FROM users WHERE pseudo = ?',
        ['testuser2']
      );

      expect(users[0].is_banned).toBe(1);
      expect(users[0].ban_reason).toBe('Repeated violations');
      expect(users[0].ban_until).not.toBeNull();
    });

    it('should reject non-moderators', async () => {
      const response = await userAgent
        .post('/users/testuser2/ban')
        .send({
          reason: 'Trying to ban',
          duration: 7,
          _csrf: userCsrfToken
        });

      expect(response.status).toBe(403);

      const [users] = await db.execute(
        'SELECT is_banned FROM users WHERE pseudo = ?',
        ['testuser2']
      );

      expect(users[0].is_banned).toBe(0);
    });

    it('should prevent moderators from banning other moderators', async () => {
      await fixtures.createTestUser(db, {
        pseudo: 'moderator2',
        pin: '8888',
        isModerator: true
      });

      const response = await moderatorAgent
        .post('/users/moderator2/ban')
        .send({
          reason: 'Attempted ban',
          duration: 7,
          _csrf: modCsrfToken
        });

      expect(response.status).toBe(403);
      expect(response.text).toContain('Cannot ban moderator');
    });

    it('should hide all content from banned user', async () => {
      // Create more content from testuser2
      const thread2 = await fixtures.createTestThread(db, {
        title: 'User2 Thread',
        body: 'Body',
        authorPseudo: 'testuser2'
      });
      const reply2 = await Reply.create(testThread.id, 'User2 Reply', 'testuser2');

      // Ban the user
      await moderatorAgent
        .post('/users/testuser2/ban')
        .send({
          reason: 'Ban test',
          duration: 7,
          hideContent: true,
          _csrf: modCsrfToken
        });

      // Verify content is hidden
      const hiddenThread = await Thread.findById(thread2.id);
      const hiddenReply1 = await Reply.findById(testReply.id);
      const hiddenReply2 = await Reply.findById(reply2.id);

      expect(hiddenThread.is_hidden).toBe(1);
      expect(hiddenReply1.is_hidden).toBe(1);
      expect(hiddenReply2.is_hidden).toBe(1);
    });
  });

  describe('POST /users/:pseudo/unban', () => {
    beforeEach(async () => {
      // Ban testuser2
      await db.execute(
        'UPDATE users SET is_banned = TRUE, ban_reason = ?, ban_until = DATE_ADD(NOW(), INTERVAL 7 DAY) WHERE pseudo = ?',
        ['Test ban', 'testuser2']
      );
    });

    it('should unban user as moderator', async () => {
      const response = await moderatorAgent
        .post('/users/testuser2/unban')
        .send({
          _csrf: modCsrfToken
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/moderation/users');

      const [users] = await db.execute(
        'SELECT is_banned, ban_reason, ban_until FROM users WHERE pseudo = ?',
        ['testuser2']
      );

      expect(users[0].is_banned).toBe(0);
      expect(users[0].ban_reason).toBeNull();
      expect(users[0].ban_until).toBeNull();
    });

    it('should reject non-moderators', async () => {
      const response = await userAgent
        .post('/users/testuser2/unban')
        .send({
          _csrf: userCsrfToken
        });

      expect(response.status).toBe(403);

      const [users] = await db.execute(
        'SELECT is_banned FROM users WHERE pseudo = ?',
        ['testuser2']
      );

      expect(users[0].is_banned).toBe(1);
    });
  });

  describe('GET /moderation/reports/:id', () => {
    it('should show detailed report information', async () => {
      // Create multiple reports with different reasons
      for (let i = 3; i <= 6; i++) {
        await fixtures.createTestUser(db, {
          pseudo: `testuser${i}`,
          pin: '1234'
        });
      }

      await ReportService.reportThread(testThread.id, 'testuser3', 'Spam');
      await ReportService.reportThread(testThread.id, 'testuser4', 'Offensive language');
      await ReportService.reportThread(testThread.id, 'testuser5', 'Harassment');
      await ReportService.reportThread(testThread.id, 'testuser6', 'Spam');

      const response = await moderatorAgent.get(`/moderation/reports/thread/${testThread.id}`);

      expect(response.status).toBe(200);
      expect(response.text).toContain('Report Details');
      expect(response.text).toContain('Test Thread 1');
      expect(response.text).toContain('4 reports');
      expect(response.text).toContain('Spam');
      expect(response.text).toContain('Offensive language');
      expect(response.text).toContain('Harassment');
      expect(response.text).toContain('testuser3');
      expect(response.text).toContain('testuser4');
    });

    it('should reject non-moderators', async () => {
      const response = await userAgent.get(`/moderation/reports/thread/${testThread.id}`);

      expect(response.status).toBe(403);
    });
  });

  describe('POST /moderation/reports/clear', () => {
    it('should clear reports as moderator', async () => {
      // Add reports
      await ReportService.reportThread(testThread.id, 'testuser2', 'Spam');

      const beforeThread = await Thread.findById(testThread.id);
      expect(beforeThread.report_count).toBe(1);

      const response = await moderatorAgent
        .post('/moderation/reports/clear')
        .send({
          type: 'thread',
          id: testThread.id,
          _csrf: modCsrfToken
        });

      expect(response.status).toBe(302);

      const afterThread = await Thread.findById(testThread.id);
      expect(afterThread.report_count).toBe(0);
    });

    it('should reject non-moderators', async () => {
      await ReportService.reportThread(testThread.id, 'testuser2', 'Spam');

      const response = await userAgent
        .post('/moderation/reports/clear')
        .send({
          type: 'thread',
          id: testThread.id,
          _csrf: userCsrfToken
        });

      expect(response.status).toBe(403);

      const thread = await Thread.findById(testThread.id);
      expect(thread.report_count).toBe(1);
    });
  });

  describe('Moderation logs', () => {
    it('should log moderation actions', async () => {
      // Perform various moderation actions
      await moderatorAgent
        .post(`/threads/${testThread.id}/pin`)
        .send({ _csrf: modCsrfToken });

      await moderatorAgent
        .post(`/threads/${testThread.id}/lock`)
        .send({ _csrf: modCsrfToken });

      await moderatorAgent
        .post(`/replies/${testReply.id}/hide`)
        .send({ _csrf: modCsrfToken });

      // Check moderation log
      const response = await moderatorAgent.get('/moderation/logs');

      expect(response.status).toBe(200);
      expect(response.text).toContain('Moderation Log');
      expect(response.text).toContain('moderator1');
      expect(response.text).toContain('pinned thread');
      expect(response.text).toContain('locked thread');
      expect(response.text).toContain('hid reply');
    });

    it('should reject non-moderators from viewing logs', async () => {
      const response = await userAgent.get('/moderation/logs');

      expect(response.status).toBe(403);
    });
  });

  describe('Bulk moderation actions', () => {
    it('should allow bulk hide of multiple items', async () => {
      // Create multiple threads and replies
      const thread2 = await fixtures.createTestThread(db, {
        title: 'Thread 2',
        body: 'Body',
        authorPseudo: 'testuser2'
      });
      const reply2 = await Reply.create(testThread.id, 'Reply 2', 'testuser1');

      const response = await moderatorAgent
        .post('/moderation/bulk/hide')
        .send({
          threads: [testThread.id, thread2.id],
          replies: [testReply.id, reply2.id],
          _csrf: modCsrfToken
        });

      expect(response.status).toBe(200);
      expect(response.body.hidden.threads).toBe(2);
      expect(response.body.hidden.replies).toBe(2);

      // Verify all items are hidden
      const hiddenThread1 = await Thread.findById(testThread.id);
      const hiddenThread2 = await Thread.findById(thread2.id);
      const hiddenReply1 = await Reply.findById(testReply.id);
      const hiddenReply2 = await Reply.findById(reply2.id);

      expect(hiddenThread1.is_hidden).toBe(1);
      expect(hiddenThread2.is_hidden).toBe(1);
      expect(hiddenReply1.is_hidden).toBe(1);
      expect(hiddenReply2.is_hidden).toBe(1);
    });

    it('should allow bulk delete of multiple items', async () => {
      const thread2 = await fixtures.createTestThread(db, {
        title: 'Thread 2',
        body: 'Body',
        authorPseudo: 'testuser2'
      });

      const response = await moderatorAgent
        .post('/moderation/bulk/delete')
        .send({
          threads: [testThread.id, thread2.id],
          reason: 'Bulk cleanup',
          _csrf: modCsrfToken
        });

      expect(response.status).toBe(200);
      expect(response.body.deleted.threads).toBe(2);

      const deletedThread1 = await Thread.findById(testThread.id);
      const deletedThread2 = await Thread.findById(thread2.id);

      expect(deletedThread1.is_deleted).toBe(1);
      expect(deletedThread1.deleted_reason).toBe('Bulk cleanup');
      expect(deletedThread2.is_deleted).toBe(1);
      expect(deletedThread2.deleted_reason).toBe('Bulk cleanup');
    });

    it('should reject bulk actions from non-moderators', async () => {
      const response = await userAgent
        .post('/moderation/bulk/hide')
        .send({
          threads: [testThread.id],
          _csrf: userCsrfToken
        });

      expect(response.status).toBe(403);
    });
  });
});