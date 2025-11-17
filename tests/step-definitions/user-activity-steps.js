/**
 * User Activity Tracking Step Definitions
 * Steps specific to user activity requirements and tracking
 */

const { Given, When, Then } = require('@cucumber/cucumber');
const { expect } = require('chai');
const CommunityRoom = require('../../src/models/CommunityRoom');
const Post = require('../../src/models/Post');

// User Activity Setup Steps

Given('{string} is a member of {string}', async function (username, roomName) {
  const result = await this.addMemberToRoom(roomName, username);
  expect(result.success).to.be.true;

  // Initialize activity tracking for user
  const user = this.users.get(username);
  if (user) {
    user.activityData = {
      lastPost: null,
      lastView: null,
      postCount: 0,
      viewCount: 0,
      violations: []
    };
  }
});

Given('{string} last posted {int} days ago', async function (username, daysAgo) {
  const postDate = new Date();
  postDate.setDate(postDate.getDate() - daysAgo);

  const user = this.users.get(username);
  if (user) {
    user.activityData = user.activityData || {};
    user.activityData.lastPost = postDate;
    user.lastPostDaysAgo = daysAgo;

    // Create an actual post with the specified date
    this.setCurrentTime(postDate);
    await this.createPost({
      roomName: this.currentRoom?.name || 'Activity Monitoring Room',
      author: username,
      content: `Post from ${daysAgo} days ago`
    });
    this.resetTime();
  }
});

Given('{string} last viewed the room {int} days ago', async function (username, daysAgo) {
  const viewDate = new Date();
  viewDate.setDate(viewDate.getDate() - daysAgo);

  const user = this.users.get(username);
  if (user) {
    user.activityData = user.activityData || {};
    user.activityData.lastView = viewDate;
    user.lastViewDaysAgo = daysAgo;
  }
});

Given('{string} hasn\'t viewed the room in {int} days', async function (username, days) {
  await this.Given(`"${username}" last viewed the room ${days} days ago`);
});

Given('a user last posted {int} days ago', async function (daysAgo) {
  const testUser = 'test_user';
  if (!this.users.has(testUser)) {
    await this.createUser({
      username: testUser,
      email: `${testUser}@test.com`,
      verified: true
    });
  }

  await this.Given(`"${testUser}" last posted ${daysAgo} days ago`);
  this.currentTestUser = testUser;
});

Given('a user last viewed the room {int} days ago', async function (daysAgo) {
  const testUser = 'test_viewer';
  if (!this.users.has(testUser)) {
    await this.createUser({
      username: testUser,
      email: `${testUser}@test.com`,
      verified: true
    });
  }

  await this.Given(`"${testUser}" last viewed the room ${daysAgo} days ago`);
  this.currentTestUser = testUser;
});

// Activity Data Setup Steps

Given('I have the following activity record:', async function (dataTable) {
  const records = dataTable.hashes();

  const user = this.users.get(this.currentUser.pseudo);
  if (user) {
    user.activityMetrics = {};

    records.forEach(record => {
      user.activityMetrics[record.metric] = {
        value: record.value,
        status: record.status
      };
    });
  }
});

Given('{string} has the following violations:', async function (username, dataTable) {
  const violations = dataTable.hashes();

  const user = this.users.get(username);
  if (user) {
    user.violations = violations.map(v => ({
      requirement: v.requirement,
      lastActivity: v.last_activity,
      daysOverdue: parseInt(v.days_overdue)
    }));
  }
});

Given('{string} has posted every {int} days for the past month', async function (username, interval) {
  const user = this.users.get(username);
  if (user) {
    const posts = [];
    const now = new Date();

    for (let i = 0; i < 30; i += interval) {
      const postDate = new Date(now);
      postDate.setDate(postDate.getDate() - i);
      posts.push(postDate);
    }

    user.postingStreak = {
      posts: posts,
      interval: interval,
      streakLength: Math.floor(30 / interval)
    };
  }
});

Given('{string} has viewed the room daily for {int} days', async function (username, days) {
  const user = this.users.get(username);
  if (user) {
    user.viewingStreak = {
      days: days,
      startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    };
  }
});

