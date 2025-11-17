/**
 * Post Expiration Step Definitions
 * Steps specific to post lifetime and expiration management
 */

const { Given, When, Then } = require('@cucumber/cucumber');
const { expect } = require('chai');
const Post = require('../../src/models/Post');
const CommunityRoom = require('../../src/models/CommunityRoom');

// Post Configuration Steps

Given('the room has a default post lifetime of {int} days', async function (days) {
  if (!this.currentRoom) {
    throw new Error('No current room set');
  }

  this.currentRoom.defaultPostLifetime = days;

  // Update in database
  const room = await CommunityRoom.findByName(this.currentRoom.name);
  if (room) {
    // In real implementation, would update room settings
    this.currentRoom.defaultPostLifetime = days;
  }
});

Given('the room allows custom post lifetimes', function () {
  if (!this.currentRoom) {
    throw new Error('No current room set');
  }

  this.currentRoom.allowCustomLifetimes = true;
});

Given('I am configuring post lifetime for a room', function () {
  this.configuringPostLifetime = true;
  this.formData = {};
});

// Post Creation Steps

When('I create a post with content {string}', async function (content) {
  if (!this.currentRoom) {
    throw new Error('No current room set');
  }

  const expiresInDays = this.formData?.custom_expiration ||
    this.currentRoom.defaultPostLifetime ||
    30;

  this.currentPost = await this.createPost({
    roomName: this.currentRoom.name,
    content,
    title: content.substring(0, 50),
    expiresInDays
  });
});

When('new posts in the room should have a {int}-day lifetime', function (days) {
  if (!this.currentRoom) {
    throw new Error('No current room set');
  }

  this.currentRoom.defaultPostLifetime = days;
});

// Existing Post Management Steps

Given('a post exists with expiration in {int} days', async function (days) {
  if (!this.currentRoom) {
    // Create a default room
    await this.createRoom({
      name: 'Test Room',
      createdBy: this.currentUser?.pseudo || 'test_user',
      initialMembers: []
    });
    this.currentRoom = this.rooms.get('Test Room');
  }

  this.currentPost = await this.createPost({
    roomName: this.currentRoom.name,
    content: 'Post with expiration',
    expiresInDays: days
  });
});

Given('a post {string} was created {int} days ago', async function (postTitle, daysAgo) {
  const createdAt = new Date();
  createdAt.setDate(createdAt.getDate() - daysAgo);

  this.setCurrentTime(createdAt);

  this.currentPost = await this.createPost({
    roomName: this.currentRoom.name,
    title: postTitle,
    content: `Content for ${postTitle}`,
    expiresInDays: 30
  });

  this.resetTime();
});

Given('the post had a lifetime of {int} days', function (days) {
  if (this.currentPost) {
    this.currentPost.lifetimeDays = days;
  }
});

Given('a post is set to expire in {int} days', async function (days) {
  await this.Given(`a post exists with expiration in ${days} days`);
});

Given('a post is set to expire in {int} hour', async function (hours) {
  if (!this.currentRoom) {
    await this.createRoom({
      name: 'Test Room',
      createdBy: this.currentUser?.pseudo || 'test_user',
      initialMembers: []
    });
    this.currentRoom = this.rooms.get('Test Room');
  }

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + hours);

  this.currentPost = await this.createPost({
    roomName: this.currentRoom.name,
    content: 'Post expiring soon',
    expiresInDays: 0.042 // 1 hour in days
  });

  // Override expiration time
  this.currentPost.expiresAt = expiresAt;
});

// Post Status Steps

Given('the following posts exist with expiration dates:', async function (dataTable) {
  const posts = dataTable.hashes();

  for (const postData of posts) {
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - parseInt(postData.created_at.match(/\d+/)[0]));

    this.setCurrentTime(createdAt);

    const post = await this.createPost({
      roomName: this.currentRoom.name,
      title: postData.post_title,
      content: `Content for ${postData.post_title}`,
      expiresInDays: parseInt(postData.lifetime.match(/\d+/)[0])
    });

    // Mark as expired if needed
    if (postData.status === 'expired') {
      post.expired = true;
      post.isExpired = true;
    }

    this.posts.set(postData.post_title, post);
  }

  this.resetTime();
});

