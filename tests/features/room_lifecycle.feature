Feature: Community Moderation Room Lifecycle
  As a platform moderator
  I want to manage the lifecycle of community moderation rooms
  So that rooms maintain adequate activity and membership levels

  Background:
    Given the following users exist:
      | username      | email                    | verified |
      | alice         | alice@example.com        | true     |
      | bob           | bob@example.com          | true     |
      | charlie       | charlie@example.com      | true     |
      | david         | david@example.com        | true     |
      | eve           | eve@example.com          | true     |
      | frank         | frank@example.com        | true     |
      | grace         | grace@example.com        | true     |
      | henry         | henry@example.com        | true     |
      | ivan          | ivan@example.com         | true     |
      | julia         | julia@example.com        | true     |
      | kevin         | kevin@example.com        | true     |
      | laura         | laura@example.com        | true     |
    And I am logged in as "alice"

  # Room Creation & Activation

  Scenario: Cannot create room with less than 6 people
    Given I am on the room creation page
    When I fill in "Room Name" with "Support Group Alpha"
    And I add the following members:
      | bob     |
      | charlie |
      | david   |
      | eve     |
    And I click "Create Room"
    Then I should see "A minimum of 6 people is required to create a room"
    And the room "Support Group Alpha" should not exist

  Scenario: Successfully create room with minimum 6 people
    Given I am on the room creation page
    When I fill in "Room Name" with "Support Group Beta"
    And I add the following members:
      | bob     |
      | charlie |
      | david   |
      | eve     |
      | frank   |
    And I click "Create Room"
    Then I should see "Room created successfully"
    And the room "Support Group Beta" should exist
    And the room "Support Group Beta" should have status "inactive"
    And the room "Support Group Beta" should have 6 members

  Scenario: Room becomes active when reaching 10 members
    Given a room "Support Group Gamma" exists with 9 members including me
    And the room "Support Group Gamma" has status "inactive"
    When user "kevin" joins the room "Support Group Gamma"
    Then the room "Support Group Gamma" should have status "active"
    And the room "Support Group Gamma" should have 10 members
    And I should see notification "Room Support Group Gamma is now active"

  Scenario Outline: Room activation at different member counts
    Given a room "Test Room" exists with <initial_count> members including me
    When <new_members> new users join the room
    Then the room should have status "<expected_status>"
    And the room should have <final_count> members

    Examples:
      | initial_count | new_members | expected_status | final_count |
      | 6            | 0           | inactive        | 6           |
      | 7            | 2           | inactive        | 9           |
      | 8            | 2           | active          | 10          |
      | 9            | 1           | active          | 10          |
      | 10           | 0           | active          | 10          |
      | 10           | 5           | active          | 15          |

  # Room Visibility

  Scenario: Non-registered users cannot see rooms
    Given a room "Private Support" exists with 15 members
    And the room "Private Support" has status "active"
    When I am not logged in
    And I visit the rooms listing page
    Then I should not see "Private Support"
    And I should see "Please log in to view community rooms"

  Scenario: Registered users can see active rooms
    Given a room "Public Support" exists with 12 members
    And the room "Public Support" has status "active"
    When I am logged in as "bob"
    And I visit the rooms listing page
    Then I should see "Public Support"
    And I should see "12 members"

  # Room Auto-Deletion

  Scenario: Room auto-deletes when membership falls below 10
    Given a room "Declining Room" exists with 10 members including me
    And the room "Declining Room" has status "active"
    When user "bob" leaves the room "Declining Room"
    Then the room "Declining Room" should have 9 members
    And the room "Declining Room" should be marked for deletion
    And all members should receive notification "Room Declining Room has been deleted due to insufficient membership"
    And the room "Declining Room" should not exist

  Scenario: Room deletion cascade
    Given a room "Deletion Test" exists with 10 members
    And the room has 25 posts
    And the room has 3 pinned announcements
    When 2 users leave the room bringing membership to 8
    Then the room "Deletion Test" should be deleted
    And all posts in "Deletion Test" should be deleted
    And all announcements in "Deletion Test" should be deleted
    And no references to "Deletion Test" should exist in the database

  # Room Auto-Locking

  Scenario: Room locks after 72 hours of low activity
    Given a room "Low Activity Room" exists with 15 members
    And the room "Low Activity Room" has status "active"
    And the following posts were made in the room:
      | author  | posted_at           |
      | alice   | 73 hours ago        |
      | bob     | 74 hours ago        |
      | charlie | 75 hours ago        |
    When the room activity check runs
    Then the room "Low Activity Room" should have status "locked"
    And members should see "This room is locked due to low activity"
    And members should not be able to create new posts

  Scenario: Room with exactly 4 posters in 72 hours remains active
    Given a room "Active Room" exists with 15 members
    And the room "Active Room" has status "active"
    And the following posts were made in the room:
      | author  | posted_at    |
      | alice   | 1 hour ago   |
      | bob     | 24 hours ago |
      | charlie | 48 hours ago |
      | david   | 71 hours ago |
    When the room activity check runs
    Then the room "Active Room" should have status "active"

  Scenario: Locked room unlocks when activity resumes
    Given a room "Locked Room" exists with 15 members
    And the room "Locked Room" has status "locked"
    When the following users create posts:
      | alice   |
      | bob     |
      | charlie |
      | david   |
    And the room activity check runs
    Then the room "Locked Room" should have status "active"
    And members should see "Room has been unlocked due to renewed activity"

  Scenario Outline: Room locking based on poster count
    Given a room "Activity Test" exists with 15 members
    And <poster_count> different users posted in the last 72 hours
    When the room activity check runs
    Then the room should have status "<expected_status>"

    Examples:
      | poster_count | expected_status |
      | 0           | locked          |
      | 1           | locked          |
      | 2           | locked          |
      | 3           | locked          |
      | 4           | active          |
      | 5           | active          |
      | 10          | active          |

  # Edge Cases

  Scenario: Room state transitions during concurrent operations
    Given a room "Concurrent Test" exists with 10 members
    And the room "Concurrent Test" has status "active"
    When user "bob" leaves the room
    And simultaneously user "charlie" creates a post
    And simultaneously user "kevin" tries to join the room
    Then the room should handle the operations gracefully
    And the final member count should be accurate
    And the room status should be consistent with the rules

  Scenario: Room founder badge assignment
    Given I create a room "Founder Test" with 6 members
    Then I should receive the "room founder" badge
    And the badge should appear in my profile
    And the badge should show timestamp of room creation

  Scenario: Multiple room state changes in succession
    Given a room "State Test" exists with 11 members
    And the room has status "active"
    When 2 members leave bringing count to 9
    Then the room should be deleted
    When I try to access the deleted room
    Then I should see "This room no longer exists"
    And I should be redirected to the rooms listing page