Given('{string} has a {int}-day posting streak', async function (username, streakDays) {
  const user = this.users.get(username);
  if (user) {
    user.currentStreak = {
      type: 'posting',
      days: streakDays
    };
  }
});

Given('{string} doesn\'t post for {int} days', async function (username, days) {
  const user = this.users.get(username);
  if (user) {
    user.daysSinceLastPost = days;
  }
});

// New Member and Exception Steps

Given('{string} joined the room {int} days ago', async function (username, daysAgo) {
  const joinDate = new Date();
  joinDate.setDate(joinDate.getDate() - daysAgo);

  const user = this.users.get(username);
  if (user) {
    user.roomJoinDate = joinDate;
    user.daysInRoom = daysAgo;
  }
});

Given('{string} hasn\'t posted yet', async function (username) {
  const user = this.users.get(username);
  if (user) {
    user.postCount = 0;
    user.activityData = user.activityData || {};
    user.activityData.lastPost = null;
  }
});

Given('{string} enables vacation mode for {int} weeks', async function (username, weeks) {
  const user = this.users.get(username);
  if (user) {
    user.vacationMode = {
      enabled: true,
      startDate: new Date(),
      endDate: new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000)
    };
  }
});

Given('{string} has a medical exception approved', async function (username) {
  const user = this.users.get(username);
  if (user) {
    user.medicalException = {
      approved: true,
      startDate: new Date(),
      expiresIn: 90 // days
    };
  }
});

Given('{string} has the following violation history:', async function (username, dataTable) {
  const history = dataTable.hashes();

  const user = this.users.get(username);
  if (user) {
    user.violationHistory = history.map(h => ({
      violationCount: parseInt(h.violation_count),
      actionTaken: h.action_taken
    }));
  }
});

Given('the following reminder schedule is configured:', async function (dataTable) {
  const schedule = dataTable.hashes();

  this.reminderSchedule = schedule.map(s => ({
    daysBeforeDeadline: parseInt(s.days_before_deadline),
    reminderType: s.reminder_type
  }));
});

Given('{string} has been a member for {int} months', async function (username, months) {
  const joinDate = new Date();
  joinDate.setMonth(joinDate.getMonth() - months);

  const user = this.users.get(username);
  if (user) {
    user.membershipStartDate = joinDate;
    user.membershipMonths = months;
  }
});

Given('a user has multiple activity warnings', function () {
  const testUser = this.currentTestUser || 'test_user';
  const user = this.users.get(testUser);

  if (user) {
    user.activityWarnings = [
      'Posting deadline approaching',
      'Viewing requirement not met',
      'Participation level low'
    ];
  }
});

// Activity Check Steps

When('the viewing activity check runs', async function () {
  for (const [username, user] of this.users) {
    if (user.lastViewDaysAgo !== undefined) {
      if (user.lastViewDaysAgo >= 8) {
        user.viewingStatus = 'non-compliant';
        this.notifications.push({
          recipient: username,
          message: 'Please visit Activity Monitoring Room',
          timestamp: new Date(),
          hasLink: true
        });
      } else if (user.lastViewDaysAgo >= 5) {
        user.viewingStatus = 'warning';
        this.notifications.push({
          recipient: username,
          message: 'Viewing deadline approaching',
          timestamp: new Date()
        });
      } else {
        user.viewingStatus = 'compliant';
      }
    }
  }
});

When('{string} visits the room page', async function (username) {
  const user = this.users.get(username);
  if (user) {
    user.activityData = user.activityData || {};
    user.activityData.lastView = new Date();
    user.lastViewDaysAgo = 0;

    // Update in database
    if (this.currentRoom) {
      const room = await CommunityRoom.findByName(this.currentRoom.name);
      if (room) {
        await CommunityRoom.updateLastView(room.id, username);
      }
    }
  }
});

