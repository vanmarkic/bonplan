/**
 * Cucumber Hooks
 * Before/After hooks for test setup and cleanup
 */

const { Before, After, BeforeAll, AfterAll } = require('@cucumber/cucumber');
const db = require('../../src/utils/database');
const logger = require('../../src/utils/logger');
const fs = require('fs').promises;
const path = require('path');

// Test database configuration
const TEST_DB_NAME = process.env.TEST_DB_NAME || 'syndicat_tox_test';

/**
 * Setup test database before all tests
 */
BeforeAll(async function () {
  try {
    // Ensure we're using test database
    if (!process.env.DB_NAME || !process.env.DB_NAME.includes('test')) {
      process.env.DB_NAME = TEST_DB_NAME;
      logger.info(`Using test database: ${TEST_DB_NAME}`);
    }

    // Create test database tables if they don't exist
    await createTestTables();

    // Initialize badge types
    await initializeBadges();

    logger.info('Test database setup completed');
  } catch (error) {
    logger.error('Failed to setup test database:', error);
    throw error;
  }
});

/**
 * Cleanup after all tests
 */
AfterAll(async function () {
  try {
    // Close database connections
    await db.end();
    logger.info('Database connections closed');
  } catch (error) {
    logger.error('Error closing database connections:', error);
  }
});

/**
 * Before each scenario
 */
Before(async function () {
  // Clear test data before each scenario
  await cleanupTestData();

  // Reset any application state
  this.cleanup && await this.cleanup();

  // Initialize fresh world state
  this.notifications = [];
  this.formData = {};
  this.pendingMembers = [];
});

/**
 * After each scenario
 */
After(async function () {
  // Cleanup world state
  if (this.cleanup) {
    await this.cleanup();
  }

  // Clear any remaining test data
  await cleanupTestData();

  // Reset time if it was mocked
  if (this.clock) {
    this.clock.restore();
  }
});

/**
 * Tagged hooks for specific scenarios
 */

// Hook for scenarios that need admin privileges
Before({ tags: '@admin' }, async function () {
  // Create an admin user
  await this.createUser({
    username: 'admin',
    email: 'admin@test.com',
    verified: true
  });

  // Set admin privileges
  await db.execute(
    'UPDATE users SET is_moderator = TRUE WHERE pseudo = ?',
    ['admin']
  );

  // Login as admin
  await this.loginAs('admin');
});

// Hook for scenarios that need time manipulation
Before({ tags: '@time-dependent' }, function () {
  // Initialize time mocking
  this.setCurrentTime(new Date('2024-01-15T10:00:00Z'));
});

// Hook for scenarios that need pre-populated data
Before({ tags: '@with-data' }, async function () {
  // Create sample users
  const usernames = ['alice', 'bob', 'charlie', 'david', 'eve', 'frank'];
  for (const username of usernames) {
    await this.createUser({
      username,
      email: `${username}@test.com`,
      verified: true
    });
  }

  // Create a sample active room
  await this.createRoom({
    name: 'Sample Room',
    createdBy: 'alice',
    initialMembers: usernames.slice(1)
  });
});

/**
 * Create test database tables
 */
