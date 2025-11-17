/**
 * GDPR Service
 * Handles GDPR-compliant data export and account deletion
 * Right to access (Article 15) and Right to erasure (Article 17)
 */

const User = require('../models/User');
const Thread = require('../models/Thread');
const Reply = require('../models/Reply');
const AuthService = require('./authService');
const db = require('../utils/database');
const redis = require('../utils/redis');
const logger = require('../utils/logger');

class GdprService {
  /**
   * Export all user data in GDPR-compliant format
   * @param {string} pseudo - User's pseudo
   * @returns {Promise<Object>} Complete user data export
   */
  static async exportUserData(pseudo) {
    try {
      // Get user account information
      const user = await User.findByPseudo(pseudo);
      if (!user) {
        throw new Error('User not found');
      }

      // Get user statistics
      const stats = await User.getStats(pseudo);

      // Get all threads created by user (with full body content)
      const threads = await Thread.findByAuthor(pseudo, {
        limit: 10000,
        offset: 0,
        includeBody: true
      });

      // Get all replies created by user (with full body content)
      const replies = await Reply.findByAuthor(pseudo, {
        limit: 10000,
        offset: 0,
        includeBody: true
      });

      // Get report history (reports made by this user)
      const [reports] = await db.execute(
        `SELECT
          content_type,
          content_id,
          reason,
          description,
          created_at,
          status
        FROM reports
        WHERE reporter_pseudo = ?
        ORDER BY created_at DESC`,
        [pseudo]
      );

      // Prepare export data (exclude sensitive fields like PIN hash/salt)
      const exportData = {
        metadata: {
          exportDate: new Date().toISOString(),
          dataController: 'Le Syndicat des Tox',
          legalBasis: 'GDPR Article 15 - Right to access',
          format: 'JSON',
          version: '1.0'
        },
        account: {
          pseudo: user.pseudo,
          createdAt: user.created_at,
          lastLogin: user.last_login,
          preferredLanguage: user.preferred_language,
          isModerator: user.is_moderator,
          isBanned: user.is_banned,
          banReason: user.ban_reason || null,
          banUntil: user.ban_until || null
        },
        statistics: {
          threadCount: stats?.post_count || 0,
          replyCount: stats?.reply_count || 0,
          accountAge: stats?.created_at ? this._calculateAccountAge(stats.created_at) : null
        },
        content: {
          threads: threads.map((thread) => ({
            id: thread.id,
            title: thread.title,
            body: thread.body,
            createdAt: thread.created_at,
            lastActivity: thread.last_activity,
            replyCount: thread.reply_count,
            viewCount: thread.view_count,
            language: thread.language,
            isPinned: thread.is_pinned,
            isLocked: thread.is_locked,
            isDeleted: thread.is_deleted,
            isHidden: thread.is_hidden
          })),
          replies: replies.map((reply) => ({
            id: reply.id,
            threadId: reply.thread_id,
            threadTitle: reply.thread_title,
            body: reply.body,
            createdAt: reply.created_at,
            editedAt: reply.edited_at,
            isDeleted: reply.is_deleted,
            isHidden: reply.is_hidden
          }))
        },
        moderation: {
          reportsMade: reports.map((report) => ({
            contentType: report.content_type,
            contentId: report.content_id,
            reason: report.reason,
            description: report.description,
            createdAt: report.created_at,
            status: report.status
          }))
        },
        gdprNotice: {
          rightsInfo: 'You have the right to rectification, erasure, restriction of processing, and data portability under GDPR.',
          contactInfo: 'For any questions about your data, please contact the platform administrators.',
          retentionPolicy: 'Account data is retained until you request deletion. Content may be anonymized instead of deleted to preserve community discussions.'
        }
      };

      logger.audit('User data exported', pseudo);

      return exportData;
    } catch (error) {
      logger.error('Error exporting user data:', error);
      throw error;
    }
  }

