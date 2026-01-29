# Playwright Migration Tool

Convert browser-based JavaScript tests (Cypress, Selenium, Puppeteer, etc.) to Playwright.

## Why Plain Playwright (No Cucumber/Gherkin)?

| Cucumber/BDD | Plain Playwright |
|--------------|------------------|
| Feature files + Step definitions + Test code | Just test code |
| Regex matching issues | Type-safe, IDE support |
| Extra abstraction layer | Direct, readable tests |
| Maintenance overhead | Single file to update |
| Good for: Business stakeholders writing specs | Good for: Developers writing tests |

**This tool generates clean Playwright tests** - no extra layers, no ceremony.

---

## Quick Start

# 1. Navigate to the migration tool directory
cd playwright-migration-agent

# 2. Install dependencies
npm install

# 3. Run against your repository
node bin/cli.js /path/to/your/test-repo --full

```bash
# Analyze what needs migration
npx playwright-migrate /path/to/your/repo --analyze

# Full migration
npx playwright-migrate /path/to/your/repo --full

# Interactive mode
npx playwright-migrate /path/to/your/repo -i

# Dry run (preview)
npx playwright-migrate /path/to/your/repo --full --dry-run
```

## CLI Options

```
playwright-migrate <repo-path> [options]

Options:
  -a, --analyze      Analyze only (no changes)
  -m, --migrate      Run migration
  --full             Full pipeline (analyze + setup + migrate)
  -o, --output       Output directory (default: "tests")
  --dry-run          Preview changes without writing
  --verbose          Show detailed output
  -y, --yes          Skip confirmation prompts
  -i, --interactive  Interactive mode
```

## What Gets Converted

### Frameworks Supported
- ✅ Cypress
- ✅ Selenium WebDriver
- ✅ Puppeteer
- ✅ TestCafe
- ✅ WebdriverIO
- ✅ jQuery-based tests
- ✅ Native browser JS
- ✅ Jest/Mocha structure

### Transformations

| Original | Playwright |
|----------|-----------|
| `cy.get('.btn')` | `page.locator('.btn')` |
| `cy.contains('Submit')` | `page.getByText('Submit')` |
| `driver.findElement(By.id('x'))` | `page.locator('#x')` |
| `page.$('.el')` | `page.locator('.el')` |
| `$('#myId')` | `page.locator('#myId')` |
| `document.getElementById('x')` | `page.locator('#x')` |
| `.type('text')` | `.fill('text')` |
| `.should('be.visible')` | `await expect(el).toBeVisible()` |
| `cy.wait(1000)` | *Removed - Playwright auto-waits* |

## Output

```typescript
import { test, expect } from '@playwright/test';

test.describe('Login', () => {
  test('should login successfully', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill('user@test.com');
    await page.locator('#password').fill('password');
    await page.getByRole('button', { name: 'Sign In' }).click();
    
    await expect(page).toHaveURL(/dashboard/);
  });
});
```

## After Migration

```bash
npm install
npx playwright install
npm test
npm run test:ui  # Debug with UI
```

## License

MIT
