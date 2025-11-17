-- Le Syndicat des Tox - Database Schema
-- Anonymous Peer Support Forum for Belgian Drug Addict Communities
-- MariaDB 10.11+ Required
-- Charset: utf8mb4 for full emoji support

-- Create database
CREATE DATABASE IF NOT EXISTS syndicat_tox
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE syndicat_tox;

-- Users table (minimal data for anonymity)
CREATE TABLE users (
    pseudo VARCHAR(20) NOT NULL,
    pin_hash VARCHAR(128) NOT NULL,
    pin_salt VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    failed_attempts TINYINT UNSIGNED DEFAULT 0,
    locked_until TIMESTAMP NULL,
    post_count INT UNSIGNED DEFAULT 0,
    reply_count INT UNSIGNED DEFAULT 0,
    is_moderator BOOLEAN DEFAULT FALSE,
    is_banned BOOLEAN DEFAULT FALSE,
    ban_reason TEXT NULL,
    ban_until TIMESTAMP NULL,
    preferred_language ENUM('fr', 'nl', 'de', 'en') DEFAULT 'fr',

    PRIMARY KEY (pseudo),
    INDEX idx_created (created_at),
    INDEX idx_last_login (last_login),
    INDEX idx_locked (locked_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Threads table
CREATE TABLE threads (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    author_pseudo VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    edited_at TIMESTAMP NULL,
    reply_count INT UNSIGNED DEFAULT 0,
    view_count INT UNSIGNED DEFAULT 0,
    is_pinned BOOLEAN DEFAULT FALSE,
    is_locked BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP NULL,
    deleted_reason TEXT NULL,
    report_count SMALLINT UNSIGNED DEFAULT 0,
    is_hidden BOOLEAN DEFAULT FALSE,
    language ENUM('fr', 'nl', 'de', 'en') DEFAULT 'fr',

    FOREIGN KEY (author_pseudo) REFERENCES users(pseudo) ON UPDATE CASCADE,
    FULLTEXT KEY idx_search (title, body),
    INDEX idx_activity (is_deleted, is_hidden, last_activity DESC),
    INDEX idx_created (is_deleted, is_hidden, created_at DESC),
    INDEX idx_author (author_pseudo, created_at DESC),
    INDEX idx_pinned (is_pinned DESC, last_activity DESC),
    INDEX idx_language (language, last_activity DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Replies table
CREATE TABLE replies (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    thread_id INT UNSIGNED NOT NULL,
    body TEXT NOT NULL,
    author_pseudo VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    edited_at TIMESTAMP NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP NULL,
    deleted_reason TEXT NULL,
    report_count SMALLINT UNSIGNED DEFAULT 0,
    is_hidden BOOLEAN DEFAULT FALSE,

    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
    FOREIGN KEY (author_pseudo) REFERENCES users(pseudo) ON UPDATE CASCADE,
    FULLTEXT KEY idx_search (body),
    INDEX idx_thread_created (thread_id, is_deleted, is_hidden, created_at),
    INDEX idx_author (author_pseudo, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reports table (for moderation)
CREATE TABLE reports (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    content_type ENUM('thread', 'reply') NOT NULL,
    content_id INT UNSIGNED NOT NULL,
    reporter_pseudo VARCHAR(20) NOT NULL,
    reason ENUM('spam', 'harmful', 'sourcing', 'personal_attack', 'other') NOT NULL,
    description TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('pending', 'reviewed', 'actioned', 'dismissed') DEFAULT 'pending',
    reviewed_by VARCHAR(20) NULL,
    reviewed_at TIMESTAMP NULL,
    action_taken TEXT NULL,

    FOREIGN KEY (reporter_pseudo) REFERENCES users(pseudo) ON UPDATE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(pseudo) ON UPDATE CASCADE,
    INDEX idx_content (content_type, content_id),
    INDEX idx_status (status, created_at),
    UNIQUE KEY unique_report (content_type, content_id, reporter_pseudo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Moderation log (audit trail)
CREATE TABLE moderation_log (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    moderator_pseudo VARCHAR(20) NOT NULL,
    action ENUM('delete_thread', 'delete_reply', 'hide_thread', 'hide_reply',
                'unhide_thread', 'unhide_reply', 'lock_thread', 'unlock_thread',
                'pin_thread', 'unpin_thread', 'ban_user', 'unban_user') NOT NULL,
    target_type ENUM('thread', 'reply', 'user') NOT NULL,
    target_id VARCHAR(50) NOT NULL, -- Can be thread_id, reply_id, or pseudo
    reason TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (moderator_pseudo) REFERENCES users(pseudo) ON UPDATE CASCADE,
    INDEX idx_moderator (moderator_pseudo, created_at DESC),
    INDEX idx_target (target_type, target_id),
    INDEX idx_created (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Login attempts tracking (for rate limiting)
CREATE TABLE login_attempts (
    pseudo VARCHAR(20) NOT NULL,
    attempt_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN DEFAULT FALSE,

    INDEX idx_pseudo_time (pseudo, attempt_time DESC),
    INDEX idx_cleanup (attempt_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Banned words for auto-moderation
CREATE TABLE banned_words (
    word VARCHAR(100) PRIMARY KEY,
    severity ENUM('warning', 'auto_hide', 'auto_delete') DEFAULT 'warning',
    added_by VARCHAR(20) NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (added_by) REFERENCES users(pseudo) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Views for common queries

-- Active threads view
CREATE VIEW active_threads AS
SELECT
    t.id,
    t.title,
    t.author_pseudo,
    t.created_at,
    t.last_activity,
    t.reply_count,
    t.view_count,
    t.is_pinned,
    t.is_locked,
    t.language,
    u.is_moderator as author_is_moderator
FROM threads t
JOIN users u ON t.author_pseudo = u.pseudo
WHERE t.is_deleted = FALSE
    AND t.is_hidden = FALSE
    AND u.is_banned = FALSE;

-- User statistics view
CREATE VIEW user_stats AS
SELECT
    pseudo,
    created_at,
    last_login,
    post_count,
    reply_count,
    (post_count + reply_count) as total_contributions,
    is_moderator,
    preferred_language
FROM users
WHERE is_banned = FALSE;

-- Stored procedures

DELIMITER $$

-- Procedure to clean old login attempts
CREATE PROCEDURE cleanup_login_attempts()
BEGIN
    DELETE FROM login_attempts
    WHERE attempt_time < DATE_SUB(NOW(), INTERVAL 24 HOUR);
END$$

-- Procedure to update thread activity on new reply
CREATE PROCEDURE update_thread_activity(IN thread_id_param INT UNSIGNED)
BEGIN
    UPDATE threads
    SET last_activity = CURRENT_TIMESTAMP,
        reply_count = (
            SELECT COUNT(*)
            FROM replies
            WHERE thread_id = thread_id_param
                AND is_deleted = FALSE
                AND is_hidden = FALSE
        )
    WHERE id = thread_id_param;
END$$

-- Procedure to check if user is rate limited
CREATE PROCEDURE check_rate_limit(
    IN pseudo_param VARCHAR(20),
    IN action_type VARCHAR(20),
    OUT is_limited BOOLEAN
)
BEGIN
    DECLARE attempt_count INT;

    -- Define limits based on action type
    CASE action_type
        WHEN 'login' THEN
            SELECT COUNT(*) INTO attempt_count
            FROM login_attempts
            WHERE pseudo = pseudo_param
                AND attempt_time > DATE_SUB(NOW(), INTERVAL 1 HOUR)
                AND success = FALSE;
            SET is_limited = attempt_count >= 10;

        WHEN 'post' THEN
            SELECT COUNT(*) INTO attempt_count
            FROM threads
            WHERE author_pseudo = pseudo_param
                AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR);
            SET is_limited = attempt_count >= 5;

        WHEN 'reply' THEN
            SELECT COUNT(*) INTO attempt_count
            FROM replies
            WHERE author_pseudo = pseudo_param
                AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR);
            SET is_limited = attempt_count >= 20;

        ELSE
            SET is_limited = FALSE;
    END CASE;
END$$

DELIMITER ;

-- Scheduled events (requires event scheduler enabled)

-- Clean old login attempts daily
CREATE EVENT IF NOT EXISTS cleanup_old_attempts
ON SCHEDULE EVERY 1 DAY
DO CALL cleanup_login_attempts();

-- Initial data

-- Insert default banned words (drug sourcing related)
INSERT INTO banned_words (word, severity, added_by) VALUES
('wickr', 'auto_delete', 'system'),
('telegram dealer', 'auto_delete', 'system'),
('for sale', 'auto_hide', 'system'),
('où acheter', 'auto_hide', 'system'),
('waar kopen', 'auto_hide', 'system');

-- Create system user for automated actions
INSERT INTO users (pseudo, pin_hash, pin_salt, is_moderator) VALUES
('system', 'no_login', 'no_login', TRUE);

-- Grants for application user
-- Create limited user for application
CREATE USER IF NOT EXISTS 'bonplan_app'@'localhost' IDENTIFIED BY 'CHANGE_THIS_PASSWORD';

GRANT SELECT, INSERT, UPDATE ON bonplan_forum.* TO 'bonplan_app'@'localhost';
GRANT DELETE ON bonplan_forum.login_attempts TO 'bonplan_app'@'localhost';
GRANT DELETE ON bonplan_forum.reports TO 'bonplan_app'@'localhost';
GRANT EXECUTE ON bonplan_forum.* TO 'bonplan_app'@'localhost';

FLUSH PRIVILEGES;