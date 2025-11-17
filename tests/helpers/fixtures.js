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

/**
 * Create test thread in database
 */
async function createTestThread(db, threadData) {
  const result = await db.execute(
    `INSERT INTO threads (title, body, author_pseudo, language)
     VALUES (?, ?, ?, ?)`,
    [
      threadData.title,
      threadData.body,
      threadData.authorPseudo,
      threadData.language || 'fr'
    ]
  );

  return {
    id: result[0].insertId,
    ...threadData
  };
}

/**
 * Create test reply in database
 */
async function createTestReply(db, replyData) {
  const result = await db.execute(
    `INSERT INTO replies (thread_id, body, author_pseudo)
     VALUES (?, ?, ?)`,
    [
      replyData.threadId,
      replyData.body,
      replyData.authorPseudo
    ]
  );

  return {
    id: result[0].insertId,
    ...replyData
  };
}

/**
 * Sample thread data
 */
const validThreads = {
  thread1: {
    title: 'Test Thread 1',
    body: 'This is the body of test thread 1. It contains some content for testing.',
    authorPseudo: 'testuser1',
    language: 'fr'
  },
  thread2: {
    title: 'Test Thread 2',
    body: 'This is the body of test thread 2. More test content here.',
    authorPseudo: 'testuser2',
    language: 'nl'
  },
  longThread: {
    title: 'Long Thread Title for Testing Search Functionality',
    body: 'This is a much longer thread body with lots of content. It includes multiple sentences and paragraphs for testing full-text search functionality. We want to make sure that searching works properly with longer content.',
    authorPseudo: 'testuser1',
    language: 'fr'
  }
};

/**
 * Sample reply data
 */
const validReplies = {
  reply1: {
    body: 'This is a test reply to the thread.',
    authorPseudo: 'testuser2'
  },
  reply2: {
    body: 'Another test reply with different content.',
    authorPseudo: 'testuser1'
  },
  longReply: {
    body: 'This is a much longer reply with detailed content. It includes multiple sentences to test search and display functionality properly.',
    authorPseudo: 'testuser2'
  }
};

module.exports = {
  validUsers,
  invalidPseudos,
  invalidPins,
  createHashedPin,
  createTestUser,
  createTestThread,
  createTestReply,
  validThreads,
  validReplies
};
