/**
 * Thread Model
 * Handles all thread-related database operations
 */

const db = require('../utils/database');

class Thread {
  /**
   * Create a new thread
   * @param {string} title - Thread title
   * @param {string} body - Thread body content
   * @param {string} authorPseudo - Author's pseudo
   * @param {string} language - Thread language (fr, nl, de, en)
   * @returns {Promise<Object>} Created thread with ID
   */
  static async create(title, body, authorPseudo, language = 'fr') {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Create the thread
      const threadQuery = `
        INSERT INTO threads (title, body, author_pseudo, language)
        VALUES (?, ?, ?, ?)
      `;
      const [result] = await connection.execute(threadQuery, [title, body, authorPseudo, language]);

      // Update user's post count
      const userQuery = `
        UPDATE users
        SET post_count = post_count + 1
        WHERE pseudo = ?
      `;
      await connection.execute(userQuery, [authorPseudo]);

      await connection.commit();

      return {
        id: result.insertId,
        title,
        body,
        authorPseudo,
        language
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Find thread by ID
   * @param {number} id - Thread ID
   * @returns {Promise<Object|null>} Thread object or null if not found
   */
  static async findById(id) {
    const query = `
      SELECT
        t.id,
        t.title,
        t.body,
        t.author_pseudo,
        t.created_at,
        t.updated_at,
        t.last_activity,
        t.edited_at,
        t.reply_count,
        t.view_count,
        t.is_pinned,
        t.is_locked,
        t.is_deleted,
        t.deleted_at,
        t.deleted_reason,
        t.report_count,
        t.is_hidden,
        t.language,
        u.is_moderator as author_is_moderator,
        u.is_banned as author_is_banned
      FROM threads t
      JOIN users u ON t.author_pseudo = u.pseudo
      WHERE t.id = ?
    `;

    const [rows] = await db.execute(query, [id]);
    return rows[0] || null;
  }

  /**
   * Find all threads with pagination and sorting
   * @param {Object} options - Query options
   * @param {number} options.limit - Number of threads to return (default: 20)
   * @param {number} options.offset - Number of threads to skip (default: 0)
   * @param {string} options.sort - Sort order: 'recent', 'newest', 'replies' (default: 'recent')
   * @param {string} options.language - Filter by language (optional)
   * @returns {Promise<Array>} Array of threads
   */
  static async findAll(options = {}) {
    const {
      limit = 20,
      offset = 0,
      sort = 'recent',
      language = null
    } = options;

    let orderBy = 'last_activity DESC';
    switch (sort) {
      case 'newest':
        orderBy = 'created_at DESC';
        break;
      case 'replies':
        orderBy = 'reply_count DESC, last_activity DESC';
        break;
      case 'recent':
      default:
        orderBy = 'last_activity DESC';
    }

    let query = `
      SELECT
        t.id,
        t.title,
        t.author_pseudo,
        t.created_at,
        t.last_activity,
        t.reply_count,
        t.view_count,
        t.is_pinned,
        t.is_locked,
        t.language,
        u.is_moderator as author_is_moderator
      FROM threads t
      JOIN users u ON t.author_pseudo = u.pseudo
      WHERE t.is_deleted = FALSE
        AND t.is_hidden = FALSE
        AND u.is_banned = FALSE
    `;

    const params = [];

    if (language) {
      query += ' AND t.language = ?';
      params.push(language);
    }

    query += `
      ORDER BY t.is_pinned DESC, ${orderBy}
      LIMIT ? OFFSET ?
    `;

    params.push(limit, offset);

    const [rows] = await db.execute(query, params);
    return rows;
  }

  /**
   * Update thread (within 15 minute window)
   * @param {number} id - Thread ID
   * @param {string} title - New title
   * @param {string} body - New body content
   * @returns {Promise<boolean>} Success status
   */
  static async update(id, title, body) {
    const query = `
      UPDATE threads
      SET title = ?,
          body = ?,
          edited_at = NOW()
      WHERE id = ?
        AND is_deleted = FALSE
        AND TIMESTAMPDIFF(MINUTE, created_at, NOW()) <= 15
    `;

    const [result] = await db.execute(query, [title, body, id]);
    return result.affectedRows > 0;
  }

  /**
   * Soft delete a thread
   * @param {number} id - Thread ID
   * @param {string} reason - Deletion reason (optional)
   * @returns {Promise<boolean>} Success status
   */
  static async softDelete(id, reason = null) {
    const query = `
      UPDATE threads
      SET is_deleted = TRUE,
          deleted_at = NOW(),
          deleted_reason = ?
      WHERE id = ?
    `;

    const [result] = await db.execute(query, [reason, id]);
    return result.affectedRows > 0;
  }

  /**
   * Increment view count for a thread
   * @param {number} id - Thread ID
   * @returns {Promise<boolean>} Success status
   */
  static async incrementViewCount(id) {
    const query = `
      UPDATE threads
      SET view_count = view_count + 1
      WHERE id = ?
    `;

    const [result] = await db.execute(query, [id]);
    return result.affectedRows > 0;
  }

  /**
   * Increment reply count for a thread
   * @param {number} id - Thread ID
   * @returns {Promise<boolean>} Success status
   */
  static async incrementReplyCount(id) {
    const query = `
      UPDATE threads
      SET reply_count = reply_count + 1,
          last_activity = NOW()
      WHERE id = ?
    `;

    const [result] = await db.execute(query, [id]);
    return result.affectedRows > 0;
  }

  /**
   * Pin a thread (moderator only)
   * @param {number} id - Thread ID
   * @returns {Promise<boolean>} Success status
   */
  static async pin(id) {
    const query = `
      UPDATE threads
      SET is_pinned = TRUE
      WHERE id = ?
    `;

    const [result] = await db.execute(query, [id]);
    return result.affectedRows > 0;
  }

  /**
   * Unpin a thread (moderator only)
   * @param {number} id - Thread ID
   * @returns {Promise<boolean>} Success status
   */
  static async unpin(id) {
    const query = `
      UPDATE threads
      SET is_pinned = FALSE
      WHERE id = ?
    `;

    const [result] = await db.execute(query, [id]);
    return result.affectedRows > 0;
  }

  /**
   * Lock a thread (moderator only)
   * @param {number} id - Thread ID
   * @returns {Promise<boolean>} Success status
   */
  static async lock(id) {
    const query = `
      UPDATE threads
      SET is_locked = TRUE
      WHERE id = ?
    `;

    const [result] = await db.execute(query, [id]);
    return result.affectedRows > 0;
  }

  /**
   * Unlock a thread (moderator only)
   * @param {number} id - Thread ID
   * @returns {Promise<boolean>} Success status
   */
  static async unlock(id) {
    const query = `
      UPDATE threads
      SET is_locked = FALSE
      WHERE id = ?
    `;

    const [result] = await db.execute(query, [id]);
    return result.affectedRows > 0;
  }

  /**
   * Hide a reported thread
   * @param {number} id - Thread ID
   * @returns {Promise<boolean>} Success status
   */
  static async hide(id) {
    const query = `
      UPDATE threads
      SET is_hidden = TRUE
      WHERE id = ?
    `;

    const [result] = await db.execute(query, [id]);
    return result.affectedRows > 0;
  }

  /**
   * Unhide a thread
   * @param {number} id - Thread ID
   * @returns {Promise<boolean>} Success status
   */
  static async unhide(id) {
    const query = `
      UPDATE threads
      SET is_hidden = FALSE
      WHERE id = ?
    `;

    const [result] = await db.execute(query, [id]);
    return result.affectedRows > 0;
  }

  /**
   * Increment report count for a thread
   * @param {number} id - Thread ID
   * @returns {Promise<boolean>} Success status
   */
  static async incrementReportCount(id) {
    const query = `
      UPDATE threads
      SET report_count = report_count + 1
      WHERE id = ?
    `;

    const [result] = await db.execute(query, [id]);
    return result.affectedRows > 0;
  }

  /**
   * Full-text search for threads
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @param {number} options.limit - Number of results (default: 20)
   * @param {number} options.offset - Number of results to skip (default: 0)
   * @param {string} options.language - Filter by language (optional)
   * @returns {Promise<Array>} Array of matching threads
   */
  static async search(query, options = {}) {
    const {
      limit = 20,
      offset = 0,
      language = null
    } = options;

    let searchQuery = `
      SELECT
        t.id,
        t.title,
        t.body,
        t.author_pseudo,
        t.created_at,
        t.last_activity,
        t.reply_count,
        t.view_count,
        t.is_pinned,
        t.is_locked,
        t.language,
        u.is_moderator as author_is_moderator,
        MATCH(t.title, t.body) AGAINST(? IN NATURAL LANGUAGE MODE) as relevance
      FROM threads t
      JOIN users u ON t.author_pseudo = u.pseudo
      WHERE MATCH(t.title, t.body) AGAINST(? IN NATURAL LANGUAGE MODE)
        AND t.is_deleted = FALSE
        AND t.is_hidden = FALSE
        AND u.is_banned = FALSE
    `;

    const params = [query, query];

    if (language) {
      searchQuery += ' AND t.language = ?';
      params.push(language);
    }

    searchQuery += `
      ORDER BY relevance DESC, t.last_activity DESC
      LIMIT ? OFFSET ?
    `;

    params.push(limit, offset);

    const [rows] = await db.execute(searchQuery, params);
    return rows;
  }

  /**
   * Get thread count for pagination
   * @param {Object} options - Count options
   * @param {string} options.language - Filter by language (optional)
   * @returns {Promise<number>} Total thread count
   */
  static async count(options = {}) {
    const { language = null } = options;

    let query = `
      SELECT COUNT(*) as total
      FROM threads t
      JOIN users u ON t.author_pseudo = u.pseudo
      WHERE t.is_deleted = FALSE
        AND t.is_hidden = FALSE
        AND u.is_banned = FALSE
    `;

    const params = [];

    if (language) {
      query += ' AND t.language = ?';
      params.push(language);
    }

    const [rows] = await db.execute(query, params);
    return rows[0].total;
  }

  /**
   * Get threads by author
   * @param {string} authorPseudo - Author's pseudo
   * @param {Object} options - Query options
   * @param {number} options.limit - Number of threads (default: 10)
   * @param {number} options.offset - Number to skip (default: 0)
   * @param {boolean} options.includeBody - Include thread body (default: false)
   * @returns {Promise<Array>} Array of threads
   */
  static async findByAuthor(authorPseudo, options = {}) {
    const {
      limit = 10,
      offset = 0,
      includeBody = false
    } = options;

    const bodyField = includeBody ? 'body,' : '';

    const query = `
      SELECT
        id,
        title,
        ${bodyField}
        created_at,
        last_activity,
        reply_count,
        view_count,
        is_pinned,
        is_locked,
        is_deleted,
        is_hidden,
        language
      FROM threads
      WHERE author_pseudo = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await db.execute(query, [authorPseudo, limit, offset]);
    return rows;
  }

  /**
   * Check if thread exists and is accessible
   * @param {number} id - Thread ID
   * @returns {Promise<boolean>} True if thread exists and is accessible
   */
  static async exists(id) {
    const query = `
      SELECT COUNT(*) as count
      FROM threads
      WHERE id = ?
        AND is_deleted = FALSE
        AND is_hidden = FALSE
    `;

    const [rows] = await db.execute(query, [id]);
    return rows[0].count > 0;
  }

  /**
   * Check if thread is locked
   * @param {number} id - Thread ID
   * @returns {Promise<boolean>} True if thread is locked
   */
  static async isLocked(id) {
    const query = `
      SELECT is_locked
      FROM threads
      WHERE id = ?
    `;

    const [rows] = await db.execute(query, [id]);
    return rows[0]?.is_locked || false;
  }

  /**
   * Get popular threads
   * @param {Object} options - Query options
   * @param {number} options.days - Number of days to look back (default: 7)
   * @param {number} options.limit - Number of threads (default: 10)
   * @param {string} options.language - Filter by language (optional)
   * @returns {Promise<Array>} Array of popular threads
   */
  static async getPopular(options = {}) {
    const {
      days = 7,
      limit = 10,
      language = null
    } = options;

    let query = `
      SELECT
        t.id,
        t.title,
        t.author_pseudo,
        t.created_at,
        t.last_activity,
        t.reply_count,
        t.view_count,
        t.language,
        u.is_moderator as author_is_moderator
      FROM threads t
      JOIN users u ON t.author_pseudo = u.pseudo
      WHERE t.is_deleted = FALSE
        AND t.is_hidden = FALSE
        AND u.is_banned = FALSE
        AND t.created_at > DATE_SUB(NOW(), INTERVAL ? DAY)
    `;

    const params = [days];

    if (language) {
      query += ' AND t.language = ?';
      params.push(language);
    }

    query += `
      ORDER BY t.reply_count DESC, t.view_count DESC
      LIMIT ?
    `;

    params.push(limit);

    const [rows] = await db.execute(query, params);
    return rows;
  }
}

module.exports = Thread;