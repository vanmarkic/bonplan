/**
 * User Model Unit Tests
 */

const User = require('../../../src/models/User');
const testDb = require('../../helpers/testDb');
const fixtures = require('../../helpers/fixtures');

describe('User Model', () => {
  let db;

  beforeAll(async () => {
    await testDb.createTestDatabase();
    await testDb.createTables();
    db = await testDb.connect();
  });

  beforeEach(async () => {
    await testDb.cleanDatabase();
  });

  afterAll(async () => {
    await testDb.disconnect();
  });

  describe('create', () => {
    it('should create a new user', async () => {
      const { hash, salt } = await fixtures.createHashedPin('1234');

      const result = await User.create('testuser', hash, salt, 'fr');

      expect(result).toBeDefined();
      expect(result.affectedRows).toBe(1);
    });

    it('should fail if pseudo already exists', async () => {
      const { hash, salt } = await fixtures.createHashedPin('1234');

      await User.create('testuser', hash, salt, 'fr');

      await expect(
        User.create('testuser', hash, salt, 'fr')
      ).rejects.toThrow();
    });
  });

  describe('findByPseudo', () => {
    it('should find existing user', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);

      const user = await User.findByPseudo('testuser1');

      expect(user).toBeDefined();
      expect(user.pseudo).toBe('testuser1');
      expect(user.pin_hash).toBeDefined();
      expect(user.pin_salt).toBeDefined();
      expect(user.failed_attempts).toBe(0);
    });

    it('should return null for non-existent user', async () => {
      const user = await User.findByPseudo('nonexistent');

      expect(user).toBeNull();
    });
  });

  describe('exists', () => {
    it('should return true for existing user', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);

      const exists = await User.exists('testuser1');

      expect(exists).toBe(true);
    });

    it('should return false for non-existent user', async () => {
      const exists = await User.exists('nonexistent');

      expect(exists).toBe(false);
    });
  });

  describe('updateLastLogin', () => {
    it('should update last_login timestamp', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);

      const before = await User.findByPseudo('testuser1');
      expect(before.last_login).toBeNull();

      await User.updateLastLogin('testuser1');

      const after = await User.findByPseudo('testuser1');
      expect(after.last_login).not.toBeNull();
    });
  });

  describe('incrementFailedAttempts', () => {
    it('should increment failed attempts counter', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);

      await User.incrementFailedAttempts('testuser1');

      const user = await User.findByPseudo('testuser1');
      expect(user.failed_attempts).toBe(1);
    });

    it('should increment multiple times', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);

      await User.incrementFailedAttempts('testuser1');
      await User.incrementFailedAttempts('testuser1');
      await User.incrementFailedAttempts('testuser1');

      const user = await User.findByPseudo('testuser1');
      expect(user.failed_attempts).toBe(3);
    });
  });

  describe('resetFailedAttempts', () => {
    it('should reset failed attempts to 0', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      await User.incrementFailedAttempts('testuser1');
      await User.incrementFailedAttempts('testuser1');

      await User.resetFailedAttempts('testuser1');

      const user = await User.findByPseudo('testuser1');
      expect(user.failed_attempts).toBe(0);
      expect(user.locked_until).toBeNull();
    });
  });

  describe('lockAccount', () => {
    it('should lock account for specified minutes', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);

      await User.lockAccount('testuser1', 30);

      const user = await User.findByPseudo('testuser1');
      expect(user.locked_until).not.toBeNull();

      // Check lockout is approximately 30 minutes in the future
      const lockoutTime = new Date(user.locked_until);
      const expectedTime = new Date(Date.now() + 30 * 60 * 1000);
      const diffMinutes = Math.abs(lockoutTime - expectedTime) / 60000;

      expect(diffMinutes).toBeLessThan(1); // Within 1 minute tolerance
    });
  });

  describe('isLocked', () => {
    it('should return null if account is not locked', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);

      const lockedUntil = await User.isLocked('testuser1');

      expect(lockedUntil).toBeNull();
    });

    it('should return timestamp if account is locked', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
      await User.lockAccount('testuser1', 30);

      const lockedUntil = await User.isLocked('testuser1');

      expect(lockedUntil).not.toBeNull();
    });

    it('should return null if lockout has expired', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);

      // Lock for 0 minutes (will be in the past)
      await db.execute(
        'UPDATE users SET locked_until = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE pseudo = ?',
        ['testuser1']
      );

      const lockedUntil = await User.isLocked('testuser1');

      expect(lockedUntil).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return user stats', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);

      const stats = await User.getStats('testuser1');

      expect(stats).toBeDefined();
      expect(stats.post_count).toBe(0);
      expect(stats.reply_count).toBe(0);
      expect(stats.created_at).toBeDefined();
    });

    it('should return null for non-existent user', async () => {
      const stats = await User.getStats('nonexistent');

      expect(stats).toBeNull();
    });
  });

  describe('deleteAccount', () => {
    it('should delete user account', async () => {
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);

      await User.deleteAccount('testuser1');

      const user = await User.findByPseudo('testuser1');
      expect(user).toBeNull();
    });
  });
});
