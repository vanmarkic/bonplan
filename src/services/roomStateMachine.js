/**
 * XState v5 State Machine for Community Room Lifecycle Management
 *
 * This machine manages the lifecycle of community rooms based on member count
 * and activity metrics, ensuring rooms maintain minimum participation levels.
 */

import { createMachine, assign, createActor } from 'xstate';

/**
 * @typedef {Object} RoomContext
 * @property {string} roomId - The unique identifier of the room
 * @property {number} memberCount - Current number of members in the room
 * @property {number} uniquePosters72h - Number of unique users who posted in last 72 hours
 * @property {Date|null} activatedAt - Timestamp when room became active
 * @property {Date|null} lockedAt - Timestamp when room was locked
 * @property {Date|null} deletedAt - Timestamp when room was deleted
 * @property {string|null} lastModeratorId - ID of moderator who last performed manual action
 */

/**
 * @typedef {Object} RoomEvent
 * @property {'USER_JOINED' | 'USER_LEFT' | 'ACTIVITY_CHECK' | 'MANUAL_LOCK' | 'MANUAL_UNLOCK'} type
 * @property {Object} [data] - Optional event data
 * @property {string} [data.userId] - ID of user joining/leaving
 * @property {string} [data.moderatorId] - ID of moderator performing action
 * @property {number} [data.memberCount] - Updated member count
 * @property {number} [data.uniquePosters72h] - Updated unique posters count
 */

/**
 * Guards - Boolean conditions that determine if transitions can occur
 */
const guards = {
  /**
   * Check if room has minimum required members (10+)
   */
  hasEnoughMembers: ({ context }) => {
    return context.memberCount >= 10;
  },

  /**
   * Check if room has minimum required active posters (4+ in last 72h)
   */
  hasEnoughPosters: ({ context }) => {
    return context.uniquePosters72h >= 4;
  },

  /**
   * Check if room has fallen below minimum member threshold
   */
  belowMinMembers: ({ context }) => {
    return context.memberCount < 10;
  },

  /**
   * Check if room meets both member and activity requirements
   */
  meetsActiveRequirements: ({ context }) => {
    return context.memberCount >= 10 && context.uniquePosters72h >= 4;
  },

  /**
   * Check if room should be locked due to low activity
   */
  shouldBeLocked: ({ context }) => {
    return context.memberCount >= 10 && context.uniquePosters72h < 4;
  }
};

/**
 * Actions - Side effects that occur during state transitions
 */
const actions = {
  /**
   * Activate the room and set activation timestamp
   */
  activateRoom: assign({
    activatedAt: () => new Date(),
    lockedAt: () => null
  }),

  /**
   * Lock the room due to low activity
   */
  lockRoom: assign({
    lockedAt: () => new Date()
  }),

  /**
   * Unlock and reactivate the room
   */
  unlockRoom: assign({
    lockedAt: () => null
  }),

  /**
   * Soft-delete the room
   */
  deleteRoom: assign({
    deletedAt: () => new Date()
  }),

  /**
   * Update member and activity counts from event data
   */
  updateCounts: assign({
    memberCount: ({ context, event }) => {
      if (event.type === 'USER_JOINED') {
        return context.memberCount + 1;
      }
      if (event.type === 'USER_LEFT') {
        return Math.max(0, context.memberCount - 1);
      }
      if (event.data?.memberCount !== undefined) {
        return event.data.memberCount;
      }
      return context.memberCount;
    },
    uniquePosters72h: ({ context, event }) => {
      if (event.data?.uniquePosters72h !== undefined) {
        return event.data.uniquePosters72h;
      }
      return context.uniquePosters72h;
    }
  }),

  /**
   * Track moderator ID for manual actions
   */
  recordModerator: assign({
    lastModeratorId: ({ event }) => event.data?.moderatorId || null
  }),

  /**
   * Log state transition to activity log
   * This is a placeholder for database integration
   */
  logStateChange: ({ context, event }) => {
    const logEntry = {
      roomId: context.roomId,
      timestamp: new Date(),
      event: event.type,
      fromState: event.from,
      toState: event.to,
      context: {
        memberCount: context.memberCount,
        uniquePosters72h: context.uniquePosters72h
      },
      userId: event.data?.userId,
      moderatorId: event.data?.moderatorId
    };

    // Integration point: Log to database
    console.log('[Room State Change]', logEntry);

    // In production, this would call your database service:
    // await db.roomActivityLog.create(logEntry);
  },

  /**
   * Persist room state to database
   * This is a placeholder for database integration
   */
  persistToDatabase: ({ context, state }) => {
    const update = {
      roomId: context.roomId,
      state: state.value,
      memberCount: context.memberCount,
      uniquePosters72h: context.uniquePosters72h,
      activatedAt: context.activatedAt,
      lockedAt: context.lockedAt,
      deletedAt: context.deletedAt,
      updatedAt: new Date()
    };

    // Integration point: Update database
    console.log('[Database Update]', update);

    // In production, this would call your database service:
    // await db.rooms.update(context.roomId, update);
  },

  /**
   * Send notifications about state changes
   * This is a placeholder for notification integration
   */
  notifyStateChange: ({ context, state, event }) => {
    const notification = {
      roomId: context.roomId,
      type: 'room_state_change',
      newState: state.value,
      trigger: event.type,
      timestamp: new Date()
    };

    // Integration point: Send notifications
    console.log('[Notification]', notification);

    // In production, this would call your notification service:
    // await notificationService.broadcast(context.roomId, notification);
  }
};

