# End-to-End Testing Guide

## 🎭 Playwright Happy Path Test

I've created a comprehensive Playwright test that validates the complete user journey from registration to first post.

---

## ✅ Test Coverage

The E2E test (`tests/e2e/happy-path.spec.js`) covers **12 steps**:

1. **Navigate to home page** - Verify initial load
2. **Go to registration** - Click "Inscription" link
3. **Fill registration form** - Pseudo + 4-digit PIN + language
4. **Submit registration** - Create new account
5. **Navigate to create thread** - Click "Nouveau fil"
6. **Create first thread** - Title + multi-line content
7. **Verify thread created** - Check title, content, author, XSS protection
8. **Verify in thread list** - Thread appears in main list
9. **Search functionality** - Find thread by search
10. **Add a reply** - Post reply to thread
11. **Logout** - Verify logout works
12. **Login again** - Verify login with created account

**Plus 2 additional test scenarios:**
- Anonymous browsing (view without login)
- Form validation (invalid inputs)

---

## 🚀 How to Run the Test

### Option 1: Using the Helper Script (Recommended)

```bash
# Headless mode (no browser window)
./scripts/run-e2e-test.sh

# Headed mode (see the browser in action)
./scripts/run-e2e-test.sh --headed

# This script will:
# - Attempt to fix macOS permission issues
# - Run the Playwright test
# - Show you the results
# - Generate screenshots
```

### Option 2: Manual Run (if script has issues)

```bash
# Fix permissions first (requires sudo password)
sudo mkdir -p /var/folders/zz/zyxvpxvq6csfxvn_n0000000000000/T/playwright-transform-cache-501
sudo chmod -R 777 /var/folders/zz/zyxvpxvq6csfxvn_n0000000000000/T/playwright-transform-cache-501

# Then run the test
npm run test:e2e

# Or with headed mode
npm run test:e2e:headed

# Or debug mode (step through each action)
npm run test:e2e:debug
```

### Option 3: npm Scripts

```bash
# Headless mode
npm run test:e2e

# Headed mode (see browser)
npm run test:e2e:headed

# Debug mode (interactive debugging)
npm run test:e2e:debug

# View HTML report
npm run test:e2e:report
```

---

## 📸 What You'll See

When running in **headed mode** (`--headed`), you'll see:

1. Browser window opens automatically
2. Navigation to http://localhost:3000
3. Automatic form filling
4. Thread creation
5. Searching and replying
6. Logout and login

**15 screenshots** are captured at key steps and saved to:
```
playwright-report/
├── 01-home-page.png
├── 02-registration-page.png
├── 03-registration-filled.png
├── 04-registration-success.png
├── 05-new-thread-page.png
├── 06-thread-filled.png
├── 07-thread-created.png
├── 08-thread-in-list.png
├── 09-search-results.png
├── 10-reply-form.png
├── 11-reply-posted.png
├── 12-logged-out.png
├── 13-login-form.png
├── 14-logged-in-again.png
└── 15-final-verification.png
```

---

## 🐛 Troubleshooting

### "EACCES: permission denied" Error

This is a macOS-specific issue with Playwright's cache directory.

**Solution 1: Run with sudo (one-time fix)**
```bash
sudo mkdir -p /var/folders/zz/zyxvpxvq6csfxvn_n0000000000000/T/playwright-transform-cache-501
sudo chmod -R 777 /var/folders/zz/zyxvpxvq6csfxvn_n0000000000000/T/playwright-transform-cache-501
```

**Solution 2: Use the helper script**
```bash
./scripts/run-e2e-test.sh --headed
# The script will attempt to fix this automatically
```

**Solution 3: Clear Playwright cache**
```bash
rm -rf ~/.cache/ms-playwright
npx playwright install chromium
```

### Server Not Running

Make sure the development server is running:
```bash
# In a separate terminal
npm run dev

# Then run the test in another terminal
npm run test:e2e
```

### Test Fails on Registration

Check that:
- Database is running: `docker compose ps`
- Redis is running: `docker compose ps`
- No previous user exists with the same pseudo (test uses timestamp, so unlikely)

