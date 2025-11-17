/**
 * Community Moderation Scheduler
 * Automated cron jobs for community room moderation, post expiration, user activity monitoring, and badge awards
 *
 * Uses node-cron for scheduled tasks
 * Integrates with CommunityRoom, Post, Badge, and User models
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const db = require('../utils/database');
const CommunityRoom = require('../models/CommunityRoom');
const Post = require('../models/Post');
const Badge = require('../models/Badge');
const User = require('../models/User');

/**
 * Configuration from environment variables
 */
const config = {
  // Enable/disable individual jobs
  enableRoomStateChecks: process.env.CRON_ENABLE_ROOM_CHECKS !== 'false',
  enablePostExpiration: process.env.CRON_ENABLE_POST_EXPIRATION !== 'false',
  enableUserActivityChecks: process.env.CRON_ENABLE_USER_ACTIVITY !== 'false',
  enableBadgeAwards: process.env.CRON_ENABLE_BADGE_AWARDS !== 'false',
  enableNotificationBatching: process.env.CRON_ENABLE_NOTIFICATIONS !== 'false',

  // Custom schedules (cron expressions)
  roomCheckSchedule: process.env.CRON_ROOM_CHECK_SCHEDULE || '0 * * * *', // Every hour
  postExpirationSchedule: process.env.CRON_POST_EXPIRATION_SCHEDULE || '0 0 * * *', // Midnight
  userActivitySchedule: process.env.CRON_USER_ACTIVITY_SCHEDULE || '0 6 * * *', // 6 AM daily
  badgeAwardSchedule: process.env.CRON_BADGE_AWARD_SCHEDULE || '0 3 * * *', // 3 AM daily
  notificationBatchSchedule: process.env.CRON_NOTIFICATION_SCHEDULE || '0 */6 * * *', // Every 6 hours

  // Thresholds
  minPostLifetimeDays: parseInt(process.env.MIN_POST_LIFETIME_DAYS || '10', 10),
  inactivityWarningDays: parseInt(process.env.INACTIVITY_WARNING_DAYS || '12', 10),
  postingFrequencyDays: parseInt(process.env.POSTING_FREQUENCY_DAYS || '14', 10),
  viewingFrequencyDays: parseInt(process.env.VIEWING_FREQUENCY_DAYS || '7', 10),

  // Notification settings
  notificationBatchSize: parseInt(process.env.NOTIFICATION_BATCH_SIZE || '50', 10),
  moderatorPseudos: (process.env.MODERATOR_PSEUDOS || '').split(',').filter(Boolean),

  // Health check
  healthCheckEnabled: process.env.CRON_HEALTH_CHECK !== 'false'
};

/**
 * Scheduler class to manage all cron jobs
 */
class ModerationScheduler {
  constructor() {
    this.jobs = new Map();
    this.isRunning = false;
    this.lastHealthCheck = null;
    this.jobStats = new Map();

    // Initialize job stats
    ['roomStateChecks', 'postExpiration', 'userActivity', 'badgeAwards', 'notificationBatching'].forEach(job => {
      this.jobStats.set(job, {
        lastRun: null,
        lastSuccess: null,
        lastError: null,
        runCount: 0,
        errorCount: 0
      });
    });
  }

