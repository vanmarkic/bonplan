/**
 * Report Service
 * Handles reporting functionality for threads and replies
 */

const db = require('../utils/database');
const logger = require('../utils/logger');

class ReportService {
  /**
   * Report a thread
   * @param {number} threadId - Thread ID
   * @param {string} reporterPseudo - Reporter's pseudo
   * @param {string} reason - Report reason
   * @returns {Promise<boolean>} Success status
   */
  static async reportThread(threadId, reporterPseudo, reason) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Check if user already reported this thread
      const checkQuery = `
        SELECT COUNT(*) as count
        FROM thread_reports
        WHERE thread_id = ? AND reporter_pseudo = ?
      `;
      const [existing] = await connection.execute(checkQuery, [threadId, reporterPseudo]);

      if (existing[0].count > 0) {
        await connection.rollback();
        return false; // Already reported
      }

      // Add report
      const insertQuery = `
        INSERT INTO thread_reports (thread_id, reporter_pseudo, reason)
        VALUES (?, ?, ?)
      `;
      await connection.execute(insertQuery, [threadId, reporterPseudo, reason]);

      // Update thread report count
      const updateQuery = `
        UPDATE threads
        SET report_count = (
          SELECT COUNT(*) FROM thread_reports WHERE thread_id = ?
        )
        WHERE id = ?
      `;
      await connection.execute(updateQuery, [threadId, threadId]);

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      logger.error('Error reporting thread', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Report a reply
   * @param {number} replyId - Reply ID
   * @param {string} reporterPseudo - Reporter's pseudo
   * @param {string} reason - Report reason
   * @returns {Promise<boolean>} Success status
   */
  static async reportReply(replyId, reporterPseudo, reason) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Check if user already reported this reply
      const checkQuery = `
        SELECT COUNT(*) as count
        FROM reply_reports
        WHERE reply_id = ? AND reporter_pseudo = ?
      `;
      const [existing] = await connection.execute(checkQuery, [replyId, reporterPseudo]);

      if (existing[0].count > 0) {
        await connection.rollback();
        return false; // Already reported
      }

      // Add report
      const insertQuery = `
        INSERT INTO reply_reports (reply_id, reporter_pseudo, reason)
        VALUES (?, ?, ?)
      `;
      await connection.execute(insertQuery, [replyId, reporterPseudo, reason]);

      // Update reply report count
      const updateQuery = `
        UPDATE replies
        SET report_count = (
          SELECT COUNT(*) FROM reply_reports WHERE reply_id = ?
        )
        WHERE id = ?
      `;
      await connection.execute(updateQuery, [replyId, replyId]);

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      logger.error('Error reporting reply', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Get thread report count
   * @param {number} threadId - Thread ID
   * @returns {Promise<number>} Report count
   */
  static async getThreadReportCount(threadId) {
    const query = `
      SELECT COUNT(*) as count
      FROM thread_reports
      WHERE thread_id = ?
    `;

    const [rows] = await db.execute(query, [threadId]);
    return rows[0].count;
  }

  /**
   * Get reply report count
   * @param {number} replyId - Reply ID
   * @returns {Promise<number>} Report count
   */
  static async getReplyReportCount(replyId) {
    const query = `
      SELECT COUNT(*) as count
      FROM reply_reports
      WHERE reply_id = ?
    `;

    const [rows] = await db.execute(query, [replyId]);
    return rows[0].count;
  }

  /**
   * Get reported threads for moderation
   * @param {Object} options - Query options
   * @param {number} options.minReports - Minimum report count (default: 5)
   * @param {number} options.limit - Result limit (default: 20)
   * @returns {Promise<Array>} Reported threads
   */
  static async getReportedThreads(options = {}) {
    const {
      minReports = 5,
      limit = 20
    } = options;

    const query = `
      SELECT
        t.id,
        t.title,
        t.author_pseudo,
        t.created_at,
        t.report_count,
        t.is_hidden,
        COUNT(DISTINCT tr.reporter_pseudo) as unique_reporters,
        GROUP_CONCAT(DISTINCT tr.reason SEPARATOR '|||') as report_reasons
      FROM threads t
      JOIN thread_reports tr ON t.id = tr.thread_id
      WHERE t.is_deleted = FALSE
        AND t.report_count >= ?
      GROUP BY t.id
      ORDER BY t.report_count DESC, t.created_at DESC
      LIMIT ?
    `;

    const [rows] = await db.execute(query, [minReports, limit]);

    // Parse report reasons
    return rows.map(row => ({
      ...row,
      report_reasons: row.report_reasons ? row.report_reasons.split('|||') : []
    }));
  }

  /**
   * Get reported replies for moderation
   * @param {Object} options - Query options
   * @param {number} options.minReports - Minimum report count (default: 5)
   * @param {number} options.limit - Result limit (default: 20)
   * @returns {Promise<Array>} Reported replies
   */
  static async getReportedReplies(options = {}) {
    const {
      minReports = 5,
      limit = 20
    } = options;

    const query = `
      SELECT
        r.id,
        r.thread_id,
        r.body,
        r.author_pseudo,
        r.created_at,
        r.report_count,
        r.is_hidden,
        t.title as thread_title,
        COUNT(DISTINCT rr.reporter_pseudo) as unique_reporters,
        GROUP_CONCAT(DISTINCT rr.reason SEPARATOR '|||') as report_reasons
      FROM replies r
      JOIN threads t ON r.thread_id = t.id
      JOIN reply_reports rr ON r.id = rr.reply_id
      WHERE r.is_deleted = FALSE
        AND r.report_count >= ?
      GROUP BY r.id
      ORDER BY r.report_count DESC, r.created_at DESC
      LIMIT ?
    `;

    const [rows] = await db.execute(query, [minReports, limit]);

    // Parse report reasons
    return rows.map(row => ({
      ...row,
      report_reasons: row.report_reasons ? row.report_reasons.split('|||') : []
    }));
  }

  /**
   * Get auto-hidden content statistics
   * @returns {Promise<Object>} Statistics
   */
  static async getAutoHiddenStats() {
    const threadQuery = `
      SELECT COUNT(*) as count
      FROM threads
      WHERE is_hidden = TRUE
        AND report_count >= 10
        AND is_deleted = FALSE
    `;

    const replyQuery = `
      SELECT COUNT(*) as count
      FROM replies
      WHERE is_hidden = TRUE
        AND report_count >= 10
        AND is_deleted = FALSE
    `;

    const [threadRows] = await db.execute(threadQuery);
    const [replyRows] = await db.execute(replyQuery);

    return {
      threads: threadRows[0].count,
      replies: replyRows[0].count,
      total: threadRows[0].count + replyRows[0].count
    };
  }

  /**
   * Clear all reports for a thread
   * @param {number} threadId - Thread ID
   * @returns {Promise<boolean>} Success status
   */
  static async clearThreadReports(threadId) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Delete all reports
      const deleteQuery = `
        DELETE FROM thread_reports
        WHERE thread_id = ?
      `;
      await connection.execute(deleteQuery, [threadId]);

      // Reset report count
      const updateQuery = `
        UPDATE threads
        SET report_count = 0
        WHERE id = ?
      `;
      await connection.execute(updateQuery, [threadId]);

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      logger.error('Error clearing thread reports', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Clear all reports for a reply
   * @param {number} replyId - Reply ID
   * @returns {Promise<boolean>} Success status
   */
  static async clearReplyReports(replyId) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Delete all reports
      const deleteQuery = `
        DELETE FROM reply_reports
        WHERE reply_id = ?
      `;
      await connection.execute(deleteQuery, [replyId]);

      // Reset report count
      const updateQuery = `
        UPDATE replies
        SET report_count = 0
        WHERE id = ?
      `;
      await connection.execute(updateQuery, [replyId]);

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      logger.error('Error clearing reply reports', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Get report details for a thread
   * @param {number} threadId - Thread ID
   * @returns {Promise<Array>} Report details
   */
  static async getThreadReportDetails(threadId) {
    const query = `
      SELECT
        reporter_pseudo,
        reason,
        created_at
      FROM thread_reports
      WHERE thread_id = ?
      ORDER BY created_at DESC
    `;

    const [rows] = await db.execute(query, [threadId]);
    return rows;
  }

  /**
   * Get report details for a reply
   * @param {number} replyId - Reply ID
   * @returns {Promise<Array>} Report details
   */
  static async getReplyReportDetails(replyId) {
    const query = `
      SELECT
        reporter_pseudo,
        reason,
        created_at
      FROM reply_reports
      WHERE reply_id = ?
      ORDER BY created_at DESC
    `;

    const [rows] = await db.execute(query, [replyId]);
    return rows;
  }

  /**
   * Get recent reports across all content
   * @param {Object} options - Query options
   * @param {number} options.limit - Result limit (default: 50)
   * @param {number} options.days - Days to look back (default: 7)
   * @returns {Promise<Array>} Recent reports
   */
  static async getRecentReports(options = {}) {
    const {
      limit = 50,
      days = 7
    } = options;

    const query = `
      (SELECT
        'thread' as type,
        thread_id as content_id,
        reporter_pseudo,
        reason,
        created_at,
        t.title as content_title
      FROM thread_reports tr
      JOIN threads t ON tr.thread_id = t.id
      WHERE tr.created_at > DATE_SUB(NOW(), INTERVAL ? DAY))
      UNION ALL
      (SELECT
        'reply' as type,
        reply_id as content_id,
        reporter_pseudo,
        reason,
        created_at,
        CONCAT('Reply in: ', t.title) as content_title
      FROM reply_reports rr
      JOIN replies r ON rr.reply_id = r.id
      JOIN threads t ON r.thread_id = t.id
      WHERE rr.created_at > DATE_SUB(NOW(), INTERVAL ? DAY))
      ORDER BY created_at DESC
      LIMIT ?
    `;

    const [rows] = await db.execute(query, [days, days, limit]);
    return rows;
  }

  /**
   * Get users with most reports
   * @param {Object} options - Query options
   * @param {number} options.limit - Result limit (default: 10)
   * @returns {Promise<Array>} Users with most reported content
   */
  static async getMostReportedUsers(options = {}) {
    const {
      limit = 10
    } = options;

    const query = `
      SELECT
        author_pseudo,
        SUM(thread_reports) as thread_reports,
        SUM(reply_reports) as reply_reports,
        SUM(thread_reports + reply_reports) as total_reports
      FROM (
        SELECT
          author_pseudo,
          COUNT(*) as thread_reports,
          0 as reply_reports
        FROM threads t
        JOIN thread_reports tr ON t.id = tr.thread_id
        WHERE t.is_deleted = FALSE
        GROUP BY author_pseudo

        UNION ALL

        SELECT
          author_pseudo,
          0 as thread_reports,
          COUNT(*) as reply_reports
        FROM replies r
        JOIN reply_reports rr ON r.id = rr.reply_id
        WHERE r.is_deleted = FALSE
        GROUP BY author_pseudo
      ) as report_counts
      GROUP BY author_pseudo
      ORDER BY total_reports DESC
      LIMIT ?
    `;

    const [rows] = await db.execute(query, [limit]);
    return rows;
  }
}

module.exports = ReportService;