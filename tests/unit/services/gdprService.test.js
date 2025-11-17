/**
 * GDPR Service Unit Tests
 * Tests for data export and account deletion functionality
 */

const GdprService = require('../../../src/services/gdprService');
const User = require('../../../src/models/User');
const Thread = require('../../../src/models/Thread');
const Reply = require('../../../src/models/Reply');
const AuthService = require('../../../src/services/authService');
const db = require('../../../src/utils/database');
const redis = require('../../../src/utils/redis');

// Mock dependencies
jest.mock('../../../src/models/User');
jest.mock('../../../src/models/Thread');
jest.mock('../../../src/models/Reply');
jest.mock('../../../src/services/authService');
jest.mock('../../../src/utils/database');
jest.mock('../../../src/utils/redis');

describe('GdprService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exportUserData', () => {
    it('should export complete user data in GDPR-compliant format', async () => {
      // Mock user data
      const mockUser = {
        pseudo: 'testuser',
        created_at: new Date('2024-01-01'),
        last_login: new Date('2024-01-15'),
        preferred_language: 'fr',
        is_moderator: false,
        is_banned: false,
        ban_reason: null,
        ban_until: null
      };

      const mockStats = {
        post_count: 5,
        reply_count: 10,
        created_at: new Date('2024-01-01')
      };

      const mockThreads = [
        {
          id: 1,
          title: 'Test Thread',
          body: 'Test thread body',
          created_at: new Date('2024-01-02'),
          last_activity: new Date('2024-01-03'),
          reply_count: 3,
          view_count: 50,
          language: 'fr',
          is_pinned: false,
          is_locked: false,
          is_deleted: false,
          is_hidden: false
        }
      ];

      const mockReplies = [
        {
          id: 1,
          thread_id: 2,
          thread_title: 'Other Thread',
          body: 'Test reply body',
          created_at: new Date('2024-01-04'),
          edited_at: null,
          is_deleted: false,
          is_hidden: false
        }
      ];

      const mockReports = [
        [
          {
            content_type: 'thread',
            content_id: 3,
            reason: 'spam',
            description: 'This is spam',
            created_at: new Date('2024-01-05'),
            status: 'pending'
          }
        ]
      ];

      // Setup mocks
      User.findByPseudo.mockResolvedValue(mockUser);
      User.getStats.mockResolvedValue(mockStats);
      Thread.findByAuthor.mockResolvedValue(mockThreads);
      Reply.findByAuthor.mockResolvedValue(mockReplies);
      db.execute.mockResolvedValue(mockReports);

      // Execute export
      const result = await GdprService.exportUserData('testuser');

      // Assertions
      expect(result).toHaveProperty('metadata');
      expect(result.metadata.legalBasis).toBe('GDPR Article 15 - Right to access');

      expect(result).toHaveProperty('account');
      expect(result.account.pseudo).toBe('testuser');
      expect(result.account.preferredLanguage).toBe('fr');

      expect(result).toHaveProperty('statistics');
      expect(result.statistics.threadCount).toBe(5);
      expect(result.statistics.replyCount).toBe(10);

      expect(result).toHaveProperty('content');
      expect(result.content.threads).toHaveLength(1);
      expect(result.content.threads[0].title).toBe('Test Thread');
      expect(result.content.threads[0].body).toBe('Test thread body');

      expect(result.content.replies).toHaveLength(1);
      expect(result.content.replies[0].body).toBe('Test reply body');

      expect(result).toHaveProperty('moderation');
      expect(result.moderation.reportsMade).toHaveLength(1);

      expect(result).toHaveProperty('gdprNotice');

      // Verify Thread.findByAuthor was called with includeBody: true
      expect(Thread.findByAuthor).toHaveBeenCalledWith('testuser', {
        limit: 10000,
        offset: 0,
        includeBody: true
      });

      // Verify Reply.findByAuthor was called with includeBody: true
      expect(Reply.findByAuthor).toHaveBeenCalledWith('testuser', {
        limit: 10000,
        offset: 0,
        includeBody: true
      });
    });

    it('should throw error if user not found', async () => {
      User.findByPseudo.mockResolvedValue(null);

      await expect(GdprService.exportUserData('nonexistent')).rejects.toThrow('User not found');
    });
  });

  describe('deleteUserAccount', () => {
    it('should delete account with anonymization strategy', async () => {
      const mockUser = {
        pseudo: 'testuser',
        pin_hash: 'hashedpin',
        is_moderator: false,
        is_banned: false
      };

      const mockConnection = {
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
        execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }])
      };

      User.findByPseudo.mockResolvedValue(mockUser);
      AuthService.verifyPin.mockResolvedValue(true);
      db.getConnection.mockResolvedValue(mockConnection);
      redis.keys.mockResolvedValue(['sess:abc123']);
      redis.get.mockResolvedValue(JSON.stringify({ pseudo: 'testuser' }));
      redis.del.mockResolvedValue(1);

      const result = await GdprService.deleteUserAccount('testuser', '1234', {
        contentStrategy: 'anonymize'
      });

      expect(result.success).toBe(true);
      expect(result.pseudo).toBe('testuser');
      expect(result.contentStrategy).toBe('anonymize');

      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(mockConnection.commit).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();

      // Verify content was anonymized (not deleted)
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining("SET author_pseudo = '[deleted]'"),
        ['testuser']
      );
    });

    it('should delete account with deletion strategy', async () => {
      const mockUser = {
        pseudo: 'testuser',
        pin_hash: 'hashedpin',
        is_moderator: false,
        is_banned: false
      };

      const mockConnection = {
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
        execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }])
      };

      User.findByPseudo.mockResolvedValue(mockUser);
      AuthService.verifyPin.mockResolvedValue(true);
      db.getConnection.mockResolvedValue(mockConnection);
      redis.keys.mockResolvedValue([]);
      redis.del.mockResolvedValue(0);

      const result = await GdprService.deleteUserAccount('testuser', '1234', {
        contentStrategy: 'delete'
      });

      expect(result.success).toBe(true);
      expect(result.contentStrategy).toBe('delete');

      // Verify content was soft deleted
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('is_deleted = TRUE'),
        expect.anything()
      );
    });

    it('should reject deletion with invalid PIN', async () => {
      const mockUser = {
        pseudo: 'testuser',
        pin_hash: 'hashedpin'
      };

      User.findByPseudo.mockResolvedValue(mockUser);
      AuthService.verifyPin.mockResolvedValue(false);

      await expect(
        GdprService.deleteUserAccount('testuser', 'wrongpin')
      ).rejects.toThrow('Invalid PIN');
    });

    it('should rollback on error', async () => {
      const mockUser = {
        pseudo: 'testuser',
        pin_hash: 'hashedpin'
      };

      const mockConnection = {
        beginTransaction: jest.fn(),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
        execute: jest.fn().mockRejectedValue(new Error('Database error'))
      };

      User.findByPseudo.mockResolvedValue(mockUser);
      AuthService.verifyPin.mockResolvedValue(true);
      db.getConnection.mockResolvedValue(mockConnection);

      await expect(
        GdprService.deleteUserAccount('testuser', '1234')
      ).rejects.toThrow('Database error');

      expect(mockConnection.rollback).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });

  describe('validateDeletionRequest', () => {
    it('should return validation result with warnings', async () => {
      const mockUser = {
        pseudo: 'testuser',
        is_moderator: true,
        is_banned: false
      };

      const mockStats = {
        post_count: 3,
        reply_count: 7,
        created_at: new Date('2024-01-01')
      };

      const mockRecentReports = [[{ count: 2 }]];

      User.findByPseudo.mockResolvedValue(mockUser);
      User.getStats.mockResolvedValue(mockStats);
      db.execute.mockResolvedValue(mockRecentReports);

      const result = await GdprService.validateDeletionRequest('testuser');

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('You are a moderator. Your moderation history will be preserved as [deleted].');
      expect(result.warnings).toContain('You have 3 thread(s) that will be affected.');
      expect(result.warnings).toContain('You have 7 reply/replies that will be affected.');
      expect(result.warnings).toContain('You have 2 pending report(s) from the last 7 days.');
      expect(result.contentStats.threads).toBe(3);
      expect(result.contentStats.replies).toBe(7);
    });

    it('should return error if user not found', async () => {
      User.findByPseudo.mockResolvedValue(null);

      const result = await GdprService.validateDeletionRequest('nonexistent');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('User not found');
    });
  });

  describe('ensureDeletedUserExists', () => {
    it('should create [deleted] user if not exists', async () => {
      User.exists.mockResolvedValue(false);
      AuthService.hashPin.mockResolvedValue({
        hash: 'hashedpin',
        salt: 'randomsalt'
      });
      db.execute.mockResolvedValue([{ insertId: 1 }]);

      await GdprService.ensureDeletedUserExists();

      expect(User.exists).toHaveBeenCalledWith('[deleted]');
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO users"),
        expect.arrayContaining(['[deleted]'])
      );
    });

    it('should skip creation if [deleted] user already exists', async () => {
      User.exists.mockResolvedValue(true);

      await GdprService.ensureDeletedUserExists();

      expect(User.exists).toHaveBeenCalledWith('[deleted]');
      expect(db.execute).not.toHaveBeenCalled();
    });
  });

  describe('_calculateAccountAge', () => {
    it('should calculate account age in days', () => {
      const createdAt = new Date('2024-01-01');
      const mockNow = new Date('2024-01-15');

      jest.spyOn(global, 'Date').mockImplementation(() => mockNow);

      const age = GdprService._calculateAccountAge(createdAt);

      expect(age).toBeGreaterThanOrEqual(14);
      expect(age).toBeLessThanOrEqual(15);

      global.Date.mockRestore();
    });
  });
});
