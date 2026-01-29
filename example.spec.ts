import { test, expect } from '@playwright/test';

/**
 * Example: Migrated from Cypress test
 * Original: cypress/e2e/login.cy.js
 */

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should login with valid credentials', async ({ page }) => {
    // Fill in credentials
    await page.locator('#email').fill('user@example.com');
    await page.locator('#password').fill('password123');
    
    // Submit form
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    // Verify redirect to dashboard
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.getByText('Welcome back')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.locator('#email').fill('user@example.com');
    await page.locator('#password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    await expect(page.getByText('Invalid credentials')).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('should validate required fields', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('should navigate to forgot password', async ({ page }) => {
    await page.getByRole('link', { name: 'Forgot Password?' }).click();
    
    await expect(page).toHaveURL(/forgot-password/);
  });
});

/**
 * Example: Migrated from Selenium test
 * Shows common patterns
 */
test.describe('Search Functionality', () => {
  test('should search and display results', async ({ page }) => {
    await page.goto('/');
    
    // Type in search box
    await page.locator('[data-testid="search-input"]').fill('playwright');
    await page.locator('[data-testid="search-input"]').press('Enter');
    
    // Wait for results (Playwright auto-waits, but explicit for clarity)
    await expect(page.locator('.search-results')).toBeVisible();
    
    // Verify results count
    await expect(page.locator('.result-item')).toHaveCount(10);
    
    // Verify first result contains search term
    await expect(page.locator('.result-item').first()).toContainText('playwright');
  });

  test('should handle no results', async ({ page }) => {
    await page.goto('/');
    
    await page.locator('[data-testid="search-input"]').fill('xyznonexistent123');
    await page.locator('[data-testid="search-input"]').press('Enter');
    
    await expect(page.getByText('No results found')).toBeVisible();
  });
});

/**
 * Example: Using Page Object Model (recommended for larger suites)
 */
class LoginPage {
  constructor(private page: any) {}

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.page.locator('#email').fill(email);
    await this.page.locator('#password').fill(password);
    await this.page.getByRole('button', { name: 'Sign In' }).click();
  }

  async expectError(message: string) {
    await expect(this.page.getByText(message)).toBeVisible();
  }
}

test('using page object model', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login('test@example.com', 'password');
  await expect(page).toHaveURL(/dashboard/);
});
