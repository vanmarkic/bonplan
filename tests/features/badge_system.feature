Feature: Badge System for Community Recognition
  As a platform administrator
  I want to award badges for achievements and milestones
  So that users feel recognized and motivated to participate

  Background:
    Given the following users exist:
      | username      | email                    | verified | joined_date |
      | veteran_user  | veteran@example.com      | true     | 2023-10-01  |
      | helper_user   | helper@example.com       | true     | 2023-11-01  |
      | founder_user  | founder@example.com      | true     | 2023-09-01  |
      | new_user      | new@example.com          | true     | 2024-01-01  |
      | active_helper | active@example.com       | true     | 2023-10-15  |
    And the current date is "2024-01-15"
    And the badge system is enabled

  # Milestone Badge: 3 Months Clean

  Scenario: Award 3 months clean milestone badge
    Given "veteran_user" has been active for 3 months
    And "veteran_user" has maintained sobriety status for 3 months
    When the milestone badge evaluation runs
    Then "veteran_user" should receive the "3 months clean" badge
    And the badge should show the achievement date
    And "veteran_user" should receive a congratulations notification
    And the badge should appear in their public profile

  Scenario: Track progress towards 3 months clean
    Given "new_user" has been clean for 45 days
    When "new_user" views their progress page
    Then they should see "45 days clean - 45 days until 3 month milestone"
    And a progress bar should show 50% completion
    And estimated achievement date should be displayed

  Scenario: Milestone badge with relapse handling
    Given "veteran_user" had achieved "3 months clean" badge
    And "veteran_user" reported a relapse 10 days ago
    When "veteran_user" resets their sobriety counter
    Then the "3 months clean" badge should be marked as "previously earned"
    And the badge should show original achievement date
    And a new progress tracker should start from the reset date

  Scenario Outline: Multiple milestone badges
    Given a user has been clean for <days_clean> days
    When the milestone evaluation runs
    Then the user should have badges: <badges_earned>

    Examples:
      | days_clean | badges_earned                                    |
      | 30         | 1 month clean                                   |
      | 60         | 1 month clean, 2 months clean                   |
      | 90         | 1 month clean, 2 months clean, 3 months clean  |
      | 180        | 1-6 months clean badges                         |
      | 365        | All monthly badges, 1 year clean                |

  # Achievement Badge: Active Helper

  Scenario: Award active helper badge for consistent support
    Given "helper_user" has provided helpful responses
    And "helper_user" has the following activity in the past month:
      | metric                  | count |
      | helpful_posts          | 25    |
      | posts_marked_helpful   | 20    |
      | users_helped          | 15    |
      | support_messages_sent  | 30    |
    When the achievement badge evaluation runs
    Then "helper_user" should receive the "active helper" badge
    And the badge description should read "Recognized for outstanding community support"

  Scenario: Active helper badge criteria validation
    Given the active helper criteria requires:
      | criterion                | minimum |
      | helpful_posts_per_month | 20      |
      | helpfulness_rate        | 75%     |
      | unique_users_helped     | 10      |
    When evaluating "active_helper" with:
      | metric              | value |
      | helpful_posts      | 22    |
      | total_posts        | 28    |
      | users_helped       | 12    |
    Then "active_helper" should qualify for the badge
    And the badge should be awarded immediately

  Scenario: Maintain active helper status
    Given "helper_user" has the "active helper" badge
    And "helper_user" continues meeting criteria for 3 months
    When the monthly badge review runs
    Then "helper_user" should retain the "active helper" badge
    And receive an "active helper - 3 months" endorsement
    And their badge should show a streak indicator

  Scenario: Lose active helper badge due to inactivity
    Given "helper_user" has the "active helper" badge
    And "helper_user" hasn't met criteria for 2 months
    When the badge review runs
    Then the "active helper" badge should become "inactive"
    And "helper_user" should receive a notification about badge status
    And the badge should show "Last active: 2 months ago"

  # Room Founder Badge

  Scenario: Award room founder badge on room creation
    Given "founder_user" initiates room creation
    And "founder_user" successfully creates "Recovery Warriors" with 6 members
    When the room creation completes
    Then "founder_user" should immediately receive the "room founder" badge
    And the badge should link to "Recovery Warriors" room
    And the badge tooltip should show "Founded: Recovery Warriors"

  Scenario: Multiple room founder badges
    Given "founder_user" has already founded 2 rooms
    When "founder_user" creates a third room "New Horizons"
    Then "founder_user" should receive an upgraded "room founder x3" badge
    And the previous badges should be consolidated
    And the badge should list all founded rooms

  Scenario: Room founder badge with room deletion
    Given "founder_user" founded "Temporary Room"
    And "founder_user" has the "room founder" badge for it
    When "Temporary Room" is deleted due to low membership
    Then the badge should show "room founder (Room closed)"
    And the historical record should be maintained
    And the badge should remain in the profile with updated status

  # Badge Display and Management

  Scenario: Badge showcase on user profile
    Given "veteran_user" has the following badges:
      | badge_name        | earned_date | status   |
      | 3 months clean   | 2024-01-01  | active   |
      | active helper    | 2023-12-15  | active   |
      | room founder     | 2023-11-01  | active   |
      | 1 month clean    | 2023-11-01  | upgraded |
    When viewing "veteran_user" profile
    Then active badges should be prominently displayed
    And upgraded badges should be hidden by default
    And badges should be sorted by importance

  Scenario: Badge notification preferences
    Given I am in my notification settings
    When I configure badge notifications:
      | notification_type        | setting  |
      | milestone_achieved      | enabled  |
      | badge_progress_update   | weekly   |
      | badge_at_risk          | enabled  |
      | others_achievements    | disabled |
    Then I should receive notifications according to my preferences

  Scenario: Private vs public badges
    Given "veteran_user" has achieved sensitive badges
    When "veteran_user" configures privacy settings:
      | badge_type      | visibility |
      | 3 months clean  | private    |
      | active helper   | public     |
      | room founder    | public     |
    Then only public badges should appear to other users
    And private badges should show to the user only

  # Badge Progress Tracking

  Scenario: Real-time badge progress dashboard
    Given I am logged in as "new_user"
    When I visit the badge progress page
    Then I should see progress for available badges:
      | badge_name        | progress | next_milestone |
      | 1 month clean    | 45%      | 17 days        |
      | active helper    | 30%      | 14 more posts  |
      | consistent_login | 80%      | 2 more days    |
    And I should see recommended actions for each badge

  Scenario: Badge achievement celebration
    Given "veteran_user" just achieved "6 months clean" badge
    When the achievement is processed
    Then a celebration animation should play
    And the achievement should be posted to the community feed
    And supportive auto-reactions should be added
    And the user should receive bonus karma points

  # Special Badge Combinations

  Scenario: Unlock combo badges
    Given "veteran_user" has earned:
      | badge_name      |
      | 3 months clean  |
      | active helper   |
      | room founder    |
    When the combo badge evaluator runs
    Then "veteran_user" should receive "Community Pillar" combo badge
    And the combo badge should reference component badges

  Scenario: Seasonal and limited-time badges
    Given a "New Year Resolution" badge is available until "2024-01-31"
    And "new_user" meets the criteria on "2024-01-20"
    When the badge is evaluated
    Then "new_user" should receive the limited-time badge
    And the badge should show "Limited Edition - January 2024"

  # Badge Statistics and Analytics

  Scenario: View badge statistics for room
    Given I am a moderator of "Recovery Warriors"
    When I view room badge analytics
    Then I should see:
      | metric                    | value |
      | Total badges earned       | 145   |
      | Members with badges       | 12    |
      | Most common badge         | 1 month clean |
      | Rarest badge             | Community Pillar |
      | Badges this month        | 23    |
    And I should see a trend graph over time

  Scenario: Personal badge history
    Given "veteran_user" has earned 15 badges over time
    When "veteran_user" views their badge history
    Then they should see a timeline of all badges earned
    And each entry should show:
      | field           | displayed |
      | badge_name      | yes       |
      | earned_date     | yes       |
      | earned_for      | yes       |
      | room_context    | yes       |

  # Badge Revocation and Appeals

  Scenario: Revoke badge for policy violation
    Given "helper_user" has "active helper" badge
    And "helper_user" violated community guidelines
    When an administrator revokes the badge
    Then the badge should be marked as "revoked"
    And "helper_user" should receive a notification with reason
    And an audit log entry should be created

  Scenario: Appeal badge revocation
    Given "helper_user" had badge revoked 5 days ago
    When "helper_user" submits an appeal with explanation
    Then the appeal should be queued for review
    And moderators should receive the appeal notification
    And the badge should show "Under appeal" status

  # Badge Gamification

  Scenario: Badge points and leaderboard
    Given badges have point values:
      | badge_name        | points |
      | 1 month clean    | 100    |
      | 3 months clean   | 500    |
      | active helper    | 300    |
      | room founder     | 400    |
    When calculating leaderboard positions
    Then users should be ranked by total badge points
    And the top 10 users should be featured
    And monthly badge point leaders should be highlighted

  Scenario: Badge challenges and goals
    Given a monthly challenge "January Helper" is active
    And the challenge requires helping 5 new users
    When "active_helper" completes the challenge
    Then they should receive the challenge badge
    And bonus points should be awarded
    And the next challenge should be unlocked