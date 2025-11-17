/**
 * Post Model
 * Handles room posts with expiration
 */

const db = require('../utils/database');
const logger = require('../utils/logger');

class Post {
  /**
   * Create a new post in a room
   * @param {Object} postData - Post data
   * @returns {Promise<Object>} Created post
   */
  static async create(postData) {
    const {
      roomId,
      authorPseudo,
      title,
      content,
      expiresInDays = 30
    } = postData;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const query = `
      INSERT INTO room_posts (
        room_id, author_pseudo, title, content, expires_at, lifetime_days
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    const [result] = await db.execute(query, [
      roomId,
      authorPseudo,
      title,
      content,
      expiresAt,
      expiresInDays
    ]);

    // Update member's last post time
    const CommunityRoom = require('./CommunityRoom');
    await CommunityRoom.updateLastPost(roomId, authorPseudo);

    return {
      id: result.insertId,
      roomId,
      authorPseudo,
      title,
      content,
      expiresAt,
      lifetimeDays: expiresInDays
    };
  }

  /**
   * Get post by ID
   * @param {number} id - Post ID
   * @returns {Promise<Object|null>} Post data or null
   */
  static async findById(id) {
    const query = `
      SELECT id, room_id, author_pseudo, title, content,
             created_at, expires_at, lifetime_days, is_pinned,
             is_expired, deleted_at
      FROM room_posts
      WHERE id = ? AND deleted_at IS NULL
    `;

    const [rows] = await db.execute(query, [id]);
    return rows[0] || null;
  }

  /**
   * Get posts for room
   * @param {number} roomId - Room ID
   * @param {boolean} includeExpired - Include expired posts
   * @returns {Promise<Array>} Array of posts
   */
  static async getRoomPosts(roomId, includeExpired = false) {
    let query = `
      SELECT id, author_pseudo, title, content,
             created_at, expires_at, lifetime_days,
             is_pinned, is_expired
      FROM room_posts
      WHERE room_id = ? AND deleted_at IS NULL
    `;

    if (!includeExpired) {
      query += ' AND is_expired = FALSE';
    }

    query += ' ORDER BY is_pinned DESC, created_at DESC';

    const [rows] = await db.execute(query, [roomId]);
    return rows;
  }

  /**
   * Get posts by author in last N days
   * @param {number} roomId - Room ID
   * @param {string} authorPseudo - Author pseudo
   * @param {number} days - Number of days
   * @returns {Promise<Array>} Array of posts
   */
  static async getAuthorRecentPosts(roomId, authorPseudo, days) {
    const query = `
      SELECT id, title, created_at, expires_at
      FROM room_posts
      WHERE room_id = ?
        AND author_pseudo = ?
        AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;

    const [rows] = await db.execute(query, [roomId, authorPseudo, days]);
    return rows;
  }

  /**
   * Get unique posters count in last N hours
   * @param {number} roomId - Room ID
   * @param {number} hours - Number of hours
   * @returns {Promise<number>} Unique poster count
   */
  static async getUniquePostersCount(roomId, hours) {
    const query = `
      SELECT COUNT(DISTINCT author_pseudo) as count
      FROM room_posts
      WHERE room_id = ?
        AND created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
        AND deleted_at IS NULL
    `;

    const [rows] = await db.execute(query, [roomId, hours]);
    return rows[0].count;
  }

  /**
   * Update post expiration
   * @param {number} postId - Post ID
   * @param {number} additionalDays - Days to add
   * @returns {Promise<Object>} Update result
   */
  static async extendExpiration(postId, additionalDays) {
    const query = `
      UPDATE room_posts
      SET expires_at = DATE_ADD(expires_at, INTERVAL ? DAY),
          lifetime_days = lifetime_days + ?
      WHERE id = ? AND deleted_at IS NULL
    `;

    const [result] = await db.execute(query, [
      additionalDays,
      additionalDays,
      postId
    ]);

    return {
      success: result.affectedRows > 0
    };
  }

  /**
   * Set post expiration to never
   * @param {number} postId - Post ID
   * @param {string} reason - Reason for no expiration
   * @returns {Promise<boolean>} Success status
   */
  static async disableExpiration(postId, reason) {
    const query = `
      UPDATE room_posts
      SET expires_at = NULL,
          no_expire_reason = ?
      WHERE id = ? AND deleted_at IS NULL
    `;

    const [result] = await db.execute(query, [reason, postId]);
    return result.affectedRows > 0;
  }

  /**
   * Pin/unpin post
   * @param {number} postId - Post ID
   * @param {boolean} isPinned - Pin status
   * @returns {Promise<boolean>} Success status
   */
  static async setPinned(postId, isPinned) {
    const query = `
      UPDATE room_posts
      SET is_pinned = ?
      WHERE id = ? AND deleted_at IS NULL
    `;

    const [result] = await db.execute(query, [isPinned, postId]);
    return result.affectedRows > 0;
  }

