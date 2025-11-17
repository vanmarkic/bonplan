/**
 * User Model
 * Minimal user data model for anonymity
 */

const db = require('../utils/database');

class User {
  /**
   * Create a new user
   * @param {string} pseudo - Unique username
   * @param {string} pinHash - Argon2id hashed PIN
   * @param {string} pinSalt - Random salt for PIN
   * @param {string} preferredLanguage - User's preferred language
   */
  static async create(pseudo, pinHash, pinSalt, preferredLanguage = 'fr') {
    const query = `
      INSERT INTO users (pseudo, pin_hash, pin_salt, preferred_language)
      VALUES (?, ?, ?, ?)
    `;

    const [result] = await db.execute(query, [pseudo, pinHash, pinSalt, preferredLanguage]);
    return result;
  }

  /**
   * Find user by pseudo
   * @param {string} pseudo
   */
  static async findByPseudo(pseudo) {
    const query = `
      SELECT pseudo, pin_hash, pin_salt, created_at, last_login,
             failed_attempts, locked_until, is_moderator, is_banned,
             ban_until, preferred_language
      FROM users
      WHERE pseudo = ?
    `;

    const [rows] = await db.execute(query, [pseudo]);
    return rows[0] || null;
  }

  /**
   * Check if pseudo exists
   * @param {string} pseudo
   */
  static async exists(pseudo) {
    const query = 'SELECT COUNT(*) as count FROM users WHERE pseudo = ?';
    const [rows] = await db.execute(query, [pseudo]);
    return rows[0].count > 0;
  }

  /**
   * Update last login timestamp
   * @param {string} pseudo
   */
  static async updateLastLogin(pseudo) {
    const query = 'UPDATE users SET last_login = NOW() WHERE pseudo = ?';
    await db.execute(query, [pseudo]);
  }

  /**
   * Increment failed login attempts
   * @param {string} pseudo
   */
  static async incrementFailedAttempts(pseudo) {
    const query = `
      UPDATE users
      SET failed_attempts = failed_attempts + 1
      WHERE pseudo = ?
    `;
    await db.execute(query, [pseudo]);
  }

  /**
   * Reset failed login attempts
   * @param {string} pseudo
   */
  static async resetFailedAttempts(pseudo) {
    const query = `
      UPDATE users
      SET failed_attempts = 0, locked_until = NULL
      WHERE pseudo = ?
    `;
    await db.execute(query, [pseudo]);
  }

  /**
   * Lock account for specified duration
   * @param {string} pseudo
   * @param {number} minutes - Lockout duration in minutes
   */
  static async lockAccount(pseudo, minutes) {
    const query = `
      UPDATE users
      SET locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE)
      WHERE pseudo = ?
    `;
    await db.execute(query, [minutes, pseudo]);
  }

  /**
   * Check if account is currently locked
   * @param {string} pseudo
   */
  static async isLocked(pseudo) {
    const query = `
      SELECT locked_until
      FROM users
      WHERE pseudo = ? AND locked_until > NOW()
    `;
    const [rows] = await db.execute(query, [pseudo]);
    return rows.length > 0 ? rows[0].locked_until : null;
  }

  /**
   * Get user stats
   * @param {string} pseudo
   */
  static async getStats(pseudo) {
    const query = `
      SELECT post_count, reply_count, created_at
      FROM users
      WHERE pseudo = ?
    `;
    const [rows] = await db.execute(query, [pseudo]);
    return rows[0] || null;
  }

  /**
   * Delete user and all their content (GDPR right to deletion)
   * @param {string} pseudo
   */
  static async deleteAccount(pseudo) {
    // This will cascade delete threads and replies due to foreign keys
    const query = 'DELETE FROM users WHERE pseudo = ?';
    await db.execute(query, [pseudo]);
  }
}

module.exports = User;