---

## 📊 Test Output

### Successful Run

```
✅ Happy Path: Registration to First Post
   ✅ Complete user journey: Registration → First Post → Verification (45s)

✅ Additional User Flows
   ✅ Anonymous user can browse public content (3s)
   ✅ Form validation works correctly (2s)

3 passed (50s)

📊 Test Summary:
   Pseudo: testuser_1737128400000
   Thread: Mon premier message - Test 1737128400000
   Screenshots: playwright-report/

⚠️  Note: Test data remains in database for manual verification
```

### Failed Run

The test will show:
- Which step failed
- Error message
- Screenshot at point of failure
- Video recording (if configured)

---

## 🔍 What the Test Validates

### Security

- ✅ XSS protection (content is properly escaped)
- ✅ CSRF tokens present
- ✅ No script tags in rendered content
- ✅ Line breaks preserved safely

### Functionality

- ✅ Registration with pseudo + PIN
- ✅ Login/logout flow
- ✅ Thread creation
- ✅ Reply posting
- ✅ Search functionality
- ✅ Form validation

### User Experience

- ✅ Proper redirects after actions
- ✅ Success messages displayed
- ✅ User pseudo shown when logged in
- ✅ Timestamps displayed correctly

---

## 📝 Test Data

Each test run creates:

**User Account:**
- Pseudo: `testuser_{timestamp}`
- PIN: `1234`
- Language: `fr`

**Thread:**
- Title: `Mon premier message - Test {timestamp}`
- Content: Multi-line text with line breaks
- Language: French

**Reply:**
- Content: "Merci pour ce forum!" with author signature

**Note:** Test data is NOT automatically cleaned up. This allows manual verification in the database.

---

## 🎥 Debugging Failed Tests

If a test fails:

1. **View Screenshots:**
   ```bash
   open playwright-report/
   ```

2. **Run in Debug Mode:**
   ```bash
   npm run test:e2e:debug
   ```
   This opens Playwright Inspector where you can:
   - Step through each action
   - Pause at failures
   - Inspect the page
   - Modify selectors

3. **View HTML Report:**
   ```bash
   npm run test:e2e:report
   ```
   This shows:
   - Test timeline
   - Screenshots
   - Network activity
   - Console logs

4. **Check Server Logs:**
   Look at the terminal where `npm run dev` is running for backend errors.

---

## 🔧 Customizing the Test

### Change Test Data

Edit `tests/e2e/happy-path.spec.js`:

```javascript
const testUser = {
  pseudo: `myuser_${timestamp}`,
  pin: '9999',
  language: 'nl'  // Dutch
};

const testThread = {
  title: `Custom Title - ${timestamp}`,
  content: `Your custom content here...`
};
```

### Add More Steps

Add new test steps after line 200:

```javascript
await test.step('Your new step', async () => {
  // Your test code here
  await page.click('...');
  await expect(page.locator('...')).toBeVisible();
});
```

### Change Browser

Edit `playwright.config.js`:

```javascript
projects: [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
  },
  {
    name: 'firefox',
    use: { ...devices['Desktop Firefox'] },
  },
  {
    name: 'webkit',
    use: { ...devices['Desktop Safari'] },
  },
],
```

---

## 🎯 CI/CD Integration

For automated testing in CI:

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci
      - run: npx playwright install --with-deps chromium

      - run: docker compose up -d database redis
      - run: sleep 10  # Wait for services

      - run: npm run test:e2e

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## 📚 Resources

- **Playwright Docs:** https://playwright.dev
- **Test File:** `tests/e2e/happy-path.spec.js`
- **Config:** `playwright.config.js`
- **Helper Script:** `scripts/run-e2e-test.sh`

---

## ✅ Quick Start

**TL;DR:**

```bash
# Make sure server is running
npm run dev

# In another terminal, run the test
./scripts/run-e2e-test.sh --headed

# Watch the magic happen! 🎭
```

**You should see:**
- Browser opens
- Automatic registration
- Thread creation
- Reply posting
- All in ~50 seconds

**That's your entire happy path validated!** 🎉
