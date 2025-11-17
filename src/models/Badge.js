/**
 * Badge Model
 * Handles badge and user_badges table operations
 */

const db = require('../utils/database');
const logger = require('../utils/logger');

class Badge {
  /**
   * Get badge by ID
   * @param {number} id - Badge ID
   * @returns {Promise<Object|null>} Badge data or null
   */
  static async getBadgeById(id) {
    const query = `
      SELECT id, name, display_name, description, type,
             criteria_type, criteria_value, icon, color,
             priority, is_visible, created_at
      FROM badges
      WHERE id = ?
    `;

    const [rows] = await db.execute(query, [id]);
    return rows[0] || null;
  }

  /**
   * Get badge by name
   * @param {string} name - Badge name
   * @returns {Promise<Object|null>} Badge data or null
   */
  static async getBadgeByName(name) {
    const query = `
      SELECT id, name, display_name, description, type,
             criteria_type, criteria_value, icon, color,
             priority, is_visible, created_at
      FROM badges
      WHERE name = ?
    `;

    const [rows] = await db.execute(query, [name]);
    return rows[0] || null;
  }

  /**
   * Get all badges, optionally filtered by type
   * @param {string} type - Badge type (milestone, achievement, moderation, special)
   * @returns {Promise<Array>} Array of badges
   */
  static async getAllBadges(type = null) {
    let query = `
      SELECT id, name, display_name, description, type,
             criteria_type, criteria_value, icon, color,
             priority, is_visible, created_at
      FROM badges
      WHERE is_visible = TRUE
    `;

    const params = [];
    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    query += ' ORDER BY priority DESC, name ASC';

    const [rows] = await db.execute(query, params);
    return rows;
  }

  /**
   * Get user badges
   * @param {string} userPseudo - User's pseudo
   * @param {boolean} includeExpired - Include expired badges
   * @returns {Promise<Array>} Array of user badges
   */
  static async getUserBadges(userPseudo, includeExpired = false) {
    let query = `
      SELECT
        ub.id,
        ub.badge_id,
        b.name as badge_name,
        b.display_name,
        b.description,
        b.type,
        b.icon,
        b.color,
        b.priority,
        ub.awarded_at,
        ub.awarded_by,
        ub.award_reason,
        ub.expires_at,
        ub.is_expired,
        ub.is_displayed,
        ub.display_order
      FROM user_badges ub
      JOIN badges b ON ub.badge_id = b.id
      WHERE ub.user_pseudo = ?
    `;

    if (!includeExpired) {
      query += ' AND ub.is_expired = FALSE';
    }

    query += ' ORDER BY ub.display_order ASC, b.priority DESC, ub.awarded_at DESC';

    const [rows] = await db.execute(query, [userPseudo]);
    return rows;
  }

  /**
   * Award badge to user
   * @param {string} userPseudo - User's pseudo
   * @param {string} badgeName - Badge name
   * @param {string|null} awardedBy - Awarder's pseudo (null for system)
   * @param {string|null} reason - Award reason
   * @param {number|null} expiresDays - Days until expiration (null for permanent)
   * @returns {Promise<Object>} Award result
   */
  static async awardBadge(userPseudo, badgeName, awardedBy = null, reason = null, expiresDays = null) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Get badge information
      const badgeQuery = 'SELECT id, name, display_name FROM badges WHERE name = ?';
      const [badges] = await connection.execute(badgeQuery, [badgeName]);

      if (badges.length === 0) {
        await connection.rollback();
        return { success: false, error: 'Badge not found' };
      }

      const badge = badges[0];

      // Check if user already has this badge (non-expired)
      const checkQuery = `
        SELECT id, expires_at
        FROM user_badges
        WHERE user_pseudo = ?
          AND badge_id = ?
          AND is_expired = FALSE
      `;
      const [existing] = await connection.execute(checkQuery, [userPseudo, badge.id]);

      if (existing.length > 0) {
        await connection.rollback();
        return { success: false, error: 'User already has this badge' };
      }

      // Calculate expiration date
      let expiresAt = null;
      if (expiresDays) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresDays);
      }

      // Award the badge
      const insertQuery = `
        INSERT INTO user_badges (
          user_pseudo, badge_id, awarded_by, award_reason, expires_at
        ) VALUES (?, ?, ?, ?, ?)
      `;

      const [result] = await connection.execute(insertQuery, [
        userPseudo,
        badge.id,
        awardedBy,
        reason,
        expiresAt
      ]);

      await connection.commit();

      logger.info(`Badge awarded: ${badgeName} to ${userPseudo}`);
      return {
        success: true,
        badgeId: badge.id,
        userBadgeId: result.insertId,
        badgeName: badge.display_name
      };

    } catch (error) {
      await connection.rollback();
      logger.error('Error awarding badge', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Revoke badge from user
   * @param {string} userPseudo - User's pseudo
   * @param {number} badgeId - Badge ID
   * @returns {Promise<boolean>} Success status
   */
  static async revokeBadge(userPseudo, badgeId) {
    const updateQuery = `
      UPDATE user_badges
      SET is_expired = TRUE,
          expires_at = NOW()
      WHERE user_pseudo = ?
        AND badge_id = ?
        AND is_expired = FALSE
    `;

    const [result] = await db.execute(updateQuery, [userPseudo, badgeId]);
    return result.affectedRows > 0;
  }

  /**
   * Check if user has specific badge
   * @param {string} userPseudo - User's pseudo
   * @param {string} badgeName - Badge name
   * @returns {Promise<boolean>} Has badge status
   */
  static async userHasBadge(userPseudo, badgeName) {
    const query = `
      SELECT COUNT(*) as count
      FROM user_badges ub
      JOIN badges b ON ub.badge_id = b.id
      WHERE ub.user_pseudo = ?
        AND b.name = ?
        AND ub.is_expired = FALSE
    `;

    const [rows] = await db.execute(query, [userPseudo, badgeName]);
    return rows[0].count > 0;
  }
}

module.exports = Badge;
