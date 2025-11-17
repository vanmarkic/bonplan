/**
 * Test Fixtures
 * Reusable test data
 */

const argon2 = require('argon2');
const crypto = require('crypto');

/**
 * Valid test users
 */
const validUsers = {
  testuser1: {
    pseudo: 'testuser1',
    pin: '1234',
    language: 'fr'
  },
  testuser2: {
    pseudo: 'testuser2',
    pin: '5678',
    language: 'nl'
  },
  moderator: {
    pseudo: 'moderator1',
    pin: '9999',
    language: 'fr',
    isModerator: true
  }
};

/**
 * Invalid pseudo examples
 */
const invalidPseudos = [
  '', // Empty
  'ab', // Too short
  'a'.repeat(21), // Too long
  'test user', // Spaces
  'test@user', // Special chars
  'test.user', // Dots
  'admin', // Reserved word
  'system', // Reserved word
  'moderator' // Reserved word
];

/**
 * Invalid PIN examples
 */
const invalidPins = [
  '', // Empty
  '123', // Too short
  '12345', // Too long
  'abcd', // Not numbers
  '12ab', // Mixed
  '12.3' // Special chars
];

/**
 * Create hashed PIN for user
 */
async function createHashedPin(pin) {
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = await argon2.hash(pin, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
    salt: Buffer.from(salt, 'hex')
  });

  return { hash, salt };
}

/**
 * Create test user in database
 */
async function createTestUser(db, userData) {
  const { hash, salt } = await createHashedPin(userData.pin);

  await db.execute(
    `INSERT INTO users (pseudo, pin_hash, pin_salt, preferred_language, is_moderator)
     VALUES (?, ?, ?, ?, ?)`,
    [
      userData.pseudo,
      hash,
      salt,
      userData.language || 'fr',
      userData.isModerator || false
    ]
  );

  return userData;
}

module.exports = {
  validUsers,
  invalidPseudos,
  invalidPins,
  createHashedPin,
  createTestUser
};
