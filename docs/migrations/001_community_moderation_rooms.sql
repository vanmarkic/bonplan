-- Community Moderation Rooms Migration
-- Adds support for community-managed discussion rooms with advanced moderation features
-- Migration Version: 001_community_moderation_rooms
-- Date: 2025-11-17
-- Dependencies: Base schema (users, threads, replies tables)

USE syndicat_tox;

-- ============================================
-- 1. COMMUNITY ROOMS
-- ============================================

-- Community rooms table - thematic discussion spaces
CREATE TABLE community_rooms (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    creator_pseudo VARCHAR(20) NOT NULL,

    -- Room state management
    state ENUM('pending', 'active', 'locked', 'deleted') DEFAULT 'pending',
    state_reason TEXT NULL,
    state_changed_at TIMESTAMP NULL,

    -- Member counts and thresholds
    member_count INT UNSIGNED DEFAULT 0,
    active_member_count INT UNSIGNED DEFAULT 0, -- Members who posted in last 72h
    unique_posters_72h INT UNSIGNED DEFAULT 0,  -- Different people who posted in last 72h

    -- Auto-management timestamps
    activated_at TIMESTAMP NULL,    -- When room reached 10+ members
    last_activity TIMESTAMP NULL,   -- Last post or reply in room
    locked_at TIMESTAMP NULL,        -- When auto-locked for inactivity
    deleted_at TIMESTAMP NULL,       -- When auto-deleted for low membership

    -- Configuration
    min_members_to_create INT UNSIGNED DEFAULT 6,
    min_members_to_activate INT UNSIGNED DEFAULT 10,
    min_members_to_maintain INT UNSIGNED DEFAULT 10,
    min_unique_posters_72h INT UNSIGNED DEFAULT 4,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Statistics
    total_threads INT UNSIGNED DEFAULT 0,
    total_posts INT UNSIGNED DEFAULT 0,

    FOREIGN KEY (creator_pseudo) REFERENCES users(pseudo) ON UPDATE CASCADE,
    INDEX idx_state (state, member_count),
    INDEX idx_activity (state, last_activity DESC),
    INDEX idx_auto_management (state, unique_posters_72h, member_count),
    INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 2. ROOM MEMBERSHIP & ACTIVITY TRACKING
-- ============================================

-- Room membership and user activity tracking
CREATE TABLE room_memberships (
    room_id INT UNSIGNED NOT NULL,
    user_pseudo VARCHAR(20) NOT NULL,

    -- Membership details
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,

    -- Activity tracking (for auto-lock/delete logic)
    last_post_at TIMESTAMP NULL,    -- Last time user posted in this room
    last_view_at TIMESTAMP NULL,    -- Last time user viewed this room
    post_count INT UNSIGNED DEFAULT 0,

    -- Activity requirements tracking
    meets_post_requirement BOOLEAN DEFAULT FALSE,  -- Posted once in last 2 weeks
    meets_view_requirement BOOLEAN DEFAULT FALSE,  -- Viewed once in last week
    last_requirement_check TIMESTAMP NULL,

    -- User role in room
    is_founder BOOLEAN DEFAULT FALSE,  -- One of the initial 6 founders
    is_moderator BOOLEAN DEFAULT FALSE,

    PRIMARY KEY (room_id, user_pseudo),
    FOREIGN KEY (room_id) REFERENCES community_rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_pseudo) REFERENCES users(pseudo) ON UPDATE CASCADE,
    INDEX idx_user_rooms (user_pseudo, is_active, last_view_at DESC),
    INDEX idx_room_active (room_id, is_active),
    INDEX idx_activity_check (room_id, last_post_at, last_view_at),
    INDEX idx_requirements (meets_post_requirement, meets_view_requirement)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 3. ENHANCED THREAD/POST MANAGEMENT
-- ============================================

-- Add room association and visibility to existing threads
ALTER TABLE threads
    ADD COLUMN room_id INT UNSIGNED NULL AFTER author_pseudo,
    ADD COLUMN visibility ENUM('public', 'semi_private', 'room_only') DEFAULT 'public' AFTER language,
    ADD COLUMN expires_at TIMESTAMP NULL AFTER visibility,
    ADD COLUMN expiration_days INT UNSIGNED NULL AFTER expires_at,
    ADD CONSTRAINT fk_thread_room FOREIGN KEY (room_id) REFERENCES community_rooms(id) ON DELETE SET NULL,
    ADD INDEX idx_room_threads (room_id, is_deleted, is_hidden, last_activity DESC),
    ADD INDEX idx_visibility (visibility, is_deleted, is_hidden),
    ADD INDEX idx_expiration (expires_at);

-- Add room association to replies
ALTER TABLE replies
    ADD COLUMN room_id INT UNSIGNED NULL AFTER thread_id,
    ADD CONSTRAINT fk_reply_room FOREIGN KEY (room_id) REFERENCES community_rooms(id) ON DELETE SET NULL,
    ADD INDEX idx_room_replies (room_id, is_deleted, is_hidden, created_at);

-- ============================================
-- 4. BADGE SYSTEM
-- ============================================

-- Badge definitions
CREATE TABLE badges (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    icon VARCHAR(50) NULL,  -- Icon identifier or emoji

    -- Badge type and criteria
    type ENUM('milestone', 'achievement', 'moderation', 'special') NOT NULL,
    criteria_type ENUM('manual', 'clean_time', 'post_count', 'help_count', 'custom') NOT NULL,
    criteria_value INT UNSIGNED NULL,  -- e.g., days clean, number of posts

    -- Display properties
    color VARCHAR(7) NULL,  -- Hex color code
    priority INT UNSIGNED DEFAULT 0,  -- Higher priority badges display first
    is_visible BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_type (type, is_visible),
    INDEX idx_priority (priority DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User badges (awarded badges)
CREATE TABLE user_badges (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_pseudo VARCHAR(20) NOT NULL,
    badge_id INT UNSIGNED NOT NULL,

    -- Award details
    awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    awarded_by VARCHAR(20) NULL,  -- NULL for system-awarded badges
    award_reason TEXT NULL,

    -- Expiration management
    expires_at TIMESTAMP NULL,
    is_expired BOOLEAN DEFAULT FALSE,

    -- Display control
    is_displayed BOOLEAN DEFAULT TRUE,  -- User can choose to hide badges
    display_order INT UNSIGNED DEFAULT 0,

    FOREIGN KEY (user_pseudo) REFERENCES users(pseudo) ON UPDATE CASCADE,
    FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE,
    FOREIGN KEY (awarded_by) REFERENCES users(pseudo) ON UPDATE CASCADE,
    UNIQUE KEY unique_user_badge (user_pseudo, badge_id, expires_at),
    INDEX idx_user_badges (user_pseudo, is_displayed, is_expired, display_order),
    INDEX idx_expiration (expires_at, is_expired)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 5. ROOM ACTIVITY LOG
-- ============================================

-- Track significant room events for moderation and history
CREATE TABLE room_activity_log (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    room_id INT UNSIGNED NOT NULL,
    user_pseudo VARCHAR(20) NULL,

    -- Event details
    event_type ENUM(
        'room_created', 'room_activated', 'room_locked', 'room_unlocked',
        'room_deleted', 'user_joined', 'user_left', 'user_removed',
        'moderator_added', 'moderator_removed', 'auto_lock', 'auto_delete'
    ) NOT NULL,
    event_data JSON NULL,  -- Additional event-specific data

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (room_id) REFERENCES community_rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_pseudo) REFERENCES users(pseudo) ON UPDATE CASCADE,
    INDEX idx_room_events (room_id, created_at DESC),
    INDEX idx_event_type (event_type, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 6. VIEWS FOR COMMON QUERIES
-- ============================================

-- View for active community rooms (visible to registered users only)
CREATE VIEW active_community_rooms AS
SELECT
    cr.id,
    cr.name,
    cr.description,
    cr.state,
    cr.member_count,
    cr.active_member_count,
    cr.unique_posters_72h,
    cr.last_activity,
    cr.total_threads,
    cr.total_posts,
    cr.created_at
FROM community_rooms cr
WHERE cr.state = 'active'
    AND cr.member_count >= cr.min_members_to_maintain;

-- View for user's joined rooms
CREATE VIEW user_rooms AS
SELECT
    rm.user_pseudo,
    cr.id as room_id,
    cr.name as room_name,
    cr.state as room_state,
    rm.joined_at,
    rm.last_post_at,
    rm.last_view_at,
    rm.post_count,
    rm.meets_post_requirement,
    rm.meets_view_requirement,
    rm.is_founder,
    rm.is_moderator
FROM room_memberships rm
JOIN community_rooms cr ON rm.room_id = cr.id
WHERE rm.is_active = TRUE
    AND cr.state IN ('pending', 'active');

-- View for room activity statistics
CREATE VIEW room_activity_stats AS
SELECT
    room_id,
    COUNT(DISTINCT user_pseudo) as unique_posters,
    COUNT(*) as total_posts,
    MAX(created_at) as last_post_time
FROM (
    SELECT room_id, author_pseudo as user_pseudo, created_at
    FROM threads
    WHERE room_id IS NOT NULL
        AND is_deleted = FALSE
        AND is_hidden = FALSE
        AND created_at > DATE_SUB(NOW(), INTERVAL 72 HOUR)
    UNION ALL
    SELECT room_id, author_pseudo as user_pseudo, created_at
    FROM replies
    WHERE room_id IS NOT NULL
        AND is_deleted = FALSE
        AND is_hidden = FALSE
        AND created_at > DATE_SUB(NOW(), INTERVAL 72 HOUR)
) as posts
GROUP BY room_id;

-- ============================================
-- 7. STORED PROCEDURES
-- ============================================

DELIMITER $$

-- Check and update room state based on membership and activity
CREATE PROCEDURE update_room_state(IN p_room_id INT UNSIGNED)
BEGIN
    DECLARE v_member_count INT UNSIGNED;
    DECLARE v_unique_posters INT UNSIGNED;
    DECLARE v_current_state VARCHAR(20);

    -- Get current state
    SELECT state INTO v_current_state
    FROM community_rooms
    WHERE id = p_room_id;

    -- Count active members
    SELECT COUNT(*) INTO v_member_count
    FROM room_memberships
    WHERE room_id = p_room_id AND is_active = TRUE;

    -- Count unique posters in last 72 hours
    SELECT COUNT(DISTINCT user_pseudo) INTO v_unique_posters
    FROM (
        SELECT author_pseudo as user_pseudo
        FROM threads
        WHERE room_id = p_room_id
            AND is_deleted = FALSE
            AND created_at > DATE_SUB(NOW(), INTERVAL 72 HOUR)
        UNION
        SELECT author_pseudo as user_pseudo
        FROM replies
        WHERE room_id = p_room_id
            AND is_deleted = FALSE
            AND created_at > DATE_SUB(NOW(), INTERVAL 72 HOUR)
    ) as recent_posters;

    -- Update counts
    UPDATE community_rooms
    SET member_count = v_member_count,
        unique_posters_72h = v_unique_posters
    WHERE id = p_room_id;

    -- State transition logic
    CASE v_current_state
        WHEN 'pending' THEN
            IF v_member_count >= 10 THEN
                UPDATE community_rooms
                SET state = 'active',
                    activated_at = CURRENT_TIMESTAMP,
                    state_changed_at = CURRENT_TIMESTAMP,
                    state_reason = 'Room activated: reached 10 members'
                WHERE id = p_room_id;

                INSERT INTO room_activity_log (room_id, event_type)
                VALUES (p_room_id, 'room_activated');
            END IF;

        WHEN 'active' THEN
            IF v_member_count < 10 THEN
                UPDATE community_rooms
                SET state = 'deleted',
                    deleted_at = CURRENT_TIMESTAMP,
                    state_changed_at = CURRENT_TIMESTAMP,
                    state_reason = 'Auto-deleted: membership fell below 10'
                WHERE id = p_room_id;

                INSERT INTO room_activity_log (room_id, event_type)
                VALUES (p_room_id, 'auto_delete');

            ELSEIF v_unique_posters < 4 THEN
                UPDATE community_rooms
                SET state = 'locked',
                    locked_at = CURRENT_TIMESTAMP,
                    state_changed_at = CURRENT_TIMESTAMP,
                    state_reason = 'Auto-locked: less than 4 unique posters in 72 hours'
                WHERE id = p_room_id;

                INSERT INTO room_activity_log (room_id, event_type)
                VALUES (p_room_id, 'auto_lock');
            END IF;

        WHEN 'locked' THEN
            IF v_unique_posters >= 4 AND v_member_count >= 10 THEN
                UPDATE community_rooms
                SET state = 'active',
                    state_changed_at = CURRENT_TIMESTAMP,
                    state_reason = 'Room reactivated: activity requirements met'
                WHERE id = p_room_id;

                INSERT INTO room_activity_log (room_id, event_type)
                VALUES (p_room_id, 'room_unlocked');
            ELSEIF v_member_count < 10 THEN
                UPDATE community_rooms
                SET state = 'deleted',
                    deleted_at = CURRENT_TIMESTAMP,
                    state_changed_at = CURRENT_TIMESTAMP,
                    state_reason = 'Auto-deleted: membership fell below 10'
                WHERE id = p_room_id;

                INSERT INTO room_activity_log (room_id, event_type)
                VALUES (p_room_id, 'auto_delete');
            END IF;
        ELSE
            -- Do nothing for deleted rooms
            SELECT 1;
    END CASE;
END$$

-- Check user activity requirements
CREATE PROCEDURE check_user_activity_requirements(
    IN p_room_id INT UNSIGNED,
    IN p_user_pseudo VARCHAR(20)
)
BEGIN
    DECLARE v_last_post TIMESTAMP;
    DECLARE v_last_view TIMESTAMP;
    DECLARE v_meets_post BOOLEAN DEFAULT FALSE;
    DECLARE v_meets_view BOOLEAN DEFAULT FALSE;

    -- Get user's last activity
    SELECT last_post_at, last_view_at
    INTO v_last_post, v_last_view
    FROM room_memberships
    WHERE room_id = p_room_id AND user_pseudo = p_user_pseudo;

    -- Check post requirement (once every 2 weeks)
    IF v_last_post IS NOT NULL AND v_last_post > DATE_SUB(NOW(), INTERVAL 14 DAY) THEN
        SET v_meets_post = TRUE;
    END IF;

    -- Check view requirement (once per week)
    IF v_last_view IS NOT NULL AND v_last_view > DATE_SUB(NOW(), INTERVAL 7 DAY) THEN
        SET v_meets_view = TRUE;
    END IF;

    -- Update membership record
    UPDATE room_memberships
    SET meets_post_requirement = v_meets_post,
        meets_view_requirement = v_meets_view,
        last_requirement_check = CURRENT_TIMESTAMP
    WHERE room_id = p_room_id AND user_pseudo = p_user_pseudo;
END$$

-- Auto-delete expired posts
CREATE PROCEDURE cleanup_expired_posts()
BEGIN
    -- Delete expired threads
    UPDATE threads
    SET is_deleted = TRUE,
        deleted_at = CURRENT_TIMESTAMP,
        deleted_reason = 'Auto-deleted: post expired'
    WHERE expires_at IS NOT NULL
        AND expires_at < CURRENT_TIMESTAMP
        AND is_deleted = FALSE;

    -- Delete replies of expired threads
    UPDATE replies r
    JOIN threads t ON r.thread_id = t.id
    SET r.is_deleted = TRUE,
        r.deleted_at = CURRENT_TIMESTAMP,
        r.deleted_reason = 'Auto-deleted: parent thread expired'
    WHERE t.expires_at IS NOT NULL
        AND t.expires_at < CURRENT_TIMESTAMP
        AND r.is_deleted = FALSE;
END$$

-- Award badge to user
CREATE PROCEDURE award_badge(
    IN p_user_pseudo VARCHAR(20),
    IN p_badge_name VARCHAR(50),
    IN p_awarded_by VARCHAR(20),
    IN p_reason TEXT,
    IN p_expires_days INT
)
BEGIN
    DECLARE v_badge_id INT UNSIGNED;
    DECLARE v_expires_at TIMESTAMP NULL;

    -- Get badge ID
    SELECT id INTO v_badge_id
    FROM badges
    WHERE name = p_badge_name;

    -- Calculate expiration if specified
    IF p_expires_days IS NOT NULL THEN
        SET v_expires_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL p_expires_days DAY);
    END IF;

    -- Award the badge
    INSERT INTO user_badges (user_pseudo, badge_id, awarded_by, award_reason, expires_at)
    VALUES (p_user_pseudo, v_badge_id, p_awarded_by, p_reason, v_expires_at)
    ON DUPLICATE KEY UPDATE
        awarded_at = CURRENT_TIMESTAMP,
        awarded_by = p_awarded_by,
        award_reason = p_reason;
END$$

DELIMITER ;

-- ============================================
-- 8. SCHEDULED EVENTS
-- ============================================

-- Check room states every hour
CREATE EVENT IF NOT EXISTS check_room_states
ON SCHEDULE EVERY 1 HOUR
DO
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_room_id INT UNSIGNED;
    DECLARE room_cursor CURSOR FOR
        SELECT id FROM community_rooms
        WHERE state IN ('pending', 'active', 'locked');
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

    OPEN room_cursor;

    read_loop: LOOP
        FETCH room_cursor INTO v_room_id;
        IF done THEN
            LEAVE read_loop;
        END IF;

        CALL update_room_state(v_room_id);
    END LOOP;

    CLOSE room_cursor;
END;

-- Check user activity requirements daily
CREATE EVENT IF NOT EXISTS check_activity_requirements
ON SCHEDULE EVERY 1 DAY
DO
BEGIN
    -- Update all active memberships
    UPDATE room_memberships rm
    JOIN community_rooms cr ON rm.room_id = cr.id
    SET rm.meets_post_requirement = (
            rm.last_post_at IS NOT NULL
            AND rm.last_post_at > DATE_SUB(NOW(), INTERVAL 14 DAY)
        ),
        rm.meets_view_requirement = (
            rm.last_view_at IS NOT NULL
            AND rm.last_view_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
        ),
        rm.last_requirement_check = CURRENT_TIMESTAMP
    WHERE rm.is_active = TRUE
        AND cr.state IN ('active', 'locked');
END;

-- Cleanup expired posts daily
CREATE EVENT IF NOT EXISTS cleanup_expired_posts_event
ON SCHEDULE EVERY 1 DAY
DO CALL cleanup_expired_posts();

-- Expire badges daily
CREATE EVENT IF NOT EXISTS expire_badges
ON SCHEDULE EVERY 1 DAY
DO
BEGIN
    UPDATE user_badges
    SET is_expired = TRUE
    WHERE expires_at IS NOT NULL
        AND expires_at < CURRENT_TIMESTAMP
        AND is_expired = FALSE;
END;

-- ============================================
-- 9. INITIAL DATA
-- ============================================

-- Insert default badges
INSERT INTO badges (name, display_name, description, type, criteria_type, criteria_value, icon, color, priority) VALUES
-- Milestone badges
('1_week_clean', '1 Week Clean', 'Clean for 1 week', 'milestone', 'clean_time', 7, '🌱', '#90EE90', 10),
('1_month_clean', '1 Month Clean', 'Clean for 1 month', 'milestone', 'clean_time', 30, '🌿', '#32CD32', 20),
('3_months_clean', '3 Months Clean', 'Clean for 3 months', 'milestone', 'clean_time', 90, '🌳', '#228B22', 30),
('6_months_clean', '6 Months Clean', 'Clean for 6 months', 'milestone', 'clean_time', 180, '🌲', '#006400', 40),
('1_year_clean', '1 Year Clean', 'Clean for 1 year', 'milestone', 'clean_time', 365, '🏆', '#FFD700', 50),

-- Achievement badges
('active_helper', 'Active Helper', 'Consistently helps others in the community', 'achievement', 'help_count', 50, '🤝', '#4169E1', 25),
('trusted_member', 'Trusted Member', 'Long-standing member with positive contributions', 'achievement', 'custom', NULL, '⭐', '#FF8C00', 35),
('room_founder', 'Room Founder', 'Founded a community room', 'achievement', 'custom', NULL, '🏠', '#8B4513', 15),
('peer_supporter', 'Peer Supporter', 'Provides regular peer support', 'achievement', 'help_count', 20, '💬', '#9370DB', 22),

-- Moderation badges
('community_mod', 'Community Moderator', 'Community room moderator', 'moderation', 'manual', NULL, '🛡️', '#C0C0C0', 60),
('forum_mod', 'Forum Moderator', 'Forum-wide moderator', 'moderation', 'manual', NULL, '⚔️', '#808080', 70),

-- Special badges
('early_member', 'Early Member', 'One of the first 100 members', 'special', 'manual', NULL, '🌅', '#FF69B4', 5),
('crisis_survivor', 'Crisis Survivor', 'Overcame a major crisis', 'special', 'manual', NULL, '🦅', '#4B0082', 45);

-- ============================================
-- 10. TRIGGERS
-- ============================================

DELIMITER $$

-- Update room stats when thread is created
CREATE TRIGGER after_thread_insert_room_stats
AFTER INSERT ON threads
FOR EACH ROW
BEGIN
    IF NEW.room_id IS NOT NULL THEN
        UPDATE community_rooms
        SET total_threads = total_threads + 1,
            total_posts = total_posts + 1,
            last_activity = CURRENT_TIMESTAMP
        WHERE id = NEW.room_id;

        -- Update user's last post time
        UPDATE room_memberships
        SET last_post_at = CURRENT_TIMESTAMP,
            post_count = post_count + 1
        WHERE room_id = NEW.room_id
            AND user_pseudo = NEW.author_pseudo;
    END IF;
END$$

-- Update room stats when reply is created
CREATE TRIGGER after_reply_insert_room_stats
AFTER INSERT ON replies
FOR EACH ROW
BEGIN
    IF NEW.room_id IS NOT NULL THEN
        UPDATE community_rooms
        SET total_posts = total_posts + 1,
            last_activity = CURRENT_TIMESTAMP
        WHERE id = NEW.room_id;

        -- Update user's last post time
        UPDATE room_memberships
        SET last_post_at = CURRENT_TIMESTAMP,
            post_count = post_count + 1
        WHERE room_id = NEW.room_id
            AND user_pseudo = NEW.author_pseudo;
    END IF;
END$$

-- Set expiration date when thread is created with expiration_days
CREATE TRIGGER before_thread_insert_expiration
BEFORE INSERT ON threads
FOR EACH ROW
BEGIN
    IF NEW.expiration_days IS NOT NULL THEN
        -- Minimum 10 days expiration
        IF NEW.expiration_days < 10 THEN
            SET NEW.expiration_days = 10;
        END IF;
        SET NEW.expires_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL NEW.expiration_days DAY);
    END IF;
END$$

-- Track room membership changes
CREATE TRIGGER after_membership_insert
AFTER INSERT ON room_memberships
FOR EACH ROW
BEGIN
    IF NEW.is_active = TRUE THEN
        UPDATE community_rooms
        SET member_count = member_count + 1
        WHERE id = NEW.room_id;

        INSERT INTO room_activity_log (room_id, user_pseudo, event_type)
        VALUES (NEW.room_id, NEW.user_pseudo, 'user_joined');
    END IF;
END$$

CREATE TRIGGER after_membership_update
AFTER UPDATE ON room_memberships
FOR EACH ROW
BEGIN
    IF OLD.is_active = TRUE AND NEW.is_active = FALSE THEN
        UPDATE community_rooms
        SET member_count = member_count - 1
        WHERE id = NEW.room_id;

        INSERT INTO room_activity_log (room_id, user_pseudo, event_type)
        VALUES (NEW.room_id, NEW.user_pseudo, 'user_left');

    ELSEIF OLD.is_active = FALSE AND NEW.is_active = TRUE THEN
        UPDATE community_rooms
        SET member_count = member_count + 1
        WHERE id = NEW.room_id;

        INSERT INTO room_activity_log (room_id, user_pseudo, event_type)
        VALUES (NEW.room_id, NEW.user_pseudo, 'user_joined');
    END IF;
END$$

-- Update user view timestamp
CREATE TRIGGER after_thread_view
AFTER UPDATE ON threads
FOR EACH ROW
BEGIN
    -- This trigger assumes view_count is incremented when a user views
    -- In practice, you'd handle this in application logic
    IF NEW.view_count > OLD.view_count AND NEW.room_id IS NOT NULL THEN
        -- Application should call a procedure to update last_view_at
        SELECT 1; -- Placeholder
    END IF;
END$$

DELIMITER ;

-- ============================================
-- 11. INDEXES FOR PERFORMANCE
-- ============================================

-- Additional performance indexes
CREATE INDEX idx_room_state_check ON community_rooms(state, member_count, unique_posters_72h);
CREATE INDEX idx_membership_activity ON room_memberships(room_id, last_post_at, last_view_at);
CREATE INDEX idx_thread_expiration_cleanup ON threads(expires_at, is_deleted);
CREATE INDEX idx_badge_display ON user_badges(user_pseudo, is_expired, is_displayed, display_order);

-- ============================================
-- 12. GRANTS FOR APPLICATION USER
-- ============================================

-- Update grants for new tables
GRANT SELECT, INSERT, UPDATE ON syndicat_tox.community_rooms TO 'bonplan_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON syndicat_tox.room_memberships TO 'bonplan_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON syndicat_tox.badges TO 'bonplan_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON syndicat_tox.user_badges TO 'bonplan_app'@'localhost';
GRANT SELECT, INSERT ON syndicat_tox.room_activity_log TO 'bonplan_app'@'localhost';
GRANT EXECUTE ON PROCEDURE syndicat_tox.update_room_state TO 'bonplan_app'@'localhost';
GRANT EXECUTE ON PROCEDURE syndicat_tox.check_user_activity_requirements TO 'bonplan_app'@'localhost';
GRANT EXECUTE ON PROCEDURE syndicat_tox.award_badge TO 'bonplan_app'@'localhost';

FLUSH PRIVILEGES;

-- ============================================
-- END OF MIGRATION
-- ============================================
