/**
 * XSS (Cross-Site Scripting) Security Tests
 * Tests that user-generated content is properly sanitized to prevent XSS attacks
 */

const request = require('supertest');
const { describe, it, expect, beforeAll, afterAll } = require('@jest/globals');
const app = require('../../src/server');
const db = require('../../src/utils/database');
const User = require('../../src/models/User');
const Thread = require('../../src/models/Thread');
const Reply = require('../../src/models/Reply');

describe('XSS Protection', () => {
  let testUser;
  let authenticatedAgent;
  let csrfToken;

  // Common XSS payloads to test
  const xssPayloads = {
    scriptTag: '<script>alert("XSS")</script>',
    imgOnError: '<img src=x onerror=alert("XSS")>',
    svgOnLoad: '<svg onload=alert("XSS")>',
    iframeJavascript: '<iframe src="javascript:alert(\'XSS\')"></iframe>',
    linkJavascript: '<a href="javascript:alert(\'XSS\')">Click me</a>',
    inputAutoFocus: '<input autofocus onfocus=alert("XSS")>',
    divOnMouseOver: '<div onmouseover="alert(\'XSS\')">Hover me</div>',
    formAction: '<form action="javascript:alert(\'XSS\')"><input type="submit"></form>',
    objectData: '<object data="javascript:alert(\'XSS\')">',
    embedSrc: '<embed src="javascript:alert(\'XSS\')">',
    styleExpression: '<style>body{background:url("javascript:alert(\'XSS\')")}</style>',
    metaRefresh: '<meta http-equiv="refresh" content="0;url=javascript:alert(\'XSS\')">',
    baseHref: '<base href="javascript:alert(\'XSS\')//">'
  };

  // Expected safe outputs (all HTML entities escaped)
  const safeOutputs = {
    scriptTag: '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;',
    imgOnError: '&lt;img src=x onerror=alert(&quot;XSS&quot;)&gt;',
    svgOnLoad: '&lt;svg onload=alert(&quot;XSS&quot;)&gt;',
    iframeJavascript: '&lt;iframe src=&quot;javascript:alert(&#x27;XSS&#x27;)&quot;&gt;&lt;/iframe&gt;',
    linkJavascript: '&lt;a href=&quot;javascript:alert(&#x27;XSS&#x27;)&quot;&gt;Click me&lt;/a&gt;'
  };

  beforeAll(async () => {
    // Create test user
    const pseudo = `xsstest_${Date.now()}`;
    testUser = await User.create({
      pseudo,
      pin: '1234',
      language: 'fr'
    });

    // Create authenticated session
    authenticatedAgent = request.agent(app);
    const loginRes = await authenticatedAgent
      .post('/auth/login')
      .send({ pseudo, pin: '1234' });

    // Extract CSRF token
    const getCsrfRes = await authenticatedAgent.get('/forum/threads/new');
    const csrfMatch = getCsrfRes.text.match(/name="_csrf" value="([^"]+)"/);
    csrfToken = csrfMatch ? csrfMatch[1] : null;
  });

  afterAll(async () => {
    // Cleanup: Delete test data
    if (testUser) {
      await db.execute('DELETE FROM replies WHERE author_pseudo = ?', [testUser.pseudo]);
      await db.execute('DELETE FROM threads WHERE author_pseudo = ?', [testUser.pseudo]);
      await db.execute('DELETE FROM users WHERE pseudo = ?', [testUser.pseudo]);
    }
    await db.end();
  });

  // ============================================================================
  // Thread Content XSS Tests
  // ============================================================================

  describe('Thread Content', () => {
    it('should prevent script tag injection in thread content', async () => {
      const maliciousContent = xssPayloads.scriptTag;

      // Create thread with malicious content
      const createRes = await authenticatedAgent
        .post('/forum/threads/new')
        .send({
          title: 'XSS Test Thread',
          body: maliciousContent,
          language: 'fr',
          _csrf: csrfToken
        });

      expect(createRes.status).toBe(302); // Redirect on success

      // Extract thread ID from redirect
      const threadId = createRes.headers.location.match(/\/threads\/(\d+)/)[1];

      // Fetch thread page
      const threadRes = await authenticatedAgent.get(`/forum/threads/${threadId}`);

      // Content should be escaped
      expect(threadRes.text).not.toContain('<script>');
      expect(threadRes.text).toContain(safeOutputs.scriptTag);
      expect(threadRes.text).not.toMatch(/<script[^>]*>.*alert.*<\/script>/);
    });

    it('should prevent img onerror injection', async () => {
      const maliciousContent = xssPayloads.imgOnError;

      const createRes = await authenticatedAgent
        .post('/forum/threads/new')
        .send({
          title: 'IMG XSS Test',
          body: maliciousContent,
          language: 'fr',
          _csrf: csrfToken
        });

      const threadId = createRes.headers.location.match(/\/threads\/(\d+)/)[1];
      const threadRes = await authenticatedAgent.get(`/forum/threads/${threadId}`);

      // Should not contain executable img tag
      expect(threadRes.text).not.toMatch(/<img[^>]+onerror=/i);
      expect(threadRes.text).toContain(safeOutputs.imgOnError);
    });

    it('should prevent SVG onload injection', async () => {
      const maliciousContent = xssPayloads.svgOnLoad;

      const createRes = await authenticatedAgent
        .post('/forum/threads/new')
        .send({
          title: 'SVG XSS Test',
          body: maliciousContent,
          language: 'fr',
          _csrf: csrfToken
        });

      const threadId = createRes.headers.location.match(/\/threads\/(\d+)/)[1];
      const threadRes = await authenticatedAgent.get(`/forum/threads/${threadId}`);

      // Should not contain executable SVG
      expect(threadRes.text).not.toMatch(/<svg[^>]+onload=/i);
      expect(threadRes.text).toContain(safeOutputs.svgOnLoad);
    });

    it('should prevent iframe javascript: protocol injection', async () => {
      const maliciousContent = xssPayloads.iframeJavascript;

      const createRes = await authenticatedAgent
        .post('/forum/threads/new')
        .send({
          title: 'Iframe XSS Test',
          body: maliciousContent,
          language: 'fr',
          _csrf: csrfToken
        });

      const threadId = createRes.headers.location.match(/\/threads\/(\d+)/)[1];
      const threadRes = await authenticatedAgent.get(`/forum/threads/${threadId}`);

      // Should not contain executable iframe
      expect(threadRes.text).not.toMatch(/<iframe[^>]+src=['"]javascript:/i);
      expect(threadRes.text).toContain(safeOutputs.iframeJavascript);
    });

    it('should prevent link javascript: protocol injection', async () => {
      const maliciousContent = xssPayloads.linkJavascript;

      const createRes = await authenticatedAgent
        .post('/forum/threads/new')
        .send({
          title: 'Link XSS Test',
          body: maliciousContent,
          language: 'fr',
          _csrf: csrfToken
        });

      const threadId = createRes.headers.location.match(/\/threads\/(\d+)/)[1];
      const threadRes = await authenticatedAgent.get(`/forum/threads/${threadId}`);

      // Should not contain executable link
      expect(threadRes.text).not.toMatch(/<a[^>]+href=['"]javascript:/i);
      expect(threadRes.text).toContain(safeOutputs.linkJavascript);
    });

    it('should preserve line breaks while escaping HTML', async () => {
      const content = 'Line 1\n<script>alert("XSS")</script>\nLine 3';

      const createRes = await authenticatedAgent
        .post('/forum/threads/new')
        .send({
          title: 'Line Break Test',
          body: content,
          language: 'fr',
          _csrf: csrfToken
        });

      const threadId = createRes.headers.location.match(/\/threads\/(\d+)/)[1];
      const threadRes = await authenticatedAgent.get(`/forum/threads/${threadId}`);

      // Should have <br> tags for line breaks
      expect(threadRes.text).toContain('<br>');

      // But script tags should still be escaped
      expect(threadRes.text).not.toContain('<script>');
      expect(threadRes.text).toContain('&lt;script&gt;');
    });
  });

  // ============================================================================
  // Reply Content XSS Tests
  // ============================================================================

  describe('Reply Content', () => {
    let safeThreadId;

    beforeAll(async () => {
      // Create a safe thread for reply testing
      const createRes = await authenticatedAgent
        .post('/forum/threads/new')
        .send({
          title: 'Safe Thread for Reply Tests',
          body: 'This is a safe thread for testing reply XSS protection.',
          language: 'fr',
          _csrf: csrfToken
        });

      safeThreadId = createRes.headers.location.match(/\/threads\/(\d+)/)[1];
    });

    it('should prevent script tag injection in replies', async () => {
      const maliciousContent = xssPayloads.scriptTag;

      // Create reply with malicious content
      const replyRes = await authenticatedAgent
        .post(`/forum/threads/${safeThreadId}/replies`)
        .send({
          content: maliciousContent,
          _csrf: csrfToken
        });

      expect(replyRes.status).toBe(302);

      // Fetch thread with replies
      const threadRes = await authenticatedAgent.get(`/forum/threads/${safeThreadId}`);

      // Reply content should be escaped
      expect(threadRes.text).not.toContain('<script>alert');
      expect(threadRes.text).toContain(safeOutputs.scriptTag);
    });

    it('should prevent event handler injection in replies', async () => {
      const maliciousContent = xssPayloads.divOnMouseOver;

      await authenticatedAgent
        .post(`/forum/threads/${safeThreadId}/replies`)
        .send({
          content: maliciousContent,
          _csrf: csrfToken
        });

      const threadRes = await authenticatedAgent.get(`/forum/threads/${safeThreadId}`);

      // Should not contain executable event handlers
      expect(threadRes.text).not.toMatch(/<div[^>]+onmouseover=/i);
      expect(threadRes.text).toContain('&lt;div onmouseover=');
    });
  });

  // ============================================================================
  // Search XSS Tests
  // ============================================================================

  describe('Search Results', () => {
    let xssThreadId;

    beforeAll(async () => {
      // Create thread with XSS in title for search testing
      const createRes = await authenticatedAgent
        .post('/forum/threads/new')
        .send({
          title: xssPayloads.scriptTag,
          body: 'Test body',
          language: 'fr',
          _csrf: csrfToken
        });

      xssThreadId = createRes.headers.location.match(/\/threads\/(\d+)/)[1];
    });

    it('should sanitize search query to prevent reflected XSS', async () => {
      const maliciousQuery = xssPayloads.scriptTag;

      const searchRes = await authenticatedAgent
        .post('/forum/search')
        .send({
          q: maliciousQuery,
          _csrf: csrfToken
        });

      // Search query should be escaped in results page
      expect(searchRes.text).not.toContain('<script>alert');
      expect(searchRes.text).toContain('&lt;script&gt;');
    });

    it('should sanitize thread titles in search results', async () => {
      // Search for the XSS thread
      const searchRes = await authenticatedAgent
        .post('/forum/search')
        .send({
          q: 'script',
          _csrf: csrfToken
        });

      // Thread title in results should be escaped
      expect(searchRes.text).not.toContain('<script>alert');
      expect(searchRes.text).toContain('&lt;script&gt;');
    });

    it('should sanitize highlighted search terms', async () => {
      // Create thread with normal title
      await authenticatedAgent
        .post('/forum/threads/new')
        .send({
          title: 'Testing search highlighting',
          body: 'Test body for search',
          language: 'fr',
          _csrf: csrfToken
        });

      // Search with XSS payload as query
      const searchRes = await authenticatedAgent
        .post('/forum/search')
        .send({
          q: xssPayloads.scriptTag,
          _csrf: csrfToken
        });

      // Highlighting should not introduce XSS
      expect(searchRes.text).not.toContain('<script>alert');

      // Highlighting markup should be safe (<span> only)
      const highlightRegex = /<span class="search-highlight">[^<]*<\/span>/;
      if (searchRes.text.includes('search-highlight')) {
        expect(searchRes.text).toMatch(highlightRegex);
      }
    });

    it('should escape excerpts in search results', async () => {
      // Search for thread with XSS in body
      await authenticatedAgent
        .post('/forum/threads/new')
        .send({
          title: 'Excerpt Test',
          body: xssPayloads.imgOnError,
          language: 'fr',
          _csrf: csrfToken
        });

      const searchRes = await authenticatedAgent
        .post('/forum/search')
        .send({
          q: 'Excerpt',
          _csrf: csrfToken
        });

      // Excerpt should be escaped
      expect(searchRes.text).not.toMatch(/<img[^>]+onerror=/i);
      expect(searchRes.text).toContain('&lt;img');
    });
  });

  // ============================================================================
  // Additional XSS Attack Vectors
  // ============================================================================

  describe('Advanced XSS Vectors', () => {
    it('should prevent data: protocol in links', async () => {
      const maliciousContent = '<a href="data:text/html,<script>alert(\'XSS\')</script>">Click</a>';

      const createRes = await authenticatedAgent
        .post('/forum/threads/new')
        .send({
          title: 'Data Protocol Test',
          body: maliciousContent,
          language: 'fr',
          _csrf: csrfToken
        });

      const threadId = createRes.headers.location.match(/\/threads\/(\d+)/)[1];
      const threadRes = await authenticatedAgent.get(`/forum/threads/${threadId}`);

      // Should not contain executable data: link
      expect(threadRes.text).not.toMatch(/<a[^>]+href=['"]data:/i);
      expect(threadRes.text).toContain('&lt;a href=');
    });

    it('should prevent mixed case HTML tags', async () => {
      const maliciousContent = '<sCrIpT>alert("XSS")</ScRiPt>';

      const createRes = await authenticatedAgent
        .post('/forum/threads/new')
        .send({
          title: 'Mixed Case Test',
          body: maliciousContent,
          language: 'fr',
          _csrf: csrfToken
        });

      const threadId = createRes.headers.location.match(/\/threads\/(\d+)/)[1];
      const threadRes = await authenticatedAgent.get(`/forum/threads/${threadId}`);

      // Should be fully escaped
      expect(threadRes.text).not.toMatch(/<script/i);
      expect(threadRes.text).toContain('&lt;');
    });

    it('should prevent null byte injection', async () => {
      const maliciousContent = '<script\x00>alert("XSS")</script>';

      const createRes = await authenticatedAgent
        .post('/forum/threads/new')
        .send({
          title: 'Null Byte Test',
          body: maliciousContent,
          language: 'fr',
          _csrf: csrfToken
        });

      const threadId = createRes.headers.location.match(/\/threads\/(\d+)/)[1];
      const threadRes = await authenticatedAgent.get(`/forum/threads/${threadId}`);

      // Should be escaped
      expect(threadRes.text).not.toMatch(/<script.*>/i);
      expect(threadRes.text).toContain('&lt;script');
    });

    it('should prevent HTML entity encoding bypass', async () => {
      const maliciousContent = '&#60;script&#62;alert("XSS")&#60;/script&#62;';

      const createRes = await authenticatedAgent
        .post('/forum/threads/new')
        .send({
          title: 'HTML Entity Test',
          body: maliciousContent,
          language: 'fr',
          _csrf: csrfToken
        });

      const threadId = createRes.headers.location.match(/\/threads\/(\d+)/)[1];
      const threadRes = await authenticatedAgent.get(`/forum/threads/${threadId}`);

      // Entities should be double-escaped
      expect(threadRes.text).not.toContain('<script>');
      expect(threadRes.text).toContain('&amp;');
    });

    it('should handle extremely long XSS payloads', async () => {
      // Create a very long malicious payload
      const longPayload = '<script>' + 'alert("XSS");'.repeat(100) + '</script>';

      const createRes = await authenticatedAgent
        .post('/forum/threads/new')
        .send({
          title: 'Long Payload Test',
          body: longPayload,
          language: 'fr',
          _csrf: csrfToken
        });

      const threadId = createRes.headers.location.match(/\/threads\/(\d+)/)[1];
      const threadRes = await authenticatedAgent.get(`/forum/threads/${threadId}`);

      // Should still be escaped
      expect(threadRes.text).not.toContain('<script>alert');
      expect(threadRes.text).toContain('&lt;script&gt;');
    });
  });

  // ============================================================================
  // Sanitize Utility Tests
  // ============================================================================

  describe('Sanitize Utility Functions', () => {
    const { sanitizeContent, highlightSearchTerms } = require('../../src/utils/sanitize');

    it('should escape all HTML entities', () => {
      const input = '<script>alert("XSS")</script>';
      const output = sanitizeContent(input, false);

      expect(output).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
      expect(output).not.toContain('<script>');
    });

    it('should convert line breaks to <br> tags', () => {
      const input = 'Line 1\nLine 2\nLine 3';
      const output = sanitizeContent(input, true);

      expect(output).toContain('<br>');
      expect(output).toMatch(/Line 1<br>Line 2<br>Line 3/);
    });

    it('should handle empty strings gracefully', () => {
      expect(sanitizeContent('')).toBe('');
      expect(sanitizeContent(null)).toBe('');
      expect(sanitizeContent(undefined)).toBe('');
    });

    it('should highlight search terms safely', () => {
      const text = 'Hello <script>alert(1)</script> world';
      const query = 'Hello';
      const output = highlightSearchTerms(text, query);

      // Should escape malicious content
      expect(output).toContain('&lt;script&gt;');
      expect(output).not.toContain('<script>');

      // Should highlight search term
      expect(output).toContain('<span class="search-highlight">Hello</span>');
    });

    it('should escape search query in highlighting', () => {
      const text = 'Normal text here';
      const query = '<script>alert(1)</script>';
      const output = highlightSearchTerms(text, query);

      // Query should be escaped, so no highlight will occur
      expect(output).not.toContain('<script>');
      expect(output).toBe('Normal text here');
    });
  });
});