  /**
   * Start all enabled cron jobs
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Moderation scheduler is already running');
      return;
    }

    logger.info('Starting moderation scheduler...', {
      enabledJobs: {
        roomStateChecks: config.enableRoomStateChecks,
        postExpiration: config.enablePostExpiration,
        userActivityChecks: config.enableUserActivityChecks,
        badgeAwards: config.enableBadgeAwards,
        notificationBatching: config.enableNotificationBatching
      }
    });

    try {
      // Test database connection
      await db.execute('SELECT 1');

      // Initialize cron jobs
      if (config.enableRoomStateChecks) {
        this.initRoomStateChecks();
      }

      if (config.enablePostExpiration) {
        this.initPostExpirationCleanup();
      }

      if (config.enableUserActivityChecks) {
        this.initUserActivityChecks();
      }

      if (config.enableBadgeAwards) {
        this.initBadgeAwards();
      }

      if (config.enableNotificationBatching) {
        this.initNotificationBatching();
      }

      // Start all jobs
      this.jobs.forEach((job, name) => {
        job.start();
        logger.info(`Started cron job: ${name}`);
      });

      this.isRunning = true;
      this.lastHealthCheck = new Date();

      logger.info('Moderation scheduler started successfully', {
        totalJobs: this.jobs.size
      });

      // Setup graceful shutdown handlers
      this.setupShutdownHandlers();

    } catch (error) {
      logger.error('Failed to start moderation scheduler', { error: error.message });
      throw error;
    }
  }

  /**
   * Stop all cron jobs gracefully
   */
  async stop() {
    if (!this.isRunning) {
      logger.warn('Moderation scheduler is not running');
      return;
    }

    logger.info('Stopping moderation scheduler...');

    // Stop all cron jobs
    this.jobs.forEach((job, name) => {
      job.stop();
      logger.info(`Stopped cron job: ${name}`);
    });

    this.jobs.clear();
    this.isRunning = false;

    logger.info('Moderation scheduler stopped successfully');
  }

  /**
   * Initialize Room State Checks job (hourly)
   * - Check all rooms for membership levels
   * - Check for activity requirements (4+ unique posters in 72h)
   * - Auto-lock inactive rooms
   * - Auto-delete rooms below 10 members
   */
  initRoomStateChecks() {
    const job = cron.schedule(config.roomCheckSchedule, async () => {
      const jobName = 'roomStateChecks';
      const startTime = Date.now();

      this.updateJobStat(jobName, 'lastRun', new Date());
      this.updateJobStat(jobName, 'runCount', this.jobStats.get(jobName).runCount + 1);

      try {
        logger.info('[CRON] Starting room state checks');

        // Get all non-deleted rooms
        const query = `
          SELECT id, name, member_count, status, is_locked, activity_score
          FROM community_rooms
          WHERE deleted_at IS NULL
          ORDER BY id ASC
        `;
        const [rooms] = await db.execute(query);

        const results = {
          checked: rooms.length,
          locked: 0,
          unlocked: 0,
          deleted: 0,
          errors: 0
        };

        for (const room of rooms) {
          try {
            // Check current activity
            const activityResult = await CommunityRoom.checkActivity(room.id);
            const { uniquePosters, meetsRequirement } = activityResult;

            logger.info(`Room ${room.id} (${room.name}): ${room.member_count} members, ${uniquePosters} unique posters`, {
              roomId: room.id,
              memberCount: room.member_count,
              uniquePosters,
              status: room.status
            });

            // Check if room should be deleted (< 10 members)
            if (room.member_count < 10) {
              const connection = await db.getConnection();
              try {
                await connection.beginTransaction();
                await CommunityRoom._deleteRoom(connection, room.id);
                await connection.commit();
                results.deleted++;
                logger.info(`Auto-deleted room ${room.id} (${room.name}) - insufficient members`, {
                  roomId: room.id,
                  memberCount: room.member_count
                });
              } catch (error) {
                await connection.rollback();
                throw error;
              } finally {
                connection.release();
              }
              continue;
            }

            // Check if room should be locked/unlocked based on activity
            if (!meetsRequirement && !room.is_locked && room.status === 'active') {
              // Lock inactive room
              await CommunityRoom.lockRoom(room.id, 'Insufficient activity: less than 4 unique posters in 72 hours');
              results.locked++;
              logger.info(`Auto-locked room ${room.id} (${room.name}) - insufficient activity`, {
                roomId: room.id,
                uniquePosters
              });

              // Notify room members
              await this.notifyRoomMembers(room.id, 'room_locked', {
                roomName: room.name,
                reason: 'insufficient_activity'
              });

            } else if (meetsRequirement && room.is_locked && room.status === 'locked') {
              // Unlock room that now meets requirements
              await CommunityRoom.unlockRoom(room.id);
              results.unlocked++;
              logger.info(`Auto-unlocked room ${room.id} (${room.name}) - activity restored`, {
                roomId: room.id,
                uniquePosters
              });

              // Notify room members
              await this.notifyRoomMembers(room.id, 'room_unlocked', {
                roomName: room.name
              });
            }

          } catch (error) {
            results.errors++;
            logger.error(`Error checking room ${room.id}`, {
              roomId: room.id,
              error: error.message
            });
          }
        }

        const duration = Date.now() - startTime;
        logger.info('[CRON] Room state checks completed', {
          ...results,
          durationMs: duration
        });

        this.updateJobStat(jobName, 'lastSuccess', new Date());

      } catch (error) {
        this.updateJobStat(jobName, 'lastError', error.message);
        this.updateJobStat(jobName, 'errorCount', this.jobStats.get(jobName).errorCount + 1);
        logger.error('[CRON] Room state checks failed', { error: error.message, stack: error.stack });
      }
    }, {
      scheduled: false,
      timezone: process.env.TZ || 'UTC'
    });

    this.jobs.set('roomStateChecks', job);
  }

