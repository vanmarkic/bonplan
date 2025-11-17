const validator = require('validator');

/**
 * Sanitize user content for safe HTML rendering
 * Escapes all HTML entities to prevent XSS attacks
 *
 * @param {string} content - User-generated content
 * @param {boolean} allowLineBreaks - Convert \n to &lt;br&gt; tags
 * @returns {string} - Safe HTML string
 *
 * @example
 * const safe = sanitizeContent('<script>alert("XSS")</script>');
 * // Returns: '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
 *
 * @example
 * const safe = sanitizeContent('Line 1\nLine 2', true);
 * // Returns: 'Line 1<br>Line 2'
 */
function sanitizeContent(content, allowLineBreaks = true) {
  if (!content || typeof content !== 'string') {
    return '';
  }

  // Escape all HTML entities (converts <script> to &lt;script&gt;)
  let safe = validator.escape(content);

  // Optionally convert line breaks to <br> tags (now safe since content is escaped)
  if (allowLineBreaks) {
    safe = safe.replace(/\n/g, '<br>');
  }

  return safe;
}

/**
 * Highlight search terms in text while preventing XSS
 * Escapes both the text and search query before adding highlight markup
 *
 * @param {string} text - Text to highlight
 * @param {string} query - Search query
 * @returns {string} - Safe HTML with highlighted terms
 *
 * @example
 * const highlighted = highlightSearchTerms('Hello <script>alert(1)</script>', 'Hello');
 * // Returns: '<span class="search-highlight">Hello</span> &lt;script&gt;...'
 */
function highlightSearchTerms(text, query) {
  if (!text || !query) {
    return validator.escape(text || '');
  }

  // Escape text first to prevent XSS
  const escapedText = validator.escape(text);

  // Escape query too
  const escapedQuery = validator.escape(query);

  // Split query into individual terms
  const terms = escapedQuery.split(' ').filter(term => term.length > 1);

  let highlightedText = escapedText;

  // Highlight each term (safe because both text and query are already escaped)
  terms.forEach(term => {
    // Escape special regex characters in the term
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedTerm})`, 'gi');
    highlightedText = highlightedText.replace(regex, '<span class="search-highlight">$1</span>');
  });

  return highlightedText;
}

module.exports = {
  sanitizeContent,
  highlightSearchTerms
};
