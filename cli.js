#!/usr/bin/env node

/**
 * Browser JS to Playwright Migration CLI
 * Converts native browser JavaScript tests to Playwright
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
${chalk.cyan('║')}  ${chalk.bold.white('Browser JS → Playwright Migration')}                        ${chalk.cyan('║')}
${chalk.cyan('╚════════════════════════════════════════════════════════════╝')}
`;

// =============================================================================
// BROWSER JS TRANSFORMATION RULES
// =============================================================================

const TRANSFORMATIONS = {
  selectors: [
    { from: /document\.getElementById\(['"]([^'"]+)['"]\)/g, to: "page.locator('#$1')" },
    { from: /document\.querySelector\(['"]([^'"]+)['"]\)/g, to: "page.locator('$1')" },
    { from: /document\.querySelectorAll\(['"]([^'"]+)['"]\)/g, to: "page.locator('$1')" },
    { from: /document\.getElementsByClassName\(['"]([^'"]+)['"]\)/g, to: "page.locator('.$1')" },
    { from: /document\.getElementsByTagName\(['"]([^'"]+)['"]\)/g, to: "page.locator('$1')" },
    { from: /document\.getElementsByName\(['"]([^'"]+)['"]\)/g, to: "page.locator('[name=\"$1\"]')" },
    { from: /\$\(['"]([^'"]+)['"]\)/g, to: "page.locator('$1')" },
    { from: /jQuery\(['"]([^'"]+)['"]\)/g, to: "page.locator('$1')" },
  ],

  properties: [
    { from: /\.innerText(?!\s*=)/g, to: ".textContent()" },
    { from: /\.textContent(?!\s*=)/g, to: ".textContent()" },
    { from: /\.innerHTML(?!\s*=)/g, to: ".innerHTML()" },
    { from: /\.value(?!\s*=)/g, to: ".inputValue()" },
    { from: /\.getAttribute\(['"]([^'"]+)['"]\)/g, to: ".getAttribute('$1')" },
    { from: /\.val\(\)(?!\s*\()/g, to: ".inputValue()" },
    { from: /\.text\(\)(?!\s*\()/g, to: ".textContent()" },
    { from: /\.html\(\)(?!\s*\()/g, to: ".innerHTML()" },
  ],

  actions: [
    { from: /\.click\(\)/g, to: ".click()" },
    { from: /\.focus\(\)/g, to: ".focus()" },
    { from: /\.blur\(\)/g, to: ".blur()" },
    { from: /\.submit\(\)/g, to: ".press('Enter')" },
    { from: /\.scrollIntoView\([^)]*\)/g, to: ".scrollIntoViewIfNeeded()" },
  ],

  mutations: [
    { from: /\.value\s*=\s*['"]([^'"]+)['"]/g, to: ".fill('$1')" },
    { from: /\.val\(['"]([^'"]+)['"]\)/g, to: ".fill('$1')" },
  ],

  navigation: [
    { from: /window\.location\s*=\s*['"]([^'"]+)['"]/g, to: "await page.goto('$1')" },
    { from: /window\.location\.href\s*=\s*['"]([^'"]+)['"]/g, to: "await page.goto('$1')" },
    { from: /window\.location\.assign\(['"]([^'"]+)['"]\)/g, to: "await page.goto('$1')" },
    { from: /window\.location\.reload\(\)/g, to: "await page.reload()" },
    { from: /history\.back\(\)/g, to: "await page.goBack()" },
    { from: /history\.forward\(\)/g, to: "await page.goForward()" },
  ],

  waits: [
    { from: /setTimeout\s*\([^,]+,\s*(\d+)\s*\)/g, to: "// TODO: Replace with proper waiting\nawait page.waitForTimeout($1)" },
    { from: /await\s+sleep\s*\(\s*(\d+)\s*\)/g, to: "// TODO: Replace with proper waiting\nawait page.waitForTimeout($1)" },
  ],

  storage: [
    { from: /localStorage\.setItem\(['"]([^'"]+)['"],\s*([^)]+)\)/g, to: "await page.evaluate(() => localStorage.setItem('$1', $2))" },
    { from: /localStorage\.getItem\(['"]([^'"]+)['"]\)/g, to: "await page.evaluate(() => localStorage.getItem('$1'))" },
    { from: /localStorage\.removeItem\(['"]([^'"]+)['"]\)/g, to: "await page.evaluate(() => localStorage.removeItem('$1'))" },
    { from: /localStorage\.clear\(\)/g, to: "await page.evaluate(() => localStorage.clear())" },
    { from: /sessionStorage\.setItem\(['"]([^'"]+)['"],\s*([^)]+)\)/g, to: "await page.evaluate(() => sessionStorage.setItem('$1', $2))" },
    { from: /sessionStorage\.getItem\(['"]([^'"]+)['"]\)/g, to: "await page.evaluate(() => sessionStorage.getItem('$1'))" },
  ],

  dialogs: [
    { from: /alert\(['"]([^'"]+)['"]\)/g, to: "// Dialog: '$1'\npage.once('dialog', d => d.accept())" },
    { from: /confirm\(['"]([^'"]+)['"]\)/g, to: "// Confirm: '$1'\npage.once('dialog', d => d.accept())" },
  ],
};

// =============================================================================
// MIGRATOR CLASS
// =============================================================================

class BrowserJSMigrator {
  constructor(repoPath, config) {
    this.repoPath = repoPath;
    this.config = {
      output: 'tests',
      include: ['**/*.test.js', '**/*.spec.js', '**/test/**/*.js', '**/tests/**/*.js'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
      dryRun: false,
      verbose: false,
      ...config,
    };
    this.report = { analyzed: 0, migrated: 0, skipped: 0, errors: [] };
  }

  async analyze() {
    const spinner = ora('Scanning for Browser JS tests...').start();
    const files = await glob(this.config.include, { cwd: this.repoPath, ignore: this.config.exclude, absolute: true });
    
    const analysis = { files: [], summary: { total: 0, browserJS: 0, patterns: {} } };
    
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const patterns = this.detectPatterns(content);
      
      if (patterns.length > 0) {
        analysis.files.push({
          path: path.relative(this.repoPath, file),
          patterns,
          complexity: this.assessComplexity(content, patterns),
        });
        analysis.summary.browserJS++;
        patterns.forEach(p => analysis.summary.patterns[p] = (analysis.summary.patterns[p] || 0) + 1);
      }
      analysis.summary.total++;
    }
    
    spinner.succeed(`Found ${analysis.summary.browserJS} Browser JS files`);
    this.printAnalysis(analysis);
    
    if (!this.config.dryRun) {
      fs.writeFileSync(path.join(this.repoPath, 'migration-analysis.json'), JSON.stringify(analysis, null, 2));
    }
    
    this.report.analyzed = analysis.summary.browserJS;
    return analysis;
  }

  detectPatterns(content) {
    const patterns = [];
    if (/document\.getElementById/.test(content)) patterns.push('getElementById');
    if (/document\.querySelector/.test(content)) patterns.push('querySelector');
    if (/document\.querySelectorAll/.test(content)) patterns.push('querySelectorAll');
    if (/\$\(['"]|jQuery\(['"]/.test(content)) patterns.push('jQuery');
    if (/\.innerText|\.innerHTML|\.textContent/.test(content)) patterns.push('DOM-properties');
    if (/\.click\(\)|\.focus\(\)|\.blur\(\)/.test(content)) patterns.push('DOM-actions');
    if (/window\.location/.test(content)) patterns.push('navigation');
    if (/localStorage\.|sessionStorage\./.test(content)) patterns.push('storage');
    if (/setTimeout|setInterval/.test(content)) patterns.push('timers');
    if (/addEventListener/.test(content)) patterns.push('events');
    if (/alert\(|confirm\(|prompt\(/.test(content)) patterns.push('dialogs');
    return patterns;
  }

  assessComplexity(content, patterns) {
    let score = content.split('\n').length > 200 ? 2 : 0;
    if (patterns.includes('timers')) score += 2;
    if (patterns.includes('events')) score += 2;
    if (/\.shadowRoot|contentDocument/.test(content)) score += 3;
    return score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low';
  }

  printAnalysis(analysis) {
    console.log(chalk.bold('\n📊 Analysis\n'));
    console.log(`Browser JS files: ${chalk.cyan(analysis.summary.browserJS)}`);
    
    if (analysis.summary.browserJS === 0) {
      console.log(chalk.yellow('\nNo Browser JS patterns found.'));
      return;
    }
    
    console.log(chalk.bold('\nPatterns:'));
    Object.entries(analysis.summary.patterns)
      .sort((a, b) => b[1] - a[1])
      .forEach(([p, c]) => console.log(`  ${p.padEnd(20)} ${chalk.cyan(c)}`));
  }

  async migrate() {
    const spinner = ora('Migrating...').start();
    const files = await glob(this.config.include, { cwd: this.repoPath, ignore: this.config.exclude, absolute: true });
    const outputDir = path.join(this.repoPath, this.config.output);
    
    if (!this.config.dryRun) fs.mkdirSync(outputDir, { recursive: true });
    
    for (const file of files) {
      let content = fs.readFileSync(file, 'utf-8');
      if (this.detectPatterns(content).length === 0) { this.report.skipped++; continue; }
      
      spinner.text = `Migrating: ${path.basename(file)}`;
      
      // Apply transformations
      for (const rules of Object.values(TRANSFORMATIONS)) {
        for (const { from, to } of rules) {
          content = content.replace(from, to);
        }
      }
      
      // Wrap in Playwright structure
      content = this.wrapTest(content, file);
      
      // Fix issues
      content = content.replace(/await\s+await/g, 'await').replace(/\n{3,}/g, '\n\n');
      
      // Save
      const outPath = path.join(outputDir, path.relative(this.repoPath, file).replace(/\.js$/, '.spec.ts'));
      if (!this.config.dryRun) {
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, content);
      }
      
      this.report.migrated++;
    }
    
    spinner.succeed(`Migrated ${this.report.migrated} files`);
  }

  wrapTest(content, filePath) {
    const name = path.basename(filePath, '.js').replace(/[.-]/g, ' ');
    
    if (content.includes("from '@playwright/test'")) return content;
    
    let result = `import { test, expect } from '@playwright/test';\n\n`;
    
    if (/describe\s*\(|it\s*\(|test\s*\(/.test(content)) {
      content = content.replace(/describe\s*\(\s*(['"][^'"]+['"])/g, 'test.describe($1');
      content = content.replace(/\bit\s*\(\s*(['"][^'"]+['"])\s*,\s*(?:async\s*)?\([^)]*\)\s*=>/g, 'test($1, async ({ page }) =>');
      result += content;
    } else {
      result += `test.describe('${name}', () => {\n`;
      result += `  test('main', async ({ page }) => {\n`;
      result += content.split('\n').map(l => '    ' + l).join('\n');
      result += `\n  });\n});\n`;
    }
    
    return result;
  }

  async setup() {
    const spinner = ora('Setting up Playwright...').start();
    
    const config = `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './${this.config.output}',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
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

    const pkgPath = path.join(this.repoPath, 'package.json');
    let pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) : {};
    pkg.devDependencies = { ...pkg.devDependencies, '@playwright/test': '^1.41.0' };
    pkg.scripts = { ...pkg.scripts, test: 'playwright test', 'test:ui': 'playwright test --ui' };

    if (!this.config.dryRun) {
      fs.writeFileSync(path.join(this.repoPath, 'playwright.config.ts'), config);
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    }
    
    spinner.succeed('Playwright configured');
  }

  async runFull() {
    console.log(chalk.bold.blue('\n🚀 Browser JS → Playwright\n'));
    
    const analysis = await this.analyze();
    if (analysis.summary.browserJS === 0) return;
    
    if (!this.config.dryRun && !this.config.yes) {
      const { ok } = await inquirer.prompt([{ type: 'confirm', name: 'ok', message: `Migrate ${analysis.summary.browserJS} files?`, default: true }]);
      if (!ok) return;
    }
    
    await this.setup();
    await this.migrate();
    
    console.log(chalk.bold.green('\n✓ Done!\n'));
    console.log(`  Migrated: ${this.report.migrated}`);
    console.log(`  Skipped:  ${this.report.skipped}\n`);
    console.log('Next: npm install && npx playwright install && npm test\n');
  }
}

// =============================================================================
// CLI
// =============================================================================

program
  .name('browserjs-to-playwright')
  .description('Convert Browser JS tests to Playwright')
  .version('1.0.0')
  .argument('[path]', 'Repository path', '.')
  .option('-a, --analyze', 'Analyze only')
  .option('--full', 'Full migration')
  .option('-o, --output <dir>', 'Output dir', 'tests')
  .option('--dry-run', 'Preview only')
  .option('--verbose', 'Verbose')
  .option('-y, --yes', 'Skip prompts')
  .option('-i, --interactive', 'Interactive')
  .action(async (repoPath, opts) => {
    console.log(BANNER);
    
    const abs = path.resolve(repoPath);
    if (!fs.existsSync(abs)) { console.error(chalk.red(`Not found: ${abs}`)); process.exit(1); }
    
    console.log(chalk.blue(`Path: ${abs}\n`));
    
    if (opts.interactive) {
      const a = await inquirer.prompt([
        { type: 'confirm', name: 'full', message: 'Full migration?', default: true },
        { type: 'input', name: 'output', message: 'Output:', default: 'tests' },
      ]);
      opts = { ...opts, ...a };
    }
    
    const m = new BrowserJSMigrator(abs, opts);
    
    if (opts.full) await m.runFull();
    else if (opts.analyze) await m.analyze();
    else { await m.analyze(); console.log(chalk.gray('\nUse --full to migrate')); }
  });

program.parse();
