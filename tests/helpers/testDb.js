/**
 * Test Database Helpers
 * Functions to setup and teardown test database
 */

const mysql = require('mysql2/promise');

let connection = null;

/**
 * Create test database connection
 */
async function connect() {
  if (connection) return connection;

  connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'test_user',
    password: process.env.DB_PASSWORD || 'test_password',
    multipleStatements: true
  });

  return connection;
}

/**
 * Create test database if it doesn't exist
 */
async function createTestDatabase() {
  const conn = await connect();

  await conn.query(`
    CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci
  `);

  await conn.query(`USE ${process.env.DB_NAME}`);
}

/**
 * Create test tables
 */
async function createTables() {
  const conn = await connect();

  // Users table
  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      pseudo VARCHAR(20) NOT NULL,
      pin_hash VARCHAR(128) NOT NULL,
      pin_salt VARCHAR(64) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP NULL,
      failed_attempts TINYINT UNSIGNED DEFAULT 0,
      locked_until TIMESTAMP NULL,
      post_count INT UNSIGNED DEFAULT 0,
      reply_count INT UNSIGNED DEFAULT 0,
      is_moderator BOOLEAN DEFAULT FALSE,
      is_banned BOOLEAN DEFAULT FALSE,
      ban_reason TEXT NULL,
      ban_until TIMESTAMP NULL,
      preferred_language ENUM('fr', 'nl', 'de', 'en') DEFAULT 'fr',
      PRIMARY KEY (pseudo),
      INDEX idx_created (created_at),
      INDEX idx_last_login (last_login),
      INDEX idx_locked (locked_until)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Threads table
  await conn.query(`
    CREATE TABLE IF NOT EXISTS threads (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      author_pseudo VARCHAR(20) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      edited_at TIMESTAMP NULL,
      reply_count INT UNSIGNED DEFAULT 0,
      view_count INT UNSIGNED DEFAULT 0,
      is_pinned BOOLEAN DEFAULT FALSE,
      is_locked BOOLEAN DEFAULT FALSE,
      is_deleted BOOLEAN DEFAULT FALSE,
      deleted_at TIMESTAMP NULL,
      deleted_reason TEXT NULL,
      report_count INT UNSIGNED DEFAULT 0,
      is_hidden BOOLEAN DEFAULT FALSE,
      language ENUM('fr', 'nl', 'de', 'en') DEFAULT 'fr',
      INDEX idx_author (author_pseudo),
      INDEX idx_last_activity (last_activity),
      INDEX idx_created (created_at),
      INDEX idx_pinned (is_pinned),
      INDEX idx_deleted (is_deleted),
      INDEX idx_hidden (is_hidden),
      INDEX idx_language (language),
      FULLTEXT ft_title_body (title, body),
      FOREIGN KEY (author_pseudo) REFERENCES users(pseudo) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Replies table
  await conn.query(`
    CREATE TABLE IF NOT EXISTS replies (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      thread_id INT UNSIGNED NOT NULL,
      body TEXT NOT NULL,
      author_pseudo VARCHAR(20) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      edited_at TIMESTAMP NULL,
      is_deleted BOOLEAN DEFAULT FALSE,
      deleted_at TIMESTAMP NULL,
      deleted_reason TEXT NULL,
      report_count INT UNSIGNED DEFAULT 0,
      is_hidden BOOLEAN DEFAULT FALSE,
      INDEX idx_thread (thread_id),
      INDEX idx_author (author_pseudo),
      INDEX idx_created (created_at),
      INDEX idx_deleted (is_deleted),
      INDEX idx_hidden (is_hidden),
      FULLTEXT ft_body (body),
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
      FOREIGN KEY (author_pseudo) REFERENCES users(pseudo) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Thread reports table
  await conn.query(`
    CREATE TABLE IF NOT EXISTS thread_reports (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      thread_id INT UNSIGNED NOT NULL,
      reporter_pseudo VARCHAR(20) NOT NULL,
      reason TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_thread (thread_id),
      INDEX idx_reporter (reporter_pseudo),
      UNIQUE KEY uk_thread_reporter (thread_id, reporter_pseudo),
      FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
      FOREIGN KEY (reporter_pseudo) REFERENCES users(pseudo) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Reply reports table
  await conn.query(`
    CREATE TABLE IF NOT EXISTS reply_reports (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      reply_id INT UNSIGNED NOT NULL,
      reporter_pseudo VARCHAR(20) NOT NULL,
      reason TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_reply (reply_id),
      INDEX idx_reporter (reporter_pseudo),
      UNIQUE KEY uk_reply_reporter (reply_id, reporter_pseudo),
      FOREIGN KEY (reply_id) REFERENCES replies(id) ON DELETE CASCADE,
      FOREIGN KEY (reporter_pseudo) REFERENCES users(pseudo) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

/**
 * Clean all test data
 */
async function cleanDatabase() {
  const conn = await connect();
  await conn.query(`USE ${process.env.DB_NAME}`);

  // Clean in order to respect foreign key constraints
  await conn.query('DELETE FROM reply_reports');
  await conn.query('DELETE FROM thread_reports');
  await conn.query('DELETE FROM replies');
  await conn.query('DELETE FROM threads');
  await conn.query('DELETE FROM users');
}

/**
 * Drop test database
 */
async function dropTestDatabase() {
  const conn = await connect();
  await conn.query(`DROP DATABASE IF EXISTS ${process.env.DB_NAME}`);
}

/**
 * Close connection
 */
async function disconnect() {
  if (connection) {
    await connection.end();
    connection = null;
  }
}

module.exports = {
  connect,
  createTestDatabase,
  createTables,
  cleanDatabase,
  dropTestDatabase,
  disconnect
};
