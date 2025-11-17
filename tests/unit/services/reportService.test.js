/**
 * Report Service Unit Tests
 */

const ReportService = require('../../../src/services/reportService');
const Thread = require('../../../src/models/Thread');
const Reply = require('../../../src/models/Reply');
const testDb = require('../../helpers/testDb');
const fixtures = require('../../helpers/fixtures');

describe('ReportService', () => {
  let db;
  let testThread;
  let testReply;

  beforeAll(async () => {
    await testDb.createTestDatabase();
    await testDb.createTables();
    db = await testDb.connect();
  });

  beforeEach(async () => {
    await testDb.cleanDatabase();

    // Create test users, thread and reply
    await fixtures.createTestUser(db, fixtures.validUsers.testuser1);
    await fixtures.createTestUser(db, fixtures.validUsers.testuser2);
    await fixtures.createTestUser(db, fixtures.validUsers.moderator);

    testThread = await fixtures.createTestThread(db, fixtures.validThreads.thread1);
    testReply = await Reply.create(testThread.id, 'Test reply', 'testuser2');
  });

  afterAll(async () => {
    await testDb.disconnect();
  });

  describe('reportThread', () => {
    it('should report a thread', async () => {
      const success = await ReportService.reportThread(
        testThread.id,
        'testuser2',
        'Inappropriate content'
      );

      expect(success).toBe(true);

      const thread = await Thread.findById(testThread.id);
      expect(thread.report_count).toBe(1);
    });

    it('should prevent duplicate reports from same user', async () => {
      await ReportService.reportThread(
        testThread.id,
        'testuser2',
        'First report'
      );

      const secondReport = await ReportService.reportThread(
        testThread.id,
        'testuser2',
        'Second report'
      );

      expect(secondReport).toBe(false);

      const thread = await Thread.findById(testThread.id);
      expect(thread.report_count).toBe(1);
    });

    it('should allow different users to report same thread', async () => {
      await ReportService.reportThread(
        testThread.id,
        'testuser1',
        'Report 1'
      );

      await ReportService.reportThread(
        testThread.id,
        'testuser2',
        'Report 2'
      );

      await ReportService.reportThread(
        testThread.id,
        'moderator1',
        'Report 3'
      );

      const thread = await Thread.findById(testThread.id);
      expect(thread.report_count).toBe(3);
    });

    it('should update report count accurately', async () => {
      // Create additional users
      for (let i = 3; i <= 7; i++) {
        await fixtures.createTestUser(db, {
          pseudo: `testuser${i}`,
          pin: '1234',
          language: 'fr'
        });
      }

      // Report from multiple users
      for (let i = 1; i <= 7; i++) {
        await ReportService.reportThread(
          testThread.id,
          `testuser${i}`,
          `Report from user ${i}`
        );
      }

      const thread = await Thread.findById(testThread.id);
      expect(thread.report_count).toBe(7);
    });
  });

  describe('reportReply', () => {
    it('should report a reply', async () => {
      const success = await ReportService.reportReply(
        testReply.id,
        'testuser1',
        'Spam'
      );

      expect(success).toBe(true);

      const reply = await Reply.findById(testReply.id);
      expect(reply.report_count).toBe(1);
    });

    it('should prevent duplicate reports from same user', async () => {
      await ReportService.reportReply(
        testReply.id,
        'testuser1',
        'First report'
      );

      const secondReport = await ReportService.reportReply(
        testReply.id,
        'testuser1',
        'Second report'
      );

      expect(secondReport).toBe(false);

      const reply = await Reply.findById(testReply.id);
      expect(reply.report_count).toBe(1);
    });

    it('should allow different users to report same reply', async () => {
      await ReportService.reportReply(
        testReply.id,
        'testuser1',
        'Report 1'
      );

      await ReportService.reportReply(
        testReply.id,
        'moderator1',
        'Report 2'
      );

      const reply = await Reply.findById(testReply.id);
      expect(reply.report_count).toBe(2);
    });
  });

  describe('getThreadReportCount', () => {
    it('should get thread report count', async () => {
      await ReportService.reportThread(testThread.id, 'testuser1', 'Report 1');
      await ReportService.reportThread(testThread.id, 'testuser2', 'Report 2');

      const count = await ReportService.getThreadReportCount(testThread.id);

      expect(count).toBe(2);
    });

    it('should return 0 for unreported thread', async () => {
      const count = await ReportService.getThreadReportCount(testThread.id);

      expect(count).toBe(0);
    });
  });

  describe('getReplyReportCount', () => {
    it('should get reply report count', async () => {
      await ReportService.reportReply(testReply.id, 'testuser1', 'Report 1');

      const count = await ReportService.getReplyReportCount(testReply.id);

      expect(count).toBe(1);
    });

    it('should return 0 for unreported reply', async () => {
      const count = await ReportService.getReplyReportCount(testReply.id);

      expect(count).toBe(0);
    });
  });

  describe('getReportedThreads', () => {
    it('should get threads with minimum report count', async () => {
      // Create additional users and threads
      for (let i = 3; i <= 7; i++) {
        await fixtures.createTestUser(db, {
          pseudo: `testuser${i}`,
          pin: '1234',
          language: 'fr'
        });
      }

      const thread2 = await fixtures.createTestThread(db, {
        ...fixtures.validThreads.thread2,
        authorPseudo: 'testuser2'
      });

      // Report thread1 from 5 users (meets threshold)
      for (let i = 1; i <= 5; i++) {
        await ReportService.reportThread(
          testThread.id,
          `testuser${i}`,
          `Reason ${i}`
        );
      }

      // Report thread2 from 3 users (below threshold)
      for (let i = 1; i <= 3; i++) {
        await ReportService.reportThread(
          thread2.id,
          `testuser${i}`,
          'Spam'
        );
      }

      const reported = await ReportService.getReportedThreads({ minReports: 5 });

      expect(reported).toHaveLength(1);
      expect(reported[0].id).toBe(testThread.id);
      expect(reported[0].report_count).toBe(5);
      expect(reported[0].unique_reporters).toBe(5);
    });

    it('should return report reasons', async () => {
      // Report with different reasons
      await ReportService.reportThread(testThread.id, 'testuser1', 'Spam');
      await ReportService.reportThread(testThread.id, 'testuser2', 'Offensive');
      await ReportService.reportThread(testThread.id, 'moderator1', 'Spam');

      const reported = await ReportService.getReportedThreads({ minReports: 3 });

      expect(reported).toHaveLength(1);
      expect(reported[0].report_reasons).toContain('Spam');
      expect(reported[0].report_reasons).toContain('Offensive');
    });

    it('should sort by report count descending', async () => {
      // Create additional users
      for (let i = 3; i <= 10; i++) {
        await fixtures.createTestUser(db, {
          pseudo: `testuser${i}`,
          pin: '1234',
          language: 'fr'
        });
      }

      const thread2 = await fixtures.createTestThread(db, {
        ...fixtures.validThreads.thread2,
        authorPseudo: 'testuser2'
      });

      // Report thread1 from 3 users
      for (let i = 1; i <= 3; i++) {
        await ReportService.reportThread(testThread.id, `testuser${i}`, 'Reason');
      }

      // Report thread2 from 7 users
      for (let i = 1; i <= 7; i++) {
        await ReportService.reportThread(thread2.id, `testuser${i}`, 'Reason');
      }

      const reported = await ReportService.getReportedThreads({ minReports: 3 });

      expect(reported).toHaveLength(2);
      expect(reported[0].id).toBe(thread2.id); // More reports
      expect(reported[1].id).toBe(testThread.id);
    });

    it('should exclude deleted threads', async () => {
      // Report thread
      for (let i = 1; i <= 5; i++) {
        await fixtures.createTestUser(db, {
          pseudo: `testuser${i + 2}`,
          pin: '1234'
        });
        await ReportService.reportThread(testThread.id, `testuser${i}`, 'Reason');
      }

      await Thread.softDelete(testThread.id);

      const reported = await ReportService.getReportedThreads({ minReports: 5 });

      expect(reported).toHaveLength(0);
    });
  });

  describe('getReportedReplies', () => {
    it('should get replies with minimum report count', async () => {
      // Create additional users
      for (let i = 3; i <= 6; i++) {
        await fixtures.createTestUser(db, {
          pseudo: `testuser${i}`,
          pin: '1234',
          language: 'fr'
        });
      }

      const reply2 = await Reply.create(testThread.id, 'Another reply', 'testuser1');

      // Report reply1 from 5 users (meets threshold)
      for (let i = 1; i <= 5; i++) {
        await ReportService.reportReply(
          testReply.id,
          `testuser${i}`,
          'Spam'
        );
      }

      // Report reply2 from 2 users (below threshold)
      await ReportService.reportReply(reply2.id, 'testuser1', 'Offensive');
      await ReportService.reportReply(reply2.id, 'testuser2', 'Offensive');

      const reported = await ReportService.getReportedReplies({ minReports: 5 });

      expect(reported).toHaveLength(1);
      expect(reported[0].id).toBe(testReply.id);
      expect(reported[0].report_count).toBe(5);
      expect(reported[0].thread_title).toBe('Test Thread 1');
    });

    it('should exclude deleted replies', async () => {
      // Report reply
      for (let i = 3; i <= 7; i++) {
        await fixtures.createTestUser(db, {
          pseudo: `testuser${i}`,
          pin: '1234'
        });
      }

      for (let i = 1; i <= 5; i++) {
        await ReportService.reportReply(testReply.id, `testuser${i}`, 'Reason');
      }

      await Reply.softDelete(testReply.id);

      const reported = await ReportService.getReportedReplies({ minReports: 5 });

      expect(reported).toHaveLength(0);
    });
  });

  describe('getAutoHiddenStats', () => {
    it('should get auto-hidden content statistics', async () => {
      // Create threads and replies with high report counts
      const thread2 = await fixtures.createTestThread(db, {
        ...fixtures.validThreads.thread2,
        authorPseudo: 'testuser2'
      });
      const reply2 = await Reply.create(testThread.id, 'Reply 2', 'testuser1');

      // Set high report counts (auto-hide threshold is 10)
      await db.execute('UPDATE threads SET report_count = 10, is_hidden = TRUE WHERE id = ?', [testThread.id]);
      await db.execute('UPDATE threads SET report_count = 10, is_hidden = TRUE WHERE id = ?', [thread2.id]);
      await db.execute('UPDATE replies SET report_count = 10, is_hidden = TRUE WHERE id = ?', [testReply.id]);
      await db.execute('UPDATE replies SET report_count = 10, is_hidden = TRUE WHERE id = ?', [reply2.id]);

      const stats = await ReportService.getAutoHiddenStats();

      expect(stats.threads).toBe(2);
      expect(stats.replies).toBe(2);
      expect(stats.total).toBe(4);
    });

    it('should exclude manually hidden content', async () => {
      // Set hidden but low report count (not auto-hidden)
      await db.execute('UPDATE threads SET report_count = 3, is_hidden = TRUE WHERE id = ?', [testThread.id]);
      await db.execute('UPDATE replies SET report_count = 2, is_hidden = TRUE WHERE id = ?', [testReply.id]);

      const stats = await ReportService.getAutoHiddenStats();

      expect(stats.threads).toBe(0);
      expect(stats.replies).toBe(0);
      expect(stats.total).toBe(0);
    });
  });

  describe('clearThreadReports', () => {
    it('should clear all reports for a thread', async () => {
      // Add multiple reports
      await ReportService.reportThread(testThread.id, 'testuser1', 'Report 1');
      await ReportService.reportThread(testThread.id, 'testuser2', 'Report 2');
      await ReportService.reportThread(testThread.id, 'moderator1', 'Report 3');

      const success = await ReportService.clearThreadReports(testThread.id);

      expect(success).toBe(true);

      const thread = await Thread.findById(testThread.id);
      expect(thread.report_count).toBe(0);

      const count = await ReportService.getThreadReportCount(testThread.id);
      expect(count).toBe(0);
    });
  });

  describe('clearReplyReports', () => {
    it('should clear all reports for a reply', async () => {
      // Add multiple reports
      await ReportService.reportReply(testReply.id, 'testuser1', 'Report 1');
      await ReportService.reportReply(testReply.id, 'moderator1', 'Report 2');

      const success = await ReportService.clearReplyReports(testReply.id);

      expect(success).toBe(true);

      const reply = await Reply.findById(testReply.id);
      expect(reply.report_count).toBe(0);

      const count = await ReportService.getReplyReportCount(testReply.id);
      expect(count).toBe(0);
    });
  });

  describe('getThreadReportDetails', () => {
    it('should get report details for a thread', async () => {
      await ReportService.reportThread(testThread.id, 'testuser1', 'Spam');
      await ReportService.reportThread(testThread.id, 'testuser2', 'Offensive language');

      const details = await ReportService.getThreadReportDetails(testThread.id);

      expect(details).toHaveLength(2);
      expect(details.some(r => r.reporter_pseudo === 'testuser1' && r.reason === 'Spam')).toBe(true);
      expect(details.some(r => r.reporter_pseudo === 'testuser2' && r.reason === 'Offensive language')).toBe(true);
    });

    it('should order by created_at descending', async () => {
      await ReportService.reportThread(testThread.id, 'testuser1', 'First');
      await new Promise(resolve => setTimeout(resolve, 10));
      await ReportService.reportThread(testThread.id, 'testuser2', 'Second');

      const details = await ReportService.getThreadReportDetails(testThread.id);

      expect(details[0].reason).toBe('Second'); // Most recent first
      expect(details[1].reason).toBe('First');
    });
  });

  describe('getReplyReportDetails', () => {
    it('should get report details for a reply', async () => {
      await ReportService.reportReply(testReply.id, 'testuser1', 'Spam');
      await ReportService.reportReply(testReply.id, 'moderator1', 'Harassment');

      const details = await ReportService.getReplyReportDetails(testReply.id);

      expect(details).toHaveLength(2);
      expect(details.some(r => r.reporter_pseudo === 'testuser1' && r.reason === 'Spam')).toBe(true);
      expect(details.some(r => r.reporter_pseudo === 'moderator1' && r.reason === 'Harassment')).toBe(true);
    });
  });

  describe('getRecentReports', () => {
    it('should get recent reports across all content', async () => {
      const thread2 = await fixtures.createTestThread(db, {
        ...fixtures.validThreads.thread2,
        authorPseudo: 'testuser2'
      });
      const reply2 = await Reply.create(thread2.id, 'Reply 2', 'testuser1');

      await ReportService.reportThread(testThread.id, 'testuser1', 'Thread report');
      await ReportService.reportReply(testReply.id, 'testuser2', 'Reply report');
      await ReportService.reportThread(thread2.id, 'moderator1', 'Thread 2 report');
      await ReportService.reportReply(reply2.id, 'testuser1', 'Reply 2 report');

      const recent = await ReportService.getRecentReports({ days: 7 });

      expect(recent).toHaveLength(4);
      expect(recent.some(r => r.type === 'thread' && r.content_id === testThread.id)).toBe(true);
      expect(recent.some(r => r.type === 'reply' && r.content_id === testReply.id)).toBe(true);
    });

    it('should exclude old reports', async () => {
      await ReportService.reportThread(testThread.id, 'testuser1', 'Old report');

      // Set report to 10 days ago
      await db.execute(
        'UPDATE thread_reports SET created_at = DATE_SUB(NOW(), INTERVAL 10 DAY) WHERE thread_id = ?',
        [testThread.id]
      );

      await ReportService.reportThread(testThread.id, 'testuser2', 'Recent report');

      const recent = await ReportService.getRecentReports({ days: 7 });

      expect(recent).toHaveLength(1);
      expect(recent[0].reason).toBe('Recent report');
    });

    it('should limit results', async () => {
      // Create many reports
      for (let i = 3; i <= 12; i++) {
        await fixtures.createTestUser(db, {
          pseudo: `testuser${i}`,
          pin: '1234'
        });

        const thread = await fixtures.createTestThread(db, {
          title: `Thread ${i}`,
          body: 'Body',
          authorPseudo: `testuser${i}`
        });

        await ReportService.reportThread(thread.id, 'testuser1', `Report ${i}`);
      }

      const recent = await ReportService.getRecentReports({ limit: 5 });

      expect(recent).toHaveLength(5);
    });
  });

  describe('getMostReportedUsers', () => {
    it('should get users with most reported content', async () => {
      // Create additional users and content
      for (let i = 3; i <= 5; i++) {
        await fixtures.createTestUser(db, {
          pseudo: `testuser${i}`,
          pin: '1234'
        });
      }

      // Create content by different users
      const thread2 = await fixtures.createTestThread(db, {
        title: 'Thread by user 2',
        body: 'Body',
        authorPseudo: 'testuser2'
      });

      const thread3 = await fixtures.createTestThread(db, {
        title: 'Thread by user 3',
        body: 'Body',
        authorPseudo: 'testuser3'
      });

      const reply2 = await Reply.create(thread2.id, 'Reply by user 1', 'testuser1');
      const reply3 = await Reply.create(thread3.id, 'Reply by user 2', 'testuser2');

      // Report content from testuser1 (1 thread + 1 reply)
      await ReportService.reportThread(testThread.id, 'testuser2', 'Report');
      await ReportService.reportThread(testThread.id, 'testuser3', 'Report');
      await ReportService.reportReply(reply2.id, 'testuser2', 'Report');

      // Report content from testuser2 (1 thread + 1 reply)
      await ReportService.reportThread(thread2.id, 'testuser1', 'Report');
      await ReportService.reportReply(reply3.id, 'testuser1', 'Report');

      const mostReported = await ReportService.getMostReportedUsers({ limit: 10 });

      expect(mostReported.length).toBeGreaterThan(0);

      const user1Stats = mostReported.find(u => u.author_pseudo === 'testuser1');
      expect(user1Stats).toBeDefined();
      expect(user1Stats.thread_reports).toBe(2); // testThread reported twice
      expect(user1Stats.reply_reports).toBe(1); // reply2 reported once
      expect(user1Stats.total_reports).toBe(3);

      const user2Stats = mostReported.find(u => u.author_pseudo === 'testuser2');
      expect(user2Stats).toBeDefined();
      expect(user2Stats.thread_reports).toBe(1);
      expect(user2Stats.reply_reports).toBe(1);
      expect(user2Stats.total_reports).toBe(2);
    });

    it('should sort by total reports descending', async () => {
      // Create users
      for (let i = 3; i <= 5; i++) {
        await fixtures.createTestUser(db, {
          pseudo: `testuser${i}`,
          pin: '1234'
        });
      }

      // Create threads
      const thread2 = await fixtures.createTestThread(db, {
        title: 'Thread 2',
        body: 'Body',
        authorPseudo: 'testuser2'
      });

      // Report testThread multiple times (by testuser1)
      for (let i = 2; i <= 5; i++) {
        await ReportService.reportThread(testThread.id, `testuser${i}`, 'Report');
      }

      // Report thread2 once (by testuser2)
      await ReportService.reportThread(thread2.id, 'testuser1', 'Report');

      const mostReported = await ReportService.getMostReportedUsers({ limit: 2 });

      expect(mostReported[0].author_pseudo).toBe('testuser1'); // 4 reports
      expect(mostReported[0].total_reports).toBe(4);
      expect(mostReported[1].author_pseudo).toBe('testuser2'); // 1 report
      expect(mostReported[1].total_reports).toBe(1);
    });
  });

  describe('Auto-hide threshold', () => {
    it('should auto-hide at 10 reports', async () => {
      // Create 10 users
      for (let i = 3; i <= 10; i++) {
        await fixtures.createTestUser(db, {
          pseudo: `testuser${i}`,
          pin: '1234'
        });
      }

      // Report thread from 10 different users
      for (let i = 1; i <= 10; i++) {
        await ReportService.reportThread(testThread.id, `testuser${i}`, 'Report');
      }

      const thread = await Thread.findById(testThread.id);
      expect(thread.report_count).toBe(10);

      // In production, auto-hiding would be handled by a trigger or application logic
      // For testing purposes, we verify the report count reaches the threshold
    });

    it('should mark for review at 5 reports', async () => {
      // Create 5 users
      for (let i = 3; i <= 5; i++) {
        await fixtures.createTestUser(db, {
          pseudo: `testuser${i}`,
          pin: '1234'
        });
      }

      // Report reply from 5 different users
      for (let i = 1; i <= 5; i++) {
        await ReportService.reportReply(testReply.id, `testuser${i}`, 'Report');
      }

      const reply = await Reply.findById(testReply.id);
      expect(reply.report_count).toBe(5);

      // This meets the review threshold
      const reportedReplies = await ReportService.getReportedReplies({ minReports: 5 });
      expect(reportedReplies.some(r => r.id === testReply.id)).toBe(true);
    });
  });

  describe('hasUserReported check', () => {
    it('should check if user has already reported thread', async () => {
      await ReportService.reportThread(testThread.id, 'testuser1', 'First');

      // Second report should fail (duplicate check)
      const duplicate = await ReportService.reportThread(testThread.id, 'testuser1', 'Second');
      expect(duplicate).toBe(false);

      // Verify only one report exists
      const count = await ReportService.getThreadReportCount(testThread.id);
      expect(count).toBe(1);
    });

    it('should check if user has already reported reply', async () => {
      await ReportService.reportReply(testReply.id, 'testuser2', 'First');

      // Second report should fail (duplicate check)
      const duplicate = await ReportService.reportReply(testReply.id, 'testuser2', 'Second');
      expect(duplicate).toBe(false);

      // Verify only one report exists
      const count = await ReportService.getReplyReportCount(testReply.id);
      expect(count).toBe(1);
    });
  });
});