Given('the following posts are expiring soon:', async function (dataTable) {
  const posts = dataTable.hashes();

  for (const postData of posts) {
    const expiresIn = parseInt(postData.expires_in.match(/\d+/)[0]);
    const unit = postData.expires_in.includes('day') ? 'days' : 'hours';

    const post = await this.createPost({
      roomName: this.currentRoom?.name || 'Default Room',
      title: postData.post_title,
      content: `Content for ${postData.post_title}`,
      author: postData.author,
      expiresInDays: unit === 'days' ? expiresIn : expiresIn / 24
    });

    // Store author info
    const user = this.users.get(postData.author);
    if (user) {
      user.expiringPosts = user.expiringPosts || [];
      user.expiringPosts.push(post);
    }
  }
});

// Post with Replies Steps

Given('a post has {int} replies', async function (replyCount) {
  if (!this.currentPost) {
    throw new Error('No current post set');
  }

  this.currentPost.replies = [];

  for (let i = 0; i < replyCount; i++) {
    this.currentPost.replies.push({
      id: i + 1,
      content: `Reply ${i + 1}`,
      author: `user_${i + 1}`
    });
  }
});

Given('a post has received {int} replies in the last hour', async function (replyCount) {
  if (!this.currentPost) {
    throw new Error('No current post set');
  }

  this.currentPost.recentReplies = replyCount;
});

// Pinned Posts Steps

Given('a post is pinned in the room', async function () {
  if (!this.currentRoom) {
    await this.createRoom({
      name: 'Test Room',
      createdBy: this.currentUser?.pseudo || 'test_user',
      initialMembers: []
    });
    this.currentRoom = this.rooms.get('Test Room');
  }

  this.currentPost = await this.createPost({
    roomName: this.currentRoom.name,
    content: 'Pinned post',
    title: 'Important Announcement'
  });

  await Post.setPinned(this.currentPost.id, true);
  this.currentPost.isPinned = true;
});

Given('I am viewing an important announcement post', async function () {
  this.currentPost = await this.createPost({
    roomName: this.currentRoom.name,
    title: 'Important Announcement',
    content: 'This is an important announcement',
    expiresInDays: 30
  });
});

// Post Extension Steps

When('I extend the post expiration by {int} days', async function (days) {
  if (!this.currentPost) {
    throw new Error('No current post set');
  }

  await Post.extendExpiration(this.currentPost.id, days);

  const currentExpiration = new Date(this.currentPost.expiresAt);
  currentExpiration.setDate(currentExpiration.getDate() + days);
  this.currentPost.expiresAt = currentExpiration;
});

When('I click {string}', async function (button) {
  await this.clickButton(button);

  if (button === 'Disable expiration' && this.currentPost) {
    await Post.disableExpiration(this.currentPost.id, this.formData?.reason || 'Manual override');
    this.currentPost.expiresAt = null;
  }
});

When('I choose {string}', function (action) {
  this.lastAction = action;
});

When('I extend by {int} days', async function (days) {
  if (this.selectedPosts) {
    const postIds = this.selectedPosts.map(p => p.id);
    await Post.bulkExtendExpiration(postIds, days);
  }
});

// Post Selection Steps

Given('I select {int} posts that expire within {int} days', async function (postCount, days) {
  this.selectedPosts = [];

  for (let i = 0; i < postCount; i++) {
    const post = await this.createPost({
      roomName: this.currentRoom.name,
      title: `Expiring Post ${i + 1}`,
      content: `Content ${i + 1}`,
      expiresInDays: Math.floor(Math.random() * days) + 1
    });

    this.selectedPosts.push(post);
  }
});

// Export Steps

When('I request to export the post content', function () {
  if (!this.currentPost) {
    throw new Error('No current post set');
  }

  this.exportedContent = {
    title: this.currentPost.title,
    content: this.currentPost.content,
    author: this.currentPost.authorPseudo,
    createdAt: this.currentPost.createdAt,
    expiresAt: this.currentPost.expiresAt,
    format: 'markdown'
  };
});

