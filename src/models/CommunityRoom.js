/**
 * CommunityRoom Model
 * Handles community moderation room operations
 */

const db = require('../utils/database');
const logger = require('../utils/logger');

class CommunityRoom {
  /**
   * Create a new room
   * @param {Object} roomData - Room data
   * @returns {Promise<Object>} Created room data
   */
  static async create(roomData) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const { name, createdBy, initialMembers = [] } = roomData;

      // Validate minimum members (6 including creator)
      const totalMembers = initialMembers.length + 1;
      if (totalMembers < 6) {
        throw new Error('A minimum of 6 people is required to create a room');
      }

      // Create the room
      const roomQuery = `
        INSERT INTO community_rooms (name, created_by, member_count, status)
        VALUES (?, ?, ?, ?)
      `;

      const status = totalMembers >= 10 ? 'active' : 'inactive';
      const [roomResult] = await connection.execute(roomQuery, [
        name,
        createdBy,
        totalMembers,
        status
      ]);

      const roomId = roomResult.insertId;

      // Add creator as first member
      const memberQuery = `
        INSERT INTO room_members (room_id, user_pseudo, joined_at, is_founder, is_moderator)
        VALUES (?, ?, NOW(), TRUE, TRUE)
      `;
      await connection.execute(memberQuery, [roomId, createdBy]);

      // Add other initial members
      for (const memberPseudo of initialMembers) {
        const addMemberQuery = `
          INSERT INTO room_members (room_id, user_pseudo, joined_at)
          VALUES (?, ?, NOW())
        `;
        await connection.execute(addMemberQuery, [roomId, memberPseudo]);
      }

      // Update user's room count if needed
      const updateUserQuery = `
        UPDATE users
        SET room_count = room_count + 1
        WHERE pseudo IN (?)
      `;
      await connection.execute(updateUserQuery, [[createdBy, ...initialMembers].join(',')]);

      await connection.commit();