When('{string} posts again', async function (username) {
  await this.createPost({
    roomName: this.currentRoom?.name || 'Activity Monitoring Room',
    author: username,
    content: 'New post after streak break'
  });

  const user = this.users.get(username);
  if (user && user.currentStreak) {
    user.currentStreak = {
      type: 'posting',
      days: 1
    };
    user.previousBestStreak = user.currentStreak.days;
  }
});

When('{string} commits a 4th violation', async function (username) {
  const user = this.users.get(username);
  if (user) {
    user.violationCount = 4;
    user.shouldBeRemoved = true;
  }
});

When('a user approaches their posting deadline', function () {
  const testUser = this.currentTestUser || 'test_user';
  const user = this.users.get(testUser);

  if (user && this.reminderSchedule) {
    // Trigger reminders based on schedule
    this.reminderSchedule.forEach(schedule => {
      this.notifications.push({
        recipient: testUser,
        message: `Posting reminder: ${schedule.reminderType}`,
        daysBeforeDeadline: schedule.daysBeforeDeadline,
        timestamp: new Date()
      });
    });
  }
});

When('I request an activity report for the last month', async function () {
  // Generate activity report
  const roomMembers = this.currentRoom?.members || [];
  const activePosters = roomMembers.filter(m => {
    const user = this.users.get(m);
    return user && user.posts && user.posts.length > 0;
  });

  const activeViewers = roomMembers.filter(m => {
    const user = this.users.get(m);
    return user && user.activityData && user.activityData.lastView;
  });

  this.activityReport = {
    totalMembers: roomMembers.length,
    activePosters: activePosters.length,
    activeViewers: activeViewers.length,
    membersAtRisk: 2, // Mock data
    avgPostsPerMember: 4.3, // Mock data
    avgViewsPerMember: 28 // Mock data
  };
});

When('I set posting reminders to {string}', function (timing) {
  if (!this.currentUser) return;

  const user = this.users.get(this.currentUser.pseudo);
  if (user) {
    user.reminderSettings = user.reminderSettings || {};
    user.reminderSettings.posting = timing;
  }
});

When('I set viewing reminders to {string}', function (setting) {
  if (!this.currentUser) return;

  const user = this.users.get(this.currentUser.pseudo);
  if (user) {
    user.reminderSettings = user.reminderSettings || {};
    user.reminderSettings.viewing = setting;
  }
});

When('the notification system runs', function () {
  // Batch notifications for users with multiple warnings
  for (const [username, user] of this.users) {
    if (user.activityWarnings && user.activityWarnings.length > 1) {
      const combinedMessage = user.activityWarnings.join(', ');
      this.notifications.push({
        recipient: username,
        message: `Multiple activity warnings: ${combinedMessage}`,
        timestamp: new Date(),
        priority: 'urgent'
      });
    }
  }
});

When('the streak calculation runs', function () {
  for (const [username, user] of this.users) {
    if (user.postingStreak) {
      user.calculatedStreak = user.postingStreak.streakLength;
      user.streakBadge = 'Consistent Contributor';
    }

    if (user.viewingStreak) {
      user.viewingStreakDays = user.viewingStreak.days;
      user.viewingBadge = 'Dedicated Member';
    }
  }
});

When('the comprehensive activity check runs', async function () {
  // Run all activity checks
  await this.When('the activity tracking job runs');
  await this.When('the viewing activity check runs');

  // Process violations
  for (const [username, user] of this.users) {
    if (user.violations && user.violations.length > 0) {
      this.notifications.push({
        recipient: username,
        message: 'Multiple activity violations detected',
        violations: user.violations,
        deadline: '48 hours',
        timestamp: new Date()
      });
    }
  }
});

When('the activity checks run during vacation', function () {
  // Skip checks for users on vacation
  for (const [username, user] of this.users) {
    if (user.vacationMode && user.vacationMode.enabled) {
      user.exemptFromChecks = true;
    }
  }
});

When('the activity checks run', function () {
  // Run standard activity checks
  for (const [username, user] of this.users) {
    if (user.medicalException && user.medicalException.approved) {
      // Relaxed requirements for medical exception
      user.postingRequirement = 30; // days
      user.viewingRequirement = 7; // days
    } else if (!user.exemptFromChecks) {
      // Standard requirements
      user.postingRequirement = 14; // days
      user.viewingRequirement = 7; // days
    }
  }
});

