Feature: Post Lifetime and Expiration Management
  As a room moderator
  I want to manage post lifetimes and automatic deletion
  So that content remains relevant and storage is optimized

  Background:
    Given the following users exist:
      | username | email              | verified |
      | alice    | alice@example.com  | true     |
      | bob      | bob@example.com    | true     |
      | charlie  | charlie@example.com| true     |
      | moderator| mod@example.com    | true     |
    And a room "Expiration Test Room" exists with 15 members
    And the room "Expiration Test Room" is active
    And I am logged in as "moderator"
    And I have moderator privileges in "Expiration Test Room"

  # Post Lifetime Configuration

  Scenario: Configure default post lifetime for room
    Given I am on the room settings page for "Expiration Test Room"
    When I set the default post lifetime to 30 days
    And I click "Save Settings"
    Then I should see "Room settings updated successfully"
    And new posts in the room should have a 30-day lifetime

  Scenario: Cannot set post lifetime below minimum
    Given I am on the room settings page for "Expiration Test Room"
    When I set the default post lifetime to 5 days
    And I click "Save Settings"
    Then I should see "Post lifetime must be at least 10 days"
    And the post lifetime setting should not be saved

  Scenario Outline: Post lifetime validation
    Given I am configuring post lifetime for a room
    When I set the post lifetime to <lifetime> days
    Then the validation result should be "<result>"
    And the error message should be "<error_message>"

    Examples:
      | lifetime | result  | error_message                          |
      | 5        | invalid | Post lifetime must be at least 10 days |
      | 9        | invalid | Post lifetime must be at least 10 days |
      | 10       | valid   |                                        |
      | 11       | valid   |                                        |
      | 30       | valid   |                                        |
      | 365      | valid   |                                        |

  # Post Creation with Expiration

  Scenario: Create post with default room expiration
    Given the room has a default post lifetime of 14 days
    When I create a post with content "This is a test post"
    Then the post should be created successfully
    And the post should have an expiration date 14 days from now
    And the post should display "Expires in 14 days"

  Scenario: Create post with custom expiration
    Given the room allows custom post lifetimes
    When I create a post with content "Custom expiration post"
    And I set custom expiration to 20 days
    Then the post should have an expiration date 20 days from now
    And the post should display "Expires in 20 days"

  Scenario: Override post expiration as moderator
    Given a post exists with expiration in 5 days
    When I extend the post expiration by 10 days
    Then the post should expire in 15 days
    And an audit log entry should be created for the extension

  # Auto-Deletion Process

  Scenario: Post auto-deletes after expiration
    Given a post "Old Content" was created 30 days ago
    And the post had a lifetime of 30 days
    When the post expiration job runs
    Then the post "Old Content" should be deleted
    And users should see "This post has expired and been removed"
    And the deletion should be logged in the audit trail

  Scenario: Bulk post expiration processing
    Given the following posts exist with expiration dates:
      | post_title      | created_at   | lifetime | status    |
      | Post A          | 31 days ago  | 30 days  | expired   |
      | Post B          | 29 days ago  | 30 days  | active    |
      | Post C          | 15 days ago  | 14 days  | expired   |
      | Post D          | 10 days ago  | 14 days  | active    |
      | Post E          | 21 days ago  | 20 days  | expired   |
    When the post expiration job runs
    Then posts "Post A, Post C, Post E" should be deleted
    And posts "Post B, Post D" should remain active
    And 3 deletion events should be logged

  Scenario: Warning before post expiration
    Given a post is set to expire in 2 days
    When users view the post
    Then they should see a warning "This post will expire in 2 days"
    And the warning should be highlighted in yellow
    And the author should receive a notification about upcoming expiration

  Scenario: Batch notification for expiring posts
    Given the following posts are expiring soon:
      | post_title | expires_in | author  |
      | Post 1     | 1 day      | alice   |
      | Post 2     | 2 days     | alice   |
      | Post 3     | 1 day      | bob     |
    When the daily notification job runs
    Then "alice" should receive a notification about 2 expiring posts
    And "bob" should receive a notification about 1 expiring post

  # Edge Cases and Special Scenarios

  Scenario: Pinned posts with expiration
    Given a post is pinned in the room
    And the post is set to expire in 1 day
    When the post expiration job runs
    Then the post should be unpinned automatically
    And then deleted according to expiration rules
    And moderators should be notified of pinned post expiration

  Scenario: Reply chain handling on parent expiration
    Given a post has 5 replies
    And the parent post expires today
    When the post expiration job runs
    Then the parent post should be deleted
    And the replies should be marked as "parent deleted"
    And replies should remain visible with a notice

  Scenario: Expiration during active discussion
    Given a post has received 10 replies in the last hour
    And the post is set to expire now
    When the expiration job runs
    Then the post expiration should be extended by 24 hours
    And participants should be notified of the extension
    And the reason "Active discussion" should be logged

  Scenario: Export before expiration
    Given a post is expiring in 1 hour
    When I request to export the post content
    Then I should receive the post in markdown format
    And the export should include all metadata
    And the export should note the original expiration date

  # Moderator Controls

  Scenario: Disable expiration for important posts
    Given I am viewing an important announcement post
    When I click "Disable expiration"
    And I provide reason "Community guidelines"
    Then the post should have no expiration date
    And the action should be logged with the reason
    And the post should display "No expiration"

  Scenario: Bulk extend expiration for multiple posts
    Given I select 5 posts that expire within 3 days
    When I choose "Bulk extend expiration"
    And I extend by 7 days
    Then all 5 posts should have updated expiration dates
    And a single audit log entry should record the bulk action

  # Performance and Cleanup

  Scenario: Efficient cleanup of expired posts
    Given 1000 posts have expired in the last hour
    When the expiration job runs
    Then all expired posts should be processed within 5 minutes
    And database performance should not degrade
    And the cleanup should be done in batches of 100

  Scenario: Retention of deleted post metadata
    Given a post "Historical Post" expired and was deleted
    When I view the audit log
    Then I should see the deletion record for "Historical Post"
    And the record should include:
      | field             | value                |
      | post_id           | [original_id]        |
      | deleted_at        | [timestamp]          |
      | expiration_reason | Lifetime expired     |
      | original_author   | [author_username]    |
      | original_title    | Historical Post      |

  # User Preferences

  Scenario: User preference for expiration warnings
    Given I have enabled expiration warnings in my preferences
    And I have posts expiring in the next 7 days
    When I log into the platform
    Then I should see a dashboard widget showing expiring posts
    And I should be able to take action on each post

  Scenario: Opt-in for expiration notifications
    Given I am in my notification settings
    When I enable "Post expiration reminders"
    And I set reminder timing to "3 days before"
    Then I should receive reminders 3 days before my posts expire
    And the reminders should include quick action links