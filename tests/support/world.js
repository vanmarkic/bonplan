/**
 * Cucumber World Object
 * Shared state and helper methods for step definitions
 */

const { World, setWorldConstructor } = require('@cucumber/cucumber');
const { expect } = require('chai');
const sinon = require('sinon');

// Models
const User = require('../../src/models/User');
const CommunityRoom = require('../../src/models/CommunityRoom');
const Badge = require('../../src/models/Badge');
const Post = require('../../src/models/Post');

// Services
const authService = require('../../src/services/authService');

// Database
const db = require('../../src/utils/database');

class CustomWorld extends World {
  constructor(options) {
    super(options);

    // Test data storage
    this.users = new Map();
    this.rooms = new Map();
    this.posts = new Map();
    this.badges = new Map();
    this.notifications = [];

    // Current context
    this.currentUser = null;
    this.currentRoom = null;
    this.currentPost = null;
    this.lastResponse = null;
    this.lastError = null;

    // Time manipulation
    this.clock = null;

    // Test helpers
    this.testHelpers = {
      generatePseudo: () => `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      generateRoomName: () => `Room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      generatePin: () => Math.floor(1000 + Math.random() * 9000).toString()
    };
  }

  /**
   * Create a test user
   * @param {Object} userData - User data
   * @returns {Promise<Object>} Created user
   */
  async createUser(userData) {
    const {
      username,
      email,
      verified = true,
      pin = this.testHelpers.generatePin()
    } = userData;

    // Hash PIN
    const { hash, salt } = await authService.hashPin(pin);

    // Create user in database
    await User.create(username, hash, salt, 'en');

    // Store user data for tests
    const user = {
      pseudo: username,
      email,
      verified,
      pin,
      pinHash: hash,
      pinSalt: salt,
      createdAt: new Date(),
      rooms: [],
      posts: [],
      badges: []
    };

    this.users.set(username, user);
    return user;
  }

  /**
   * Login as user
   * @param {string} username - Username
   * @returns {Promise<void>}
   */
  async loginAs(username) {
    const user = this.users.get(username);
    if (!user) {
      throw new Error(`User ${username} not found`);
    }

    this.currentUser = user;

    // Update last login
    await User.updateLastLogin(username);
  }

  /**
   * Create a room
   * @param {Object} roomData - Room data
   * @returns {Promise<Object>} Created room
   */
  async createRoom(roomData) {
    const {
      name,
      createdBy = this.currentUser?.pseudo,
      initialMembers = []
    } = roomData;

    if (!createdBy) {
      throw new Error('No user logged in to create room');
    }

    const room = await CommunityRoom.create({
      name,
      createdBy,
      initialMembers
    });

    // Store room data
    const roomInfo = {
      ...room,
      members: [createdBy, ...initialMembers],
      posts: [],
      pinnedPosts: [],
      notifications: []
    };

    this.rooms.set(name, roomInfo);

    // Add room to creator's data
    const creator = this.users.get(createdBy);
    if (creator) {
      creator.rooms.push(name);
    }

    return roomInfo;
  }

  /**
   * Add member to room
   * @param {string} roomName - Room name
   * @param {string} username - Username to add
   * @returns {Promise<Object>} Result
   */
  async addMemberToRoom(roomName, username) {
    const room = await CommunityRoom.findByName(roomName);
    if (!room) {
      throw new Error(`Room ${roomName} not found`);
    }

    const result = await CommunityRoom.addMember(room.id, username);

    if (result.success) {
      const roomInfo = this.rooms.get(roomName);
      if (roomInfo) {
        roomInfo.members.push(username);
        roomInfo.memberCount = result.memberCount;
        roomInfo.status = result.status;
      }

      const user = this.users.get(username);
      if (user) {
        user.rooms.push(roomName);
      }
    }

    return result;
  }

  /**
   * Remove member from room
   * @param {string} roomName - Room name
   * @param {string} username - Username to remove
   * @returns {Promise<Object>} Result
   */
  async removeMemberFromRoom(roomName, username) {
    const room = await CommunityRoom.findByName(roomName);
    if (!room) {
      throw new Error(`Room ${roomName} not found`);
    }

    const result = await CommunityRoom.removeMember(room.id, username);

    if (result.success) {
      const roomInfo = this.rooms.get(roomName);
      if (roomInfo) {
        roomInfo.members = roomInfo.members.filter(m => m !== username);
        roomInfo.memberCount = result.memberCount;

        if (result.roomDeleted) {
          roomInfo.deleted = true;
          this.sendNotificationToMembers(roomName,
            `Room ${roomName} has been deleted due to insufficient membership`);
        }
      }

      const user = this.users.get(username);
      if (user) {
        user.rooms = user.rooms.filter(r => r !== roomName);
      }
    }

    return result;
  }

