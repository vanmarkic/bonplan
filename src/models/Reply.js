/**
 * Reply Model
 * Handles all reply-related database operations
 */

const db = require('../utils/database');

class Reply {
  /**
   * Create a new reply
   * @param {number} threadId - Thread ID to reply to
   * @param {string} body - Reply body content
   * @param {string} authorPseudo - Author's pseudo
   * @returns {Promise<Object>} Created reply with ID
   */
  static async create(threadId, body, authorPseudo) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Check if thread exists and is not locked
      const checkQuery = `
        SELECT is_locked, is_deleted, is_hidden
        FROM threads
        WHERE id = ?
      `;
      const [threadCheck] = await connection.execute(checkQuery, [threadId]);

      if (!threadCheck[0]) {
        throw new Error('Thread not found');
      }

      if (threadCheck[0].is_locked) {
        throw new Error('Thread is locked');
      }

      if (threadCheck[0].is_deleted || threadCheck[0].is_hidden) {
        throw new Error('Thread is not accessible');
      }

      // Create the reply
      const replyQuery = `
        INSERT INTO replies (thread_id, body, author_pseudo)
        VALUES (?, ?, ?)
      `;
      const [result] = await connection.execute(replyQuery, [threadId, body, authorPseudo]);

      // Update thread's last activity and reply count
      const threadUpdateQuery = `
        UPDATE threads
        SET last_activity = NOW(),
            reply_count = reply_count + 1
        WHERE id = ?
      `;
      await connection.execute(threadUpdateQuery, [threadId]);

      // Update user's reply count
      const userQuery = `
        UPDATE users
        SET reply_count = reply_count + 1
        WHERE pseudo = ?
      `;
      await connection.execute(userQuery, [authorPseudo]);

      await connection.commit();

