# Browser JS → Playwright Migration Tool

Convert native browser JavaScript tests to Playwright.

## What This Converts

| Browser JS | Playwright |
|------------|-----------|
| `document.getElementById('x')` | `page.locator('#x')` |
| `document.querySelector('.x')` | `page.locator('.x')` |
| `$('.selector')` (jQuery) | `page.locator('.selector')` |
| `element.innerText` | `await element.textContent()` |
| `element.value` | `await element.inputValue()` |
| `element.value = 'x'` | `await element.fill('x')` |
| `element.click()` | `await element.click()` |
| `window.location = '/url'` | `await page.goto('/url')` |
| `localStorage.setItem()` | `await page.evaluate(...)` |
| `setTimeout(fn, ms)` | `await page.waitForTimeout(ms)` |
| `alert('msg')` | `page.once('dialog', ...)` |

## Usage

# 1. Navigate to the migration tool directory
cd playwright-migration-agent

# 2. Install dependencies
npm install

# 3. Run against your repository
node bin/cli.js /path/to/your/test-repo --full

```bash
# Analyze
node bin/cli.js /path/to/repo --analyze

# Full migration  
node bin/cli.js /path/to/repo --full

# Interactive
node bin/cli.js /path/to/repo -i
```

## Options

```
-a, --analyze     Analyze only
--full            Full migration
-o, --output      Output directory (default: tests)
--dry-run         Preview only
-y, --yes         Skip prompts
```

## Example

**Before:**
```javascript
document.getElementById('email').value = 'test@example.com';
document.querySelector('.btn').click();
```

**After:**
```typescript
import { test, expect } from '@playwright/test';

test('example', async ({ page }) => {
  await page.locator('#email').fill('test@example.com');
  await page.locator('.btn').click();
});
```

## After Migration

```bash
npm install
npx playwright install
npm test
```