  /**
   * Create a post in room
   * @param {Object} postData - Post data
   * @returns {Promise<Object>} Created post
   */
  async createPost(postData) {
    const {
      roomName,
      author = this.currentUser?.pseudo,
      title = 'Test Post',
      content,
      expiresInDays = 30
    } = postData;

    const room = await CommunityRoom.findByName(roomName);
    if (!room) {
      throw new Error(`Room ${roomName} not found`);
    }

    const post = await Post.create({
      roomId: room.id,
      authorPseudo: author,
      title,
      content,
      expiresInDays
    });

    // Store post data
    const postInfo = {
      ...post,
      roomName,
      replies: [],
      views: 0
    };

    this.posts.set(post.id, postInfo);

    // Add to room's posts
    const roomInfo = this.rooms.get(roomName);
    if (roomInfo) {
      roomInfo.posts.push(post.id);
    }

    // Add to author's posts
    const user = this.users.get(author);
    if (user) {
      user.posts.push(post.id);
    }

    return postInfo;
  }

  /**
   * Award badge to user
   * @param {string} username - Username
   * @param {string} badgeName - Badge name
   * @param {string} reason - Award reason
   * @returns {Promise<Object>} Award result
   */
  async awardBadge(username, badgeName, reason = null) {
    const result = await Badge.awardBadge(
      username,
      badgeName,
      this.currentUser?.pseudo,
      reason
    );

    if (result.success) {
      const user = this.users.get(username);
      if (user) {
        user.badges.push({
          name: badgeName,
          awardedAt: new Date(),
          reason
        });
      }

      this.badges.set(`${username}_${badgeName}`, {
        username,
        badgeName,
        awardedAt: new Date(),
        reason
      });
    }

    return result;
  }

  /**
   * Send notification to room members
   * @param {string} roomName - Room name
   * @param {string} message - Notification message
   */
  sendNotificationToMembers(roomName, message) {
    const room = this.rooms.get(roomName);
    if (!room) return;

    room.members.forEach(member => {
      this.notifications.push({
        recipient: member,
        message,
        timestamp: new Date(),
        roomName
      });
    });
  }

  /**
   * Get user notifications
   * @param {string} username - Username
   * @returns {Array} User notifications
   */
  getUserNotifications(username) {
    return this.notifications.filter(n => n.recipient === username);
  }

  /**
   * Set current time (for time-based testing)
   * @param {Date|string} time - Time to set
   */
  setCurrentTime(time) {
    if (this.clock) {
      this.clock.restore();
    }

    const date = time instanceof Date ? time : new Date(time);
    this.clock = sinon.useFakeTimers(date.getTime());
  }

  /**
   * Advance time
   * @param {number} value - Time value
   * @param {string} unit - Time unit (hours, days, etc.)
   */
  advanceTime(value, unit) {
    if (!this.clock) {
      this.clock = sinon.useFakeTimers();
    }

    let milliseconds = 0;
    switch (unit) {
      case 'seconds':
      case 'second':
        milliseconds = value * 1000;
        break;
      case 'minutes':
      case 'minute':
        milliseconds = value * 60 * 1000;
        break;
      case 'hours':
      case 'hour':
        milliseconds = value * 60 * 60 * 1000;
        break;
      case 'days':
      case 'day':
        milliseconds = value * 24 * 60 * 60 * 1000;
        break;
      default:
        throw new Error(`Unknown time unit: ${unit}`);
    }

    this.clock.tick(milliseconds);
  }

  /**
   * Reset time mocking
   */
  resetTime() {
    if (this.clock) {
      this.clock.restore();
      this.clock = null;
    }
  }

  /**
   * Parse relative time string (e.g., "5 days ago", "2 hours ago")
   * @param {string} timeStr - Time string
   * @returns {Date} Date object
   */
  parseRelativeTime(timeStr) {
    const now = this.clock ? new Date(this.clock.now) : new Date();
    const match = timeStr.match(/(\d+)\s+(second|minute|hour|day|week|month)s?\s+ago/i);

    if (!match) {
      throw new Error(`Cannot parse time string: ${timeStr}`);
    }

    const [, value, unit] = match;
    const date = new Date(now);

    switch (unit.toLowerCase()) {
      case 'second':
        date.setSeconds(date.getSeconds() - parseInt(value));
        break;
      case 'minute':
        date.setMinutes(date.getMinutes() - parseInt(value));
        break;
      case 'hour':
        date.setHours(date.getHours() - parseInt(value));
        break;
      case 'day':
        date.setDate(date.getDate() - parseInt(value));
        break;
      case 'week':
        date.setDate(date.getDate() - (parseInt(value) * 7));
        break;
      case 'month':
        date.setMonth(date.getMonth() - parseInt(value));
        break;
    }

    return date;
  }