      return {
        id: result.insertId,
        threadId,
        body,
        authorPseudo,
        createdAt: new Date()
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Find replies by thread ID with pagination
   * @param {number} threadId - Thread ID
   * @param {Object} options - Query options
   * @param {number} options.limit - Number of replies to return (default: 50)
   * @param {number} options.offset - Number of replies to skip (default: 0)
   * @param {string} options.sort - Sort order: 'asc' or 'desc' (default: 'asc')
   * @returns {Promise<Array>} Array of replies
   */
  static async findByThreadId(threadId, options = {}) {
    const {
      limit = 50,
      offset = 0,
      sort = 'asc'
    } = options;

    const orderDirection = sort.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const query = `
      SELECT
        r.id,
        r.thread_id,
        r.body,
        r.author_pseudo,
        r.created_at,
        r.updated_at,
        r.edited_at,
        r.is_deleted,
        r.deleted_at,
        r.deleted_reason,
        r.report_count,
        r.is_hidden,
        u.is_moderator as author_is_moderator,
        u.is_banned as author_is_banned,
        u.created_at as author_joined_at
      FROM replies r
      JOIN users u ON r.author_pseudo = u.pseudo
      WHERE r.thread_id = ?
        AND r.is_deleted = FALSE
        AND r.is_hidden = FALSE
      ORDER BY r.created_at ${orderDirection}
      LIMIT ? OFFSET ?
    `;

    const [rows] = await db.execute(query, [threadId, limit, offset]);
    return rows;
  }

  /**
   * Find reply by ID
   * @param {number} id - Reply ID
   * @returns {Promise<Object|null>} Reply object or null if not found
   */
  static async findById(id) {
    const query = `
      SELECT
        r.id,
        r.thread_id,
        r.body,
        r.author_pseudo,
        r.created_at,
        r.updated_at,
        r.edited_at,
        r.is_deleted,
        r.deleted_at,
        r.deleted_reason,
        r.report_count,
        r.is_hidden,
        u.is_moderator as author_is_moderator,
        u.is_banned as author_is_banned
      FROM replies r
      JOIN users u ON r.author_pseudo = u.pseudo
      WHERE r.id = ?
    `;

    const [rows] = await db.execute(query, [id]);
    return rows[0] || null;
  }

  /**
   * Update reply (within 15 minute window)
   * @param {number} id - Reply ID
   * @param {string} body - New body content
   * @returns {Promise<boolean>} Success status
   */
  static async update(id, body) {
    const query = `
      UPDATE replies
      SET body = ?,
          edited_at = NOW()
      WHERE id = ?
        AND is_deleted = FALSE
        AND TIMESTAMPDIFF(MINUTE, created_at, NOW()) <= 15
    `;

    const [result] = await db.execute(query, [body, id]);
    return result.affectedRows > 0;
  }

  /**
   * Soft delete a reply
   * @param {number} id - Reply ID
   * @param {string} reason - Deletion reason (optional)
   * @returns {Promise<boolean>} Success status
   */
  static async softDelete(id, reason = null) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Get thread ID before deletion
      const getThreadQuery = `
        SELECT thread_id
        FROM replies
        WHERE id = ?
      `;
      const [replyInfo] = await connection.execute(getThreadQuery, [id]);

      if (!replyInfo[0]) {
        await connection.rollback();
        return false;
      }

      // Soft delete the reply
      const deleteQuery = `
        UPDATE replies
        SET is_deleted = TRUE,
            deleted_at = NOW(),
            deleted_reason = ?
        WHERE id = ?
      `;
      const [result] = await connection.execute(deleteQuery, [reason, id]);

      if (result.affectedRows > 0) {
        // Update thread's reply count
        const updateThreadQuery = `
          UPDATE threads
          SET reply_count = GREATEST(0, reply_count - 1)
          WHERE id = ?
        `;
        await connection.execute(updateThreadQuery, [replyInfo[0].thread_id]);
      }

      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Hide a reported reply
   * @param {number} id - Reply ID
   * @returns {Promise<boolean>} Success status
   */
  static async hide(id) {
    const query = `
      UPDATE replies
      SET is_hidden = TRUE
      WHERE id = ?
    `;

    const [result] = await db.execute(query, [id]);
    return result.affectedRows > 0;
  }

  /**
   * Unhide a reply
   * @param {number} id - Reply ID
   * @returns {Promise<boolean>} Success status
   */
  static async unhide(id) {
    const query = `
      UPDATE replies
      SET is_hidden = FALSE
      WHERE id = ?
    `;

    const [result] = await db.execute(query, [id]);
    return result.affectedRows > 0;
  }

  /**
   * Increment report count for a reply
   * @param {number} id - Reply ID
   * @returns {Promise<boolean>} Success status
   */
  static async incrementReportCount(id) {
    const query = `
      UPDATE replies
      SET report_count = report_count + 1
      WHERE id = ?
    `;

    const [result] = await db.execute(query, [id]);
    return result.affectedRows > 0;
  }

  /**
   * Get reply count for a thread
   * @param {number} threadId - Thread ID
   * @param {boolean} includeHidden - Include hidden replies in count (default: false)
   * @returns {Promise<number>} Reply count
   */
  static async countByThreadId(threadId, includeHidden = false) {
    let query = `
      SELECT COUNT(*) as total
      FROM replies
      WHERE thread_id = ?
        AND is_deleted = FALSE
    `;

    if (!includeHidden) {
      query += ' AND is_hidden = FALSE';
    }

    const [rows] = await db.execute(query, [threadId]);
    return rows[0].total;
  }

  /**
   * Get replies by author
   * @param {string} authorPseudo - Author's pseudo
   * @param {Object} options - Query options
   * @param {number} options.limit - Number of replies (default: 20)
   * @param {number} options.offset - Number to skip (default: 0)
   * @param {boolean} options.includeBody - Include reply body (default: true)
   * @returns {Promise<Array>} Array of replies
   */
  static async findByAuthor(authorPseudo, options = {}) {
    const {
      limit = 20,
      offset = 0,
      includeBody = true
    } = options;

    const bodyField = includeBody ? 'r.body,' : '';

    const query = `
      SELECT
        r.id,
        r.thread_id,
        ${bodyField}
        r.created_at,
        r.edited_at,
        r.is_deleted,
        r.is_hidden,
        t.title as thread_title
      FROM replies r
      JOIN threads t ON r.thread_id = t.id
      WHERE r.author_pseudo = ?
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await db.execute(query, [authorPseudo, limit, offset]);
    return rows;
  }

  /**
   * Search replies (full-text search)
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @param {number} options.limit - Number of results (default: 20)
   * @param {number} options.offset - Number of results to skip (default: 0)
   * @returns {Promise<Array>} Array of matching replies
   */
  static async search(query, options = {}) {
    const {
      limit = 20,
      offset = 0
    } = options;

    const searchQuery = `
      SELECT
        r.id,
        r.thread_id,
        r.body,
        r.author_pseudo,
        r.created_at,
        t.title as thread_title,
        t.language as thread_language,
        u.is_moderator as author_is_moderator,
        MATCH(r.body) AGAINST(? IN NATURAL LANGUAGE MODE) as relevance
      FROM replies r
      JOIN threads t ON r.thread_id = t.id
      JOIN users u ON r.author_pseudo = u.pseudo
      WHERE MATCH(r.body) AGAINST(? IN NATURAL LANGUAGE MODE)
        AND r.is_deleted = FALSE
        AND r.is_hidden = FALSE
        AND t.is_deleted = FALSE
        AND t.is_hidden = FALSE
        AND u.is_banned = FALSE
      ORDER BY relevance DESC, r.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await db.execute(searchQuery, [query, query, limit, offset]);
    return rows;
  }

  /**
   * Get recent replies
   * @param {Object} options - Query options
   * @param {number} options.limit - Number of replies (default: 10)
   * @param {string} options.language - Filter by thread language (optional)
   * @returns {Promise<Array>} Array of recent replies
   */
  static async getRecent(options = {}) {
    const {
      limit = 10,
      language = null
    } = options;

    let query = `
      SELECT
        r.id,
        r.thread_id,
        r.body,
        r.author_pseudo,
        r.created_at,
        t.title as thread_title,
        t.language as thread_language,
        u.is_moderator as author_is_moderator
      FROM replies r
      JOIN threads t ON r.thread_id = t.id
      JOIN users u ON r.author_pseudo = u.pseudo
      WHERE r.is_deleted = FALSE
        AND r.is_hidden = FALSE
        AND t.is_deleted = FALSE
        AND t.is_hidden = FALSE
        AND u.is_banned = FALSE
    `;

    const params = [];

    if (language) {
      query += ' AND t.language = ?';
      params.push(language);
    }

    query += `
      ORDER BY r.created_at DESC
      LIMIT ?
    `;

    params.push(limit);

    const [rows] = await db.execute(query, params);
    return rows;
  }

  /**
   * Check if reply exists
   * @param {number} id - Reply ID
   * @returns {Promise<boolean>} True if reply exists and is accessible
   */
  static async exists(id) {
    const query = `
      SELECT COUNT(*) as count
      FROM replies
      WHERE id = ?
        AND is_deleted = FALSE
        AND is_hidden = FALSE
    `;

    const [rows] = await db.execute(query, [id]);
    return rows[0].count > 0;
  }

  /**
   * Get reply with thread context
   * @param {number} id - Reply ID
   * @returns {Promise<Object|null>} Reply with thread information
   */
  static async findByIdWithContext(id) {
    const query = `
      SELECT
        r.id,
        r.thread_id,
        r.body,
        r.author_pseudo,
        r.created_at,
        r.updated_at,
        r.edited_at,
        r.is_deleted,
        r.is_hidden,
        r.report_count,
        t.title as thread_title,
        t.is_locked as thread_is_locked,
        t.language as thread_language,
        u.is_moderator as author_is_moderator
      FROM replies r
      JOIN threads t ON r.thread_id = t.id
      JOIN users u ON r.author_pseudo = u.pseudo
      WHERE r.id = ?
    `;

    const [rows] = await db.execute(query, [id]);
    return rows[0] || null;
  }

  /**
   * Bulk hide replies by thread ID (for moderation)
   * @param {number} threadId - Thread ID
   * @returns {Promise<number>} Number of affected replies
   */
  static async hideByThreadId(threadId) {
    const query = `
      UPDATE replies
      SET is_hidden = TRUE
      WHERE thread_id = ?
        AND is_deleted = FALSE
    `;

    const [result] = await db.execute(query, [threadId]);
    return result.affectedRows;
  }

  /**
   * Bulk unhide replies by thread ID (for moderation)
   * @param {number} threadId - Thread ID
   * @returns {Promise<number>} Number of affected replies
   */
  static async unhideByThreadId(threadId) {
    const query = `
      UPDATE replies
      SET is_hidden = FALSE
      WHERE thread_id = ?
    `;

    const [result] = await db.execute(query, [threadId]);
    return result.affectedRows;
  }
}

module.exports = Reply;