  /**
   * Delete user account permanently (GDPR Right to Erasure)
   * @param {string} pseudo - User's pseudo
   * @param {string} pin - User's PIN for verification
   * @param {Object} options - Deletion options
   * @param {string} options.contentStrategy - 'delete' or 'anonymize' (default: 'anonymize')
   * @returns {Promise<Object>} Deletion result
   */
  static async deleteUserAccount(pseudo, pin, options = {}) {
    const { contentStrategy = 'anonymize' } = options;

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Verify user exists
      const user = await User.findByPseudo(pseudo);
      if (!user) {
        throw new Error('User not found');
      }

      // Verify PIN
      const validPin = await AuthService.verifyPin(pin, user.pin_hash);
      if (!validPin) {
        logger.security('Failed account deletion attempt - invalid PIN', { pseudo });
        throw new Error('Invalid PIN');
      }

      // Strategy 1: Anonymize content (preserve discussions, remove attribution)
      if (contentStrategy === 'anonymize') {
        // Update threads to show as [deleted user]
        await connection.execute(
          `UPDATE threads
           SET author_pseudo = '[deleted]'
           WHERE author_pseudo = ?`,
          [pseudo]
        );

        // Update replies to show as [deleted user]
        await connection.execute(
          `UPDATE replies
           SET author_pseudo = '[deleted]'
           WHERE author_pseudo = ?`,
          [pseudo]
        );

        // Update reports to show as [deleted user]
        await connection.execute(
          `UPDATE reports
           SET reporter_pseudo = '[deleted]'
           WHERE reporter_pseudo = ?`,
          [pseudo]
        );

        // Update moderation logs
        await connection.execute(
          `UPDATE moderation_log
           SET moderator_pseudo = '[deleted]'
           WHERE moderator_pseudo = ?`,
          [pseudo]
        );
      }
      // Strategy 2: Delete all content (complete removal)
      else if (contentStrategy === 'delete') {
        // Soft delete all threads
        await connection.execute(
          `UPDATE threads
           SET is_deleted = TRUE,
               deleted_at = NOW(),
               deleted_reason = 'Account deletion'
           WHERE author_pseudo = ? AND is_deleted = FALSE`,
          [pseudo]
        );

        // Soft delete all replies
        await connection.execute(
          `UPDATE replies
           SET is_deleted = TRUE,
               deleted_at = NOW(),
               deleted_reason = 'Account deletion'
           WHERE author_pseudo = ? AND is_deleted = FALSE`,
          [pseudo]
        );

        // Delete reports made by user
        await connection.execute(
          'DELETE FROM reports WHERE reporter_pseudo = ?',
          [pseudo]
        );
      }

      // Delete login attempts history
      await connection.execute(
        'DELETE FROM login_attempts WHERE pseudo = ?',
        [pseudo]
      );

      // Delete the user account
      await connection.execute(
        'DELETE FROM users WHERE pseudo = ?',
        [pseudo]
      );

      await connection.commit();

      // Clear all sessions for this user from Redis
      await this._clearUserSessions(pseudo);

      logger.audit('User account deleted', pseudo, {
        contentStrategy,
        deletedBy: pseudo
      });

      return {
        success: true,
        pseudo,
        contentStrategy,
        message: 'Account successfully deleted'
      };
    } catch (error) {
      await connection.rollback();
      logger.error('Error deleting user account:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Clear all sessions for a user from Redis
   * @param {string} pseudo - User's pseudo
   * @private
   */
  static async _clearUserSessions(pseudo) {
    try {
      // Get all session keys
      const sessionKeys = await redis.keys('sess:*');

      // Check each session for this user's pseudo
      for (const key of sessionKeys) {
        const sessionData = await redis.get(key);
        if (sessionData) {
          try {
            const session = JSON.parse(sessionData);
            if (session.pseudo === pseudo) {
              await redis.del(key);
              logger.info('Cleared session for deleted user', { sessionKey: key });
            }
          } catch (parseError) {
            // Skip invalid session data
            logger.error('Error parsing session data:', parseError);
          }
        }
      }

      // Also clear any rate limiting data for this pseudo
      const rateLimitKeys = await redis.keys(`ratelimit:*:${pseudo}`);
      if (rateLimitKeys.length > 0) {
        await redis.del(...rateLimitKeys);
      }

      logger.info('Cleared all sessions and rate limit data', { pseudo });
    } catch (error) {
      logger.error('Error clearing user sessions from Redis:', error);
      // Don't throw - this is a cleanup operation that shouldn't fail the deletion
    }
  }

  /**
   * Calculate account age in days
   * @param {Date} createdAt - Account creation date
   * @returns {number} Account age in days
   * @private
   */
  static _calculateAccountAge(createdAt) {
    const created = new Date(createdAt);
    const now = new Date();
    const diffTime = Math.abs(now - created);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  /**
   * Create a placeholder '[deleted]' user if it doesn't exist
   * This user is used for anonymized content
   * Should be called during database initialization
   * @returns {Promise<void>}
   */
  static async ensureDeletedUserExists() {
    try {
      const exists = await User.exists('[deleted]');
      if (!exists) {
        // Create a placeholder user with a random PIN (no one can log in)
        const randomPin = Math.floor(1000 + Math.random() * 9000).toString();
        const { hash, salt } = await AuthService.hashPin(randomPin);

        await db.execute(
          `INSERT INTO users (pseudo, pin_hash, pin_salt, preferred_language, is_moderator, is_banned)
           VALUES (?, ?, ?, 'fr', FALSE, TRUE)`,
          ['[deleted]', hash, salt]
        );

        logger.info('Created [deleted] placeholder user');
      }
    } catch (error) {
      logger.error('Error ensuring [deleted] user exists:', error);
      throw error;
    }
  }

  /**
   * Validate deletion request
   * Checks if user can request deletion and provides any warnings
   * @param {string} pseudo - User's pseudo
   * @returns {Promise<Object>} Validation result with warnings
   */
  static async validateDeletionRequest(pseudo) {
    try {
      const user = await User.findByPseudo(pseudo);
      if (!user) {
        return { valid: false, error: 'User not found' };
      }

      const warnings = [];

      // Check if user is a moderator
      if (user.is_moderator) {
        warnings.push('You are a moderator. Your moderation history will be preserved as [deleted].');
      }

      // Get content counts
      const stats = await User.getStats(pseudo);
      if (stats.post_count > 0) {
        warnings.push(`You have ${stats.post_count} thread(s) that will be affected.`);
      }
      if (stats.reply_count > 0) {
        warnings.push(`You have ${stats.reply_count} reply/replies that will be affected.`);
      }

      // Check for recent reports
      const [recentReports] = await db.execute(
        `SELECT COUNT(*) as count
         FROM reports
         WHERE reporter_pseudo = ?
           AND created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)`,
        [pseudo]
      );

      if (recentReports[0].count > 0) {
        warnings.push(`You have ${recentReports[0].count} pending report(s) from the last 7 days.`);
      }

      return {
        valid: true,
        warnings,
        contentStats: {
          threads: stats.post_count,
          replies: stats.reply_count
        }
      };
    } catch (error) {
      logger.error('Error validating deletion request:', error);
      throw error;
    }
  }
}

module.exports = GdprService;