  /**
   * Initialize Post Expiration Cleanup job (daily at midnight)
   * - Find all expired posts
   * - Delete expired posts (respecting minimum lifetime)
   * - Clean up orphaned replies
   * - Log all deletions
   */
  initPostExpirationCleanup() {
    const job = cron.schedule(config.postExpirationSchedule, async () => {
      const jobName = 'postExpiration';
      const startTime = Date.now();

      this.updateJobStat(jobName, 'lastRun', new Date());
      this.updateJobStat(jobName, 'runCount', this.jobStats.get(jobName).runCount + 1);

      try {
        logger.info('[CRON] Starting post expiration cleanup');

        // Process expired posts (handles extension logic internally)
        const deletedPostIds = await Post.processExpiredPosts();

        // Clean up orphaned replies
        let orphanedRepliesDeleted = 0;
        if (deletedPostIds.length > 0) {
          const placeholders = deletedPostIds.map(() => '?').join(',');
          const deleteRepliesQuery = `
            UPDATE post_replies
            SET deleted_at = NOW()
            WHERE post_id IN (${placeholders})
              AND deleted_at IS NULL
          `;
          const [repliesResult] = await db.execute(deleteRepliesQuery, deletedPostIds);
          orphanedRepliesDeleted = repliesResult.affectedRows;
        }

        // Find posts expiring soon (within 3 days) to notify authors
        const expiringPosts = await Post.getExpiringPosts(3);

        for (const post of expiringPosts) {
          await this.sendNotification(post.author_pseudo, 'post_expiring_soon', {
            postId: post.id,
            postTitle: post.title,
            roomName: post.room_name,
            expiresAt: post.expires_at
          });
        }

        const duration = Date.now() - startTime;
        logger.info('[CRON] Post expiration cleanup completed', {
          postsDeleted: deletedPostIds.length,
          orphanedRepliesDeleted,
          expiringPostsNotified: expiringPosts.length,
          durationMs: duration
        });

        this.updateJobStat(jobName, 'lastSuccess', new Date());

      } catch (error) {
        this.updateJobStat(jobName, 'lastError', error.message);
        this.updateJobStat(jobName, 'errorCount', this.jobStats.get(jobName).errorCount + 1);
        logger.error('[CRON] Post expiration cleanup failed', { error: error.message, stack: error.stack });
      }
    }, {
      scheduled: false,
      timezone: process.env.TZ || 'UTC'
    });

    this.jobs.set('postExpiration', job);
  }