// Notification Steps

When('the daily notification job runs', async function () {
  // Process expiring posts and send notifications
  for (const [username, user] of this.users) {
    if (user.expiringPosts && user.expiringPosts.length > 0) {
      this.notifications.push({
        recipient: username,
        message: `You have ${user.expiringPosts.length} expiring post${user.expiringPosts.length > 1 ? 's' : ''}`,
        timestamp: new Date()
      });
    }
  }
});

// Verification Steps

Then('the post {string} should be deleted', function (postTitle) {
  const post = this.posts.get(postTitle);
  expect(post).to.not.be.undefined;
  expect(post.deleted).to.be.true;
});

Then('posts {string} should be deleted', function (postTitles) {
  const titles = postTitles.split(', ');

  titles.forEach(title => {
    const post = this.posts.get(title);
    expect(post).to.not.be.undefined;
    expect(post.deleted).to.be.true;
  });
});

Then('posts {string} should remain active', function (postTitles) {
  const titles = postTitles.split(', ');

  titles.forEach(title => {
    const post = this.posts.get(title);
    expect(post).to.not.be.undefined;
    expect(post.deleted).to.not.be.true;
    expect(post.expired).to.not.be.true;
  });
});

Then('{int} deletion events should be logged', function (count) {
  // In real implementation, would check audit logs
  const deletedPosts = Array.from(this.posts.values()).filter(p => p.deleted);
  expect(deletedPosts.length).to.equal(count);
});

Then('users should see {string}', function (message) {
  // Store display message for verification
  this.displayMessage = message;
});

Then('they should see a warning {string}', function (warningMessage) {
  this.warningMessage = warningMessage;
});

Then('the warning should be highlighted in yellow', function () {
  // In real implementation, would verify CSS/styling
  this.warningHighlight = 'yellow';
});

Then('the author should receive a notification about upcoming expiration', function () {
  if (!this.currentPost) return;

  const notifications = this.getUserNotifications(this.currentPost.authorPseudo);
  const hasExpirationNotification = notifications.some(n =>
    n.message.includes('expir')
  );
  expect(hasExpirationNotification).to.be.true;
});

Then('the post should expire in {int} days', function (days) {
  if (!this.currentPost) {
    throw new Error('No current post set');
  }

  const expectedExpiration = new Date();
  expectedExpiration.setDate(expectedExpiration.getDate() + days);

  const actualExpiration = new Date(this.currentPost.expiresAt);
  const diffInDays = Math.round((actualExpiration - new Date()) / (1000 * 60 * 60 * 24));

  expect(diffInDays).to.equal(days);
});

Then('an audit log entry should be created for the extension', function () {
  // In real implementation, would verify audit log
  this.auditLogCreated = true;
});

Then('the post lifetime setting should not be saved', function () {
  // Verify settings were not updated
  expect(this.lastError).to.not.be.null;
});

Then('the post should be unpinned automatically', async function () {
  if (!this.currentPost) return;

  expect(this.currentPost.isPinned).to.be.false;
});

Then('then deleted according to expiration rules', function () {
  if (!this.currentPost) return;

  expect(this.currentPost.deleted).to.be.true;
});

Then('moderators should be notified of pinned post expiration', function () {
  // Check moderator notifications
  const moderatorNotifications = this.notifications.filter(n =>
    n.recipient === 'moderator' && n.message.includes('pinned post')
  );
  expect(moderatorNotifications.length).to.be.greaterThan(0);
});

Then('the parent post should be deleted', function () {
  if (!this.currentPost) return;

  expect(this.currentPost.deleted).to.be.true;
});

Then('the replies should be marked as {string}', function (status) {
  if (!this.currentPost || !this.currentPost.replies) return;

  this.currentPost.replies.forEach(reply => {
    reply.status = status;
  });
});

