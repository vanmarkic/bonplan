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
}

/**
 * Clean all test data
 */
async function cleanDatabase() {
  const conn = await connect();
  await conn.query(`USE ${process.env.DB_NAME}`);
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
