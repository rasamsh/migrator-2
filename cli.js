#!/usr/bin/env node

/**
 * Browser JS → Playwright BDD Migration CLI
 * 
 * Converts native browser JavaScript tests to Playwright BDD format
 * with Gherkin feature files and Cucumber step definitions.
 */

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { glob } from 'glob';

const program = new Command();

const BANNER = `
${chalk.cyan('╔════════════════════════════════════════════════════════════╗')}
${chalk.cyan('║')}  ${chalk.bold.white('Browser JS → Playwright BDD Migration')}                    ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.gray('Generates Gherkin features + Cucumber steps')}               ${chalk.cyan('║')}
${chalk.cyan('╚════════════════════════════════════════════════════════════╝')}
`;

// =============================================================================
// BROWSER JS PATTERNS TO DETECT
// =============================================================================

const BROWSER_JS_PATTERNS = {
  selectors: {
    getElementById: /document\.getElementById\(['"]([^'"]+)['"]\)/g,
    querySelector: /document\.querySelector\(['"]([^'"]+)['"]\)/g,
    querySelectorAll: /document\.querySelectorAll\(['"]([^'"]+)['"]\)/g,
    getElementsByClassName: /document\.getElementsByClassName\(['"]([^'"]+)['"]\)/g,
    getElementsByTagName: /document\.getElementsByTagName\(['"]([^'"]+)['"]\)/g,
    getElementsByName: /document\.getElementsByName\(['"]([^'"]+)['"]\)/g,
    jquery: /\$\(['"]([^'"]+)['"]\)/g,
    jqueryFull: /jQuery\(['"]([^'"]+)['"]\)/g,
  },
  properties: {
    innerText: /\.innerText/g,
    innerHTML: /\.innerHTML/g,
    textContent: /\.textContent/g,
    value: /\.value/g,
    checked: /\.checked/g,
    disabled: /\.disabled/g,
    className: /\.className/g,
  },
  actions: {
    click: /\.click\(\)/g,
    focus: /\.focus\(\)/g,
    blur: /\.blur\(\)/g,
    submit: /\.submit\(\)/g,
    reset: /\.reset\(\)/g,
  },
  navigation: {
    locationAssign: /window\.location\s*=/g,
    locationHref: /window\.location\.href\s*=/g,
    locationReload: /window\.location\.reload\(\)/g,
    historyBack: /history\.back\(\)/g,
    historyForward: /history\.forward\(\)/g,
  },
  storage: {
    localStorageSet: /localStorage\.setItem/g,
    localStorageGet: /localStorage\.getItem/g,
    sessionStorageSet: /sessionStorage\.setItem/g,
    sessionStorageGet: /sessionStorage\.getItem/g,
  },
  async: {
    setTimeout: /setTimeout\s*\(/g,
    setInterval: /setInterval\s*\(/g,
    fetch: /fetch\s*\(/g,
    xhr: /XMLHttpRequest/g,
  },
  events: {
    addEventListener: /\.addEventListener\(/g,
    removeEventListener: /\.removeEventListener\(/g,
    dispatchEvent: /\.dispatchEvent\(/g,
  },
  dialogs: {
    alert: /(?:window\.)?alert\(/g,
    confirm: /(?:window\.)?confirm\(/g,
    prompt: /(?:window\.)?prompt\(/g,
  },
};

// =============================================================================
// MIGRATOR CLASS
// =============================================================================

class BrowserJSToPlaywrightBDD {
  constructor(repoPath, config) {
    this.repoPath = repoPath;
    this.config = {
      output: 'tests',
      featuresDir: 'tests/features',
      stepsDir: 'tests/steps',
      supportDir: 'tests/support',
      include: [
        '**/*.test.js',
        '**/*.spec.js',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/test/**/*.js',
        '**/tests/**/*.js',
      ],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/playwright-report/**',
        '**/.playwright/**',
      ],
      dryRun: false,
      verbose: false,
      ...config,
    };
    this.report = {
      analyzed: 0,
      migrated: 0,
      skipped: 0,
      features: 0,
      steps: 0,
      errors: [],
    };
    this.collectedSteps = new Set();
  }

  // ---------------------------------------------------------------------------
  // ANALYZE
  // ---------------------------------------------------------------------------

  async analyze() {
    const spinner = ora('Scanning for Browser JS test files...').start();
    
    const files = await glob(this.config.include, {
      cwd: this.repoPath,
      ignore: this.config.exclude,
      absolute: true,
    });

    const analysis = {
      files: [],
      summary: {
        total: files.length,
        browserJS: 0,
        skipped: 0,
        patterns: {},
        actions: [],
      },
    };

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const detected = this.detectBrowserJS(content);

      if (detected.isBrowserJS) {
        analysis.files.push({
          path: path.relative(this.repoPath, file),
          patterns: detected.patterns,
          actions: detected.actions,
          testCases: this.extractTestCases(content),
        });
        analysis.summary.browserJS++;
        
        // Aggregate patterns
        for (const p of detected.patterns) {
          analysis.summary.patterns[p] = (analysis.summary.patterns[p] || 0) + 1;
        }
        analysis.summary.actions.push(...detected.actions);
      } else {
        analysis.summary.skipped++;
      }
    }

    spinner.succeed(`Found ${analysis.summary.browserJS} Browser JS test files`);
    this.printAnalysis(analysis);

    if (!this.config.dryRun) {
      const reportPath = path.join(this.repoPath, 'migration-analysis.json');
      fs.writeFileSync(reportPath, JSON.stringify(analysis, null, 2));
      console.log(chalk.gray(`\nSaved: ${reportPath}`));
    }

    this.report.analyzed = analysis.summary.browserJS;
    return analysis;
  }

  detectBrowserJS(content) {
    const patterns = [];
    const actions = [];

    for (const [category, regexMap] of Object.entries(BROWSER_JS_PATTERNS)) {
      for (const [name, regex] of Object.entries(regexMap)) {
        const matches = content.match(new RegExp(regex.source, 'g'));
        if (matches && matches.length > 0) {
          patterns.push(`${category}.${name}`);
          
          // Extract specific actions for step generation
          if (category === 'selectors') {
            const selectorMatches = [...content.matchAll(new RegExp(regex.source, 'g'))];
            for (const m of selectorMatches) {
              actions.push({ type: 'select', selector: m[1], method: name });
            }
          }
          if (category === 'actions') {
            actions.push({ type: 'action', action: name });
          }
          if (category === 'navigation') {
            actions.push({ type: 'navigation', action: name });
          }
        }
      }
    }

    return {
      isBrowserJS: patterns.length > 0,
      patterns,
      actions,
    };
  }

  extractTestCases(content) {
    const testCases = [];
    
    // Match describe/it blocks
    const describeRegex = /describe\s*\(\s*['"]([^'"]+)['"]/g;
    const itRegex = /it\s*\(\s*['"]([^'"]+)['"]/g;
    const testRegex = /test\s*\(\s*['"]([^'"]+)['"]/g;

    let match;
    let currentDescribe = 'Tests';

    while ((match = describeRegex.exec(content)) !== null) {
      currentDescribe = match[1];
    }

    while ((match = itRegex.exec(content)) !== null) {
      testCases.push({ describe: currentDescribe, name: match[1] });
    }

    while ((match = testRegex.exec(content)) !== null) {
      testCases.push({ describe: currentDescribe, name: match[1] });
    }

    // If no test structure found, treat whole file as one test
    if (testCases.length === 0) {
      testCases.push({ describe: 'Browser JS Tests', name: 'Main test' });
    }

    return testCases;
  }

  printAnalysis(analysis) {
    console.log(chalk.bold('\n📊 Analysis Results\n'));
    console.log(`Browser JS files: ${chalk.cyan(analysis.summary.browserJS)}`);
    console.log(`Skipped: ${chalk.gray(analysis.summary.skipped)}`);

    if (analysis.summary.browserJS === 0) {
      console.log(chalk.yellow('\nNo Browser JS patterns detected.'));
      return;
    }

    console.log(chalk.bold('\nDetected Patterns:'));
    const sorted = Object.entries(analysis.summary.patterns).sort((a, b) => b[1] - a[1]);
    for (const [pattern, count] of sorted.slice(0, 10)) {
      console.log(`  ${pattern.padEnd(30)} ${chalk.cyan(count)}`);
    }

    console.log(chalk.bold('\nFiles to migrate:'));
    for (const f of analysis.files.slice(0, 5)) {
      console.log(`  ${chalk.white(f.path)}`);
      console.log(`    Tests: ${f.testCases.map(t => t.name).join(', ').slice(0, 50)}...`);
    }
    if (analysis.files.length > 5) {
      console.log(chalk.gray(`  ... and ${analysis.files.length - 5} more`));
    }
  }

  // ---------------------------------------------------------------------------
  // MIGRATE
  // ---------------------------------------------------------------------------

  async migrate() {
    const spinner = ora('Migrating to Playwright BDD...').start();

    // Create directory structure
    const dirs = [
      this.config.featuresDir,
      this.config.stepsDir,
      this.config.supportDir,
    ];
    
    if (!this.config.dryRun) {
      for (const dir of dirs) {
        fs.mkdirSync(path.join(this.repoPath, dir), { recursive: true });
      }
    }

    // Find and process files
    const files = await glob(this.config.include, {
      cwd: this.repoPath,
      ignore: this.config.exclude,
      absolute: true,
    });

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const detected = this.detectBrowserJS(content);

      if (!detected.isBrowserJS) {
        this.report.skipped++;
        continue;
      }

      spinner.text = `Migrating: ${path.basename(file)}`;

      try {
        await this.migrateFile(file, content, detected);
        this.report.migrated++;
      } catch (err) {
        this.report.errors.push({ file, error: err.message });
      }
    }

    // Generate common step definitions
    await this.generateStepDefinitions();

    // Generate support files
    await this.generateSupportFiles();

    spinner.succeed(`Migration complete`);
  }

  async migrateFile(filePath, content, detected) {
    const fileName = path.basename(filePath, path.extname(filePath));
    const testCases = this.extractTestCases(content);
    
    // Generate feature file
    const featureContent = this.generateFeatureFile(fileName, testCases, content, detected);
    const featurePath = path.join(
      this.repoPath,
      this.config.featuresDir,
      `${fileName}.feature`
    );

    if (!this.config.dryRun) {
      fs.writeFileSync(featurePath, featureContent);
    }

    this.report.features++;

    if (this.config.verbose) {
      console.log(chalk.gray(`  → ${featurePath}`));
    }
  }

  generateFeatureFile(fileName, testCases, content, detected) {
    const featureName = fileName
      .replace(/[.-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    let feature = `@browser-js @automated
Feature: ${featureName}
  Migrated from Browser JS test: ${fileName}

`;

    // Group test cases by describe block
    const grouped = {};
    for (const tc of testCases) {
      if (!grouped[tc.describe]) grouped[tc.describe] = [];
      grouped[tc.describe].push(tc.name);
    }

    // Generate scenarios
    for (const [describe, tests] of Object.entries(grouped)) {
      for (const testName of tests) {
        const steps = this.extractStepsFromTest(content, testName, detected);
        
        feature += `  @migrated
  Scenario: ${testName}
`;
        for (const step of steps) {
          feature += `    ${step}\n`;
          this.collectedSteps.add(step);
        }
        feature += '\n';
      }
    }

    return feature;
  }

  extractStepsFromTest(content, testName, detected) {
    const steps = [];
    
    // Analyze the content to generate meaningful steps
    
    // Navigation
    if (/window\.location|\.href\s*=/.test(content)) {
      const urlMatch = content.match(/(?:window\.location|\.href)\s*=\s*['"]([^'"]+)['"]/);
      if (urlMatch) {
        steps.push(`Given I navigate to "${urlMatch[1]}"`);
      } else {
        steps.push('Given I am on the application page');
      }
    } else {
      steps.push('Given I am on the application page');
    }

    // Element interactions
    const selectorActions = [];
    
    // Find getElementById + value assignment
    const getByIdValue = content.match(/document\.getElementById\(['"]([^'"]+)['"]\)\.value\s*=\s*['"]([^'"]+)['"]/g);
    if (getByIdValue) {
      for (const match of getByIdValue) {
        const parts = match.match(/getElementById\(['"]([^'"]+)['"]\)\.value\s*=\s*['"]([^'"]+)['"]/);
        if (parts) {
          steps.push(`When I enter "${parts[2]}" in the "#${parts[1]}" field`);
        }
      }
    }

    // Find querySelector + value assignment
    const querySelectorValue = content.match(/document\.querySelector\(['"]([^'"]+)['"]\)\.value\s*=\s*['"]([^'"]+)['"]/g);
    if (querySelectorValue) {
      for (const match of querySelectorValue) {
        const parts = match.match(/querySelector\(['"]([^'"]+)['"]\)\.value\s*=\s*['"]([^'"]+)['"]/);
        if (parts) {
          steps.push(`When I enter "${parts[2]}" in the "${parts[1]}" field`);
        }
      }
    }

    // jQuery val()
    const jqueryVal = content.match(/\$\(['"]([^'"]+)['"]\)\.val\(['"]([^'"]+)['"]\)/g);
    if (jqueryVal) {
      for (const match of jqueryVal) {
        const parts = match.match(/\$\(['"]([^'"]+)['"]\)\.val\(['"]([^'"]+)['"]\)/);
        if (parts) {
          steps.push(`When I enter "${parts[2]}" in the "${parts[1]}" field`);
        }
      }
    }

    // Click actions
    const clickById = content.match(/document\.getElementById\(['"]([^'"]+)['"]\)\.click\(\)/g);
    if (clickById) {
      for (const match of clickById) {
        const parts = match.match(/getElementById\(['"]([^'"]+)['"]\)/);
        if (parts) {
          steps.push(`When I click on "#${parts[1]}"`);
        }
      }
    }

    const clickBySelector = content.match(/document\.querySelector\(['"]([^'"]+)['"]\)\.click\(\)/g);
    if (clickBySelector) {
      for (const match of clickBySelector) {
        const parts = match.match(/querySelector\(['"]([^'"]+)['"]\)/);
        if (parts) {
          steps.push(`When I click on "${parts[1]}"`);
        }
      }
    }

    // jQuery click
    const jqueryClick = content.match(/\$\(['"]([^'"]+)['"]\)\.click\(\)/g);
    if (jqueryClick) {
      for (const match of jqueryClick) {
        const parts = match.match(/\$\(['"]([^'"]+)['"]\)/);
        if (parts) {
          steps.push(`When I click on "${parts[1]}"`);
        }
      }
    }

    // If no specific actions found, add generic action
    if (steps.length === 1) {
      steps.push('When I perform the test actions');
    }

    // Assertions - look for common patterns
    if (/\.innerText|\.textContent|\.innerHTML/.test(content)) {
      steps.push('Then I should see the expected content');
    }
    if (/console\.assert|throw\s+new\s+Error|expect\(/.test(content)) {
      steps.push('Then the assertion should pass');
    }
    if (/\.includes\(|\.contains\(|indexOf/.test(content)) {
      steps.push('Then the element should contain the expected text');
    }

    // Default assertion if none found
    if (steps.filter(s => s.startsWith('Then')).length === 0) {
      steps.push('Then I should see the expected result');
    }

    return steps;
  }

  async generateStepDefinitions() {
    const stepsContent = `import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { ICustomWorld } from '../support/world';

// =============================================================================
// GIVEN STEPS - Navigation & Setup
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
// WHEN STEPS - Actions
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

When('I type {string} in {string}', async function (
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

When('I uncheck the {string} checkbox', async function (this: ICustomWorld, selector: string) {
  await this.page!.locator(selector).uncheck();
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

When('I double click on {string}', async function (this: ICustomWorld, selector: string) {
  await this.page!.locator(selector).dblclick();
});

When('I press {string}', async function (this: ICustomWorld, key: string) {
  await this.page!.keyboard.press(key);
});

When('I scroll to {string}', async function (this: ICustomWorld, selector: string) {
  await this.page!.locator(selector).scrollIntoViewIfNeeded();
});

When('I wait for {int} seconds', async function (this: ICustomWorld, seconds: number) {
  await this.page!.waitForTimeout(seconds * 1000);
});

When('I perform the test actions', async function (this: ICustomWorld) {
  // Placeholder - implement specific test actions
  // This step is generated when specific actions couldn't be extracted
});

// =============================================================================
// THEN STEPS - Assertions
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

Then('the element {string} should not be visible', async function (
  this: ICustomWorld,
  selector: string
) {
  await expect(this.page!.locator(selector)).not.toBeVisible();
});

Then('the element {string} should contain {string}', async function (
  this: ICustomWorld,
  selector: string,
  text: string
) {
  await expect(this.page!.locator(selector)).toContainText(text);
});

Then('the element {string} should have text {string}', async function (
  this: ICustomWorld,
  selector: string,
  text: string
) {
  await expect(this.page!.locator(selector)).toHaveText(text);
});

Then('the input {string} should have value {string}', async function (
  this: ICustomWorld,
  selector: string,
  value: string
) {
  await expect(this.page!.locator(selector)).toHaveValue(value);
});

Then('the checkbox {string} should be checked', async function (
  this: ICustomWorld,
  selector: string
) {
  await expect(this.page!.locator(selector)).toBeChecked();
});

Then('the element {string} should be disabled', async function (
  this: ICustomWorld,
  selector: string
) {
  await expect(this.page!.locator(selector)).toBeDisabled();
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

Then('I should see the expected content', async function (this: ICustomWorld) {
  // Placeholder - verify page has loaded with content
  await expect(this.page!.locator('body')).toBeVisible();
});

Then('I should see the expected result', async function (this: ICustomWorld) {
  // Placeholder - implement specific assertion
});

Then('the assertion should pass', async function (this: ICustomWorld) {
  // Placeholder - implement specific assertion
});

Then('the element should contain the expected text', async function (this: ICustomWorld) {
  // Placeholder - implement specific text assertion
});

// =============================================================================
// STORAGE STEPS
// =============================================================================

When('I set localStorage {string} to {string}', async function (
  this: ICustomWorld,
  key: string,
  value: string
) {
  await this.page!.evaluate(([k, v]) => localStorage.setItem(k, v), [key, value]);
});

Then('localStorage {string} should be {string}', async function (
  this: ICustomWorld,
  key: string,
  value: string
) {
  const actual = await this.page!.evaluate(k => localStorage.getItem(k), key);
  expect(actual).toBe(value);
});

// =============================================================================
// DIALOG STEPS
// =============================================================================

When('I accept the alert', async function (this: ICustomWorld) {
  this.page!.once('dialog', dialog => dialog.accept());
});

When('I dismiss the alert', async function (this: ICustomWorld) {
  this.page!.once('dialog', dialog => dialog.dismiss());
});

When('I accept the confirm dialog', async function (this: ICustomWorld) {
  this.page!.once('dialog', dialog => dialog.accept());
});

When('I dismiss the confirm dialog', async function (this: ICustomWorld) {
  this.page!.once('dialog', dialog => dialog.dismiss());
});
`;

    const stepsPath = path.join(this.repoPath, this.config.stepsDir, 'common.steps.ts');
    
    if (!this.config.dryRun) {
      fs.writeFileSync(stepsPath, stepsContent);
    }

    this.report.steps++;

    if (this.config.verbose) {
      console.log(chalk.gray(`  → ${stepsPath}`));
    }
  }

  async generateSupportFiles() {
    // World file
    const worldContent = `import { World, IWorldOptions, setWorldConstructor } from '@cucumber/cucumber';
import { BrowserContext, Page } from '@playwright/test';

export interface ICustomWorld extends World {
  context?: BrowserContext;
  page?: Page;
  testData?: Record<string, any>;
}

export class CustomWorld extends World implements ICustomWorld {
  context?: BrowserContext;
  page?: Page;
  testData?: Record<string, any>;

  constructor(options: IWorldOptions) {
    super(options);
    this.testData = {};
  }
}

setWorldConstructor(CustomWorld);
`;

    // Hooks file
    const hooksContent = `import { Before, After, BeforeAll, AfterAll, Status } from '@cucumber/cucumber';
import { chromium, Browser } from '@playwright/test';
import { ICustomWorld } from './world';

let browser: Browser;

BeforeAll(async function () {
  browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
  });
});

AfterAll(async function () {
  await browser?.close();
});

Before(async function (this: ICustomWorld) {
  this.context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  this.page = await this.context.newPage();
  this.page.setDefaultTimeout(30000);
});

After(async function (this: ICustomWorld, { result, pickle }) {
  if (result?.status === Status.FAILED && this.page) {
    const name = pickle.name.replace(/[^a-zA-Z0-9]/g, '-');
    await this.page.screenshot({
      path: \`screenshots/\${name}-\${Date.now()}.png\`,
      fullPage: true,
    });
  }
  await this.page?.close();
  await this.context?.close();
});
`;

    if (!this.config.dryRun) {
      fs.writeFileSync(
        path.join(this.repoPath, this.config.supportDir, 'world.ts'),
        worldContent
      );
      fs.writeFileSync(
        path.join(this.repoPath, this.config.supportDir, 'hooks.ts'),
        hooksContent
      );
      fs.mkdirSync(path.join(this.repoPath, 'screenshots'), { recursive: true });
    }
  }

  // ---------------------------------------------------------------------------
  // SETUP PROJECT
  // ---------------------------------------------------------------------------

  async setupProject() {
    const spinner = ora('Setting up Playwright BDD project...').start();

    // Update package.json
    const pkgPath = path.join(this.repoPath, 'package.json');
    let pkg = fs.existsSync(pkgPath)
      ? JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      : { name: 'playwright-bdd-tests', version: '1.0.0' };

    pkg.devDependencies = {
      ...pkg.devDependencies,
      '@playwright/test': '^1.41.0',
      '@cucumber/cucumber': '^10.3.1',
      'playwright-bdd': '^6.6.0',
      'typescript': '^5.3.3',
    };

    pkg.scripts = {
      ...pkg.scripts,
      'test': 'npx bddgen && playwright test',
      'test:headed': 'npx bddgen && playwright test --headed',
      'test:ui': 'npx bddgen && playwright test --ui',
      'test:debug': 'npx bddgen && playwright test --debug',
      'test:report': 'playwright show-report',
    };

    // Copy playwright.config.ts
    const configContent = `import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig, cucumberReporter } from 'playwright-bdd';

const testDir = defineBddConfig({
  features: '${this.config.featuresDir}/**/*.feature',
  steps: '${this.config.stepsDir}/**/*.ts',
});

export default defineConfig({
  testDir,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    cucumberReporter('html', { outputFile: 'reports/cucumber-report.html' }),
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
`;

    // tsconfig.json
    const tsconfigContent = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist"
  },
  "include": ["${this.config.stepsDir}/**/*", "${this.config.supportDir}/**/*"]
}
`;

    if (!this.config.dryRun) {
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
      fs.writeFileSync(path.join(this.repoPath, 'playwright.config.ts'), configContent);
      fs.writeFileSync(path.join(this.repoPath, 'tsconfig.json'), tsconfigContent);
      fs.mkdirSync(path.join(this.repoPath, 'reports'), { recursive: true });
    }

    spinner.succeed('Playwright BDD project configured');
  }

  // ---------------------------------------------------------------------------
  // FULL PIPELINE
  // ---------------------------------------------------------------------------

  async runFull() {
    console.log(chalk.bold.blue('\n🚀 Browser JS → Playwright BDD Migration\n'));

    // Analyze
    const analysis = await this.analyze();

    if (analysis.summary.browserJS === 0) {
      console.log(chalk.yellow('\nNo Browser JS test files found.'));
      return;
    }

    // Confirm
    if (!this.config.dryRun && !this.config.yes) {
      const { proceed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: `Migrate ${analysis.summary.browserJS} files to Playwright BDD?`,
        default: true,
      }]);
      if (!proceed) {
        console.log(chalk.yellow('\nMigration cancelled.'));
        return;
      }
    }

    // Setup
    await this.setupProject();

    // Migrate
    await this.migrate();

    // Summary
    this.printSummary();
  }

  printSummary() {
    console.log(chalk.bold('\n' + '═'.repeat(55)));
    console.log(chalk.bold.green('  ✓ Migration Complete'));
    console.log('═'.repeat(55));

    console.log(`
  Files analyzed:     ${chalk.cyan(this.report.analyzed)}
  Feature files:      ${chalk.green(this.report.features)}
  Step definitions:   ${chalk.green(this.report.steps)}
  Skipped:            ${chalk.gray(this.report.skipped)}
  Errors:             ${chalk.red(this.report.errors.length)}
`);

    console.log(chalk.bold('Generated structure:'));
    console.log(`  ${this.config.featuresDir}/    ${chalk.gray('← Gherkin feature files')}`);
    console.log(`  ${this.config.stepsDir}/       ${chalk.gray('← Cucumber step definitions')}`);
    console.log(`  ${this.config.supportDir}/     ${chalk.gray('← World & Hooks')}`);

    console.log(chalk.bold('\nNext steps:'));
    console.log(`  1. ${chalk.cyan('npm install')}`);
    console.log(`  2. ${chalk.cyan('npx playwright install')}`);
    console.log(`  3. ${chalk.cyan('npm test')}`);
    console.log(`  4. Review generated .feature files and customize steps`);
    console.log('');
  }
}

// =============================================================================
// CLI
// =============================================================================

program
  .name('browserjs-to-playwright-bdd')
  .description('Convert Browser JS tests to Playwright BDD')
  .version('1.0.0')
  .argument('[path]', 'Repository path', '.')
  .option('-a, --analyze', 'Analyze only')
  .option('--full', 'Full migration')
  .option('-o, --output <dir>', 'Output directory', 'tests')
  .option('--dry-run', 'Preview only')
  .option('--verbose', 'Verbose output')
  .option('-y, --yes', 'Skip prompts')
  .option('-i, --interactive', 'Interactive mode')
  .action(async (repoPath, opts) => {
    console.log(BANNER);

    const abs = path.resolve(repoPath);
    if (!fs.existsSync(abs)) {
      console.error(chalk.red(`Not found: ${abs}`));
      process.exit(1);
    }

    console.log(chalk.blue(`Repository: ${abs}\n`));

    if (opts.interactive) {
      const answers = await inquirer.prompt([
        { type: 'confirm', name: 'full', message: 'Run full migration?', default: true },
        { type: 'input', name: 'output', message: 'Output directory:', default: 'tests' },
        { type: 'confirm', name: 'dryRun', message: 'Dry run (preview)?', default: false },
      ]);
      opts = { ...opts, ...answers };
    }

    const migrator = new BrowserJSToPlaywrightBDD(abs, {
      ...opts,
      featuresDir: `${opts.output}/features`,
      stepsDir: `${opts.output}/steps`,
      supportDir: `${opts.output}/support`,
    });

    try {
      if (opts.full) {
        await migrator.runFull();
      } else if (opts.analyze) {
        await migrator.analyze();
      } else {
        await migrator.analyze();
        console.log(chalk.gray('\nUse --full for complete migration'));
      }
    } catch (err) {
      console.error(chalk.red(`\nError: ${err.message}`));
      if (opts.verbose) console.error(err.stack);
      process.exit(1);
    }
  });

program.parse();