      return {
        id: roomId,
        name,
        createdBy,
        memberCount: totalMembers,
        status
      };
    } catch (error) {
      await connection.rollback();
      logger.error('Error creating room', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Get room by ID
   * @param {number} id - Room ID
   * @returns {Promise<Object|null>} Room data or null
   */
  static async findById(id) {
    const query = `
      SELECT id, name, created_by, member_count, status,
             activity_score, last_activity_check, is_locked,
             lock_reason, created_at, deleted_at
      FROM community_rooms
      WHERE id = ? AND deleted_at IS NULL
    `;

    const [rows] = await db.execute(query, [id]);
    return rows[0] || null;
  }

  /**
   * Get room by name
   * @param {string} name - Room name
   * @returns {Promise<Object|null>} Room data or null
   */
  static async findByName(name) {
    const query = `
      SELECT id, name, created_by, member_count, status,
             activity_score, last_activity_check, is_locked,
             lock_reason, created_at, deleted_at
      FROM community_rooms
      WHERE name = ? AND deleted_at IS NULL
    `;

    const [rows] = await db.execute(query, [name]);
    return rows[0] || null;
  }

  /**
   * Check if room exists
   * @param {string} name - Room name
   * @returns {Promise<boolean>} Existence status
   */
  static async exists(name) {
    const query = `
      SELECT COUNT(*) as count
      FROM community_rooms
      WHERE name = ? AND deleted_at IS NULL
    `;

    const [rows] = await db.execute(query, [name]);
    return rows[0].count > 0;
  }

  /**
   * Add member to room
   * @param {number} roomId - Room ID
   * @param {string} userPseudo - User pseudo
   * @returns {Promise<Object>} Result
   */
  static async addMember(roomId, userPseudo) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Check if already member
      const checkQuery = `
        SELECT id FROM room_members
        WHERE room_id = ? AND user_pseudo = ?
      `;
      const [existing] = await connection.execute(checkQuery, [roomId, userPseudo]);

      if (existing.length > 0) {
        await connection.rollback();
        return { success: false, error: 'User is already a member' };
      }

      // Add member
      const insertQuery = `
        INSERT INTO room_members (room_id, user_pseudo, joined_at)
        VALUES (?, ?, NOW())
      `;
      await connection.execute(insertQuery, [roomId, userPseudo]);

      // Update room member count and check for activation
      const updateQuery = `
        UPDATE community_rooms
        SET member_count = member_count + 1,
            status = CASE
              WHEN member_count + 1 >= 10 THEN 'active'
              ELSE status
            END
        WHERE id = ?
      `;
      await connection.execute(updateQuery, [roomId]);

      // Get updated room info
      const [roomInfo] = await connection.execute(
        'SELECT member_count, status FROM community_rooms WHERE id = ?',
        [roomId]
      );

      await connection.commit();

      return {
        success: true,
        memberCount: roomInfo[0].member_count,
        status: roomInfo[0].status
      };
    } catch (error) {
      await connection.rollback();
      logger.error('Error adding member', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Remove member from room
   * @param {number} roomId - Room ID
   * @param {string} userPseudo - User pseudo
   * @returns {Promise<Object>} Result
   */
  static async removeMember(roomId, userPseudo) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Remove member
      const deleteQuery = `
        DELETE FROM room_members
        WHERE room_id = ? AND user_pseudo = ?
      `;
      const [result] = await connection.execute(deleteQuery, [roomId, userPseudo]);

      if (result.affectedRows === 0) {
        await connection.rollback();
        return { success: false, error: 'User is not a member' };
      }

      // Update room member count
      const updateQuery = `
        UPDATE community_rooms
        SET member_count = member_count - 1
        WHERE id = ?
      `;
      await connection.execute(updateQuery, [roomId]);

      // Check if room should be deleted (< 10 members)
      const [roomInfo] = await connection.execute(
        'SELECT member_count FROM community_rooms WHERE id = ?',
        [roomId]
      );

      if (roomInfo[0].member_count < 10) {
        // Mark room for deletion
        await this._deleteRoom(connection, roomId);
        await connection.commit();
        return {
          success: true,
          roomDeleted: true,
          memberCount: roomInfo[0].member_count
        };
      }

      await connection.commit();

      return {
        success: true,
        roomDeleted: false,
        memberCount: roomInfo[0].member_count
      };
    } catch (error) {
      await connection.rollback();
      logger.error('Error removing member', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Get room members
   * @param {number} roomId - Room ID
   * @returns {Promise<Array>} Array of members
   */
  static async getMembers(roomId) {
    const query = `
      SELECT rm.user_pseudo, rm.joined_at, rm.is_founder, rm.is_moderator,
             rm.last_post_at, rm.last_view_at, rm.post_count,
             u.is_banned, u.ban_until
      FROM room_members rm
      JOIN users u ON rm.user_pseudo = u.pseudo
      WHERE rm.room_id = ?
      ORDER BY rm.joined_at ASC
    `;

    const [rows] = await db.execute(query, [roomId]);
    return rows;
  }

  /**
   * Get member count for a room
   * @param {string} roomName - Room name
   * @returns {Promise<number>} Member count
   */
  static async getMemberCount(roomName) {
    const query = `
      SELECT member_count
      FROM community_rooms
      WHERE name = ? AND deleted_at IS NULL
    `;

    const [rows] = await db.execute(query, [roomName]);
    return rows[0] ? rows[0].member_count : 0;
  }

  /**
   * Update room status
   * @param {number} roomId - Room ID
   * @param {string} status - New status
   * @returns {Promise<boolean>} Success status
   */
  static async updateStatus(roomId, status) {
    const query = `
      UPDATE community_rooms
      SET status = ?
      WHERE id = ? AND deleted_at IS NULL
    `;

    const [result] = await db.execute(query, [status, roomId]);
    return result.affectedRows > 0;
  }

  /**
   * Lock room due to low activity
   * @param {number} roomId - Room ID
   * @param {string} reason - Lock reason
   * @returns {Promise<boolean>} Success status
   */
  static async lockRoom(roomId, reason = 'Low activity') {
    const query = `
      UPDATE community_rooms
      SET is_locked = TRUE,
          lock_reason = ?,
          status = 'locked'
      WHERE id = ? AND deleted_at IS NULL
    `;

    const [result] = await db.execute(query, [reason, roomId]);
    return result.affectedRows > 0;
  }

  /**
   * Unlock room
   * @param {number} roomId - Room ID
   * @returns {Promise<boolean>} Success status
   */
  static async unlockRoom(roomId) {
    const query = `
      UPDATE community_rooms
      SET is_locked = FALSE,
          lock_reason = NULL,
          status = 'active'
      WHERE id = ? AND deleted_at IS NULL
    `;

    const [result] = await db.execute(query, [roomId]);
    return result.affectedRows > 0;
  }

  /**
   * Check room activity (posters in last 72 hours)
   * @param {number} roomId - Room ID
   * @returns {Promise<Object>} Activity data
   */
  static async checkActivity(roomId) {
    const query = `
      SELECT COUNT(DISTINCT author_pseudo) as unique_posters
      FROM room_posts
      WHERE room_id = ?
        AND created_at >= DATE_SUB(NOW(), INTERVAL 72 HOUR)
        AND deleted_at IS NULL
    `;

    const [rows] = await db.execute(query, [roomId]);
    const uniquePosters = rows[0].unique_posters;

    // Update activity score
    const updateQuery = `
      UPDATE community_rooms
      SET activity_score = ?,
          last_activity_check = NOW()
      WHERE id = ?
    `;
    await db.execute(updateQuery, [uniquePosters, roomId]);

    return {
      uniquePosters,
      meetsRequirement: uniquePosters >= 4
    };
  }

  /**
   * Get active rooms
   * @returns {Promise<Array>} Array of active rooms
   */
  static async getActiveRooms() {
    const query = `
      SELECT id, name, created_by, member_count, status,
             activity_score, created_at
      FROM community_rooms
      WHERE status = 'active'
        AND deleted_at IS NULL
        AND is_locked = FALSE
      ORDER BY member_count DESC, created_at DESC
    `;

    const [rows] = await db.execute(query);
    return rows;
  }

  /**
   * Get rooms for user
   * @param {string} userPseudo - User pseudo
   * @returns {Promise<Array>} Array of rooms
   */
  static async getUserRooms(userPseudo) {
    const query = `
      SELECT cr.id, cr.name, cr.member_count, cr.status,
             cr.is_locked, rm.joined_at, rm.is_founder,
             rm.is_moderator, rm.last_post_at, rm.last_view_at
      FROM community_rooms cr
      JOIN room_members rm ON cr.id = rm.room_id
      WHERE rm.user_pseudo = ?
        AND cr.deleted_at IS NULL
      ORDER BY rm.joined_at DESC
    `;

    const [rows] = await db.execute(query, [userPseudo]);
    return rows;
  }

  /**
   * Delete room (internal helper)
   * @param {Object} connection - Database connection
   * @param {number} roomId - Room ID
   * @private
   */
  static async _deleteRoom(connection, roomId) {
    // Soft delete the room
    const deleteQuery = `
      UPDATE community_rooms
      SET deleted_at = NOW(),
          status = 'deleted'
      WHERE id = ?
    `;
    await connection.execute(deleteQuery, [roomId]);

    // Delete all posts
    const deletePostsQuery = `
      UPDATE room_posts
      SET deleted_at = NOW()
      WHERE room_id = ?
    `;
    await connection.execute(deletePostsQuery, [roomId]);

    // Remove all members
    const deleteMembersQuery = `
      DELETE FROM room_members
      WHERE room_id = ?
    `;
    await connection.execute(deleteMembersQuery, [roomId]);

    // Log deletion
    logger.info(`Room ${roomId} deleted due to insufficient membership`);
  }

  /**
   * Check if user is member of room
   * @param {number} roomId - Room ID
   * @param {string} userPseudo - User pseudo
   * @returns {Promise<boolean>} Membership status
   */
  static async isMember(roomId, userPseudo) {
    const query = `
      SELECT COUNT(*) as count
      FROM room_members
      WHERE room_id = ? AND user_pseudo = ?
    `;

    const [rows] = await db.execute(query, [roomId, userPseudo]);
    return rows[0].count > 0;
  }

  /**
   * Update member's last view time
   * @param {number} roomId - Room ID
   * @param {string} userPseudo - User pseudo
   * @returns {Promise<boolean>} Success status
   */
  static async updateLastView(roomId, userPseudo) {
    const query = `
      UPDATE room_members
      SET last_view_at = NOW()
      WHERE room_id = ? AND user_pseudo = ?
    `;

    const [result] = await db.execute(query, [roomId, userPseudo]);
    return result.affectedRows > 0;
  }

  /**
   * Update member's last post time
   * @param {number} roomId - Room ID
   * @param {string} userPseudo - User pseudo
   * @returns {Promise<boolean>} Success status
   */
  static async updateLastPost(roomId, userPseudo) {
    const query = `
      UPDATE room_members
      SET last_post_at = NOW(),
          post_count = post_count + 1
      WHERE room_id = ? AND user_pseudo = ?
    `;

    const [result] = await db.execute(query, [roomId, userPseudo]);
    return result.affectedRows > 0;
  }
}

module.exports = CommunityRoom;