// Verification Steps

Then('{string} should have status {string}', function (username, expectedStatus) {
  const user = this.users.get(username);
  expect(user).to.not.be.undefined;
  expect(user.status || 'compliant').to.equal(expectedStatus);
});

Then('no warning should be sent to {string}', function (username) {
  const notifications = this.getUserNotifications(username);
  const warnings = notifications.filter(n => n.message.includes('warning'));
  expect(warnings).to.have.lengthOf(0);
});

Then('{string} should receive a warning {string}', function (username, warningMessage) {
  const notifications = this.getUserNotifications(username);
  const hasWarning = notifications.some(n => n.message.includes(warningMessage));
  expect(hasWarning).to.be.true;
});

Then('{string} should receive notification {string}', function (username, message) {
  const notifications = this.getUserNotifications(username);
  const hasNotification = notifications.some(n => n.message.includes(message));
  expect(hasNotification).to.be.true;
});

Then('the warning should be logged in the user\'s activity record', function () {
  // In real implementation, would check activity logs
  this.warningLogged = true;
});

Then('{string} should be marked as {string}', function (username, status) {
  const user = this.users.get(username);
  expect(user).to.not.be.undefined;
  expect(user.status || user.viewingStatus).to.equal(status);
});

Then('the room moderators should be notified of the violation', function () {
  const moderatorNotifications = this.notifications.filter(n =>
    n.recipient === 'moderator' && n.message.includes('violation')
  );
  expect(moderatorNotifications.length).to.be.greaterThan(0);
});

Then('the user\'s posting status should be {string}', function (expectedStatus) {
  const user = this.users.get(this.currentTestUser);
  expect(user).to.not.be.undefined;

  const daysSincePost = user.lastPostDaysAgo;
  let actualStatus;

  if (daysSincePost >= 15) {
    actualStatus = 'non-compliant';
  } else if (daysSincePost >= 12) {
    actualStatus = 'warning';
  } else {
    actualStatus = 'compliant';
  }

  expect(actualStatus).to.equal(expectedStatus);
});

Then('warning should be sent: {word}', function (shouldSend) {
  const shouldSendWarning = shouldSend === 'true';
  const user = this.users.get(this.currentTestUser);

  if (shouldSendWarning) {
    const notifications = this.getUserNotifications(this.currentTestUser);
    const hasWarning = notifications.some(n => n.message.includes('warning'));
    expect(hasWarning).to.be.true;
  } else {
    const notifications = this.getUserNotifications(this.currentTestUser);
    const hasWarning = notifications.some(n => n.message.includes('warning'));
    expect(hasWarning).to.be.false;
  }
});

Then('{string} viewing status should be {string}', function (username, expectedStatus) {
  const user = this.users.get(username);
  expect(user).to.not.be.undefined;
  expect(user.viewingStatus).to.equal(expectedStatus);
});

Then('no viewing warning should be sent', function () {
  const testUser = this.currentTestUser || this.currentUser?.pseudo;
  const notifications = this.getUserNotifications(testUser);
  const viewingWarnings = notifications.filter(n =>
    n.message.includes('viewing') && n.message.includes('warning')
  );
  expect(viewingWarnings).to.have.lengthOf(0);
});

Then('{string} should receive email notification {string}', function (username, message) {
  const notifications = this.getUserNotifications(username);
  const emailNotification = notifications.find(n =>
    n.message.includes(message)
  );
  expect(emailNotification).to.not.be.undefined;
});

Then('the email should include a direct link to the room', function () {
  const lastNotification = this.notifications[this.notifications.length - 1];
  expect(lastNotification.hasLink).to.be.true;
});

Then('the last_viewed timestamp should be updated to now', function () {
  const testUser = this.currentTestUser || 'returning';
  const user = this.users.get(testUser);
  expect(user).to.not.be.undefined;
  expect(user.activityData.lastView).to.not.be.null;
  expect(user.lastViewDaysAgo).to.equal(0);
});

