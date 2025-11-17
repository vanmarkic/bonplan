/**
 * AuthService Unit Tests
 */

const AuthService = require('../../../src/services/authService');
const User = require('../../../src/models/User');
const testDb = require('../../helpers/testDb');
const fixtures = require('../../helpers/fixtures');

describe('AuthService', () => {
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

  describe('validatePseudo', () => {
    it('should accept valid pseudo', () => {
      const result = AuthService.validatePseudo('validuser123');

      expect(result.valid).toBe(true);
      expect(result.pseudo).toBe('validuser123');
    });

    it('should trim whitespace', () => {
      const result = AuthService.validatePseudo('  testuser  ');

      expect(result.valid).toBe(true);
      expect(result.pseudo).toBe('testuser');
    });

    it('should reject empty pseudo', () => {
      const result = AuthService.validatePseudo('');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject too short pseudo', () => {
      const result = AuthService.validatePseudo('ab');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('trop court');
    });

    it('should reject too long pseudo', () => {
      const result = AuthService.validatePseudo('a'.repeat(21));

      expect(result.valid).toBe(false);
      expect(result.error).toContain('trop long');
    });

    it('should reject pseudo with invalid characters', () => {
      const invalidPseudos = ['test user', 'test@user', 'test.user', 'test!user'];

      invalidPseudos.forEach(pseudo => {
        const result = AuthService.validatePseudo(pseudo);
        expect(result.valid).toBe(false);
      });
    });

    it('should reject reserved words', () => {
      const reserved = ['admin', 'system', 'moderator', 'mod', 'root'];

      reserved.forEach(word => {
        const result = AuthService.validatePseudo(word);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('réservé');
      });
    });
  });

  describe('validatePin', () => {
    it('should accept valid 4-digit PIN', () => {
      const result = AuthService.validatePin('1234');

      expect(result.valid).toBe(true);
      expect(result.pin).toBe('1234');
    });

    it('should reject empty PIN', () => {
      const result = AuthService.validatePin('');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject too short PIN', () => {
      const result = AuthService.validatePin('123');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('invalide');
    });

    it('should reject too long PIN', () => {
      const result = AuthService.validatePin('12345');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('invalide');
    });

    it('should reject non-numeric PIN', () => {
      const invalid = ['abcd', '12ab', '12.3', '12 3'];

      invalid.forEach(pin => {
        const result = AuthService.validatePin(pin);
        expect(result.valid).toBe(false);
      });
    });
  });

  describe('hashPin', () => {
    it('should hash PIN and generate salt', async () => {
      const { hash, salt } = await AuthService.hashPin('1234');

      expect(hash).toBeDefined();
      expect(salt).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(typeof salt).toBe('string');
      expect(hash.length).toBeGreaterThan(90);
      expect(salt.length).toBe(64); // 32 bytes as hex
    });

    it('should generate different hashes for same PIN', async () => {
      const result1 = await AuthService.hashPin('1234');
      const result2 = await AuthService.hashPin('1234');

      expect(result1.hash).not.toBe(result2.hash);
      expect(result1.salt).not.toBe(result2.salt);
    });

    it('should use provided salt if given', async () => {
      const customSalt = 'a'.repeat(64);
      const { hash, salt } = await AuthService.hashPin('1234', customSalt);

      expect(salt).toBe(customSalt);
    });
  });

  describe('verifyPin', () => {
    it('should verify correct PIN', async () => {
      const { hash } = await AuthService.hashPin('1234');

      const valid = await AuthService.verifyPin('1234', hash);

      expect(valid).toBe(true);
    });

    it('should reject incorrect PIN', async () => {
      const { hash } = await AuthService.hashPin('1234');

      const valid = await AuthService.verifyPin('5678', hash);

      expect(valid).toBe(false);
    });

    it('should handle invalid hash gracefully', async () => {
      const valid = await AuthService.verifyPin('1234', 'invalid-hash');

      expect(valid).toBe(false);
    });
  });

  describe('register', () => {
    it('should register new user successfully', async () => {
      const result = await AuthService.register('newuser', '1234', 'fr');

      expect(result).toBeDefined();
      expect(result.pseudo).toBe('newuser');

      // Verify user exists in database
      const user = await User.findByPseudo('newuser');
      expect(user).toBeDefined();
    });

    it('should reject invalid pseudo', async () => {
      await expect(
        AuthService.register('ab', '1234', 'fr')
      ).rejects.toThrow();
    });

    it('should reject invalid PIN', async () => {
      await expect(
        AuthService.register('validuser', '123', 'fr')
      ).rejects.toThrow();
    });

    it('should reject duplicate pseudo', async () => {
      await AuthService.register('testuser', '1234', 'fr');

      await expect(
        AuthService.register('testuser', '5678', 'fr')
      ).rejects.toThrow('déjà pris');
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      // Create test user before each login test
      await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
    });

    it('should login with correct credentials', async () => {
      const result = await AuthService.login('testuser1', '1234');

      expect(result).toBeDefined();
      expect(result.pseudo).toBe('testuser1');
      expect(result.isModerator).toBe(false);
      expect(result.preferredLanguage).toBe('fr');
    });

    it('should reject non-existent user', async () => {
      await expect(
        AuthService.login('nonexistent', '1234')
      ).rejects.toThrow('incorrect');
    });

    it('should reject incorrect PIN', async () => {
      await expect(
        AuthService.login('testuser1', '9999')
      ).rejects.toThrow('incorrect');
    });

    it('should increment failed attempts on wrong PIN', async () => {
      await expect(
        AuthService.login('testuser1', '9999')
      ).rejects.toThrow();

      const user = await User.findByPseudo('testuser1');
      expect(user.failed_attempts).toBe(1);
    });

    it('should lock account after 5 failed attempts', async () => {
      // Try 5 times with wrong PIN
      for (let i = 0; i < 5; i++) {
        try {
          await AuthService.login('testuser1', '9999');
        } catch (e) {
          // Expected to fail
        }
      }

      // 6th attempt should mention lockout
      await expect(
        AuthService.login('testuser1', '9999')
      ).rejects.toThrow('verrouillé');

      const lockedUntil = await User.isLocked('testuser1');
      expect(lockedUntil).not.toBeNull();
    });

    it('should reset failed attempts on successful login', async () => {
      // Fail once
      await expect(
        AuthService.login('testuser1', '9999')
      ).rejects.toThrow();

      // Succeed
      await AuthService.login('testuser1', '1234');

      const user = await User.findByPseudo('testuser1');
      expect(user.failed_attempts).toBe(0);
    });

    it('should reject login for locked account', async () => {
      await User.lockAccount('testuser1', 30);

      await expect(
        AuthService.login('testuser1', '1234')
      ).rejects.toThrow('verrouillé');
    });

    it('should reject permanently banned user', async () => {
      await db.execute(
        'UPDATE users SET is_banned = TRUE WHERE pseudo = ?',
        ['testuser1']
      );

      await expect(
        AuthService.login('testuser1', '1234')
      ).rejects.toThrow('banni');
    });

    it('should update last_login on successful login', async () => {
      const before = await User.findByPseudo('testuser1');
      expect(before.last_login).toBeNull();

      await AuthService.login('testuser1', '1234');

      const after = await User.findByPseudo('testuser1');
      expect(after.last_login).not.toBeNull();
    });
  });
});