async function createTestTables() {
  const connection = await db.getConnection();
  try {
    // Users table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        pseudo VARCHAR(50) PRIMARY KEY,
        pin_hash VARCHAR(255) NOT NULL,
        pin_salt VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP NULL,
        failed_attempts INT DEFAULT 0,
        locked_until TIMESTAMP NULL,
        is_moderator BOOLEAN DEFAULT FALSE,
        is_banned BOOLEAN DEFAULT FALSE,
        ban_until TIMESTAMP NULL,
        preferred_language VARCHAR(5) DEFAULT 'en',
        post_count INT DEFAULT 0,
        reply_count INT DEFAULT 0,
        room_count INT DEFAULT 0,
        joined_date DATE DEFAULT (CURRENT_DATE)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Community rooms table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS community_rooms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        created_by VARCHAR(50) NOT NULL,
        member_count INT DEFAULT 0,
        status ENUM('inactive', 'active', 'locked', 'deleted') DEFAULT 'inactive',
        activity_score INT DEFAULT 0,
        last_activity_check TIMESTAMP NULL,
        is_locked BOOLEAN DEFAULT FALSE,
        lock_reason VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,
        default_post_lifetime INT DEFAULT 30,
        FOREIGN KEY (created_by) REFERENCES users(pseudo) ON DELETE CASCADE,
        INDEX idx_status (status),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Room members table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS room_members (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_id INT NOT NULL,
        user_pseudo VARCHAR(50) NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_founder BOOLEAN DEFAULT FALSE,
        is_moderator BOOLEAN DEFAULT FALSE,
        last_post_at TIMESTAMP NULL,
        last_view_at TIMESTAMP NULL,
        post_count INT DEFAULT 0,
        violation_count INT DEFAULT 0,
        on_vacation BOOLEAN DEFAULT FALSE,
        vacation_until DATE NULL,
        FOREIGN KEY (room_id) REFERENCES community_rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (user_pseudo) REFERENCES users(pseudo) ON DELETE CASCADE,
        UNIQUE KEY unique_room_member (room_id, user_pseudo),
        INDEX idx_last_post (last_post_at),
        INDEX idx_last_view (last_view_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Room posts table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS room_posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_id INT NOT NULL,
        author_pseudo VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL,
        lifetime_days INT DEFAULT 30,
        is_pinned BOOLEAN DEFAULT FALSE,
        is_expired BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP NULL,
        no_expire_reason VARCHAR(255),
        extension_reason VARCHAR(255),
        bulk_extended BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (room_id) REFERENCES community_rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (author_pseudo) REFERENCES users(pseudo) ON DELETE CASCADE,
        INDEX idx_expires_at (expires_at),
        INDEX idx_created_at (created_at),
        INDEX idx_room_author (room_id, author_pseudo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Post replies table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS post_replies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        post_id INT NOT NULL,
        author_pseudo VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES room_posts(id) ON DELETE CASCADE,
        FOREIGN KEY (author_pseudo) REFERENCES users(pseudo) ON DELETE CASCADE,
        INDEX idx_post_id (post_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Badges table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS badges (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        description TEXT,
        type ENUM('milestone', 'achievement', 'moderation', 'special') NOT NULL,
        criteria_type VARCHAR(50),
        criteria_value JSON,
        icon VARCHAR(100),
        color VARCHAR(7),
        priority INT DEFAULT 0,
        is_visible BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_type (type),
        INDEX idx_priority (priority)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // User badges table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS user_badges (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_pseudo VARCHAR(50) NOT NULL,
        badge_id INT NOT NULL,
        awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        awarded_by VARCHAR(50),
        award_reason TEXT,
        expires_at TIMESTAMP NULL,
        is_expired BOOLEAN DEFAULT FALSE,
        is_displayed BOOLEAN DEFAULT TRUE,
        display_order INT DEFAULT 0,
        FOREIGN KEY (user_pseudo) REFERENCES users(pseudo) ON DELETE CASCADE,
        FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE,
        FOREIGN KEY (awarded_by) REFERENCES users(pseudo) ON DELETE SET NULL,
        UNIQUE KEY unique_user_badge (user_pseudo, badge_id),
        INDEX idx_user_pseudo (user_pseudo),
        INDEX idx_awarded_at (awarded_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Activity logs table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_pseudo VARCHAR(50) NOT NULL,
        room_id INT,
        activity_type VARCHAR(50) NOT NULL,
        details JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_pseudo) REFERENCES users(pseudo) ON DELETE CASCADE,
        FOREIGN KEY (room_id) REFERENCES community_rooms(id) ON DELETE CASCADE,
        INDEX idx_user_activity (user_pseudo, activity_type),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Initialize badge types
 */
async function initializeBadges() {
  const badges = [
    {
      name: '1_month_clean',
      display_name: '1 Month Clean',
      description: 'Achieved 1 month of sobriety',
      type: 'milestone',
      criteria_type: 'days_clean',
      criteria_value: JSON.stringify({ days: 30 }),
      icon: '🏆',
      color: '#4CAF50',
      priority: 10
    },
    {
      name: '3_months_clean',
      display_name: '3 Months Clean',
      description: 'Achieved 3 months of sobriety',
      type: 'milestone',
      criteria_type: 'days_clean',
      criteria_value: JSON.stringify({ days: 90 }),
      icon: '🌟',
      color: '#2196F3',
      priority: 20
    },
    {
      name: 'active_helper',
      display_name: 'Active Helper',
      description: 'Recognized for outstanding community support',
      type: 'achievement',
      criteria_type: 'helping',
      criteria_value: JSON.stringify({ posts: 20, helpfulness: 75 }),
      icon: '🤝',
      color: '#FF9800',
      priority: 15
    },
    {
      name: 'room_founder',
      display_name: 'Room Founder',
      description: 'Founded a community room',
      type: 'achievement',
      criteria_type: 'room_creation',
      criteria_value: JSON.stringify({ rooms: 1 }),
      icon: '🏠',
      color: '#9C27B0',
      priority: 12
    },
    {
      name: 'community_pillar',
      display_name: 'Community Pillar',
      description: 'Exceptional contribution to the community',
      type: 'special',
      criteria_type: 'combo',
      criteria_value: JSON.stringify({ badges: ['3_months_clean', 'active_helper', 'room_founder'] }),
      icon: '👑',
      color: '#FFD700',
      priority: 100
    }
  ];

  const connection = await db.getConnection();
  try {
    for (const badge of badges) {
      await connection.execute(`
        INSERT IGNORE INTO badges (
          name, display_name, description, type,
          criteria_type, criteria_value, icon, color, priority
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        badge.name,
        badge.display_name,
        badge.description,
        badge.type,
        badge.criteria_type,
        badge.criteria_value,
        badge.icon,
        badge.color,
        badge.priority
      ]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Cleanup test data between scenarios
 */
async function cleanupTestData() {
  const connection = await db.getConnection();
  try {
    // Delete in reverse order of dependencies
    await connection.execute('DELETE FROM activity_logs');
    await connection.execute('DELETE FROM user_badges');
    await connection.execute('DELETE FROM post_replies');
    await connection.execute('DELETE FROM room_posts');
    await connection.execute('DELETE FROM room_members');
    await connection.execute('DELETE FROM community_rooms');
    await connection.execute('DELETE FROM users');

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    logger.error('Error cleaning test data:', error);
  } finally {
    connection.release();
  }
}

module.exports = {
  createTestTables,
  initializeBadges,
  cleanupTestData
};