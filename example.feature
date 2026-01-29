@browser-js @example
Feature: Login Functionality
  Example of migrated Browser JS test to Playwright BDD

  Background:
    Given I am on the application page

  @smoke
  Scenario: Successful login with valid credentials
    Given I navigate to "/login"
    When I enter "user@example.com" in the "#email" field
    And I enter "password123" in the "#password" field
    And I click on ".login-btn"
    Then the URL should contain "/dashboard"
    And I should see "Welcome"

  @negative
  Scenario: Login fails with invalid password
    Given I navigate to "/login"
    When I enter "user@example.com" in the "#email" field
    And I enter "wrongpassword" in the "#password" field
    And I click on ".login-btn"
    Then I should see "Invalid credentials"
    And the URL should contain "/login"

  @validation
  Scenario: Form validation for empty fields
    Given I navigate to "/login"
    When I click on ".login-btn"
    Then I should see "Email is required"
    And I should see "Password is required"