/**
 * Main Room Lifecycle State Machine
 */
export const roomStateMachine = createMachine({
  id: 'roomLifecycle',
  initial: 'pending',

  context: {
    roomId: '',
    memberCount: 6, // Starts with 6+ founders
    uniquePosters72h: 0,
    activatedAt: null,
    lockedAt: null,
    deletedAt: null,
    lastModeratorId: null
  },

  states: {
    /**
     * PENDING STATE
     * Room is created but hasn't reached minimum members yet
     */
    pending: {
      entry: ['logStateChange'],
      on: {
        USER_JOINED: [
          {
            target: 'active',
            guard: 'hasEnoughMembers',
            actions: ['updateCounts', 'activateRoom', 'persistToDatabase', 'notifyStateChange', 'logStateChange']
          },
          {
            target: 'pending',
            actions: ['updateCounts', 'persistToDatabase']
          }
        ],
        USER_LEFT: [
          {
            target: 'deleted',
            guard: 'belowMinMembers',
            actions: ['updateCounts', 'deleteRoom', 'persistToDatabase', 'notifyStateChange', 'logStateChange']
          },
          {
            target: 'pending',
            actions: ['updateCounts', 'persistToDatabase']
          }
        ],
        ACTIVITY_CHECK: {
          target: 'pending',
          actions: ['updateCounts', 'persistToDatabase']
        }
      }
    },

    /**
     * ACTIVE STATE
     * Room has sufficient members and activity
     */
    active: {
      entry: ['logStateChange'],
      on: {
        USER_JOINED: {
          target: 'active',
          actions: ['updateCounts', 'persistToDatabase']
        },
        USER_LEFT: [
          {
            target: 'deleted',
            guard: 'belowMinMembers',
            actions: ['updateCounts', 'deleteRoom', 'persistToDatabase', 'notifyStateChange', 'logStateChange']
          },
          {
            target: 'active',
            actions: ['updateCounts', 'persistToDatabase']
          }
        ],
        ACTIVITY_CHECK: [
          {
            target: 'locked',
            guard: 'shouldBeLocked',
            actions: ['updateCounts', 'lockRoom', 'persistToDatabase', 'notifyStateChange', 'logStateChange']
          },
          {
            target: 'active',
            actions: ['updateCounts', 'persistToDatabase']
          }
        ],
        MANUAL_LOCK: {
          target: 'locked',
          actions: ['recordModerator', 'lockRoom', 'persistToDatabase', 'notifyStateChange', 'logStateChange']
        }
      }
    },

    /**
     * LOCKED STATE
     * Room has members but insufficient activity
     */
    locked: {
      entry: ['logStateChange'],
      on: {
        USER_JOINED: {
          target: 'locked',
          actions: ['updateCounts', 'persistToDatabase']
        },
        USER_LEFT: [
          {
            target: 'deleted',
            guard: 'belowMinMembers',
            actions: ['updateCounts', 'deleteRoom', 'persistToDatabase', 'notifyStateChange', 'logStateChange']
          },
          {
            target: 'locked',
            actions: ['updateCounts', 'persistToDatabase']
          }
        ],
        ACTIVITY_CHECK: [
          {
            target: 'active',
            guard: 'meetsActiveRequirements',
            actions: ['updateCounts', 'unlockRoom', 'persistToDatabase', 'notifyStateChange', 'logStateChange']
          },
          {
            target: 'deleted',
            guard: 'belowMinMembers',
            actions: ['updateCounts', 'deleteRoom', 'persistToDatabase', 'notifyStateChange', 'logStateChange']
          },
          {
            target: 'locked',
            actions: ['updateCounts', 'persistToDatabase']
          }
        ],
        MANUAL_UNLOCK: {
          target: 'active',
          actions: ['recordModerator', 'unlockRoom', 'persistToDatabase', 'notifyStateChange', 'logStateChange']
        }
      }
    },

    /**
     * DELETED STATE
     * Terminal state - room is soft-deleted
     */
    deleted: {
      type: 'final',
      entry: ['logStateChange', 'notifyStateChange']
    }
  }
}, {
  guards,
  actions
});