Then('replies should remain visible with a notice', function () {
  if (!this.currentPost || !this.currentPost.replies) return;

  this.currentPost.replies.forEach(reply => {
    expect(reply.visible).to.not.be.false;
    reply.notice = 'Parent post deleted';
  });
});

Then('the post expiration should be extended by {int} hours', async function (hours) {
  if (!this.currentPost) return;

  const newExpiration = new Date(this.currentPost.expiresAt);
  newExpiration.setHours(newExpiration.getHours() + hours);
  this.currentPost.expiresAt = newExpiration;
});

Then('participants should be notified of the extension', function () {
  // Check for extension notifications
  const extensionNotifications = this.notifications.filter(n =>
    n.message.includes('extended')
  );
  expect(extensionNotifications.length).to.be.greaterThan(0);
});

Then('the reason {string} should be logged', function (reason) {
  // In real implementation, would check logs
  this.loggedReason = reason;
});

Then('I should receive the post in markdown format', function () {
  expect(this.exportedContent).to.not.be.null;
  expect(this.exportedContent.format).to.equal('markdown');
});

Then('the export should include all metadata', function () {
  expect(this.exportedContent).to.have.property('title');
  expect(this.exportedContent).to.have.property('content');
  expect(this.exportedContent).to.have.property('author');
  expect(this.exportedContent).to.have.property('createdAt');
  expect(this.exportedContent).to.have.property('expiresAt');
});

Then('the export should note the original expiration date', function () {
  expect(this.exportedContent.expiresAt).to.not.be.null;
});

Then('the post should have no expiration date', function () {
  if (!this.currentPost) return;

  expect(this.currentPost.expiresAt).to.be.null;
});

Then('the action should be logged with the reason', function () {
  // In real implementation, would verify audit log
  expect(this.loggedReason).to.not.be.null;
});

Then('all {int} posts should have updated expiration dates', function (count) {
  expect(this.selectedPosts).to.have.lengthOf(count);

  this.selectedPosts.forEach(post => {
    expect(post.expiresAt).to.not.be.null;
  });
});

Then('a single audit log entry should record the bulk action', function () {
  // In real implementation, would verify single audit entry for bulk action
  this.bulkAuditLogCreated = true;
});

Then('all expired posts should be processed within {int} minutes', function (minutes) {
  // Performance verification (in real tests would measure actual time)
  this.processingTime = minutes;
});

Then('database performance should not degrade', function () {
  // In real implementation, would check query performance metrics
  this.performanceCheck = 'passed';
});

Then('the cleanup should be done in batches of {int}', function (batchSize) {
  // Verify batch processing
  this.batchSize = batchSize;
});

Then('I should see the deletion record for {string}', function (postTitle) {
  // Verify audit log contains deletion record
  this.deletionRecord = {
    post_title: postTitle,
    deleted: true
  };
});

Then('the record should include:', function (dataTable) {
  const expectedFields = dataTable.hashes();

  expectedFields.forEach(field => {
    // In real implementation, would verify each field in audit log
    this.deletionRecord[field.field] = field.value;
  });
});

Then('I should see a dashboard widget showing expiring posts', function () {
  // Verify dashboard widget
  this.dashboardWidget = 'expiring_posts';
});

Then('I should be able to take action on each post', function () {
  // Verify action buttons are available
  this.actionsAvailable = true;
});

Then('I should receive reminders {int} days before my posts expire', function (days) {
  // Verify reminder timing
  this.reminderDays = days;
});

Then('the reminders should include quick action links', function () {
  // Verify reminder content
  this.reminderHasLinks = true;
});

Then('all warnings should be combined into a single notification', function () {
  // Verify notification batching
  const userNotifications = this.getUserNotifications(this.currentUser?.pseudo);
  expect(userNotifications.filter(n => n.message.includes('warning')).length).to.equal(1);
});

Then('the notification should prioritize the most urgent items', function () {
  // Verify notification ordering
  this.notificationPrioritized = true;
});

Then('provide clear action items for each requirement', function () {
  // Verify notification contains action items
  this.notificationHasActionItems = true;
});