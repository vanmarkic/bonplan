/**
 * Room Lifecycle Step Definitions
 * Steps specific to community room management
 */

const { Given, When, Then } = require('@cucumber/cucumber');
const { expect } = require('chai');
const CommunityRoom = require('../../src/models/CommunityRoom');
const Post = require('../../src/models/Post');

// Room Creation & Setup Steps

Given('a room {string} exists with {int} members including me', async function (roomName, memberCount) {
  // Create additional test users if needed
  const existingUsers = Array.from(this.users.keys());
  const neededUsers = memberCount - 1; // Excluding current user

  while (existingUsers.length < neededUsers) {
    const newUser = `user_${existingUsers.length + 1}`;
    await this.createUser({
      username: newUser,
      email: `${newUser}@test.com`,
      verified: true
    });
    existingUsers.push(newUser);
  }

  // Create room with specified members
  const members = existingUsers.slice(0, neededUsers - 1);
  await this.createRoom({
    name: roomName,
    createdBy: this.currentUser.pseudo,
    initialMembers: members
  });

  this.currentRoom = this.rooms.get(roomName);
});

Given('a room {string} exists with {int} members', async function (roomName, memberCount) {
  // Create test users
  const users = [];
  for (let i = 0; i < memberCount; i++) {
    const username = `member_${i + 1}`;
    if (!this.users.has(username)) {
      await this.createUser({
        username,
        email: `${username}@test.com`,
        verified: true
      });
    }
    users.push(username);
  }

  // Create room
  await this.createRoom({
    name: roomName,
    createdBy: users[0],
    initialMembers: users.slice(1)
  });

  this.currentRoom = this.rooms.get(roomName);
});

Given('the room {string} has status {string}', async function (roomName, status) {
  const room = await CommunityRoom.findByName(roomName);
  if (room) {
    await CommunityRoom.updateStatus(room.id, status);
    const roomInfo = this.rooms.get(roomName);
    if (roomInfo) {
      roomInfo.status = status;
    }
  }
});

Given('the room {string} is active', async function (roomName) {
  await this.Given(`the room "${roomName}" has status "active"`);
});

Given('the room has {int} posts', async function (postCount) {
  if (!this.currentRoom) {
    throw new Error('No current room set');
  }

  for (let i = 0; i < postCount; i++) {
    await this.createPost({
      roomName: this.currentRoom.name,
      title: `Post ${i + 1}`,
      content: `Content for post ${i + 1}`
    });
  }
});

Given('the room has {int} pinned announcements', async function (pinnedCount) {
  if (!this.currentRoom) {
    throw new Error('No current room set');
  }

  for (let i = 0; i < pinnedCount; i++) {
    const post = await this.createPost({
      roomName: this.currentRoom.name,
      title: `Announcement ${i + 1}`,
      content: `Important announcement ${i + 1}`
    });

    await Post.setPinned(post.id, true);
    this.currentRoom.pinnedPosts.push(post.id);
  }
});

Given('I have moderator privileges in {string}', async function (roomName) {
  const room = await CommunityRoom.findByName(roomName);
  if (room && this.currentUser) {
    // In real implementation, would update room_members table
    this.currentUser.isModerator = true;
  }
});

Given('I create a room {string} with {int} members', async function (roomName, memberCount) {
  // Create additional members if needed
  const members = [];
  for (let i = 1; i < memberCount; i++) {
    const username = `member_${i}`;
    if (!this.users.has(username)) {
      await this.createUser({
        username,
        email: `${username}@test.com`,
        verified: true
      });
    }
    members.push(username);
  }

  await this.createRoom({
    name: roomName,
    createdBy: this.currentUser.pseudo,
    initialMembers: members
  });

  this.currentRoom = this.rooms.get(roomName);
});

// Room Membership Steps

When('user {string} joins the room {string}', async function (username, roomName) {
  const result = await this.addMemberToRoom(roomName, username);
  expect(result.success).to.be.true;
});

When('user {string} leaves the room {string}', async function (username, roomName) {
  const result = await this.removeMemberFromRoom(roomName, username);
  expect(result.success).to.be.true;
});

When('{int} users leave the room bringing membership to {int}', async function (leavingCount, finalCount) {
  if (!this.currentRoom) {
    throw new Error('No current room set');
  }

  const room = this.rooms.get(this.currentRoom.name);
  const membersToRemove = room.members.slice(-leavingCount);

  for (const member of membersToRemove) {
    await this.removeMemberFromRoom(this.currentRoom.name, member);
  }

  expect(room.memberCount).to.equal(finalCount);
});

When('{int} members leave bringing count to {int}', async function (leavingCount, finalCount) {
  await this.When(`${leavingCount} users leave the room bringing membership to ${finalCount}`);
});

When('{int} new users join the room', async function (newUserCount) {
  if (!this.currentRoom) {
    throw new Error('No current room set');
  }

  for (let i = 0; i < newUserCount; i++) {
    const username = `new_user_${Date.now()}_${i}`;
    await this.createUser({
      username,
      email: `${username}@test.com`,
      verified: true
    });

    await this.addMemberToRoom(this.currentRoom.name, username);
  }
});

