/**
 * MariaDB Database Connection Pool
 * Uses connection pooling for better performance
 */

const mysql = require('mysql2/promise');
const logger = require('./logger');

// Create connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  database: process.env.DB_NAME || 'syndicat_tox',
  user: process.env.DB_USER || 'syndicat_app',
  password: process.env.DB_PASSWORD || '',
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'Z',
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  // Security: Prevent multiple statements (SQL injection protection)
  multipleStatements: false
});

// Test connection on startup
pool.getConnection()
  .then((connection) => {
    logger.info('Database connection pool established');
    connection.release();
  })
  .catch((error) => {
    logger.error('Failed to create database connection pool:', error);
  });

// Export pool for promise-based queries
module.exports = pool;