  /**
   * Process expired posts
   * @returns {Promise<Array>} Array of deleted post IDs
   */
  static async processExpiredPosts() {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Find expired posts
      const selectQuery = `
        SELECT id, room_id, author_pseudo, title
        FROM room_posts
        WHERE expires_at <= NOW()
          AND is_expired = FALSE
          AND deleted_at IS NULL
      `;
      const [expiredPosts] = await connection.execute(selectQuery);

      const deletedIds = [];

      for (const post of expiredPosts) {
        // Check for recent activity (replies in last hour)
        const activityQuery = `
          SELECT COUNT(*) as reply_count
          FROM post_replies
          WHERE post_id = ?
            AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
        `;
        const [activity] = await connection.execute(activityQuery, [post.id]);

        if (activity[0].reply_count >= 10) {
          // Extend expiration due to active discussion
          const extendQuery = `
            UPDATE room_posts
            SET expires_at = DATE_ADD(NOW(), INTERVAL 1 DAY),
                extension_reason = 'Active discussion'
            WHERE id = ?
          `;
          await connection.execute(extendQuery, [post.id]);
          logger.info(`Extended expiration for active post ${post.id}`);
        } else {
          // Mark as expired and delete
          const deleteQuery = `
            UPDATE room_posts
            SET is_expired = TRUE,
                deleted_at = NOW()
            WHERE id = ?
          `;
          await connection.execute(deleteQuery, [post.id]);
          deletedIds.push(post.id);
          logger.info(`Deleted expired post ${post.id}: ${post.title}`);
        }
      }

      await connection.commit();
      return deletedIds;
    } catch (error) {
      await connection.rollback();
      logger.error('Error processing expired posts', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Get posts expiring soon
   * @param {number} days - Days until expiration
   * @returns {Promise<Array>} Array of posts
   */
  static async getExpiringPosts(days) {
    const query = `
      SELECT p.id, p.room_id, p.author_pseudo, p.title,
             p.expires_at, cr.name as room_name
      FROM room_posts p
      JOIN community_rooms cr ON p.room_id = cr.id
      WHERE p.expires_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ? DAY)
        AND p.is_expired = FALSE
        AND p.deleted_at IS NULL
      ORDER BY p.expires_at ASC
    `;

    const [rows] = await db.execute(query, [days]);
    return rows;
  }

  /**
   * Get posts by expiration status for user
   * @param {string} userPseudo - User pseudo
   * @param {number} days - Days to check
   * @returns {Promise<Object>} Grouped posts by expiration
   */
  static async getUserExpiringPosts(userPseudo, days = 7) {
    const query = `
      SELECT p.id, p.room_id, p.title, p.expires_at,
             DATEDIFF(p.expires_at, NOW()) as days_until_expiration,
             cr.name as room_name
      FROM room_posts p
      JOIN community_rooms cr ON p.room_id = cr.id
      WHERE p.author_pseudo = ?
        AND p.expires_at IS NOT NULL
        AND p.is_expired = FALSE
        AND p.deleted_at IS NULL
        AND p.expires_at <= DATE_ADD(NOW(), INTERVAL ? DAY)
      ORDER BY p.expires_at ASC
    `;

    const [rows] = await db.execute(query, [userPseudo, days]);

    // Group by urgency
    const grouped = {
      expired: [],
      today: [],
      tomorrow: [],
      thisWeek: []
    };

    rows.forEach(post => {
      const daysLeft = post.days_until_expiration;
      if (daysLeft < 0) {
        grouped.expired.push(post);
      } else if (daysLeft === 0) {
        grouped.today.push(post);
      } else if (daysLeft === 1) {
        grouped.tomorrow.push(post);
      } else if (daysLeft <= 7) {
        grouped.thisWeek.push(post);
      }
    });

    return grouped;
  }

  /**
   * Bulk extend expiration for multiple posts
   * @param {Array} postIds - Array of post IDs
   * @param {number} additionalDays - Days to add
   * @returns {Promise<number>} Number of posts updated
   */
  static async bulkExtendExpiration(postIds, additionalDays) {
    if (postIds.length === 0) {
      return 0;
    }

    const placeholders = postIds.map(() => '?').join(',');
    const query = `
      UPDATE room_posts
      SET expires_at = DATE_ADD(expires_at, INTERVAL ? DAY),
          lifetime_days = lifetime_days + ?,
          bulk_extended = TRUE
      WHERE id IN (${placeholders})
        AND deleted_at IS NULL
    `;

    const params = [additionalDays, additionalDays, ...postIds];
    const [result] = await db.execute(query, params);

    return result.affectedRows;
  }

  /**
   * Delete post
   * @param {number} postId - Post ID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(postId) {
    const query = `
      UPDATE room_posts
      SET deleted_at = NOW()
      WHERE id = ?
    `;

    const [result] = await db.execute(query, [postId]);
    return result.affectedRows > 0;
  }
}

module.exports = Post;