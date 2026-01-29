import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { ICustomWorld } from '../support/world';

// =============================================================================
// GIVEN STEPS
// =============================================================================

Given('I am on the application page', async function (this: ICustomWorld) {
  await this.page!.goto('/');
});

Given('I navigate to {string}', async function (this: ICustomWorld, url: string) {
  await this.page!.goto(url);
});

Given('I am on the {string} page', async function (this: ICustomWorld, pageName: string) {
  const urls: Record<string, string> = {
    'home': '/',
    'login': '/login',
    'register': '/register',
    'dashboard': '/dashboard',
  };
  await this.page!.goto(urls[pageName.toLowerCase()] || '/' + pageName);
});

// =============================================================================
// WHEN STEPS
// =============================================================================

When('I click on {string}', async function (this: ICustomWorld, selector: string) {
  await this.page!.locator(selector).click();
});

When('I enter {string} in the {string} field', async function (
  this: ICustomWorld,
  value: string,
  selector: string
) {
  await this.page!.locator(selector).fill(value);
});

When('I clear the {string} field', async function (this: ICustomWorld, selector: string) {
  await this.page!.locator(selector).clear();
});

When('I check the {string} checkbox', async function (this: ICustomWorld, selector: string) {
  await this.page!.locator(selector).check();
});

When('I select {string} from {string}', async function (
  this: ICustomWorld,
  option: string,
  selector: string
) {
  await this.page!.locator(selector).selectOption(option);
});

When('I hover over {string}', async function (this: ICustomWorld, selector: string) {
  await this.page!.locator(selector).hover();
});

When('I press {string}', async function (this: ICustomWorld, key: string) {
  await this.page!.keyboard.press(key);
});

// =============================================================================
// THEN STEPS
// =============================================================================

Then('I should see {string}', async function (this: ICustomWorld, text: string) {
  await expect(this.page!.getByText(text)).toBeVisible();
});

Then('I should not see {string}', async function (this: ICustomWorld, text: string) {
  await expect(this.page!.getByText(text)).not.toBeVisible();
});

Then('the element {string} should be visible', async function (
  this: ICustomWorld,
  selector: string
) {
  await expect(this.page!.locator(selector)).toBeVisible();
});

Then('the element {string} should contain {string}', async function (
  this: ICustomWorld,
  selector: string,
  text: string
) {
  await expect(this.page!.locator(selector)).toContainText(text);
});

Then('the input {string} should have value {string}', async function (
  this: ICustomWorld,
  selector: string,
  value: string
) {
  await expect(this.page!.locator(selector)).toHaveValue(value);
});

Then('the URL should be {string}', async function (this: ICustomWorld, url: string) {
  await expect(this.page!).toHaveURL(url);
});

Then('the URL should contain {string}', async function (this: ICustomWorld, urlPart: string) {
  await expect(this.page!).toHaveURL(new RegExp(urlPart));
});

Then('the page title should be {string}', async function (this: ICustomWorld, title: string) {
  await expect(this.page!).toHaveTitle(title);
});