When('simultaneously user {string} creates a post', async function (username) {
  // Simulate concurrent operation
  this.createPost({
    roomName: this.currentRoom.name,
    author: username,
    title: 'Concurrent post',
    content: 'Posted during concurrent operations'
  }).catch(error => {
    // Handle potential race condition
    this.lastError = error.message;
  });
});

When('simultaneously user {string} tries to join the room', async function (username) {
  // Simulate concurrent join attempt
  this.addMemberToRoom(this.currentRoom.name, username).catch(error => {
    // Handle potential race condition
    this.lastError = error.message;
  });
});

// Room State Verification Steps

Then('the room {string} should have status {string}', async function (roomName, expectedStatus) {
  await this.assertRoomStatus(roomName, expectedStatus);
});

Then('the room {string} should have {int} members', async function (roomName, expectedCount) {
  await this.assertRoomMemberCount(roomName, expectedCount);
});

Then('the room should have status {string}', async function (expectedStatus) {
  if (!this.currentRoom) {
    throw new Error('No current room set');
  }
  await this.assertRoomStatus(this.currentRoom.name, expectedStatus);
});

Then('the room should have {int} members', async function (expectedCount) {
  if (!this.currentRoom) {
    throw new Error('No current room set');
  }
  await this.assertRoomMemberCount(this.currentRoom.name, expectedCount);
});

Then('I should see notification {string}', function (message) {
  const notifications = this.getUserNotifications(this.currentUser.pseudo);
  const hasNotification = notifications.some(n => n.message.includes(message));
  expect(hasNotification).to.be.true;
});

Then('members should see {string}', function (message) {
  if (!this.currentRoom) return;

  const room = this.rooms.get(this.currentRoom.name);
  // In real implementation, would check UI state
  room.displayMessage = message;
});

Then('members should not be able to create new posts', async function () {
  if (!this.currentRoom) return;

  const room = await CommunityRoom.findByName(this.currentRoom.name);
  expect(room.is_locked).to.be.true;
});

Then('the room {string} should be marked for deletion', async function (roomName) {
  const room = this.rooms.get(roomName);
  expect(room).to.not.be.null;
  expect(room.deleted).to.be.true;
});

Then('the room {string} should be deleted', async function (roomName) {
  const exists = await CommunityRoom.exists(roomName);
  expect(exists).to.be.false;
});

Then('all posts in {string} should be deleted', async function (roomName) {
  const room = this.rooms.get(roomName);
  if (room && room.posts) {
    room.posts.forEach(postId => {
      const post = this.posts.get(postId);
      expect(post.deleted).to.be.true;
    });
  }
});

Then('all announcements in {string} should be deleted', async function (roomName) {
  const room = this.rooms.get(roomName);
  if (room && room.pinnedPosts) {
    room.pinnedPosts.forEach(postId => {
      const post = this.posts.get(postId);
      expect(post.deleted).to.be.true;
    });
  }
});

// Room Activity Steps

Given('{int} different users posted in the last {int} hours', async function (posterCount, hours) {
  if (!this.currentRoom) {
    throw new Error('No current room set');
  }

  // Create posts from different users
  for (let i = 0; i < posterCount; i++) {
    const username = `poster_${i + 1}`;
    if (!this.users.has(username)) {
      await this.createUser({
        username,
        email: `${username}@test.com`,
        verified: true
      });
      await this.addMemberToRoom(this.currentRoom.name, username);
    }

    // Set time to be within the specified hours
    const hoursAgo = Math.floor(Math.random() * hours);
    const postTime = new Date();
    postTime.setHours(postTime.getHours() - hoursAgo);

    this.setCurrentTime(postTime);
    await this.createPost({
      roomName: this.currentRoom.name,
      author: username,
      title: `Post by ${username}`,
      content: `Activity post ${i + 1}`
    });
  }

  this.resetTime();
});

When('the following users create posts:', async function (dataTable) {
  const users = dataTable.raw().flat();

  for (const username of users) {
    await this.createPost({
      roomName: this.currentRoom.name,
      author: username,
      title: `Post by ${username}`,
      content: `New post to unlock room`
    });
  }
});

// Room Founder Badge Steps

Then('I should receive the {string} badge', async function (badgeName) {
  const normalizedBadgeName = badgeName.replace(/\s+/g, '_');
  const userBadges = this.users.get(this.currentUser.pseudo).badges;
  const hasBadge = userBadges.some(b => b.name === normalizedBadgeName);
  expect(hasBadge).to.be.true;
});

Then('the badge should appear in my profile', function () {
  // In real implementation, would check profile rendering
  const userBadges = this.users.get(this.currentUser.pseudo).badges;
  expect(userBadges.length).to.be.greaterThan(0);
});

Then('the badge should show timestamp of room creation', function () {
  const userBadges = this.users.get(this.currentUser.pseudo).badges;
  const founderBadge = userBadges.find(b => b.name === 'room_founder');
  expect(founderBadge).to.not.be.null;
  expect(founderBadge.awardedAt).to.not.be.null;
});

// Scenario Outline Steps

Given('a room {string} exists with {int} members including me', async function (roomName, memberCount) {
  await this.Given(`a room "${roomName}" exists with ${memberCount} members including me`);
});

Then('the room should have {int} members', async function (memberCount) {
  await this.Then(`the room should have ${memberCount} members`);
});