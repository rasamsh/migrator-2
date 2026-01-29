# Browser JS → Playwright BDD Migration Tool

Convert native browser JavaScript tests to **Playwright BDD** with Gherkin feature files and Cucumber step definitions.

## What It Does

Transforms Browser JS code like this:

```javascript
document.getElementById('email').value = 'test@example.com';
document.getElementById('password').value = 'secret';
document.querySelector('.login-btn').click();
```

Into Playwright BDD:

**Feature file** (`login.feature`):
```gherkin
Feature: Login
  Scenario: User logs in
    Given I am on the application page
    When I enter "test@example.com" in the "#email" field
    And I enter "secret" in the "#password" field
    And I click on ".login-btn"
    Then I should see the expected result
```

**Step definitions** (`common.steps.ts`):
```typescript
When('I enter {string} in the {string} field', async function (value, selector) {
  await this.page.locator(selector).fill(value);
});

When('I click on {string}', async function (selector) {
  await this.page.locator(selector).click();
});
```

## Usage

```bash
# Install dependencies
cd playwright-migration-agent
npm install

# Analyze your repository
node bin/cli.js /path/to/your/repo --analyze

# Run full migration
node bin/cli.js /path/to/your/repo --full

# Interactive mode
node bin/cli.js /path/to/your/repo -i
```

## CLI Options

```
browserjs-to-playwright-bdd [path] [options]

Options:
  -a, --analyze     Analyze only (no changes)
  --full            Full migration pipeline
  -o, --output      Output directory (default: "tests")
  --dry-run         Preview without writing files  
  --verbose         Show detailed output
  -y, --yes         Skip confirmation prompts
  -i, --interactive Interactive mode
```

## Generated Structure

```
your-repo/
├── tests/
│   ├── features/           ← Gherkin .feature files
│   │   └── login.feature
│   ├── steps/              ← Cucumber step definitions
│   │   └── common.steps.ts
│   └── support/            ← World & Hooks
│       ├── world.ts
│       └── hooks.ts
├── playwright.config.ts
├── tsconfig.json
└── package.json (updated)
```

## Browser JS Patterns Detected

| Pattern | Example |
|---------|---------|
| `document.getElementById()` | `document.getElementById('email')` |
| `document.querySelector()` | `document.querySelector('.btn')` |
| `document.querySelectorAll()` | `document.querySelectorAll('li')` |
| jQuery `$()` | `$('#submit')` |
| `.value` | `input.value = 'text'` |
| `.click()` | `button.click()` |
| `.innerText` / `.innerHTML` | `el.innerText` |
| `window.location` | `window.location = '/page'` |
| `localStorage` | `localStorage.setItem()` |
| `setTimeout` | `setTimeout(fn, 1000)` |
| `alert()` / `confirm()` | `alert('message')` |

## After Migration

```bash
cd your-repo

# Install dependencies
npm install

# Install browsers
npx playwright install

# Run tests
npm test

# Run with UI mode
npm run test:ui

# Run headed (see browser)
npm run test:headed
```

## Customizing Generated Tests

1. **Review feature files** - Update scenarios to match your actual test intent
2. **Add specific steps** - Create additional step definitions for unique actions
3. **Update selectors** - Use better selectors like `getByRole`, `getByLabel`
4. **Add assertions** - Replace placeholder assertions with real checks

## Step Definition Reference

The tool generates these common steps:

### Given (Setup)
- `Given I am on the application page`
- `Given I navigate to {string}`
- `Given I am on the {string} page`

### When (Actions)
- `When I click on {string}`
- `When I enter {string} in the {string} field`
- `When I check the {string} checkbox`
- `When I select {string} from {string}`
- `When I hover over {string}`
- `When I press {string}`

### Then (Assertions)
- `Then I should see {string}`
- `Then the element {string} should be visible`
- `Then the element {string} should contain {string}`
- `Then the input {string} should have value {string}`
- `Then the URL should contain {string}`

## License

MIT