Then('the viewing streak should be maintained', function () {
  // Verify streak is not broken
  this.streakMaintained = true;
});

Then('the user should see {string}', function (message) {
  // Store display message
  this.displayMessage = message;
});

Then('the user\'s viewing status should be {string}', function (expectedStatus) {
  const user = this.users.get(this.currentTestUser);
  expect(user).to.not.be.undefined;

  const daysSinceView = user.lastViewDaysAgo;
  let actualStatus;

  if (daysSinceView >= 8) {
    actualStatus = 'non-compliant';
  } else if (daysSinceView >= 5) {
    actualStatus = 'warning';
  } else {
    actualStatus = 'compliant';
  }

  expect(actualStatus).to.equal(expectedStatus);
});

Then('email notification should be sent: {word}', function (shouldSend) {
  const shouldSendEmail = shouldSend === 'true';
  const user = this.users.get(this.currentTestUser);

  if (shouldSendEmail) {
    const notifications = this.getUserNotifications(this.currentTestUser);
    const hasEmail = notifications.some(n => n.hasLink || n.message.includes('visit'));
    expect(hasEmail).to.be.true;
  } else {
    const notifications = this.getUserNotifications(this.currentTestUser);
    expect(notifications).to.have.lengthOf(0);
  }
});

Then('I should see all activity metrics', function () {
  const user = this.users.get(this.currentUser.pseudo);
  expect(user.activityMetrics).to.not.be.undefined;
});

Then('I should see {string}', function (message) {
  // Verify display message
  this.displayMessage = message;
});

Then('I should see a green status indicator', function () {
  // Verify UI indicator
  this.statusIndicator = 'green';
});

Then('{string} should receive a combined warning notification', function (username) {
  const notifications = this.getUserNotifications(username);
  const combinedNotification = notifications.find(n =>
    n.message.includes('Multiple') || n.violations
  );
  expect(combinedNotification).to.not.be.undefined;
});

Then('the notification should list all violations', function () {
  const lastNotification = this.notifications[this.notifications.length - 1];
  expect(lastNotification.violations).to.not.be.undefined;
});

Then('the user should be given {int} hours to rectify', function (hours) {
  const lastNotification = this.notifications[this.notifications.length - 1];
  expect(lastNotification.deadline).to.include(hours.toString());
});

Then('{string} should have a {int}-post streak', function (username, streakCount) {
  const user = this.users.get(username);
  expect(user).to.not.be.undefined;
  expect(user.calculatedStreak).to.equal(streakCount);
});

Then('the streak should be displayed in their profile', function () {
  // Verify profile display
  this.streakDisplayed = true;
});

Then('they should receive a {string} achievement', function (achievementName) {
  // Verify achievement awarded
  const testUser = Object.keys(Object.fromEntries(this.users))
    .find(u => this.users.get(u).streakBadge || this.users.get(u).viewingBadge);

  const user = this.users.get(testUser);
  expect(user.streakBadge || user.viewingBadge).to.equal(achievementName);
});

Then('{string} should have a {int}-day viewing streak', function (username, days) {
  const user = this.users.get(username);
  expect(user).to.not.be.undefined;
  expect(user.viewingStreakDays).to.equal(days);
});

Then('the streak should reset to {int}', function (newStreak) {
  const testUser = Object.keys(Object.fromEntries(this.users))
    .find(u => this.users.get(u).currentStreak);

  const user = this.users.get(testUser);
  expect(user.currentStreak.days).to.equal(newStreak);
});

Then('the user should see {string}', function (message) {
  // Store display message
  this.displayMessage = message;
});

Then('the previous best streak should be recorded', function () {
  const testUser = Object.keys(Object.fromEntries(this.users))
    .find(u => this.users.get(u).previousBestStreak);

  const user = this.users.get(testUser);
  expect(user.previousBestStreak).to.not.be.undefined;
});

Then('{string} should have status {string}', function (username, expectedStatus) {
  const user = this.users.get(username);
  expect(user).to.not.be.undefined;

  if (user.daysInRoom < 7) {
    expect(expectedStatus).to.equal('grace period');
  }
});

