/**
 * Test Setup
 * Runs before all tests
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Quiet during tests

// Mock environment variables for tests
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_NAME = 'syndicat_tox_test';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';

process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.REDIS_PASSWORD = '';
process.env.REDIS_DB = '1'; // Use DB 1 for tests

process.env.SESSION_SECRET = 'test-session-secret-for-testing-only';
process.env.PORT = '3001'; // Different port for tests

// Increase timeout for integration tests
jest.setTimeout(10000);

// Global test cleanup
afterAll(async () => {
  // Give time for connections to close
  await new Promise(resolve => setTimeout(resolve, 500));
});