  /**
   * Initialize User Activity Checks job (daily at 6 AM)
   * - Check all users' posting frequency (2 weeks)
   * - Check viewing frequency (1 week)
   * - Send warnings to users approaching deadlines
   * - Send notifications to moderators about violations
   */
  initUserActivityChecks() {
    const job = cron.schedule(config.userActivitySchedule, async () => {
      const jobName = 'userActivity';
      const startTime = Date.now();

      this.updateJobStat(jobName, 'lastRun', new Date());
      this.updateJobStat(jobName, 'runCount', this.jobStats.get(jobName).runCount + 1);

      try {
        logger.info('[CRON] Starting user activity checks');

        const results = {
          usersChecked: 0,
          postingWarnings: 0,
          viewingWarnings: 0,
          violations: 0,
          moderatorNotifications: 0
        };

        // Get all active room members
        const membersQuery = `
          SELECT DISTINCT
            rm.user_pseudo,
            rm.room_id,
            rm.last_post_at,
            rm.last_view_at,
            rm.joined_at,
            cr.name as room_name,
            u.is_banned,
            u.ban_until
          FROM room_members rm
          JOIN community_rooms cr ON rm.room_id = cr.id
          JOIN users u ON rm.user_pseudo = u.pseudo
          WHERE cr.deleted_at IS NULL
            AND cr.status = 'active'
            AND (u.is_banned = FALSE OR u.ban_until < NOW())
          ORDER BY rm.user_pseudo, rm.room_id
        `;

        const [members] = await db.execute(membersQuery);
        results.usersChecked = members.length;

        for (const member of members) {
          try {
            const now = new Date();

            // Check posting frequency (14 days required)
            const daysSincePost = member.last_post_at
              ? Math.floor((now - new Date(member.last_post_at)) / (1000 * 60 * 60 * 24))
              : Math.floor((now - new Date(member.joined_at)) / (1000 * 60 * 60 * 24));

            // Check viewing frequency (7 days required)
            const daysSinceView = member.last_view_at
              ? Math.floor((now - new Date(member.last_view_at)) / (1000 * 60 * 60 * 24))
              : Math.floor((now - new Date(member.joined_at)) / (1000 * 60 * 60 * 24));

            // Send warnings for posting inactivity (approaching 14 day limit)
            if (daysSincePost >= config.inactivityWarningDays && daysSincePost < config.postingFrequencyDays) {
              await this.sendNotification(member.user_pseudo, 'posting_inactivity_warning', {
                roomName: member.room_name,
                daysSincePost,
                daysUntilViolation: config.postingFrequencyDays - daysSincePost
              });
              results.postingWarnings++;
            }

            // Send warnings for viewing inactivity (approaching 7 day limit)
            if (daysSinceView >= (config.viewingFrequencyDays - 2) && daysSinceView < config.viewingFrequencyDays) {
              await this.sendNotification(member.user_pseudo, 'viewing_inactivity_warning', {
                roomName: member.room_name,
                daysSinceView,
                daysUntilViolation: config.viewingFrequencyDays - daysSinceView
              });
              results.viewingWarnings++;
            }

            // Detect violations
            const violations = [];
            if (daysSincePost >= config.postingFrequencyDays) {
              violations.push({
                type: 'posting_frequency',
                days: daysSincePost,
                required: config.postingFrequencyDays
              });
            }

            if (daysSinceView >= config.viewingFrequencyDays) {
              violations.push({
                type: 'viewing_frequency',
                days: daysSinceView,
                required: config.viewingFrequencyDays
              });
            }

            // Notify moderators of violations
            if (violations.length > 0) {
              results.violations++;

              for (const moderatorPseudo of config.moderatorPseudos) {
                await this.sendNotification(moderatorPseudo, 'member_activity_violation', {
                  userPseudo: member.user_pseudo,
                  roomId: member.room_id,
                  roomName: member.room_name,
                  violations
                });
              }
              results.moderatorNotifications++;

              logger.info(`Activity violation detected for user ${member.user_pseudo} in room ${member.room_name}`, {
                userPseudo: member.user_pseudo,
                roomId: member.room_id,
                violations
              });
            }

          } catch (error) {
            logger.error(`Error checking activity for user ${member.user_pseudo}`, {
              userPseudo: member.user_pseudo,
              error: error.message
            });
          }
        }

        const duration = Date.now() - startTime;
        logger.info('[CRON] User activity checks completed', {
          ...results,
          durationMs: duration
        });

        this.updateJobStat(jobName, 'lastSuccess', new Date());

      } catch (error) {
        this.updateJobStat(jobName, 'lastError', error.message);
        this.updateJobStat(jobName, 'errorCount', this.jobStats.get(jobName).errorCount + 1);
        logger.error('[CRON] User activity checks failed', { error: error.message, stack: error.stack });
      }
    }, {
      scheduled: false,
      timezone: process.env.TZ || 'UTC'
    });

    this.jobs.set('userActivity', job);
  }

