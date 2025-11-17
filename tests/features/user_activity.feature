Feature: User Activity Tracking and Requirements
  As a platform administrator
  I want to track and enforce user activity requirements
  So that community rooms maintain engagement and active participation

  Background:
    Given the following users exist:
      | username    | email                  | verified |
      | active_user | active@example.com     | true     |
      | lazy_user   | lazy@example.com       | true     |
      | new_user    | new@example.com        | true     |
      | returning   | returning@example.com  | true     |
    And a room "Activity Monitoring Room" exists with 15 members
    And the room "Activity Monitoring Room" is active
    And the current date is "2024-01-15"

  # Posting Requirements

  Scenario: Track user posting frequency
    Given "active_user" is a member of "Activity Monitoring Room"
    And "active_user" last posted 13 days ago
    When the activity tracking job runs
    Then "active_user" should have status "compliant"
    And no warning should be sent to "active_user"

  Scenario: Warn user approaching posting deadline
    Given "lazy_user" is a member of "Activity Monitoring Room"
    And "lazy_user" last posted 12 days ago
    When the daily activity check runs
    Then "lazy_user" should receive a warning "You haven't posted in 12 days. Please post within 2 days to maintain membership"
    And the warning should be logged in the user's activity record

  Scenario: User exceeds two-week posting requirement
    Given "lazy_user" is a member of "Activity Monitoring Room"
    And "lazy_user" last posted 15 days ago
    When the activity enforcement job runs
    Then "lazy_user" should be marked as "non-compliant"
    And "lazy_user" should receive notification "You have exceeded the 2-week posting requirement"
    And the room moderators should be notified of the violation

  Scenario Outline: Posting compliance at different intervals
    Given a user last posted <days_ago> days ago
    When the activity check runs
    Then the user's posting status should be "<status>"
    And warning should be sent: <send_warning>

    Examples:
      | days_ago | status        | send_warning |
      | 0        | compliant     | false        |
      | 7        | compliant     | false        |
      | 11       | compliant     | false        |
      | 12       | warning       | true         |
      | 13       | warning       | true         |
      | 14       | compliant     | false        |
      | 15       | non-compliant | true         |
      | 20       | non-compliant | true         |

  # Viewing Requirements

  Scenario: Track user viewing activity
    Given "active_user" is a member of "Activity Monitoring Room"
    And "active_user" last viewed the room 3 days ago
    When the viewing activity check runs
    Then "active_user" viewing status should be "compliant"
    And no viewing warning should be sent

  Scenario: User exceeds one-week viewing requirement
    Given "lazy_user" is a member of "Activity Monitoring Room"
    And "lazy_user" last viewed the room 8 days ago
    When the viewing activity check runs
    Then "lazy_user" should be marked as "inactive viewer"
    And "lazy_user" should receive email notification "Please visit Activity Monitoring Room"
    And the email should include a direct link to the room

  Scenario: Viewing activity updates on room access
    Given "returning" hasn't viewed the room in 6 days
    When "returning" visits the room page
    Then the last_viewed timestamp should be updated to now
    And the viewing streak should be maintained
    And the user should see "Welcome back! Last visit: 6 days ago"

  Scenario Outline: Viewing compliance at different intervals
    Given a user last viewed the room <days_ago> days ago
    When the viewing check runs
    Then the user's viewing status should be "<status>"
    And email notification should be sent: <send_email>

    Examples:
      | days_ago | status        | send_email |
      | 0        | compliant     | false      |
      | 3        | compliant     | false      |
      | 5        | warning       | true       |
      | 6        | warning       | true       |
      | 7        | compliant     | false      |
      | 8        | non-compliant | true       |
      | 14       | non-compliant | true       |

  # Combined Activity Tracking

  Scenario: Dashboard shows comprehensive activity status
    Given I am logged in as "active_user"
    And I have the following activity record:
      | metric           | value        | status    |
      | last_post        | 5 days ago   | compliant |
      | last_view        | 1 hour ago   | compliant |
      | posts_this_month | 8            | active    |
      | views_this_week  | 12           | active    |
    When I visit my activity dashboard
    Then I should see all activity metrics
    And I should see "Activity Status: Fully Compliant"
    And I should see a green status indicator

  Scenario: Multiple violation handling
    Given "lazy_user" has the following violations:
      | requirement      | last_activity | days_overdue |
      | posting          | 16 days ago   | 2            |
      | viewing          | 9 days ago    | 2            |
    When the comprehensive activity check runs
    Then "lazy_user" should receive a combined warning notification
    And the notification should list all violations
    And the user should be given 48 hours to rectify

  # Activity Streaks and Rewards

  Scenario: Track posting streak
    Given "active_user" has posted every 3 days for the past month
    When the streak calculation runs
    Then "active_user" should have a 10-post streak
    And the streak should be displayed in their profile
    And they should receive a "Consistent Contributor" achievement

  Scenario: Track viewing streak
    Given "active_user" has viewed the room daily for 30 days
    When the streak calculation runs
    Then "active_user" should have a 30-day viewing streak
    And they should receive a "Dedicated Member" achievement

  Scenario: Streak breaks and recovery
    Given "active_user" has a 15-day posting streak
    And "active_user" doesn't post for 15 days
    When "active_user" posts again
    Then the streak should reset to 1
    And the user should see "Streak broken after 15 days"
    And the previous best streak should be recorded

  # Grace Periods and Exceptions

  Scenario: New member grace period
    Given "new_user" joined the room 3 days ago
    And "new_user" hasn't posted yet
    When the activity check runs
    Then "new_user" should have status "grace period"
    And no warnings should be sent for the first week

  Scenario: Vacation mode
    Given "active_user" enables vacation mode for 2 weeks
    When the activity checks run during vacation
    Then no violations should be recorded for "active_user"
    And activity requirements should resume after vacation ends
    And other members should see "active_user is on vacation"

  Scenario: Medical exception
    Given "active_user" has a medical exception approved
    When the activity checks run
    Then requirements should be relaxed to 1 month for posting
    And viewing requirements should remain at 1 week
    And the exception should expire after 3 months

  # Enforcement Actions

  Scenario: Progressive enforcement for violations
    Given "lazy_user" has the following violation history:
      | violation_count | action_taken          |
      | 1              | Warning sent          |
      | 2              | Final warning sent    |
      | 3              | Temporary restriction |
    When "lazy_user" commits a 4th violation
    Then "lazy_user" should be removed from the room
    And a removal notification should be sent
    And the user should be blocked from rejoining for 30 days

  Scenario: Activity requirement reminder schedule
    Given the following reminder schedule is configured:
      | days_before_deadline | reminder_type |
      | 3                   | gentle        |
      | 2                   | standard      |
      | 1                   | urgent        |
      | 0                   | final         |
    When a user approaches their posting deadline
    Then reminders should be sent according to the schedule
    And each reminder should have increasing urgency

  # Reporting and Analytics

  Scenario: Generate room activity report
    Given I am a room moderator
    When I request an activity report for the last month
    Then I should see:
      | metric                    | value |
      | Total members             | 15    |
      | Active posters            | 12    |
      | Active viewers            | 14    |
      | Members at risk           | 2     |
      | Average posts per member  | 4.3   |
      | Average views per member  | 28    |
    And I should be able to export the report as CSV

  Scenario: Individual activity timeline
    Given "active_user" has been a member for 3 months
    When I view their activity timeline
    Then I should see a chronological list of:
      | activity_type | count |
      | Posts        | 24    |
      | Views        | 89    |
      | Reactions    | 156   |
      | Comments     | 67    |
    And I should see a graph of activity over time

  # Notifications and Preferences

  Scenario: Customize activity reminder preferences
    Given I am in my notification settings
    When I set posting reminders to "2 days before deadline"
    And I set viewing reminders to "disabled"
    Then I should receive posting reminders at my chosen time
    And I should not receive viewing reminders

  Scenario: Bulk activity notification batching
    Given a user has multiple activity warnings
    When the notification system runs
    Then all warnings should be combined into a single notification
    And the notification should prioritize the most urgent items
    And provide clear action items for each requirement