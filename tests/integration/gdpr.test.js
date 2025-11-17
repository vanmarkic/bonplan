/**
 * GDPR Routes Integration Tests
 * Tests user settings, data export, and account deletion
 */

const request = require('supertest');
const app = require('../../src/server');
const testDb = require('../helpers/testDb');
const testRedis = require('../helpers/testRedis');
const fixtures = require('../helpers/fixtures');
const User = require('../../src/models/User');
const Thread = require('../../src/models/Thread');
const Reply = require('../../src/models/Reply');

describe('GDPR Routes Integration', () => {
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

    // Get CSRF token from settings page
    const settingsRes = await authenticatedAgent.get('/forum/settings');
    const csrfMatch = settingsRes.text.match(/<input[^>]*name="_csrf"[^>]*value="([^"]+)"/);
    csrfToken = csrfMatch ? csrfMatch[1] : null;
  });

  afterAll(async () => {
    await testDb.disconnect();
    await testRedis.disconnect();
  });

  // ============================================================================
  // GET /forum/settings
  // ============================================================================

  describe('GET /forum/settings', () => {
    it('should display settings page when authenticated', async () => {
      const response = await authenticatedAgent.get('/forum/settings');

      expect(response.status).toBe(200);
      expect(response.text).toContain('Paramètres');
      expect(response.text).toContain('testuser1');
      expect(response.text).toContain('_csrf');
    });

    it('should show user statistics', async () => {
      // Create some content for the user
      await Thread.create('Test Thread', 'Test body content', 'testuser1', 'fr');

      const response = await authenticatedAgent.get('/forum/settings');

      expect(response.status).toBe(200);
      expect(response.text).toContain('testuser1');
      // Should show post count
      expect(response.text).toMatch(/post|fil|thread/i);
    });

    it('should require authentication', async () => {
      const response = await agent.get('/forum/settings');

      expect(response.status).toBe(401);
    });

    it('should show current language preference', async () => {
      // Update user language
      await db.execute(
        'UPDATE users SET preferred_language = ? WHERE pseudo = ?',
        ['nl', 'testuser1']
      );

      const response = await authenticatedAgent.get('/forum/settings');

      expect(response.status).toBe(200);
      expect(response.text).toContain('nl');
    });
  });

  // ============================================================================
  // POST /forum/settings/language
  // ============================================================================

  describe('POST /forum/settings/language', () => {
    it('should update user language preference', async () => {
      const response = await authenticatedAgent
        .post('/forum/settings/language')
        .send({
          language: 'nl',
          _csrf: csrfToken
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/forum/settings');

      // Verify database update
      const user = await User.findByPseudo('testuser1');
      expect(user.preferred_language).toBe('nl');
    });

    it('should reject invalid language', async () => {
      const response = await authenticatedAgent
        .post('/forum/settings/language')
        .send({
          language: 'es', // Not a valid language
          _csrf: csrfToken
        });

      expect(response.status).toBe(302);

      // Verify language was not changed
      const user = await User.findByPseudo('testuser1');
      expect(user.preferred_language).toBe('fr'); // Should remain 'fr'
    });

    it('should require CSRF token', async () => {
      const response = await authenticatedAgent
        .post('/forum/settings/language')
        .send({
          language: 'nl'
          // Missing _csrf
        });

      expect(response.status).toBe(403);
    });

    it('should require authentication', async () => {
      const response = await agent
        .post('/forum/settings/language')
        .send({
          language: 'nl',
          _csrf: csrfToken
        });

      expect(response.status).toBe(401);
    });

    it('should update session language', async () => {
      await authenticatedAgent
        .post('/forum/settings/language')
        .send({
          language: 'de',
          _csrf: csrfToken
        });

      // Make another request and check if language persisted
      const response = await authenticatedAgent.get('/forum/settings');
      expect(response.status).toBe(200);
    });
  });

  // ============================================================================
  // GET /forum/resources
  // ============================================================================

  describe('GET /forum/resources', () => {
    it('should display crisis resources page', async () => {
      const response = await agent.get('/forum/resources');

      expect(response.status).toBe(200);
      expect(response.text).toContain('Ressources');
    });

    it('should show Belgian crisis hotlines', async () => {
      const response = await agent.get('/forum/resources');

      expect(response.status).toBe(200);
      // Check for Belgian crisis services
      expect(response.text).toMatch(/0800|1813|078/); // Belgian phone numbers
    });

    it('should be accessible without authentication', async () => {
      const response = await agent.get('/forum/resources');

      expect(response.status).toBe(200);
    });

    it('should be accessible when authenticated', async () => {
      const response = await authenticatedAgent.get('/forum/resources');

      expect(response.status).toBe(200);
    });
  });

  // ============================================================================
  // GET /forum/export
  // ============================================================================

  describe('GET /forum/export', () => {
    it('should display export page when authenticated', async () => {
      const response = await authenticatedAgent.get('/forum/export');

      expect(response.status).toBe(200);
      expect(response.text).toContain('Exporter');
      expect(response.text).toContain('_csrf');
      expect(response.text).toContain('confirm');
    });

    it('should require authentication', async () => {
      const response = await agent.get('/forum/export');

      expect(response.status).toBe(401);
    });
  });

  // ============================================================================
  // POST /forum/export
  // ============================================================================

  describe('POST /forum/export', () => {
    beforeEach(async () => {
      // Create some user content
      const thread = await Thread.create(
        'User Thread',
        'This is my thread content',
        'testuser1',
        'fr'
      );

      await Reply.create(thread.id, 'My reply to thread', 'testuser1');
    });

    it('should export user data successfully', async () => {
      const response = await authenticatedAgent
        .post('/forum/export')
        .send({
          confirm: 'on',
          _csrf: csrfToken
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['content-disposition']).toMatch(/attachment/);
      expect(response.headers['content-disposition']).toContain('syndicat-export');

      // Parse JSON response
      const exportData = JSON.parse(response.text);

      // Verify structure
      expect(exportData).toHaveProperty('user');
      expect(exportData).toHaveProperty('threads');
      expect(exportData).toHaveProperty('replies');
      expect(exportData).toHaveProperty('exportDate');
      expect(exportData).toHaveProperty('exportVersion');

      // Verify user data
      expect(exportData.user.pseudo).toBe('testuser1');
      expect(exportData.user.preferredLanguage).toBe('fr');

      // Verify threads included
      expect(exportData.threads).toHaveLength(1);
      expect(exportData.threads[0].title).toBe('User Thread');
      expect(exportData.threads[0].body).toBe('This is my thread content');

      // Verify replies included
      expect(exportData.replies).toHaveLength(1);
      expect(exportData.replies[0].body).toBe('My reply to thread');
    });

    it('should not include PIN hash in export', async () => {
      const response = await authenticatedAgent
        .post('/forum/export')
        .send({
          confirm: 'on',
          _csrf: csrfToken
        });

      expect(response.status).toBe(200);

      const exportData = JSON.parse(response.text);

      // Verify PIN data is NOT included
      expect(exportData.user).not.toHaveProperty('pin_hash');
      expect(exportData.user).not.toHaveProperty('pin_salt');
      expect(exportData.user).not.toHaveProperty('pinHash');
      expect(exportData.user).not.toHaveProperty('pinSalt');
    });

    it('should not include deleted content in export', async () => {
      // Create and delete a thread
      const thread = await Thread.create(
        'Deleted Thread',
        'This will be deleted',
        'testuser1',
        'fr'
      );
      await Thread.softDelete(thread.id, 'Test deletion');

      const response = await authenticatedAgent
        .post('/forum/export')
        .send({
          confirm: 'on',
          _csrf: csrfToken
        });

      expect(response.status).toBe(200);

      const exportData = JSON.parse(response.text);

      // Should not include deleted thread
      const deletedThread = exportData.threads.find(t => t.title === 'Deleted Thread');
      expect(deletedThread).toBeUndefined();
    });

    it('should include thread metadata in export', async () => {
      const response = await authenticatedAgent
        .post('/forum/export')
        .send({
          confirm: 'on',
          _csrf: csrfToken
        });

      expect(response.status).toBe(200);

      const exportData = JSON.parse(response.text);

      expect(exportData.threads[0]).toHaveProperty('id');
      expect(exportData.threads[0]).toHaveProperty('title');
      expect(exportData.threads[0]).toHaveProperty('body');
      expect(exportData.threads[0]).toHaveProperty('createdAt');
      expect(exportData.threads[0]).toHaveProperty('replyCount');
      expect(exportData.threads[0]).toHaveProperty('viewCount');
      expect(exportData.threads[0]).toHaveProperty('language');
    });

    it('should require confirmation checkbox', async () => {
      const response = await authenticatedAgent
        .post('/forum/export')
        .send({
          // Missing confirm: 'on'
          _csrf: csrfToken
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('confirmer');
    });

    it('should require CSRF token', async () => {
      const response = await authenticatedAgent
        .post('/forum/export')
        .send({
          confirm: 'on'
          // Missing _csrf
        });

      expect(response.status).toBe(403);
    });

    it('should require authentication', async () => {
      const response = await agent
        .post('/forum/export')
        .send({
          confirm: 'on',
          _csrf: csrfToken
        });

      expect(response.status).toBe(401);
    });

    it('should export empty arrays when user has no content', async () => {
      // Clean up content created in beforeEach
      await db.execute('DELETE FROM replies WHERE author_pseudo = ?', ['testuser1']);
      await db.execute('DELETE FROM threads WHERE author_pseudo = ?', ['testuser1']);

      const response = await authenticatedAgent
        .post('/forum/export')
        .send({
          confirm: 'on',
          _csrf: csrfToken
        });

      expect(response.status).toBe(200);

      const exportData = JSON.parse(response.text);

      expect(exportData.threads).toHaveLength(0);
      expect(exportData.replies).toHaveLength(0);
    });
  });

  // ============================================================================
  // GET /forum/delete-account
  // ============================================================================

  describe('GET /forum/delete-account', () => {
    it('should display account deletion page when authenticated', async () => {
      const response = await authenticatedAgent.get('/forum/delete-account');

      expect(response.status).toBe(200);
      expect(response.text).toContain('Supprimer');
      expect(response.text).toContain('_csrf');
      expect(response.text).toContain('confirmation');
      expect(response.text).toContain('pin');
      expect(response.text).toContain('understand');
    });

    it('should show warning about permanent deletion', async () => {
      const response = await authenticatedAgent.get('/forum/delete-account');

      expect(response.status).toBe(200);
      expect(response.text).toMatch(/permanent|définitif|irréversible/i);
    });

    it('should require authentication', async () => {
      const response = await agent.get('/forum/delete-account');

      expect(response.status).toBe(401);
    });
  });

  // ============================================================================
  // POST /forum/delete-account
  // ============================================================================

  describe('POST /forum/delete-account', () => {
    beforeEach(async () => {
      // Create some content for the user
      const thread = await Thread.create(
        'Thread to be deleted',
        'This thread will be deleted with account',
        'testuser1',
        'fr'
      );

      await Reply.create(thread.id, 'Reply to be deleted', 'testuser1');
    });

    it('should delete account with correct PIN and confirmation', async () => {
      const response = await authenticatedAgent
        .post('/forum/delete-account')
        .send({
          confirmation: 'DELETE MY ACCOUNT',
          pin: '1234',
          understand: 'on',
          _csrf: csrfToken
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('supprimé');

      // Verify user was deleted
      const user = await User.findByPseudo('testuser1');
      expect(user).toBeNull();

      // Verify threads were cascade deleted
      const threads = await db.execute(
        'SELECT * FROM threads WHERE author_pseudo = ?',
        ['testuser1']
      );
      expect(threads[0]).toHaveLength(0);

      // Verify replies were cascade deleted
      const replies = await db.execute(
        'SELECT * FROM replies WHERE author_pseudo = ?',
        ['testuser1']
      );
      expect(replies[0]).toHaveLength(0);
    });

    it('should reject incorrect PIN', async () => {
      const response = await authenticatedAgent
        .post('/forum/delete-account')
        .send({
          confirmation: 'DELETE MY ACCOUNT',
          pin: '9999', // Wrong PIN
          understand: 'on',
          _csrf: csrfToken
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('incorrect');

      // Verify user was NOT deleted
      const user = await User.findByPseudo('testuser1');
      expect(user).not.toBeNull();
    });

    it('should reject incorrect confirmation phrase', async () => {
      const response = await authenticatedAgent
        .post('/forum/delete-account')
        .send({
          confirmation: 'delete my account', // Wrong case
          pin: '1234',
          understand: 'on',
          _csrf: csrfToken
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('DELETE MY ACCOUNT');

      // Verify user was NOT deleted
      const user = await User.findByPseudo('testuser1');
      expect(user).not.toBeNull();
    });

    it('should require understand checkbox', async () => {
      const response = await authenticatedAgent
        .post('/forum/delete-account')
        .send({
          confirmation: 'DELETE MY ACCOUNT',
          pin: '1234',
          // Missing understand: 'on'
          _csrf: csrfToken
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('confirmer');

      // Verify user was NOT deleted
      const user = await User.findByPseudo('testuser1');
      expect(user).not.toBeNull();
    });

    it('should validate PIN format', async () => {
      const response = await authenticatedAgent
        .post('/forum/delete-account')
        .send({
          confirmation: 'DELETE MY ACCOUNT',
          pin: 'abc', // Invalid format
          understand: 'on',
          _csrf: csrfToken
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('invalide');

      // Verify user was NOT deleted
      const user = await User.findByPseudo('testuser1');
      expect(user).not.toBeNull();
    });

    it('should require CSRF token', async () => {
      const response = await authenticatedAgent
        .post('/forum/delete-account')
        .send({
          confirmation: 'DELETE MY ACCOUNT',
          pin: '1234',
          understand: 'on'
          // Missing _csrf
        });

      expect(response.status).toBe(403);
    });

    it('should require authentication', async () => {
      const response = await agent
        .post('/forum/delete-account')
        .send({
          confirmation: 'DELETE MY ACCOUNT',
          pin: '1234',
          understand: 'on',
          _csrf: csrfToken
        });

      expect(response.status).toBe(401);
    });

    it('should destroy session after deletion', async () => {
      await authenticatedAgent
        .post('/forum/delete-account')
        .send({
          confirmation: 'DELETE MY ACCOUNT',
          pin: '1234',
          understand: 'on',
          _csrf: csrfToken
        });

      // Try to access protected route - should fail
      const settingsResponse = await authenticatedAgent.get('/forum/settings');
      expect(settingsResponse.status).toBe(401);
    });

    it('should cascade delete reports made by user', async () => {
      // Create another user and their content
      await fixtures.createTestUser(db, fixtures.validUsers.testuser2);
      const thread = await Thread.create(
        'Other user thread',
        'Content',
        'testuser2',
        'fr'
      );

      // Report the thread
      await db.execute(
        'INSERT INTO thread_reports (thread_id, reporter_pseudo, reason) VALUES (?, ?, ?)',
        [thread.id, 'testuser1', 'Test report']
      );

      // Delete account
      await authenticatedAgent
        .post('/forum/delete-account')
        .send({
          confirmation: 'DELETE MY ACCOUNT',
          pin: '1234',
          understand: 'on',
          _csrf: csrfToken
        });

      // Verify report was deleted
      const reports = await db.execute(
        'SELECT * FROM thread_reports WHERE reporter_pseudo = ?',
        ['testuser1']
      );
      expect(reports[0]).toHaveLength(0);
    });
  });
});