  /**
   * Initialize Badge Awards job (daily at 3 AM)
   * - Check for clean time milestone badges
   * - Check for activity badges
   * - Award appropriate badges automatically
   */
  initBadgeAwards() {
    const job = cron.schedule(config.badgeAwardSchedule, async () => {
      const jobName = 'badgeAwards';
      const startTime = Date.now();

      this.updateJobStat(jobName, 'lastRun', new Date());
      this.updateJobStat(jobName, 'runCount', this.jobStats.get(jobName).runCount + 1);

      try {
        logger.info('[CRON] Starting badge awards');

        const results = {
          usersChecked: 0,
          cleanTimeBadges: 0,
          activityBadges: 0,
          errors: 0
        };

        // Get all active users
        const usersQuery = `
          SELECT pseudo, created_at, post_count, reply_count
          FROM users
          WHERE is_banned = FALSE OR ban_until < NOW()
        `;
        const [users] = await db.execute(usersQuery);
        results.usersChecked = users.length;

        for (const user of users) {
          try {
            // Calculate days since account creation
            const daysSinceCreation = Math.floor(
              (Date.now() - new Date(user.created_at)) / (1000 * 60 * 60 * 24)
            );

            // Check for clean time milestone badges
            const milestones = [
              { days: 30, badge: 'clean_30_days' },
              { days: 60, badge: 'clean_60_days' },
              { days: 90, badge: 'clean_90_days' },
              { days: 180, badge: 'clean_6_months' },
              { days: 365, badge: 'clean_1_year' }
            ];

            for (const milestone of milestones) {
              if (daysSinceCreation >= milestone.days) {
                // Check if user already has this badge
                const hasBadge = await Badge.userHasBadge(user.pseudo, milestone.badge);

                if (!hasBadge) {
                  // Award the badge
                  const result = await Badge.awardBadge(
                    user.pseudo,
                    milestone.badge,
                    null, // System award
                    `Achieved ${milestone.days} days of participation`
                  );

                  if (result.success) {
                    results.cleanTimeBadges++;
                    logger.info(`Awarded ${milestone.badge} to ${user.pseudo}`, {
                      userPseudo: user.pseudo,
                      badge: milestone.badge,
                      days: daysSinceCreation
                    });

                    // Notify user
                    await this.sendNotification(user.pseudo, 'badge_awarded', {
                      badgeName: result.badgeName,
                      badgeType: 'milestone',
                      days: milestone.days
                    });
                  }
                }
              }
            }

            // Check for activity badges
            const totalActivity = user.post_count + user.reply_count;

            const activityMilestones = [
              { count: 10, badge: 'active_contributor' },
              { count: 50, badge: 'prolific_contributor' },
              { count: 100, badge: 'super_contributor' }
            ];

            for (const milestone of activityMilestones) {
              if (totalActivity >= milestone.count) {
                const hasBadge = await Badge.userHasBadge(user.pseudo, milestone.badge);

                if (!hasBadge) {
                  const result = await Badge.awardBadge(
                    user.pseudo,
                    milestone.badge,
                    null,
                    `Reached ${milestone.count} total contributions`
                  );

                  if (result.success) {
                    results.activityBadges++;
                    logger.info(`Awarded ${milestone.badge} to ${user.pseudo}`, {
                      userPseudo: user.pseudo,
                      badge: milestone.badge,
                      totalActivity
                    });

                    await this.sendNotification(user.pseudo, 'badge_awarded', {
                      badgeName: result.badgeName,
                      badgeType: 'activity',
                      count: milestone.count
                    });
                  }
                }
              }
            }

          } catch (error) {
            results.errors++;
            logger.error(`Error processing badges for user ${user.pseudo}`, {
              userPseudo: user.pseudo,
              error: error.message
            });
          }
        }

        const duration = Date.now() - startTime;
        logger.info('[CRON] Badge awards completed', {
          ...results,
          durationMs: duration
        });

        this.updateJobStat(jobName, 'lastSuccess', new Date());

      } catch (error) {
        this.updateJobStat(jobName, 'lastError', error.message);
        this.updateJobStat(jobName, 'errorCount', this.jobStats.get(jobName).errorCount + 1);
        logger.error('[CRON] Badge awards failed', { error: error.message, stack: error.stack });
      }
    }, {
      scheduled: false,
      timezone: process.env.TZ || 'UTC'
    });

    this.jobs.set('badgeAwards', job);
  }

