/**
 * Test Redis Helpers
 */

const Redis = require('ioredis');

let client = null;

/**
 * Create test Redis client
 */
function createClient() {
  if (client) return client;

  client = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '1', 10),
    lazyConnect: false
  });

  return client;
}

/**
 * Flush test Redis database
 */
async function flushDatabase() {
  const redis = createClient();
  await redis.flushdb();
}

/**
 * Close Redis connection
 */
async function disconnect() {
  if (client) {
    await client.quit();
    client = null;
  }
}

module.exports = {
  createClient,
  flushDatabase,
  disconnect
};