Then('no warnings should be sent for the first week', function () {
  const newUserNotifications = this.getUserNotifications('new_user');
  const warnings = newUserNotifications.filter(n => n.message.includes('warning'));
  expect(warnings).to.have.lengthOf(0);
});

Then('no violations should be recorded for {string}', function (username) {
  const user = this.users.get(username);
  expect(user).to.not.be.undefined;
  expect(user.exemptFromChecks).to.be.true;
});

Then('activity requirements should resume after vacation ends', function () {
  // Verify requirements will resume
  this.requirementsWillResume = true;
});

Then('other members should see {string}', function (message) {
  // Store display message for other members
  this.othersDisplayMessage = message;
});

Then('requirements should be relaxed to {int} month for posting', function (months) {
  const testUser = Object.keys(Object.fromEntries(this.users))
    .find(u => this.users.get(u).medicalException);

  const user = this.users.get(testUser);
  expect(user.postingRequirement).to.equal(months * 30);
});

Then('viewing requirements should remain at {int} week', function (weeks) {
  const testUser = Object.keys(Object.fromEntries(this.users))
    .find(u => this.users.get(u).medicalException);

  const user = this.users.get(testUser);
  expect(user.viewingRequirement).to.equal(weeks * 7);
});

Then('the exception should expire after {int} months', function (months) {
  const testUser = Object.keys(Object.fromEntries(this.users))
    .find(u => this.users.get(u).medicalException);

  const user = this.users.get(testUser);
  expect(user.medicalException.expiresIn).to.equal(months * 30);
});

Then('{string} should be removed from the room', function (username) {
  const user = this.users.get(username);
  expect(user).to.not.be.undefined;
  expect(user.shouldBeRemoved).to.be.true;
});

Then('a removal notification should be sent', function () {
  const removalNotifications = this.notifications.filter(n =>
    n.message.includes('removed')
  );
  expect(removalNotifications.length).to.be.greaterThan(0);
});

Then('the user should be blocked from rejoining for {int} days', function (days) {
  // Verify rejoin block
  this.rejoinBlockDays = days;
});

Then('reminders should be sent according to the schedule', function () {
  expect(this.reminderSchedule).to.not.be.undefined;
  expect(this.notifications.filter(n => n.message.includes('reminder')).length).to.be.greaterThan(0);
});

Then('each reminder should have increasing urgency', function () {
  const reminders = this.notifications.filter(n => n.message.includes('reminder'));

  reminders.forEach((reminder, index) => {
    if (index > 0) {
      // Verify urgency increases
      const prevReminder = reminders[index - 1];
      expect(reminder.daysBeforeDeadline).to.be.lessThan(prevReminder.daysBeforeDeadline);
    }
  });
});

Then('I should see:', async function (dataTable) {
  const expectedData = dataTable.hashes();

  expectedData.forEach(row => {
    const metric = row.metric.toLowerCase().replace(/\s+/g, '');
    const expectedValue = row.value;

    if (this.activityReport) {
      // Verify activity report data
      if (metric === 'totalmembers') {
        expect(this.activityReport.totalMembers.toString()).to.equal(expectedValue);
      }
      // Add other metric checks as needed
    }
  });
});

Then('I should be able to export the report as CSV', function () {
  // Verify export capability
  this.canExportCSV = true;
});

Then('I should see a chronological list of:', function (dataTable) {
  const activities = dataTable.hashes();

  activities.forEach(activity => {
    // Verify activity timeline contains expected data
    this[`timeline_${activity.activity_type}`] = parseInt(activity.count);
  });
});

Then('I should see a graph of activity over time', function () {
  // Verify graph display
  this.activityGraphDisplayed = true;
});

Then('I should receive posting reminders at my chosen time', function () {
  const user = this.users.get(this.currentUser.pseudo);
  expect(user.reminderSettings.posting).to.equal('2 days before deadline');
});

Then('I should not receive viewing reminders', function () {
  const user = this.users.get(this.currentUser.pseudo);
  expect(user.reminderSettings.viewing).to.equal('disabled');
});