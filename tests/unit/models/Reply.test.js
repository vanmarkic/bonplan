/**
 * Reply Model Unit Tests
 */

const Reply = require('../../../src/models/Reply');
const Thread = require('../../../src/models/Thread');
const testDb = require('../../helpers/testDb');
const fixtures = require('../../helpers/fixtures');

describe('Reply Model', () => {
  let db;
  let testThread;

  beforeAll(async () => {
    await testDb.createTestDatabase();
    await testDb.createTables();
    db = await testDb.connect();
  });

  beforeEach(async () => {
    await testDb.cleanDatabase();

    // Create test users and thread for replies
    await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
    await fixtures.createTestUser(db, fixtures.validUsers.testuser2);
    testThread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);
  });

  afterAll(async () => {
    await testDb.disconnect();
  });

  describe('create', () => {
    it('should create a new reply', async () => {
      const result = await Reply.create(
        testThread.id,
        'This is a test reply',
        'testuser2'
      );

      expect(result).toBeDefined();
      expect(result.id).toBeGreaterThan(0);
      expect(result.threadId).toBe(testThread.id);
      expect(result.body).toBe('This is a test reply');
      expect(result.authorPseudo).toBe('testuser2');
      expect(result.createdAt).toBeDefined();
    });

    it('should update thread reply count and last activity', async () => {
      const beforeThread = await Thread.findById(testThread.id);
      const originalActivity = beforeThread.last_activity;

      await new Promise(resolve => setTimeout(resolve, 10));

      await Reply.create(testThread.id, 'Reply 1', 'testuser2');
      await Reply.create(testThread.id, 'Reply 2', 'testuser1');

      const afterThread = await Thread.findById(testThread.id);

      expect(afterThread.reply_count).toBe(2);
      expect(new Date(afterThread.last_activity).getTime()).toBeGreaterThan(
        new Date(originalActivity).getTime()
      );
    });

    it('should increment user reply count', async () => {
      await Reply.create(testThread.id, 'Reply', 'testuser2');

      const [users] = await db.execute(
        'SELECT reply_count FROM users WHERE pseudo = ?',
        ['testuser2']
      );

      expect(users[0].reply_count).toBe(1);
    });

    it('should fail if thread does not exist', async () => {
      await expect(
        Reply.create(99999, 'Reply', 'testuser1')
      ).rejects.toThrow('Thread not found');
    });

    it('should fail if thread is locked', async () => {
      await Thread.lock(testThread.id);

      await expect(
        Reply.create(testThread.id, 'Reply', 'testuser2')
      ).rejects.toThrow('Thread is locked');
    });

    it('should fail if thread is deleted', async () => {
      await Thread.softDelete(testThread.id);

      await expect(
        Reply.create(testThread.id, 'Reply', 'testuser2')
      ).rejects.toThrow('Thread is not accessible');
    });

    it('should fail if thread is hidden', async () => {
      await Thread.hide(testThread.id);

      await expect(
        Reply.create(testThread.id, 'Reply', 'testuser2')
      ).rejects.toThrow('Thread is not accessible');
    });

    it('should fail if author does not exist', async () => {
      await expect(
        Reply.create(testThread.id, 'Reply', 'nonexistent')
      ).rejects.toThrow();
    });
  });

  describe('findByThreadId', () => {
    it('should find replies by thread ID', async () => {
      await Reply.create(testThread.id, 'Reply 1', 'testuser1');
      await Reply.create(testThread.id, 'Reply 2', 'testuser2');
      await Reply.create(testThread.id, 'Reply 3', 'testuser1');

      const replies = await Reply.findByThreadId(testThread.id);

      expect(replies).toHaveLength(3);
      expect(replies[0].body).toBe('Reply 1'); // Default ascending order
      expect(replies[1].body).toBe('Reply 2');
      expect(replies[2].body).toBe('Reply 3');
    });

    it('should paginate replies', async () => {
      // Create 10 replies
      for (let i = 1; i <= 10; i++) {
        await Reply.create(
          testThread.id,
          `Reply ${i}`,
          i % 2 ? 'testuser1' : 'testuser2'
        );
      }

      const page1 = await Reply.findByThreadId(testThread.id, { limit: 5, offset: 0 });
      const page2 = await Reply.findByThreadId(testThread.id, { limit: 5, offset: 5 });

      expect(page1).toHaveLength(5);
      expect(page2).toHaveLength(5);
      expect(page1[0].body).toBe('Reply 1');
      expect(page2[0].body).toBe('Reply 6');
    });

    it('should sort replies in descending order', async () => {
      await Reply.create(testThread.id, 'Reply 1', 'testuser1');
      await Reply.create(testThread.id, 'Reply 2', 'testuser2');
      await Reply.create(testThread.id, 'Reply 3', 'testuser1');

      const replies = await Reply.findByThreadId(testThread.id, { sort: 'desc' });

      expect(replies).toHaveLength(3);
      expect(replies[0].body).toBe('Reply 3');
      expect(replies[1].body).toBe('Reply 2');
      expect(replies[2].body).toBe('Reply 1');
    });

    it('should exclude deleted replies', async () => {
      const reply1 = await Reply.create(testThread.id, 'Reply 1', 'testuser1');
      await Reply.create(testThread.id, 'Reply 2', 'testuser2');

      await Reply.softDelete(reply1.id);

      const replies = await Reply.findByThreadId(testThread.id);

      expect(replies).toHaveLength(1);
      expect(replies[0].body).toBe('Reply 2');
    });

    it('should exclude hidden replies', async () => {
      const reply1 = await Reply.create(testThread.id, 'Reply 1', 'testuser1');
      await Reply.create(testThread.id, 'Reply 2', 'testuser2');

      await Reply.hide(reply1.id);

      const replies = await Reply.findByThreadId(testThread.id);

      expect(replies).toHaveLength(1);
      expect(replies[0].body).toBe('Reply 2');
    });

    it('should include author metadata', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.moderator);
      await Reply.create(testThread.id, 'Mod Reply', 'moderator1');

      const replies = await Reply.findByThreadId(testThread.id);

      expect(replies[0].author_is_moderator).toBe(1);
      expect(replies[0].author_joined_at).toBeDefined();
    });
  });

  describe('findById', () => {
    it('should find reply by ID', async () => {
      const created = await Reply.create(testThread.id, 'Test Reply', 'testuser1');

      const reply = await Reply.findById(created.id);

      expect(reply).toBeDefined();
      expect(reply.id).toBe(created.id);
      expect(reply.thread_id).toBe(testThread.id);
      expect(reply.body).toBe('Test Reply');
      expect(reply.author_pseudo).toBe('testuser1');
      expect(reply.is_deleted).toBe(0);
      expect(reply.is_hidden).toBe(0);
    });

    it('should return null for non-existent reply', async () => {
      const reply = await Reply.findById(99999);

      expect(reply).toBeNull();
    });
  });

  describe('update', () => {
    it('should update reply within 15 minute window', async () => {
      const reply = await Reply.create(testThread.id, 'Original', 'testuser1');

      const success = await Reply.update(reply.id, 'Updated Reply');

      expect(success).toBe(true);

      const updated = await Reply.findById(reply.id);
      expect(updated.body).toBe('Updated Reply');
      expect(updated.edited_at).not.toBeNull();
    });

    it('should fail to update after 15 minute window', async () => {
      const reply = await Reply.create(testThread.id, 'Original', 'testuser1');

      // Set created_at to 20 minutes ago
      await db.execute(
        'UPDATE replies SET created_at = DATE_SUB(NOW(), INTERVAL 20 MINUTE) WHERE id = ?',
        [reply.id]
      );

      const success = await Reply.update(reply.id, 'Updated Reply');

      expect(success).toBe(false);
    });

    it('should not update deleted replies', async () => {
      const reply = await Reply.create(testThread.id, 'Original', 'testuser1');

      await Reply.softDelete(reply.id);

      const success = await Reply.update(reply.id, 'Updated Reply');

      expect(success).toBe(false);
    });
  });

  describe('softDelete', () => {
    it('should soft delete a reply', async () => {
      const reply = await Reply.create(testThread.id, 'To Delete', 'testuser1');

      const success = await Reply.softDelete(reply.id, 'Spam');

      expect(success).toBe(true);

      const deleted = await Reply.findById(reply.id);
      expect(deleted.is_deleted).toBe(1);
      expect(deleted.deleted_at).not.toBeNull();
      expect(deleted.deleted_reason).toBe('Spam');
    });

    it('should soft delete without reason', async () => {
      const reply = await Reply.create(testThread.id, 'To Delete', 'testuser1');

      const success = await Reply.softDelete(reply.id);

      expect(success).toBe(true);

      const deleted = await Reply.findById(reply.id);
      expect(deleted.is_deleted).toBe(1);
      expect(deleted.deleted_reason).toBeNull();
    });

    it('should update thread reply count when deleting', async () => {
      await Reply.create(testThread.id, 'Reply 1', 'testuser1');
      const reply2 = await Reply.create(testThread.id, 'Reply 2', 'testuser2');

      const beforeThread = await Thread.findById(testThread.id);
      expect(beforeThread.reply_count).toBe(2);

      await Reply.softDelete(reply2.id);

      const afterThread = await Thread.findById(testThread.id);
      expect(afterThread.reply_count).toBe(1);
    });

    it('should return false for non-existent reply', async () => {
      const success = await Reply.softDelete(99999);

      expect(success).toBe(false);
    });
  });

  describe('hide/unhide', () => {
    it('should hide a reply', async () => {
      const reply = await Reply.create(testThread.id, 'To Hide', 'testuser1');

      const success = await Reply.hide(reply.id);

      expect(success).toBe(true);

      const hidden = await Reply.findById(reply.id);
      expect(hidden.is_hidden).toBe(1);
    });

    it('should unhide a reply', async () => {
      const reply = await Reply.create(testThread.id, 'To Unhide', 'testuser1');

      await Reply.hide(reply.id);
      const success = await Reply.unhide(reply.id);

      expect(success).toBe(true);

      const unhidden = await Reply.findById(reply.id);
      expect(unhidden.is_hidden).toBe(0);
    });
  });

  describe('incrementReportCount', () => {
    it('should increment report count', async () => {
      const reply = await Reply.create(testThread.id, 'To Report', 'testuser1');

      await Reply.incrementReportCount(reply.id);
      await Reply.incrementReportCount(reply.id);

      const reported = await Reply.findById(reply.id);
      expect(reported.report_count).toBe(2);
    });
  });

  describe('countByThreadId', () => {
    it('should count replies for a thread', async () => {
      await Reply.create(testThread.id, 'Reply 1', 'testuser1');
      await Reply.create(testThread.id, 'Reply 2', 'testuser2');
      await Reply.create(testThread.id, 'Reply 3', 'testuser1');

      const count = await Reply.countByThreadId(testThread.id);

      expect(count).toBe(3);
    });

    it('should exclude deleted replies from count', async () => {
      await Reply.create(testThread.id, 'Reply 1', 'testuser1');
      const reply2 = await Reply.create(testThread.id, 'Reply 2', 'testuser2');

      await Reply.softDelete(reply2.id);

      const count = await Reply.countByThreadId(testThread.id);

      expect(count).toBe(1);
    });

    it('should exclude hidden replies by default', async () => {
      await Reply.create(testThread.id, 'Reply 1', 'testuser1');
      const reply2 = await Reply.create(testThread.id, 'Reply 2', 'testuser2');

      await Reply.hide(reply2.id);

      const count = await Reply.countByThreadId(testThread.id);

      expect(count).toBe(1);
    });

    it('should include hidden replies when requested', async () => {
      await Reply.create(testThread.id, 'Reply 1', 'testuser1');
      const reply2 = await Reply.create(testThread.id, 'Reply 2', 'testuser2');

      await Reply.hide(reply2.id);

      const count = await Reply.countByThreadId(testThread.id, true);

      expect(count).toBe(2);
    });
  });

  describe('findByAuthor', () => {
    it('should find replies by author', async () => {
      await Reply.create(testThread.id, 'Reply 1', 'testuser1');
      await Reply.create(testThread.id, 'Reply 2', 'testuser2');
      await Reply.create(testThread.id, 'Reply 3', 'testuser1');

      const user1Replies = await Reply.findByAuthor('testuser1');
      const user2Replies = await Reply.findByAuthor('testuser2');

      expect(user1Replies).toHaveLength(2);
      expect(user2Replies).toHaveLength(1);
    });

    it('should include thread title in results', async () => {
      await Reply.create(testThread.id, 'Reply', 'testuser1');

      const replies = await Reply.findByAuthor('testuser1');

      expect(replies[0].thread_title).toBe('Test Thread 1');
    });

    it('should paginate author replies', async () => {
      for (let i = 1; i <= 25; i++) {
        await Reply.create(testThread.id, `Reply ${i}`, 'testuser1');
      }

      const page1 = await Reply.findByAuthor('testuser1', { limit: 10, offset: 0 });
      const page2 = await Reply.findByAuthor('testuser1', { limit: 10, offset: 10 });

      expect(page1).toHaveLength(10);
      expect(page2).toHaveLength(10);
    });
  });

  describe('search', () => {
    it('should search replies by content', async () => {
      await Reply.create(testThread.id, 'Normal reply', 'testuser1');
      await Reply.create(testThread.id, 'Reply with special keyword', 'testuser2');
      await Reply.create(testThread.id, 'Another normal reply', 'testuser1');

      const results = await Reply.search('keyword');

      expect(results).toHaveLength(1);
      expect(results[0].body).toContain('keyword');
    });

    it('should return relevance scores', async () => {
      await Reply.create(testThread.id, 'Testing Testing Testing', 'testuser1');
      await Reply.create(testThread.id, 'Just one Testing mention', 'testuser2');

      const results = await Reply.search('Testing');

      expect(results).toHaveLength(2);
      expect(results[0].body).toBe('Testing Testing Testing');
      expect(results[0].relevance).toBeGreaterThan(results[1].relevance);
    });

    it('should include thread context in search results', async () => {
      await Reply.create(testThread.id, 'Searchable reply', 'testuser1');

      const results = await Reply.search('Searchable');

      expect(results[0].thread_title).toBe('Test Thread 1');
      expect(results[0].thread_language).toBe('fr');
    });

    it('should paginate search results', async () => {
      for (let i = 1; i <= 25; i++) {
        await Reply.create(testThread.id, `Reply ${i} with keyword`, 'testuser1');
      }

      const page1 = await Reply.search('keyword', { limit: 10, offset: 0 });
      const page2 = await Reply.search('keyword', { limit: 10, offset: 10 });

      expect(page1).toHaveLength(10);
      expect(page2).toHaveLength(10);
    });

    it('should exclude deleted and hidden replies from search', async () => {
      const reply1 = await Reply.create(testThread.id, 'Searchable reply 1', 'testuser1');
      const reply2 = await Reply.create(testThread.id, 'Searchable reply 2', 'testuser2');

      await Reply.softDelete(reply1.id);
      await Reply.hide(reply2.id);

      const results = await Reply.search('Searchable');

      expect(results).toHaveLength(0);
    });
  });

  describe('getRecent', () => {
    it('should get recent replies', async () => {
      await Reply.create(testThread.id, 'Reply 1', 'testuser1');
      await new Promise(resolve => setTimeout(resolve, 10));
      await Reply.create(testThread.id, 'Reply 2', 'testuser2');
      await new Promise(resolve => setTimeout(resolve, 10));
      await Reply.create(testThread.id, 'Reply 3', 'testuser1');

      const recent = await Reply.getRecent({ limit: 2 });

      expect(recent).toHaveLength(2);
      expect(recent[0].body).toBe('Reply 3'); // Most recent first
      expect(recent[1].body).toBe('Reply 2');
    });

    it('should filter by thread language', async () => {
      // Create Dutch thread
      const dutchThread = await fixtures.createTestThread(db, {
        ...fixtures.validThreads.thread2,
        language: 'nl'
      });

      await Reply.create(testThread.id, 'French reply', 'testuser1');
      await Reply.create(dutchThread.id, 'Dutch reply', 'testuser2');

      const frenchRecent = await Reply.getRecent({ language: 'fr' });
      const dutchRecent = await Reply.getRecent({ language: 'nl' });

      expect(frenchRecent).toHaveLength(1);
      expect(frenchRecent[0].thread_language).toBe('fr');
      expect(dutchRecent).toHaveLength(1);
      expect(dutchRecent[0].thread_language).toBe('nl');
    });

    it('should exclude replies from deleted/hidden threads', async () => {
      const thread2 = await fixtures.createTestThread(db, {
        ...fixtures.validThreads.thread2,
        authorPseudo: 'testuser2'
      });

      await Reply.create(testThread.id, 'Reply 1', 'testuser1');
      await Reply.create(thread2.id, 'Reply 2', 'testuser2');

      await Thread.softDelete(thread2.id);

      const recent = await Reply.getRecent();

      expect(recent).toHaveLength(1);
      expect(recent[0].body).toBe('Reply 1');
    });
  });

  describe('exists', () => {
    it('should return true for existing accessible reply', async () => {
      const reply = await Reply.create(testThread.id, 'Test', 'testuser1');

      const exists = await Reply.exists(reply.id);

      expect(exists).toBe(true);
    });

    it('should return false for non-existent reply', async () => {
      const exists = await Reply.exists(99999);

      expect(exists).toBe(false);
    });

    it('should return false for deleted reply', async () => {
      const reply = await Reply.create(testThread.id, 'Test', 'testuser1');

      await Reply.softDelete(reply.id);

      const exists = await Reply.exists(reply.id);

      expect(exists).toBe(false);
    });

    it('should return false for hidden reply', async () => {
      const reply = await Reply.create(testThread.id, 'Test', 'testuser1');

      await Reply.hide(reply.id);

      const exists = await Reply.exists(reply.id);

      expect(exists).toBe(false);
    });
  });

  describe('findByIdWithContext', () => {
    it('should find reply with thread context', async () => {
      const reply = await Reply.create(testThread.id, 'Test Reply', 'testuser1');

      const withContext = await Reply.findByIdWithContext(reply.id);

      expect(withContext).toBeDefined();
      expect(withContext.id).toBe(reply.id);
      expect(withContext.thread_title).toBe('Test Thread 1');
      expect(withContext.thread_is_locked).toBe(0);
      expect(withContext.thread_language).toBe('fr');
    });

    it('should include thread locked status', async () => {
      const reply = await Reply.create(testThread.id, 'Test Reply', 'testuser1');

      await Thread.lock(testThread.id);

      const withContext = await Reply.findByIdWithContext(reply.id);

      expect(withContext.thread_is_locked).toBe(1);
    });
  });

  describe('hideByThreadId/unhideByThreadId', () => {
    it('should bulk hide replies by thread ID', async () => {
      await Reply.create(testThread.id, 'Reply 1', 'testuser1');
      await Reply.create(testThread.id, 'Reply 2', 'testuser2');
      await Reply.create(testThread.id, 'Reply 3', 'testuser1');

      const affected = await Reply.hideByThreadId(testThread.id);

      expect(affected).toBe(3);

      const replies = await Reply.findByThreadId(testThread.id);
      expect(replies).toHaveLength(0); // All hidden
    });

    it('should bulk unhide replies by thread ID', async () => {
      await Reply.create(testThread.id, 'Reply 1', 'testuser1');
      await Reply.create(testThread.id, 'Reply 2', 'testuser2');

      await Reply.hideByThreadId(testThread.id);
      const affected = await Reply.unhideByThreadId(testThread.id);

      expect(affected).toBe(2);

      const replies = await Reply.findByThreadId(testThread.id);
      expect(replies).toHaveLength(2);
    });

    it('should not affect deleted replies when hiding', async () => {
      const reply1 = await Reply.create(testThread.id, 'Reply 1', 'testuser1');
      await Reply.create(testThread.id, 'Reply 2', 'testuser2');

      await Reply.softDelete(reply1.id);

      const affected = await Reply.hideByThreadId(testThread.id);

      expect(affected).toBe(1); // Only non-deleted reply
    });
  });
});