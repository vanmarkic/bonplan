/**
 * Thread Model Unit Tests
 */

const Thread = require('../../../src/models/Thread');
const testDb = require('../../helpers/testDb');
const fixtures = require('../../helpers/fixtures');

describe('Thread Model', () => {
  let db;

  beforeAll(async () => {
    await testDb.createTestDatabase();
    await testDb.createTables();
    db = await testDb.connect();
  });

  beforeEach(async () => {
    await testDb.cleanDatabase();
  });

  afterAll(async () => {
    await testDb.disconnect();
  });

  describe('create', () => {
    it('should create a new thread', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);

      const result = await Thread.create(
        'Test Title',
        'Test Body Content',
        'testuser1',
        'fr'
      );

      expect(result).toBeDefined();
      expect(result.id).toBeGreaterThan(0);
      expect(result.title).toBe('Test Title');
      expect(result.body).toBe('Test Body Content');
      expect(result.authorPseudo).toBe('testuser1');
      expect(result.language).toBe('fr');
    });

    it('should increment user post count on thread creation', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);

      await Thread.create('Test', 'Body', 'testuser1', 'fr');

      const [users] = await db.execute(
        'SELECT post_count FROM users WHERE pseudo = ?',
        ['testuser1']
      );

      expect(users[0].post_count).toBe(1);
    });

    it('should fail if author does not exist', async () => {
      await expect(
        Thread.create('Test', 'Body', 'nonexistent', 'fr')
      ).rejects.toThrow();
    });

    it('should use default language if not specified', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);

      const result = await Thread.create(
        'Test Title',
        'Test Body',
        'testuser1'
      );

      expect(result.language).toBe('fr');
    });
  });

  describe('findById', () => {
    it('should find thread by ID', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      const created = await fixtures.createTestThread(db, fixtures.validThreads.thread1);

      const thread = await Thread.findById(created.id);

      expect(thread).toBeDefined();
      expect(thread.id).toBe(created.id);
      expect(thread.title).toBe('Test Thread 1');
      expect(thread.author_pseudo).toBe('testuser1');
      expect(thread.reply_count).toBe(0);
      expect(thread.view_count).toBe(0);
      expect(thread.is_pinned).toBe(0);
      expect(thread.is_locked).toBe(0);
      expect(thread.is_deleted).toBe(0);
      expect(thread.is_hidden).toBe(0);
    });

    it('should return null for non-existent thread', async () => {
      const thread = await Thread.findById(99999);

      expect(thread).toBeNull();
    });

    it('should include author moderator status', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.moderator);
      const created = await fixtures.createTestThread(db, {
        title: 'Mod Thread',
        body: 'Body',
        authorPseudo: 'moderator1',
        language: 'fr'
      });

      const thread = await Thread.findById(created.id);

      expect(thread.author_is_moderator).toBe(1);
    });
  });

  describe('findAll', () => {
    beforeEach(async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      await fixtures.createTestUser(db, fixtures.validUsers.testuser2);
    });

    it('should return paginated threads', async () => {
      // Create multiple threads
      for (let i = 1; i <= 25; i++) {
        await fixtures.createTestThread(db, {
          title: `Thread ${i}`,
          body: `Body ${i}`,
          authorPseudo: i % 2 ? 'testuser1' : 'testuser2',
          language: 'fr'
        });
      }

      const threads = await Thread.findAll({ limit: 10, offset: 0 });

      expect(threads).toHaveLength(10);
      expect(threads[0].title).toBe('Thread 25'); // Most recent first
    });

    it('should filter by language', async () => {
      await fixtures.createTestThread(db, { ...fixtures.validThreads.thread1, language: 'fr' });
      await fixtures.createTestThread(db, { ...fixtures.validThreads.thread2, language: 'nl' });

      const frenchThreads = await Thread.findAll({ language: 'fr' });
      const dutchThreads = await Thread.findAll({ language: 'nl' });

      expect(frenchThreads).toHaveLength(1);
      expect(dutchThreads).toHaveLength(1);
    });

    it('should sort by recent activity', async () => {
      const thread1 = await fixtures.createTestThread(db, fixtures.validThreads.thread1);
      await new Promise(resolve => setTimeout(resolve, 10));
      const thread2 = await fixtures.createTestThread(db, fixtures.validThreads.thread2);

      // Update thread1's last_activity
      await db.execute(
        'UPDATE threads SET last_activity = NOW() WHERE id = ?',
        [thread1.id]
      );

      const threads = await Thread.findAll({ sort: 'recent' });

      expect(threads[0].id).toBe(thread1.id);
      expect(threads[1].id).toBe(thread2.id);
    });

    it('should sort by newest creation', async () => {
      const thread1 = await fixtures.createTestThread(db, fixtures.validThreads.thread1);
      await new Promise(resolve => setTimeout(resolve, 10));
      const thread2 = await fixtures.createTestThread(db, fixtures.validThreads.thread2);

      const threads = await Thread.findAll({ sort: 'newest' });

      expect(threads[0].id).toBe(thread2.id);
      expect(threads[1].id).toBe(thread1.id);
    });

    it('should sort by reply count', async () => {
      const thread1 = await fixtures.createTestThread(db, fixtures.validThreads.thread1);
      const thread2 = await fixtures.createTestThread(db, fixtures.validThreads.thread2);

      // Update reply counts
      await db.execute('UPDATE threads SET reply_count = 5 WHERE id = ?', [thread1.id]);
      await db.execute('UPDATE threads SET reply_count = 10 WHERE id = ?', [thread2.id]);

      const threads = await Thread.findAll({ sort: 'replies' });

      expect(threads[0].id).toBe(thread2.id);
      expect(threads[1].id).toBe(thread1.id);
    });

    it('should exclude deleted threads', async () => {
      const thread1 = await fixtures.createTestThread(db, fixtures.validThreads.thread1);
      await fixtures.createTestThread(db, fixtures.validThreads.thread2);

      await Thread.softDelete(thread1.id);

      const threads = await Thread.findAll();

      expect(threads).toHaveLength(1);
      expect(threads[0].title).toBe('Test Thread 2');
    });

    it('should exclude hidden threads', async () => {
      const thread1 = await fixtures.createTestThread(db, fixtures.validThreads.thread1);
      await fixtures.createTestThread(db, fixtures.validThreads.thread2);

      await Thread.hide(thread1.id);

      const threads = await Thread.findAll();

      expect(threads).toHaveLength(1);
      expect(threads[0].title).toBe('Test Thread 2');
    });

    it('should exclude threads from banned authors', async () => {
      await fixtures.createTestThread(db, fixtures.validThreads.thread1);
      await fixtures.createTestThread(db, fixtures.validThreads.thread2);

      await db.execute(
        'UPDATE users SET is_banned = TRUE WHERE pseudo = ?',
        ['testuser1']
      );

      const threads = await Thread.findAll();

      expect(threads).toHaveLength(1);
      expect(threads[0].author_pseudo).toBe('testuser2');
    });

    it('should show pinned threads first', async () => {
      const thread1 = await fixtures.createTestThread(db, fixtures.validThreads.thread1);
      const thread2 = await fixtures.createTestThread(db, fixtures.validThreads.thread2);

      await Thread.pin(thread1.id);

      const threads = await Thread.findAll();

      expect(threads[0].id).toBe(thread1.id);
      expect(threads[0].is_pinned).toBe(1);
    });
  });

  describe('update', () => {
    it('should update thread within 15 minute window', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      const thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);

      const success = await Thread.update(
        thread.id,
        'Updated Title',
        'Updated Body'
      );

      expect(success).toBe(true);

      const updated = await Thread.findById(thread.id);
      expect(updated.title).toBe('Updated Title');
      expect(updated.body).toBe('Updated Body');
      expect(updated.edited_at).not.toBeNull();
    });

    it('should fail to update after 15 minute window', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      const thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);

      // Set created_at to 20 minutes ago
      await db.execute(
        'UPDATE threads SET created_at = DATE_SUB(NOW(), INTERVAL 20 MINUTE) WHERE id = ?',
        [thread.id]
      );

      const success = await Thread.update(
        thread.id,
        'Updated Title',
        'Updated Body'
      );

      expect(success).toBe(false);
    });

    it('should not update deleted threads', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      const thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);

      await Thread.softDelete(thread.id);

      const success = await Thread.update(
        thread.id,
        'Updated Title',
        'Updated Body'
      );

      expect(success).toBe(false);
    });
  });

  describe('softDelete', () => {
    it('should soft delete a thread', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      const thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);

      const success = await Thread.softDelete(thread.id, 'Test deletion');

      expect(success).toBe(true);

      const deleted = await Thread.findById(thread.id);
      expect(deleted.is_deleted).toBe(1);
      expect(deleted.deleted_at).not.toBeNull();
      expect(deleted.deleted_reason).toBe('Test deletion');
    });

    it('should soft delete without reason', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      const thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);

      const success = await Thread.softDelete(thread.id);

      expect(success).toBe(true);

      const deleted = await Thread.findById(thread.id);
      expect(deleted.is_deleted).toBe(1);
      expect(deleted.deleted_reason).toBeNull();
    });
  });

  describe('pin/unpin', () => {
    it('should pin a thread', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      const thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);

      const success = await Thread.pin(thread.id);

      expect(success).toBe(true);

      const pinned = await Thread.findById(thread.id);
      expect(pinned.is_pinned).toBe(1);
    });

    it('should unpin a thread', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      const thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);

      await Thread.pin(thread.id);
      const success = await Thread.unpin(thread.id);

      expect(success).toBe(true);

      const unpinned = await Thread.findById(thread.id);
      expect(unpinned.is_pinned).toBe(0);
    });
  });

  describe('lock/unlock', () => {
    it('should lock a thread', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      const thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);

      const success = await Thread.lock(thread.id);

      expect(success).toBe(true);

      const locked = await Thread.findById(thread.id);
      expect(locked.is_locked).toBe(1);
    });

    it('should unlock a thread', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      const thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);

      await Thread.lock(thread.id);
      const success = await Thread.unlock(thread.id);

      expect(success).toBe(true);

      const unlocked = await Thread.findById(thread.id);
      expect(unlocked.is_locked).toBe(0);
    });

    it('should check if thread is locked', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      const thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);

      let isLocked = await Thread.isLocked(thread.id);
      expect(isLocked).toBe(false);

      await Thread.lock(thread.id);

      isLocked = await Thread.isLocked(thread.id);
      expect(isLocked).toBe(true);
    });
  });

  describe('hide/unhide', () => {
    it('should hide a thread', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      const thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);

      const success = await Thread.hide(thread.id);

      expect(success).toBe(true);

      const hidden = await Thread.findById(thread.id);
      expect(hidden.is_hidden).toBe(1);
    });

    it('should unhide a thread', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      const thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);

      await Thread.hide(thread.id);
      const success = await Thread.unhide(thread.id);

      expect(success).toBe(true);

      const unhidden = await Thread.findById(thread.id);
      expect(unhidden.is_hidden).toBe(0);
    });
  });

  describe('incrementViewCount', () => {
    it('should increment view count', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      const thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);

      await Thread.incrementViewCount(thread.id);
      await Thread.incrementViewCount(thread.id);
      await Thread.incrementViewCount(thread.id);

      const viewed = await Thread.findById(thread.id);
      expect(viewed.view_count).toBe(3);
    });
  });

  describe('incrementReplyCount', () => {
    it('should increment reply count and update last activity', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      const thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);

      const originalActivity = (await Thread.findById(thread.id)).last_activity;

      await new Promise(resolve => setTimeout(resolve, 10));

      await Thread.incrementReplyCount(thread.id);

      const updated = await Thread.findById(thread.id);
      expect(updated.reply_count).toBe(1);
      expect(new Date(updated.last_activity).getTime()).toBeGreaterThan(
        new Date(originalActivity).getTime()
      );
    });
  });

  describe('incrementReportCount', () => {
    it('should increment report count', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      const thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);

      await Thread.incrementReportCount(thread.id);
      await Thread.incrementReportCount(thread.id);

      const reported = await Thread.findById(thread.id);
      expect(reported.report_count).toBe(2);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      await fixtures.createTestUser(db, fixtures.validUsers.testuser2);
    });

    it('should search threads by title and body', async () => {
      await fixtures.createTestThread(db, fixtures.validThreads.thread1);
      await fixtures.createTestThread(db, fixtures.validThreads.thread2);
      await fixtures.createTestThread(db, fixtures.validThreads.longThread);

      const results = await Thread.search('functionality');

      expect(results).toHaveLength(1);
      expect(results[0].title).toContain('Search Functionality');
    });

    it('should return relevance scores', async () => {
      await fixtures.createTestThread(db, {
        title: 'Testing Testing Testing',
        body: 'Some content',
        authorPseudo: 'testuser1'
      });
      await fixtures.createTestThread(db, {
        title: 'Other Thread',
        body: 'Testing once',
        authorPseudo: 'testuser2'
      });

      const results = await Thread.search('Testing');

      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('Testing Testing Testing');
      expect(results[0].relevance).toBeGreaterThan(results[1].relevance);
    });

    it('should filter search by language', async () => {
      await fixtures.createTestThread(db, {
        title: 'French Test',
        body: 'Content',
        authorPseudo: 'testuser1',
        language: 'fr'
      });
      await fixtures.createTestThread(db, {
        title: 'Dutch Test',
        body: 'Content',
        authorPseudo: 'testuser2',
        language: 'nl'
      });

      const frenchResults = await Thread.search('Test', { language: 'fr' });
      const dutchResults = await Thread.search('Test', { language: 'nl' });

      expect(frenchResults).toHaveLength(1);
      expect(frenchResults[0].language).toBe('fr');
      expect(dutchResults).toHaveLength(1);
      expect(dutchResults[0].language).toBe('nl');
    });

    it('should paginate search results', async () => {
      // Create multiple threads with same keyword
      for (let i = 1; i <= 25; i++) {
        await fixtures.createTestThread(db, {
          title: `Thread ${i} with keyword`,
          body: 'Content',
          authorPseudo: i % 2 ? 'testuser1' : 'testuser2'
        });
      }

      const page1 = await Thread.search('keyword', { limit: 10, offset: 0 });
      const page2 = await Thread.search('keyword', { limit: 10, offset: 10 });

      expect(page1).toHaveLength(10);
      expect(page2).toHaveLength(10);
      expect(page1[0].id).not.toBe(page2[0].id);
    });

    it('should exclude deleted and hidden threads from search', async () => {
      const thread1 = await fixtures.createTestThread(db, {
        title: 'Searchable Thread',
        body: 'Content',
        authorPseudo: 'testuser1'
      });
      const thread2 = await fixtures.createTestThread(db, {
        title: 'Another Searchable Thread',
        body: 'Content',
        authorPseudo: 'testuser2'
      });

      await Thread.softDelete(thread1.id);
      await Thread.hide(thread2.id);

      const results = await Thread.search('Searchable');

      expect(results).toHaveLength(0);
    });
  });

  describe('count', () => {
    it('should count total threads', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      await fixtures.createTestUser(db, fixtures.validUsers.testuser2);

      await fixtures.createTestThread(db, fixtures.validThreads.thread1);
      await fixtures.createTestThread(db, fixtures.validThreads.thread2);

      const count = await Thread.count();

      expect(count).toBe(2);
    });

    it('should count threads by language', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      await fixtures.createTestUser(db, fixtures.validUsers.testuser2);

      await fixtures.createTestThread(db, { ...fixtures.validThreads.thread1, language: 'fr' });
      await fixtures.createTestThread(db, { ...fixtures.validThreads.thread2, language: 'nl' });

      const frenchCount = await Thread.count({ language: 'fr' });
      const dutchCount = await Thread.count({ language: 'nl' });

      expect(frenchCount).toBe(1);
      expect(dutchCount).toBe(1);
    });

    it('should exclude deleted and hidden threads from count', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);

      const thread1 = await fixtures.createTestThread(db, fixtures.validThreads.thread1);
      const thread2 = await fixtures.createTestThread(db, {
        ...fixtures.validThreads.thread1,
        title: 'Thread 2'
      });
      const thread3 = await fixtures.createTestThread(db, {
        ...fixtures.validThreads.thread1,
        title: 'Thread 3'
      });

      await Thread.softDelete(thread1.id);
      await Thread.hide(thread2.id);

      const count = await Thread.count();

      expect(count).toBe(1);
    });
  });

  describe('findByAuthor', () => {
    it('should find threads by author', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      await fixtures.createTestUser(db, fixtures.validUsers.testuser2);

      await fixtures.createTestThread(db, fixtures.validThreads.thread1);
      await fixtures.createTestThread(db, fixtures.validThreads.thread2);
      await fixtures.createTestThread(db, {
        ...fixtures.validThreads.thread1,
        title: 'Another Thread by User 1'
      });

      const user1Threads = await Thread.findByAuthor('testuser1');
      const user2Threads = await Thread.findByAuthor('testuser2');

      expect(user1Threads).toHaveLength(2);
      expect(user2Threads).toHaveLength(1);
    });

    it('should include deleted threads for author', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);

      const thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);
      await Thread.softDelete(thread.id);

      const threads = await Thread.findByAuthor('testuser1');

      expect(threads).toHaveLength(1);
      expect(threads[0].is_deleted).toBe(1);
    });

    it('should paginate author threads', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);

      for (let i = 1; i <= 15; i++) {
        await fixtures.createTestThread(db, {
          title: `Thread ${i}`,
          body: 'Body',
          authorPseudo: 'testuser1'
        });
      }

      const page1 = await Thread.findByAuthor('testuser1', { limit: 10, offset: 0 });
      const page2 = await Thread.findByAuthor('testuser1', { limit: 10, offset: 10 });

      expect(page1).toHaveLength(10);
      expect(page2).toHaveLength(5);
    });
  });

  describe('exists', () => {
    it('should return true for existing accessible thread', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      const thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);

      const exists = await Thread.exists(thread.id);

      expect(exists).toBe(true);
    });

    it('should return false for non-existent thread', async () => {
      const exists = await Thread.exists(99999);

      expect(exists).toBe(false);
    });

    it('should return false for deleted thread', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      const thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);

      await Thread.softDelete(thread.id);

      const exists = await Thread.exists(thread.id);

      expect(exists).toBe(false);
    });

    it('should return false for hidden thread', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      const thread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);

      await Thread.hide(thread.id);

      const exists = await Thread.exists(thread.id);

      expect(exists).toBe(false);
    });
  });

  describe('getPopular', () => {
    beforeEach(async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      await fixtures.createTestUser(db, fixtures.validUsers.testuser2);
    });

    it('should return popular threads from last 7 days', async () => {
      const thread1 = await fixtures.createTestThread(db, fixtures.validThreads.thread1);
      const thread2 = await fixtures.createTestThread(db, fixtures.validThreads.thread2);

      // Update reply and view counts
      await db.execute(
        'UPDATE threads SET reply_count = 10, view_count = 100 WHERE id = ?',
        [thread1.id]
      );
      await db.execute(
        'UPDATE threads SET reply_count = 20, view_count = 50 WHERE id = ?',
        [thread2.id]
      );

      const popular = await Thread.getPopular({ days: 7, limit: 10 });

      expect(popular).toHaveLength(2);
      expect(popular[0].id).toBe(thread2.id); // More replies
      expect(popular[1].id).toBe(thread1.id);
    });

    it('should exclude old threads', async () => {
      const thread1 = await fixtures.createTestThread(db, fixtures.validThreads.thread1);
      const thread2 = await fixtures.createTestThread(db, fixtures.validThreads.thread2);

      // Set thread1 to 10 days ago
      await db.execute(
        'UPDATE threads SET created_at = DATE_SUB(NOW(), INTERVAL 10 DAY) WHERE id = ?',
        [thread1.id]
      );

      const popular = await Thread.getPopular({ days: 7 });

      expect(popular).toHaveLength(1);
      expect(popular[0].id).toBe(thread2.id);
    });

    it('should filter by language', async () => {
      await fixtures.createTestThread(db, { ...fixtures.validThreads.thread1, language: 'fr' });
      await fixtures.createTestThread(db, { ...fixtures.validThreads.thread2, language: 'nl' });

      const frenchPopular = await Thread.getPopular({ language: 'fr' });
      const dutchPopular = await Thread.getPopular({ language: 'nl' });

      expect(frenchPopular).toHaveLength(1);
      expect(frenchPopular[0].language).toBe('fr');
      expect(dutchPopular).toHaveLength(1);
      expect(dutchPopular[0].language).toBe('nl');
    });
  });
});