  /**
   * Simulate page visit
   * @param {string} page - Page identifier
   */
  visitPage(page) {
    this.currentPage = page;

    // Update view tracking if visiting a room
    if (page.includes('room') && this.currentUser) {
      const roomMatch = page.match(/room[s]?\/([\w\s]+)/);
      if (roomMatch) {
        const roomName = roomMatch[1];
        this.updateRoomView(roomName);
      }
    }
  }

  /**
   * Update room view timestamp
   * @param {string} roomName - Room name
   */
  async updateRoomView(roomName) {
    if (!this.currentUser) return;

    const room = await CommunityRoom.findByName(roomName);
    if (room) {
      await CommunityRoom.updateLastView(room.id, this.currentUser.pseudo);
    }
  }

  /**
   * Fill in form field
   * @param {string} field - Field name
   * @param {string} value - Field value
   */
  fillInField(field, value) {
    if (!this.formData) {
      this.formData = {};
    }
    this.formData[field] = value;
  }

  /**
   * Click button (simulate action)
   * @param {string} button - Button text
   */
  async clickButton(button) {
    this.lastAction = button;

    // Handle specific button actions
    switch (button.toLowerCase()) {
      case 'create room':
        await this.handleCreateRoom();
        break;
      case 'save settings':
        await this.handleSaveSettings();
        break;
      case 'disable expiration':
        await this.handleDisableExpiration();
        break;
      default:
        // Generic action
        break;
    }
  }

  /**
   * Handle room creation
   */
  async handleCreateRoom() {
    if (!this.formData || !this.formData['Room Name']) {
      this.lastError = 'Room name is required';
      return;
    }

    try {
      const room = await this.createRoom({
        name: this.formData['Room Name'],
        initialMembers: this.pendingMembers || []
      });

      this.lastResponse = 'Room created successfully';
      this.currentRoom = room;
    } catch (error) {
      this.lastError = error.message;
      this.lastResponse = error.message;
    }
  }

  /**
   * Handle save settings
   */
  async handleSaveSettings() {
    this.lastResponse = 'Room settings updated successfully';
  }

  /**
   * Handle disable expiration
   */
  async handleDisableExpiration() {
    if (this.currentPost && this.formData?.reason) {
      await Post.disableExpiration(this.currentPost.id, this.formData.reason);
      this.lastResponse = 'Expiration disabled';
    }
  }

  /**
   * Add pending members for room creation
   * @param {Array} members - Member list
   */
  addPendingMembers(members) {
    this.pendingMembers = members;
  }

  /**
   * Check if message/error is displayed
   * @param {string} message - Message to check
   * @returns {boolean} Is displayed
   */
  shouldSeeMessage(message) {
    return this.lastResponse === message || this.lastError === message;
  }

  /**
   * Assert room exists
   * @param {string} roomName - Room name
   * @param {boolean} shouldExist - Should exist
   */
  async assertRoomExists(roomName, shouldExist = true) {
    const exists = await CommunityRoom.exists(roomName);
    expect(exists).to.equal(shouldExist);
  }

  /**
   * Assert room status
   * @param {string} roomName - Room name
   * @param {string} expectedStatus - Expected status
   */
  async assertRoomStatus(roomName, expectedStatus) {
    const room = await CommunityRoom.findByName(roomName);
    expect(room).to.not.be.null;
    expect(room.status).to.equal(expectedStatus);
  }

  /**
   * Assert room member count
   * @param {string} roomName - Room name
   * @param {number} expectedCount - Expected count
   */
  async assertRoomMemberCount(roomName, expectedCount) {
    const count = await CommunityRoom.getMemberCount(roomName);
    expect(count).to.equal(expectedCount);
  }

  /**
   * Clean up test data
   */
  async cleanup() {
    // Reset time if mocked
    this.resetTime();

    // Clear test data
    this.users.clear();
    this.rooms.clear();
    this.posts.clear();
    this.badges.clear();
    this.notifications = [];

    // Reset state
    this.currentUser = null;
    this.currentRoom = null;
    this.currentPost = null;
    this.lastResponse = null;
    this.lastError = null;
    this.formData = null;
    this.pendingMembers = null;
  }
}

setWorldConstructor(CustomWorld);

module.exports = CustomWorld;