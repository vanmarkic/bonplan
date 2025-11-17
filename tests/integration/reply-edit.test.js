/**
 * Reply Edit Integration Tests
 * Tests reply editing functionality with authentication and authorization
 */

const request = require('supertest');
const app = require('../../src/server');
const testDb = require('../helpers/testDb');
const testRedis = require('../helpers/testRedis');
const fixtures = require('../helpers/fixtures');
const Thread = require('../../src/models/Thread');
const Reply = require('../../src/models/Reply');

describe('Reply Edit Integration', () => {
  let agent;
  let authenticatedAgent;
  let otherUserAgent;
  let csrfToken;
  let otherCsrfToken;
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

    agent = request.agent(app);
    authenticatedAgent = request.agent(app);
    otherUserAgent = request.agent(app);

    // Create test users
    await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
    await fixtures.createTestUser(db, fixtures.validUsers.testuser2);

    // Login testuser1
    const loginRes = await authenticatedAgent
      .post('/auth/login')
      .send({
        pseudo: 'testuser1',
        pin: '1234'
      });

    expect(loginRes.status).toBe(302);

    // Login testuser2
    const otherLoginRes = await otherUserAgent
      .post('/auth/login')
      .send({
        pseudo: 'testuser2',
        pin: '5678'
      });

    expect(otherLoginRes.status).toBe(302);

    // Get CSRF tokens
    const formRes = await authenticatedAgent.get('/threads/new');
    const csrfMatch = formRes.text.match(/<input[^>]*name="_csrf"[^>]*value="([^"]+)"/);
    csrfToken = csrfMatch ? csrfMatch[1] : null;

    const otherFormRes = await otherUserAgent.get('/threads/new');
    const otherCsrfMatch = otherFormRes.text.match(/<input[^>]*name="_csrf"[^>]*value="([^"]+)"/);
    otherCsrfToken = otherCsrfMatch ? otherCsrfMatch[1] : null;

    // Create test thread and reply
    testThread = await Thread.create(
      'Test Thread for Replies',
      'Thread body content',
      'testuser1',
      'fr'
    );

    testReply = await Reply.create(
      testThread.id,
      'Original reply content',
      'testuser1'
    );
  });

  afterAll(async () => {
    await testDb.disconnect();
    await testRedis.disconnect();
  });

  // ============================================================================
  // GET /replies/:id/edit
  // ============================================================================

  describe('GET /replies/:id/edit', () => {
    it('should display edit form for own reply within edit window', async () => {
      const response = await authenticatedAgent.get(`/replies/${testReply.id}/edit`);

      expect(response.status).toBe(200);
      expect(response.text).toContain('Modifier la réponse');
      expect(response.text).toContain('Original reply content');
      expect(response.text).toContain('_csrf');
      expect(response.text).toContain('name="body"');
    });

    it('should require authentication', async () => {
      const response = await agent.get(`/replies/${testReply.id}/edit`);

      expect(response.status).toBe(401);
    });

    it('should reject edit by non-owner', async () => {
      const response = await otherUserAgent.get(`/replies/${testReply.id}/edit`);

      expect(response.status).toBe(403);
      expect(response.text).toContain('propres réponses');
    });

    it('should reject edit after 15 minute window', async () => {
      // Set reply created_at to 20 minutes ago
      await db.execute(
        'UPDATE replies SET created_at = DATE_SUB(NOW(), INTERVAL 20 MINUTE) WHERE id = ?',
        [testReply.id]
      );

      const response = await authenticatedAgent.get(`/replies/${testReply.id}/edit`);

      expect(response.status).toBe(403);
      expect(response.text).toContain('15 minutes');
      expect(response.text).toContain('expiré');
    });

    it('should return 404 for non-existent reply', async () => {
      const response = await authenticatedAgent.get('/replies/99999/edit');

      expect(response.status).toBe(404);
    });

    it('should return 404 for deleted reply', async () => {
      await Reply.softDelete(testReply.id, 'Test deletion');

      const response = await authenticatedAgent.get(`/replies/${testReply.id}/edit`);

      expect(response.status).toBe(404);
    });

    it('should validate reply ID format', async () => {
      const response = await authenticatedAgent.get('/replies/invalid/edit');

      expect(response.status).toBe(400);
      expect(response.text).toContain('invalide');
    });

    it('should show thread title in edit form', async () => {
      const response = await authenticatedAgent.get(`/replies/${testReply.id}/edit`);

      expect(response.status).toBe(200);
      expect(response.text).toContain('Test Thread for Replies');
    });

    it('should show current reply body in textarea', async () => {
      const response = await authenticatedAgent.get(`/replies/${testReply.id}/edit`);

      expect(response.status).toBe(200);
      expect(response.text).toContain('Original reply content');
      expect(response.text).toMatch(/<textarea[^>]*>Original reply content<\/textarea>/);
    });
  });

  // ============================================================================
  // POST /replies/:id/edit
  // ============================================================================

  describe('POST /replies/:id/edit', () => {
    it('should update reply with valid data within edit window', async () => {
      const response = await authenticatedAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: 'Updated reply content',
          _csrf: csrfToken
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`/threads/${testThread.id}#reply-${testReply.id}`);

      // Verify database update
      const updated = await Reply.findById(testReply.id);
      expect(updated.body).toBe('Updated reply content');
      expect(updated.edited_at).not.toBeNull();
    });

    it('should require authentication', async () => {
      const response = await agent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: 'Updated content',
          _csrf: csrfToken
        });

      expect(response.status).toBe(401);
    });

    it('should reject edit by non-owner', async () => {
      const response = await otherUserAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: 'Hacked content',
          _csrf: otherCsrfToken
        });

      expect(response.status).toBe(403);

      // Verify reply was not changed
      const unchanged = await Reply.findById(testReply.id);
      expect(unchanged.body).toBe('Original reply content');
    });

    it('should reject edit after 15 minute window', async () => {
      // Set reply created_at to 20 minutes ago
      await db.execute(
        'UPDATE replies SET created_at = DATE_SUB(NOW(), INTERVAL 20 MINUTE) WHERE id = ?',
        [testReply.id]
      );

      const response = await authenticatedAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: 'Too late edit',
          _csrf: csrfToken
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('dépassé');

      // Verify reply was not changed
      const unchanged = await Reply.findById(testReply.id);
      expect(unchanged.body).toBe('Original reply content');
    });

    it('should validate reply body is not empty', async () => {
      const response = await authenticatedAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: '', // Empty
          _csrf: csrfToken
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('2 et 5000 caractères');

      // Verify reply was not changed
      const unchanged = await Reply.findById(testReply.id);
      expect(unchanged.body).toBe('Original reply content');
    });

    it('should validate reply body minimum length', async () => {
      const response = await authenticatedAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: 'a', // Too short
          _csrf: csrfToken
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('2 et 5000 caractères');
    });

    it('should validate reply body maximum length', async () => {
      const response = await authenticatedAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: 'a'.repeat(5001), // Too long
          _csrf: csrfToken
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('2 et 5000 caractères');
    });

    it('should require CSRF token', async () => {
      const response = await authenticatedAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: 'Updated content'
          // Missing _csrf
        });

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent reply', async () => {
      const response = await authenticatedAgent
        .post('/replies/99999/edit')
        .send({
          body: 'Updated content',
          _csrf: csrfToken
        });

      expect(response.status).toBe(404);
    });

    it('should return 404 for deleted reply', async () => {
      await Reply.softDelete(testReply.id, 'Test deletion');

      const response = await authenticatedAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: 'Updated content',
          _csrf: csrfToken
        });

      expect(response.status).toBe(404);
    });

    it('should preserve edited_at timestamp', async () => {
      await authenticatedAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: 'First edit',
          _csrf: csrfToken
        });

      const firstEdit = await Reply.findById(testReply.id);
      const firstEditTime = new Date(firstEdit.edited_at);

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 100));

      await authenticatedAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: 'Second edit',
          _csrf: csrfToken
        });

      const secondEdit = await Reply.findById(testReply.id);
      const secondEditTime = new Date(secondEdit.edited_at);

      expect(secondEditTime.getTime()).toBeGreaterThan(firstEditTime.getTime());
    });

    it('should trim whitespace from reply body', async () => {
      const response = await authenticatedAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: '  Updated content with spaces  ',
          _csrf: csrfToken
        });

      expect(response.status).toBe(302);

      const updated = await Reply.findById(testReply.id);
      expect(updated.body).toBe('Updated content with spaces');
    });

    it('should allow multiple edits within window', async () => {
      // First edit
      await authenticatedAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: 'First edit',
          _csrf: csrfToken
        });

      // Second edit
      const response = await authenticatedAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: 'Second edit',
          _csrf: csrfToken
        });

      expect(response.status).toBe(302);

      const final = await Reply.findById(testReply.id);
      expect(final.body).toBe('Second edit');
    });

    it('should validate reply ID format', async () => {
      const response = await authenticatedAgent
        .post('/replies/invalid/edit')
        .send({
          body: 'Updated content',
          _csrf: csrfToken
        });

      expect(response.status).toBe(400);
    });

    it('should redirect to thread with reply anchor', async () => {
      const response = await authenticatedAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: 'Updated content',
          _csrf: csrfToken
        });

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain(`#reply-${testReply.id}`);
    });
  });

  // ============================================================================
  // Edit Window Enforcement
  // ============================================================================

  describe('Edit Window Enforcement', () => {
    it('should allow edit at 14 minutes (within window)', async () => {
      // Set created_at to 14 minutes ago
      await db.execute(
        'UPDATE replies SET created_at = DATE_SUB(NOW(), INTERVAL 14 MINUTE) WHERE id = ?',
        [testReply.id]
      );

      const response = await authenticatedAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: 'Last minute edit',
          _csrf: csrfToken
        });

      expect(response.status).toBe(302);

      const updated = await Reply.findById(testReply.id);
      expect(updated.body).toBe('Last minute edit');
    });

    it('should reject edit at 16 minutes (outside window)', async () => {
      // Set created_at to 16 minutes ago
      await db.execute(
        'UPDATE replies SET created_at = DATE_SUB(NOW(), INTERVAL 16 MINUTE) WHERE id = ?',
        [testReply.id]
      );

      const response = await authenticatedAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: 'Too late',
          _csrf: csrfToken
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('dépassé');
    });

    it('should enforce window on GET request', async () => {
      await db.execute(
        'UPDATE replies SET created_at = DATE_SUB(NOW(), INTERVAL 20 MINUTE) WHERE id = ?',
        [testReply.id]
      );

      const response = await authenticatedAgent.get(`/replies/${testReply.id}/edit`);

      expect(response.status).toBe(403);
    });

    it('should enforce window on POST request', async () => {
      await db.execute(
        'UPDATE replies SET created_at = DATE_SUB(NOW(), INTERVAL 20 MINUTE) WHERE id = ?',
        [testReply.id]
      );

      const response = await authenticatedAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: 'Updated',
          _csrf: csrfToken
        });

      // Should fail - model update returns false
      expect(response.status).toBe(200);
      expect(response.text).toContain('dépassé');
    });
  });

  // ============================================================================
  // Ownership Verification
  // ============================================================================

  describe('Ownership Verification', () => {
    it('should allow owner to edit their reply', async () => {
      const response = await authenticatedAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: 'Owner edit',
          _csrf: csrfToken
        });

      expect(response.status).toBe(302);
    });

    it('should prevent other users from editing', async () => {
      const response = await otherUserAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: 'Unauthorized edit',
          _csrf: otherCsrfToken
        });

      expect(response.status).toBe(403);
    });

    it('should verify ownership on GET request', async () => {
      const response = await otherUserAgent.get(`/replies/${testReply.id}/edit`);

      expect(response.status).toBe(403);
    });

    it('should verify ownership on POST request', async () => {
      const response = await otherUserAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: 'Hack attempt',
          _csrf: otherCsrfToken
        });

      expect(response.status).toBe(403);
    });

    it('should allow user to edit their own reply in someone elses thread', async () => {
      // Create reply by testuser2 in testuser1's thread
      const otherReply = await Reply.create(
        testThread.id,
        'Other user reply',
        'testuser2'
      );

      const response = await otherUserAgent
        .post(`/replies/${otherReply.id}/edit`)
        .send({
          body: 'Own reply edit',
          _csrf: otherCsrfToken
        });

      expect(response.status).toBe(302);

      const updated = await Reply.findById(otherReply.id);
      expect(updated.body).toBe('Own reply edit');
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle concurrent edit attempts gracefully', async () => {
      // Simulate two edit attempts at the same time
      const edit1 = authenticatedAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: 'Edit 1',
          _csrf: csrfToken
        });

      const edit2 = authenticatedAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: 'Edit 2',
          _csrf: csrfToken
        });

      const [response1, response2] = await Promise.all([edit1, edit2]);

      // Both should succeed (last write wins)
      expect(response1.status).toBe(302);
      expect(response2.status).toBe(302);

      const final = await Reply.findById(testReply.id);
      expect(['Edit 1', 'Edit 2']).toContain(final.body);
    });

    it('should handle reply to locked thread', async () => {
      // Lock the thread
      await Thread.lock(testThread.id);

      // Edit should still work (editing existing reply)
      const response = await authenticatedAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: 'Edit in locked thread',
          _csrf: csrfToken
        });

      expect(response.status).toBe(302);

      const updated = await Reply.findById(testReply.id);
      expect(updated.body).toBe('Edit in locked thread');
    });

    it('should handle special characters in reply body', async () => {
      const specialContent = 'Reply with <script>alert("xss")</script> & special chars: @#$%^&*()';

      const response = await authenticatedAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: specialContent,
          _csrf: csrfToken
        });

      expect(response.status).toBe(302);

      const updated = await Reply.findById(testReply.id);
      expect(updated.body).toBe(specialContent);
    });

    it('should handle unicode characters in reply body', async () => {
      const unicodeContent = 'Emoji test 🎉 Chinese 中文 Arabic العربية French émojis 🇫🇷';

      const response = await authenticatedAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: unicodeContent,
          _csrf: csrfToken
        });

      expect(response.status).toBe(302);

      const updated = await Reply.findById(testReply.id);
      expect(updated.body).toBe(unicodeContent);
    });

    it('should handle multiline reply content', async () => {
      const multilineContent = 'Line 1\nLine 2\nLine 3\n\nParagraph 2';

      const response = await authenticatedAgent
        .post(`/replies/${testReply.id}/edit`)
        .send({
          body: multilineContent,
          _csrf: csrfToken
        });

      expect(response.status).toBe(302);

      const updated = await Reply.findById(testReply.id);
      expect(updated.body).toBe(multilineContent);
    });
  });
});