  /**
   * Initialize Notification Batching job (every 6 hours)
   * - Batch notifications for users
   * - Send digest emails if configured
   */
  initNotificationBatching() {
    const job = cron.schedule(config.notificationBatchSchedule, async () => {
      const jobName = 'notificationBatching';
      const startTime = Date.now();

      this.updateJobStat(jobName, 'lastRun', new Date());
      this.updateJobStat(jobName, 'runCount', this.jobStats.get(jobName).runCount + 1);

      try {
        logger.info('[CRON] Starting notification batching');

        const results = {
          usersBatched: 0,
          notificationsSent: 0,
          digestsSent: 0,
          errors: 0
        };

        // Get pending notifications
        const notificationsQuery = `
          SELECT
            user_pseudo,
            COUNT(*) as notification_count,
            GROUP_CONCAT(
              JSON_OBJECT(
                'type', notification_type,
                'data', notification_data,
                'created_at', created_at
              )
              ORDER BY created_at DESC
            ) as notifications
          FROM user_notifications
          WHERE sent_at IS NULL
            AND scheduled_for <= NOW()
          GROUP BY user_pseudo
          LIMIT ?
        `;

        const [notificationGroups] = await db.execute(notificationsQuery, [config.notificationBatchSize]);

        for (const group of notificationGroups) {
          try {
            const notifications = JSON.parse(`[${group.notifications}]`);

            // Process each notification
            for (const notification of notifications) {
              await this.processNotification(group.user_pseudo, notification);
              results.notificationsSent++;
            }

            // Mark notifications as sent
            const updateQuery = `
              UPDATE user_notifications
              SET sent_at = NOW()
              WHERE user_pseudo = ?
                AND sent_at IS NULL
            `;
            await db.execute(updateQuery, [group.user_pseudo]);

            // Send digest email if user has email configured
            if (group.notification_count > 5) {
              await this.sendDigestEmail(group.user_pseudo, notifications);
              results.digestsSent++;
            }

            results.usersBatched++;

          } catch (error) {
            results.errors++;
            logger.error(`Error processing notifications for user ${group.user_pseudo}`, {
              userPseudo: group.user_pseudo,
              error: error.message
            });
          }
        }

        const duration = Date.now() - startTime;
        logger.info('[CRON] Notification batching completed', {
          ...results,
          durationMs: duration
        });

        this.updateJobStat(jobName, 'lastSuccess', new Date());

      } catch (error) {
        this.updateJobStat(jobName, 'lastError', error.message);
        this.updateJobStat(jobName, 'errorCount', this.jobStats.get(jobName).errorCount + 1);
        logger.error('[CRON] Notification batching failed', { error: error.message, stack: error.stack });
      }
    }, {
      scheduled: false,
      timezone: process.env.TZ || 'UTC'
    });

    this.jobs.set('notificationBatching', job);
  }

  /**
   * Send a notification to a user
   * @private
   */
  async sendNotification(userPseudo, notificationType, data) {
    try {
      const insertQuery = `
        INSERT INTO user_notifications (
          user_pseudo, notification_type, notification_data, created_at, scheduled_for
        ) VALUES (?, ?, ?, NOW(), NOW())
      `;

      await db.execute(insertQuery, [
        userPseudo,
        notificationType,
        JSON.stringify(data)
      ]);

    } catch (error) {
      logger.error('Error sending notification', {
        userPseudo,
        notificationType,
        error: error.message
      });
    }
  }

  /**
   * Notify all members of a room
   * @private
   */
  async notifyRoomMembers(roomId, notificationType, data) {
    try {
      const membersQuery = `
        SELECT user_pseudo
        FROM room_members
        WHERE room_id = ?
      `;
      const [members] = await db.execute(membersQuery, [roomId]);

      for (const member of members) {
        await this.sendNotification(member.user_pseudo, notificationType, data);
      }

    } catch (error) {
      logger.error('Error notifying room members', {
        roomId,
        error: error.message
      });
    }
  }

