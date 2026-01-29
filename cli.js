#!/usr/bin/env node

/**
 * Playwright Migration CLI
 * Migrate browser JS tests to pure Playwright (no Cucumber/Gherkin)
 * 
 * Usage:
 *   npx playwright-migrate <repo-path> [options]
 *   npx playwright-migrate /path/to/repo --analyze
 *   npx playwright-migrate /path/to/repo --full
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
${chalk.cyan('║')}  ${chalk.bold.white('Playwright Migration Tool')}                                ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.gray('Convert browser JS tests to Playwright')}                    ${chalk.cyan('║')}
${chalk.cyan('╚════════════════════════════════════════════════════════════╝')}
`;

// =============================================================================
// TRANSFORMATION RULES
// =============================================================================

const TRANSFORMATIONS = {
  selectors: [
    { from: /document\.getElementById\(['"]([^'"]+)['"]\)/g, to: "page.locator('#$1')" },
    { from: /document\.querySelector\(['"]([^'"]+)['"]\)/g, to: "page.locator('$1')" },
    { from: /document\.querySelectorAll\(['"]([^'"]+)['"]\)/g, to: "page.locator('$1')" },
    { from: /document\.getElementsByClassName\(['"]([^'"]+)['"]\)/g, to: "page.locator('.$1')" },
    { from: /\$\(['"]([^'"]+)['"]\)/g, to: "page.locator('$1')" },
    { from: /jQuery\(['"]([^'"]+)['"]\)/g, to: "page.locator('$1')" },
    { from: /cy\.get\(['"]([^'"]+)['"]\)/g, to: "page.locator('$1')" },
    { from: /cy\.contains\(['"]([^'"]+)['"]\)/g, to: "page.getByText('$1')" },
    { from: /driver\.findElement\(By\.id\(['"]([^'"]+)['"]\)\)/g, to: "page.locator('#$1')" },
    { from: /driver\.findElement\(By\.css\(['"]([^'"]+)['"]\)\)/g, to: "page.locator('$1')" },
    { from: /driver\.findElement\(By\.xpath\(['"]([^'"]+)['"]\)\)/g, to: "page.locator('xpath=$1')" },
    { from: /driver\.findElement\(By\.className\(['"]([^'"]+)['"]\)\)/g, to: "page.locator('.$1')" },
    { from: /driver\.findElement\(By\.name\(['"]([^'"]+)['"]\)\)/g, to: "page.locator('[name=\"$1\"]')" },
    { from: /driver\.findElement\(By\.linkText\(['"]([^'"]+)['"]\)\)/g, to: "page.getByRole('link', { name: '$1' })" },
    { from: /page\.\$\(['"]([^'"]+)['"]\)/g, to: "page.locator('$1')" },
    { from: /page\.\$\$\(['"]([^'"]+)['"]\)/g, to: "page.locator('$1')" },
    { from: /Selector\(['"]([^'"]+)['"]\)/g, to: "page.locator('$1')" },
  ],

  navigation: [
    { from: /cy\.visit\(['"]([^'"]+)['"]\)/g, to: "await page.goto('$1')" },
    { from: /driver\.get\(['"]([^'"]+)['"]\)/g, to: "await page.goto('$1')" },
    { from: /driver\.navigate\(\)\.to\(['"]([^'"]+)['"]\)/g, to: "await page.goto('$1')" },
    { from: /browser\.url\(['"]([^'"]+)['"]\)/g, to: "await page.goto('$1')" },
    { from: /window\.location\s*=\s*['"]([^'"]+)['"]/g, to: "await page.goto('$1')" },
    { from: /window\.location\.href\s*=\s*['"]([^'"]+)['"]/g, to: "await page.goto('$1')" },
    { from: /cy\.reload\(\)/g, to: "await page.reload()" },
    { from: /driver\.navigate\(\)\.refresh\(\)/g, to: "await page.reload()" },
  ],

  actions: [
    { from: /\.click\(\)/g, to: ".click()" },
    { from: /\.dblclick\(\)/g, to: ".dblclick()" },
    { from: /\.type\(['"]([^'"]+)['"]\)/g, to: ".fill('$1')" },
    { from: /\.sendKeys\(['"]([^'"]+)['"]\)/g, to: ".fill('$1')" },
    { from: /cy\.type\(['"]([^'"]+)['"]\)/g, to: ".fill('$1')" },
    { from: /\.clear\(\)/g, to: ".clear()" },
    { from: /\.focus\(\)/g, to: ".focus()" },
    { from: /\.blur\(\)/g, to: ".blur()" },
    { from: /\.hover\(\)/g, to: ".hover()" },
    { from: /\.check\(\)/g, to: ".check()" },
    { from: /\.uncheck\(\)/g, to: ".uncheck()" },
    { from: /\.select\(['"]([^'"]+)['"]\)/g, to: ".selectOption('$1')" },
    { from: /\.submit\(\)/g, to: ".press('Enter')" },
  ],

  waits: [
    { from: /cy\.wait\((\d+)\)/g, to: "// Removed cy.wait - Playwright auto-waits" },
    { from: /driver\.sleep\((\d+)\)/g, to: "// TODO: Replace with assertion\nawait page.waitForTimeout($1)" },
    { from: /page\.waitForSelector\(['"]([^'"]+)['"]\)/g, to: "page.locator('$1').waitFor()" },
    { from: /page\.waitForNavigation\(\)/g, to: "page.waitForLoadState('networkidle')" },
  ],

  cypressAssertions: [
    { from: /\.should\(['"]be\.visible['"]\)/g, to: ";\nawait expect(element).toBeVisible()" },
    { from: /\.should\(['"]not\.be\.visible['"]\)/g, to: ";\nawait expect(element).not.toBeVisible()" },
    { from: /\.should\(['"]exist['"]\)/g, to: ";\nawait expect(element).toBeAttached()" },
    { from: /\.should\(['"]not\.exist['"]\)/g, to: ";\nawait expect(element).not.toBeAttached()" },
    { from: /\.should\(['"]have\.text['"],\s*['"]([^'"]+)['"]\)/g, to: ";\nawait expect(element).toHaveText('$1')" },
    { from: /\.should\(['"]contain['"],\s*['"]([^'"]+)['"]\)/g, to: ";\nawait expect(element).toContainText('$1')" },
    { from: /\.should\(['"]have\.value['"],\s*['"]([^'"]+)['"]\)/g, to: ";\nawait expect(element).toHaveValue('$1')" },
    { from: /\.should\(['"]be\.checked['"]\)/g, to: ";\nawait expect(element).toBeChecked()" },
    { from: /\.should\(['"]be\.disabled['"]\)/g, to: ";\nawait expect(element).toBeDisabled()" },
    { from: /\.should\(['"]have\.length['"],\s*(\d+)\)/g, to: ";\nawait expect(element).toHaveCount($1)" },
  ],

  assertions: [
    { from: /expect\(([^)]+)\)\.to\.equal\(([^)]+)\)/g, to: "expect($1).toBe($2)" },
    { from: /expect\(([^)]+)\)\.to\.be\.true/g, to: "expect($1).toBe(true)" },
    { from: /expect\(([^)]+)\)\.to\.be\.false/g, to: "expect($1).toBe(false)" },
    { from: /expect\(([^)]+)\)\.to\.include\(([^)]+)\)/g, to: "expect($1).toContain($2)" },
    { from: /assert\.equal\(([^,]+),\s*([^)]+)\)/g, to: "expect($1).toBe($2)" },
  ],

  properties: [
    { from: /\.innerText/g, to: ".textContent()" },
    { from: /\.innerHTML/g, to: ".innerHTML()" },
    { from: /\.value(?!\s*[=\(])/g, to: ".inputValue()" },
    { from: /\.getAttribute\(['"]([^'"]+)['"]\)/g, to: ".getAttribute('$1')" },
    { from: /\.val\(\)(?!\s*\()/g, to: ".inputValue()" },
    { from: /\.text\(\)(?!\s*\()/g, to: ".textContent()" },
  ],

  imports: [
    { from: /const\s*\{[^}]*\}\s*=\s*require\(['"]selenium-webdriver['"]\);?/g, to: "" },
    { from: /import\s*\{[^}]*\}\s*from\s*['"]selenium-webdriver['"];?/g, to: "" },
    { from: /const\s+puppeteer\s*=\s*require\(['"]puppeteer['"]\);?/g, to: "" },
    { from: /import\s+puppeteer\s+from\s*['"]puppeteer['"];?/g, to: "" },
    { from: /\/\/\/\s*<reference\s+types=['"]cypress['"]\s*\/>/g, to: "" },
  ],
};

// =============================================================================
// MIGRATOR CLASS
// =============================================================================

class PlaywrightMigrator {
  constructor(repoPath, config) {
    this.repoPath = repoPath;
    this.config = {
      output: 'tests',
      include: [
        '**/*.test.js', '**/*.spec.js', '**/*.test.ts', '**/*.spec.ts',
        '**/test/**/*.js', '**/tests/**/*.js', '**/e2e/**/*.js',
        '**/cypress/**/*.cy.js', '**/cypress/**/*.cy.ts',
        '**/__tests__/**/*.js',
      ],
      exclude: ['**/node_modules/**', '**/dist/**', '**/.playwright/**'],
      dryRun: false,
      verbose: false,
      ...config,
    };
    this.report = { analyzed: 0, migrated: 0, errors: [] };
  }

  async analyze() {
    const spinner = ora('Analyzing repository...').start();
    const files = await this.findTestFiles();
    
    const analysis = {
      files: [],
      summary: { total: files.length, byFramework: {}, byComplexity: { low: 0, medium: 0, high: 0 } },
    };
    
    for (const file of files) {
      const info = await this.analyzeFile(file);
      analysis.files.push(info);
      analysis.summary.byFramework[info.framework] = (analysis.summary.byFramework[info.framework] || 0) + 1;
      analysis.summary.byComplexity[info.complexity]++;
    }
    
    spinner.succeed(`Analyzed ${files.length} files`);
    this.printAnalysis(analysis);
    
    if (!this.config.dryRun) {
      fs.writeFileSync(path.join(this.repoPath, 'migration-analysis.json'), JSON.stringify(analysis, null, 2));
    }
    
    this.report.analyzed = files.length;
    return analysis;
  }

  async findTestFiles() {
    return glob(this.config.include, { cwd: this.repoPath, ignore: this.config.exclude, absolute: true });
  }

  async analyzeFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    return {
      path: path.relative(this.repoPath, filePath),
      framework: this.detectFramework(content),
      testCount: (content.match(/\b(it|test)\s*\(/g) || []).length,
      lineCount: content.split('\n').length,
      complexity: this.assessComplexity(content),
      issues: this.detectIssues(content),
    };
  }

  detectFramework(content) {
    if (/cy\.(visit|get|contains)/.test(content)) return 'cypress';
    if (/from ['"]selenium-webdriver['"]|driver\.(findElement|get)/.test(content)) return 'selenium';
    if (/from ['"]puppeteer['"]|page\.\$\(/.test(content)) return 'puppeteer';
    if (/from ['"]@playwright\/test['"]/.test(content)) return 'playwright';
    if (/from ['"]testcafe['"]/.test(content)) return 'testcafe';
    if (/document\.(getElementById|querySelector)/.test(content)) return 'browser-js';
    if (/\$\(['"]/.test(content)) return 'jquery';
    if (/describe\s*\(/.test(content)) return 'jest/mocha';
    return 'unknown';
  }

  assessComplexity(content) {
    let score = 0;
    if (content.length > 10000) score += 2;
    if (/\.shadowRoot/.test(content)) score += 2;
    if (/contentDocument|contentWindow/.test(content)) score += 2;
    if (/setTimeout|setInterval/.test(content)) score += 1;
    if (/window\.(alert|confirm|prompt)/.test(content)) score += 1;
    if (score >= 4) return 'high';
    if (score >= 2) return 'medium';
    return 'low';
  }

  detectIssues(content) {
    const issues = [];
    if (/setTimeout|sleep\(|\.wait\(\d/.test(content)) issues.push('hardcoded-waits');
    if (/\.shadowRoot/.test(content)) issues.push('shadow-dom');
    if (/contentDocument|contentWindow/.test(content)) issues.push('iframes');
    if (/window\.(alert|confirm|prompt)/.test(content)) issues.push('dialogs');
    if (/type=['"]file['"]/.test(content)) issues.push('file-uploads');
    return issues;
  }

  printAnalysis(analysis) {
    console.log(chalk.bold('\n📊 Analysis Results\n'));
    console.log(`Total files: ${chalk.cyan(analysis.summary.total)}`);
    
    console.log(chalk.bold('\nFrameworks:'));
    for (const [fw, count] of Object.entries(analysis.summary.byFramework).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${fw.padEnd(15)} ${chalk.green('█'.repeat(Math.min(count, 30)))} ${count}`);
    }
    
    console.log(chalk.bold('\nComplexity:'));
    console.log(`  ${chalk.green('Low:')}    ${analysis.summary.byComplexity.low}`);
    console.log(`  ${chalk.yellow('Medium:')} ${analysis.summary.byComplexity.medium}`);
    console.log(`  ${chalk.red('High:')}   ${analysis.summary.byComplexity.high}`);
    
    const problemFiles = analysis.files.filter(f => f.issues.length > 0);
    if (problemFiles.length > 0) {
      console.log(chalk.bold.yellow('\n⚠️  Files needing review:'));
      for (const f of problemFiles.slice(0, 5)) {
        console.log(`  ${f.path} - ${chalk.gray(f.issues.join(', '))}`);
      }
    }
  }

  async migrate() {
    const spinner = ora('Migrating...').start();
    const files = await this.findTestFiles();
    const outputDir = path.join(this.repoPath, this.config.output);
    
    if (!this.config.dryRun) fs.mkdirSync(outputDir, { recursive: true });
    
    let migrated = 0;
    for (const file of files) {
      try {
        spinner.text = `Migrating: ${path.basename(file)}`;
        await this.migrateFile(file, outputDir);
        migrated++;
      } catch (err) {
        this.report.errors.push({ file, error: err.message });
      }
    }
    
    spinner.succeed(`Migrated ${migrated}/${files.length} files`);
    this.report.migrated = migrated;
  }

  async migrateFile(filePath, outputDir) {
    let content = fs.readFileSync(filePath, 'utf-8');
    const framework = this.detectFramework(content);
    
    // Apply transformations
    for (const rules of Object.values(TRANSFORMATIONS)) {
      for (const rule of rules) {
        content = content.replace(rule.from, rule.to);
      }
    }
    
    // Convert test structure
    content = content.replace(/describe\s*\(\s*(['"][^'"]+['"])\s*,\s*(?:function\s*\(\)|(?:\(\)\s*=>))\s*\{/g, 'test.describe($1, () => {');
    content = content.replace(/\bit\s*\(\s*(['"][^'"]+['"])\s*,\s*(?:async\s*)?\(?[^)]*\)?\s*=>\s*\{/g, 'test($1, async ({ page }) => {');
    content = content.replace(/\btest\s*\(\s*(['"][^'"]+['"])\s*,\s*(?:async\s*)?\(?[^)]*\)?\s*=>\s*\{/g, 'test($1, async ({ page }) => {');
    
    // Add imports
    if (!content.includes("from '@playwright/test'")) {
      const imports = "import { test, expect } from '@playwright/test';\n\n";
      content = imports + content;
    }
    
    // Fix awaits
    content = content.replace(/(?<!await\s)(page\.goto\()/g, 'await $1');
    content = content.replace(/(?<!await\s)(page\.locator\([^)]+\)\.click\()/g, 'await $1');
    content = content.replace(/(?<!await\s)(page\.locator\([^)]+\)\.fill\()/g, 'await $1');
    content = content.replace(/await\s+await/g, 'await');
    content = content.replace(/\n{3,}/g, '\n\n');
    
    // Save
    const relativePath = path.relative(this.repoPath, filePath);
    const outputPath = path.join(outputDir, relativePath.replace(/\.(cy|spec|test)\.(js|ts)$/, '.spec.ts'));
    
    if (!this.config.dryRun) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, content);
    }
    
    if (this.config.verbose) console.log(chalk.gray(`  → ${outputPath}`));
  }

  async setupProject() {
    const spinner = ora('Setting up Playwright...').start();
    
    const config = `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './${this.config.output}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
`;

    const pkgPath = path.join(this.repoPath, 'package.json');
    let pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) : {};
    
    pkg.devDependencies = { ...pkg.devDependencies, '@playwright/test': '^1.41.0' };
    pkg.scripts = {
      ...pkg.scripts,
      'test': 'playwright test',
      'test:headed': 'playwright test --headed',
      'test:ui': 'playwright test --ui',
      'test:debug': 'playwright test --debug',
    };

    if (!this.config.dryRun) {
      fs.writeFileSync(path.join(this.repoPath, 'playwright.config.ts'), config);
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    }
    
    spinner.succeed('Playwright configured');
  }

  async runFull() {
    console.log(chalk.bold.blue('\n🚀 Starting Migration\n'));
    
    const analysis = await this.analyze();
    if (analysis.files.length === 0) {
      console.log(chalk.yellow('\nNo test files found.'));
      return;
    }
    
    if (!this.config.dryRun && !this.config.yes) {
      const { proceed } = await inquirer.prompt([{
        type: 'confirm', name: 'proceed',
        message: `Migrate ${analysis.files.length} files?`, default: true,
      }]);
      if (!proceed) return;
    }
    
    await this.setupProject();
    await this.migrate();
    
    console.log(chalk.bold('\n' + '═'.repeat(50)));
    console.log(chalk.bold.green('  ✓ Migration Complete!'));
    console.log('═'.repeat(50));
    console.log(`\n  Files migrated: ${this.report.migrated}`);
    console.log(`  Errors: ${this.report.errors.length}\n`);
    console.log(chalk.bold('Next steps:'));
    console.log(`  1. ${chalk.cyan('npm install')}`);
    console.log(`  2. ${chalk.cyan('npx playwright install')}`);
    console.log(`  3. ${chalk.cyan('npm test')}\n`);
  }
}

// =============================================================================
// CLI
// =============================================================================

program
  .name('playwright-migrate')
  .description('Migrate browser tests to Playwright')
  .version('2.0.0')
  .argument('[repo-path]', 'Repository path', '.')
  .option('-a, --analyze', 'Analyze only')
  .option('-m, --migrate', 'Run migration')
  .option('--full', 'Full pipeline')
  .option('-o, --output <dir>', 'Output directory', 'tests')
  .option('--dry-run', 'Preview changes')
  .option('--verbose', 'Detailed output')
  .option('-y, --yes', 'Skip confirmations')
  .option('-i, --interactive', 'Interactive mode')
  .action(async (repoPath, options) => {
    console.log(BANNER);
    
    const absPath = path.resolve(repoPath);
    if (!fs.existsSync(absPath)) {
      console.error(chalk.red(`Path not found: ${absPath}`));
      process.exit(1);
    }
    
    console.log(chalk.blue(`Repository: ${absPath}\n`));
    
    if (options.interactive) {
      const answers = await inquirer.prompt([
        { type: 'confirm', name: 'full', message: 'Run full migration?', default: true },
        { type: 'input', name: 'output', message: 'Output directory:', default: 'tests' },
        { type: 'confirm', name: 'dryRun', message: 'Dry run?', default: false },
      ]);
      options = { ...options, ...answers };
    }
    
    const migrator = new PlaywrightMigrator(absPath, options);
    
    if (options.full) {
      await migrator.runFull();
    } else if (options.analyze) {
      await migrator.analyze();
    } else if (options.migrate) {
      await migrator.setupProject();
      await migrator.migrate();
    } else {
      await migrator.analyze();
      console.log(chalk.gray('\nUse --full for complete migration'));
    }
  });

program.parse();