/**
 * Create a new room state machine actor with initial context
 *
 * @param {string} roomId - Unique identifier for the room
 * @param {number} initialMemberCount - Starting member count
 * @param {number} initialPosters - Initial unique posters count
 * @returns {Actor} XState actor instance
 */
export function createRoomActor(roomId, initialMemberCount = 6, initialPosters = 0) {
  return createActor(roomStateMachine, {
    input: {
      roomId,
      memberCount: initialMemberCount,
      uniquePosters72h: initialPosters
    }
  });
}

/**
 * Helper function to send events to room actor
 *
 * @param {Actor} actor - The room state machine actor
 * @param {string} eventType - Type of event to send
 * @param {Object} data - Event data
 */
export function sendRoomEvent(actor, eventType, data = {}) {
  actor.send({
    type: eventType,
    data
  });
}

/**
 * Get current state information from actor
 *
 * @param {Actor} actor - The room state machine actor
 * @returns {Object} Current state and context
 */
export function getRoomState(actor) {
  const snapshot = actor.getSnapshot();
  return {
    state: snapshot.value,
    context: snapshot.context,
    can: {
      lock: snapshot.can({ type: 'MANUAL_LOCK' }),
      unlock: snapshot.can({ type: 'MANUAL_UNLOCK' }),
      delete: snapshot.value !== 'deleted'
    }
  };
}

/**
 * Batch update room counts and check activity
 *
 * @param {Actor} actor - The room state machine actor
 * @param {number} memberCount - Updated member count
 * @param {number} uniquePosters - Updated unique posters count
 */
export function updateRoomActivity(actor, memberCount, uniquePosters) {
  sendRoomEvent(actor, 'ACTIVITY_CHECK', {
    memberCount,
    uniquePosters72h: uniquePosters
  });
}

/**
 * Example integration with database service
 *
 * @param {string} roomId - Room identifier
 * @returns {Actor} Initialized room state machine actor
 */
export async function initializeRoomFromDatabase(roomId) {
  // In production, fetch room data from database
  // const roomData = await db.rooms.findById(roomId);

  // Mock data for example
  const roomData = {
    memberCount: 8,
    uniquePosters72h: 2,
    state: 'pending'
  };

  const actor = createRoomActor(roomId, roomData.memberCount, roomData.uniquePosters72h);

  // Start the actor
  actor.start();

  // Subscribe to state changes for persistence
  actor.subscribe((snapshot) => {
    // Persist state changes to database
    console.log('[State Subscription]', {
      roomId,
      state: snapshot.value,
      context: snapshot.context
    });
  });

  return actor;
}

/**
 * Periodic activity checker for all rooms
 * This would typically run as a scheduled job
 */
export class RoomActivityMonitor {
  constructor() {
    this.actors = new Map();
    this.checkInterval = 60000; // Check every minute (adjust as needed)
  }

  /**
   * Register a room for monitoring
   *
   * @param {string} roomId - Room identifier
   * @param {Actor} actor - Room state machine actor
   */
  registerRoom(roomId, actor) {
    this.actors.set(roomId, actor);
  }

  /**
   * Unregister a room from monitoring
   *
   * @param {string} roomId - Room identifier
   */
  unregisterRoom(roomId) {
    const actor = this.actors.get(roomId);
    if (actor) {
      actor.stop();
      this.actors.delete(roomId);
    }
  }

  /**
   * Start monitoring all registered rooms
   */
  start() {
    this.intervalId = setInterval(async () => {
      for (const [roomId, actor] of this.actors) {
        try {
          // In production, fetch current stats from database
          // const stats = await db.getRoomStats(roomId);

          // Mock stats for example
          const stats = {
            memberCount: Math.floor(Math.random() * 20) + 5,
            uniquePosters72h: Math.floor(Math.random() * 10)
          };

          updateRoomActivity(actor, stats.memberCount, stats.uniquePosters72h);
        } catch (error) {
          console.error(`Error checking room ${roomId}:`, error);
        }
      }
    }, this.checkInterval);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Stop all actors
    for (const actor of this.actors.values()) {
      actor.stop();
    }
    this.actors.clear();
  }
}

/**
 * Export default configuration for easy import
 */
export default {
  machine: roomStateMachine,
  createActor: createRoomActor,
  sendEvent: sendRoomEvent,
  getState: getRoomState,
  updateActivity: updateRoomActivity,
  initFromDatabase: initializeRoomFromDatabase,
  ActivityMonitor: RoomActivityMonitor
};