  /**
   * Process a single notification (placeholder for actual implementation)
   * @private
   */
  async processNotification(userPseudo, notification) {
    // This is a placeholder for actual notification processing
    // In production, this would integrate with a notification service,
    // WebSocket server, push notification service, etc.

    logger.info('Processing notification', {
      userPseudo,
      type: notification.type,
      createdAt: notification.created_at
    });

    // Integration points:
    // - WebSocket: await websocketService.send(userPseudo, notification);
    // - Push: await pushService.send(userPseudo, notification);
    // - In-app: Already stored in database, just mark as sent
  }

  /**
   * Send a digest email (placeholder for actual implementation)
   * @private
   */
  async sendDigestEmail(userPseudo, notifications) {
    // This is a placeholder for email digest functionality
    // In production, this would integrate with an email service

    logger.info('Sending digest email', {
      userPseudo,
      notificationCount: notifications.length
    });

    // Integration point:
    // await emailService.sendDigest(userPseudo, {
    //   notifications,
    //   period: '6 hours',
    //   template: 'notification_digest'
    // });
  }

  /**
   * Update job statistics
   * @private
   */
  updateJobStat(jobName, field, value) {
    const stats = this.jobStats.get(jobName);
    if (stats) {
      stats[field] = value;
      this.jobStats.set(jobName, stats);
    }
  }

  /**
   * Get health check status
   */
  getHealthStatus() {
    const status = {
      isRunning: this.isRunning,
      activeJobs: this.jobs.size,
      lastHealthCheck: this.lastHealthCheck,
      jobs: {}
    };

    this.jobStats.forEach((stats, jobName) => {
      status.jobs[jobName] = {
        ...stats,
        isHealthy: stats.errorCount === 0 || (stats.lastSuccess && stats.lastSuccess > stats.lastError)
      };
    });

    return status;
  }

  /**
   * Setup graceful shutdown handlers
   * @private
   */
  setupShutdownHandlers() {
    const shutdown = async (signal) => {
      logger.info(`Received ${signal} signal, shutting down gracefully...`);
      await this.stop();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  /**
   * Run a specific job immediately (for testing/manual triggers)
   */
  async runJobNow(jobName) {
    const job = this.jobs.get(jobName);
    if (!job) {
      throw new Error(`Job not found: ${jobName}`);
    }

    logger.info(`Manually triggering job: ${jobName}`);

    // Note: node-cron doesn't expose a direct way to trigger a job manually,
    // so we need to implement manual trigger methods for each job type
    switch (jobName) {
      case 'roomStateChecks':
        return await this.manualRoomStateCheck();
      case 'postExpiration':
        return await this.manualPostExpiration();
      case 'userActivity':
        return await this.manualUserActivityCheck();
      case 'badgeAwards':
        return await this.manualBadgeAwards();
      case 'notificationBatching':
        return await this.manualNotificationBatch();
      default:
        throw new Error(`Manual trigger not implemented for job: ${jobName}`);
    }
  }

  /**
   * Manual trigger methods (extract core logic for reuse)
   */
  async manualRoomStateCheck() {
    // Implementation would be extracted from initRoomStateChecks
    logger.info('Manual room state check triggered');
    // ... reuse logic from cron job
  }

  async manualPostExpiration() {
    logger.info('Manual post expiration triggered');
    // ... reuse logic from cron job
  }

  async manualUserActivityCheck() {
    logger.info('Manual user activity check triggered');
    // ... reuse logic from cron job
  }

  async manualBadgeAwards() {
    logger.info('Manual badge awards triggered');
    // ... reuse logic from cron job
  }

  async manualNotificationBatch() {
    logger.info('Manual notification batch triggered');
    // ... reuse logic from cron job
  }
}

// Create singleton instance
const scheduler = new ModerationScheduler();

// Export scheduler instance and class
module.exports = scheduler;
module.exports.ModerationScheduler = ModerationScheduler;
module.exports.config = config;
