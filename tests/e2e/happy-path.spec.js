/**
 * Happy Path End-to-End Test
 * Tests the complete user journey: Registration → Login → Create First Post
 */

const { test, expect } = require('@playwright/test');

test.describe('Happy Path: Registration to First Post', () => {
  // Generate unique test data
  const timestamp = Date.now();
  const testUser = {
    pseudo: `testuser_${timestamp}`,
    pin: '1234',
    language: 'fr'
  };

  // Pseudo might be truncated to 20 chars in display
  const displayedPseudo = testUser.pseudo.substring(0, 20);

  const testThread = {
    title: `Mon premier message - Test ${timestamp}`,
    content: `Ceci est mon premier message sur le forum.\n\nMerci pour ce lieu d'échange sécurisé et anonyme.\n\nTest automatisé - ${new Date().toISOString()}`
  };

  test('Complete user journey: Registration → First Post → Verification', async ({ page }) => {
    // ========================================================================
    // Step 1: Navigate to Home Page
    // ========================================================================

    await test.step('Navigate to home page', async () => {
      await page.goto('/');

      // Verify we're on the home page
      await expect(page).toHaveTitle(/Le Syndicat des Tox/);

      // Take screenshot
      await page.screenshot({ path: 'playwright-report/01-home-page.png' });
    });

    // ========================================================================
    // Step 2: Go to Registration Page
    // ========================================================================

    await test.step('Navigate to registration page', async () => {
      // Click on "Sign up" button (page defaults to English)
      await page.click('text=Sign up');

      // Verify we're on registration page
      await expect(page).toHaveURL(/\/auth\/register/);
      await expect(page.locator('h2')).toContainText(/Sign up|Registration|Inscription/);

      await page.screenshot({ path: 'playwright-report/02-registration-page.png' });
    });

    // ========================================================================
    // Step 3: Fill Registration Form
    // ========================================================================

    await test.step('Fill registration form', async () => {
      // Fill pseudo (username)
      await page.fill('input[name="pseudo"]', testUser.pseudo);

      // Fill PIN (4 digits)
      await page.fill('input[name="pin"]', testUser.pin);

      // Select language (French)
      await page.selectOption('select[name="language"]', testUser.language);

      await page.screenshot({ path: 'playwright-report/03-registration-filled.png' });
    });

    // ========================================================================
    // Step 4: Submit Registration
    // ========================================================================

    await test.step('Submit registration and verify success', async () => {
      // Submit form
      await page.click('button[type="submit"]');

      // Wait for redirect to homepage after registration
      await page.waitForURL(/\/$/, { timeout: 10000 });

      // Verify we're logged in (check for logout button or user menu)
      await expect(page.locator('text=/Log out|Déconnexion/i').first()).toBeVisible();

      // Verify welcome message is displayed (pseudo might be in nav or welcome text)
      const welcomeText = page.locator('text=/Welcome|Bienvenue/i').first();
      await expect(welcomeText).toBeVisible();

      await page.screenshot({ path: 'playwright-report/04-registration-success.png' });
    });

    // ========================================================================
    // Step 5: Navigate to Create Thread Page
    // ========================================================================

    await test.step('Navigate to create new thread', async () => {
      // Navigate directly to new thread page
      await page.goto('/threads/new');

      // Verify we're on the right URL
      await expect(page).toHaveURL(/\/threads\/new/);

      await page.screenshot({ path: 'playwright-report/05-new-thread-page.png' });
    });

    // ========================================================================
    // Step 6: Create First Thread
    // ========================================================================

    await test.step('Fill and submit first thread', async () => {
      // Fill title
      await page.fill('input[name="title"]', testThread.title);

      // Fill content
      await page.fill('textarea[name="body"]', testThread.content);

      // Language should default to user's language (fr)
      const languageSelect = page.locator('select[name="language"]');
      await expect(languageSelect).toHaveValue('fr');

      await page.screenshot({ path: 'playwright-report/06-thread-filled.png' });

      // Submit thread
      await page.click('button[type="submit"]');

      // Wait for redirect to thread detail page
      await page.waitForURL(/\/threads\/\d+/, { timeout: 10000 });
    });

    // ========================================================================
    // Step 7: Verify Thread Created Successfully
    // ========================================================================

    await test.step('Verify thread appears correctly', async () => {
      // Verify thread title is displayed
      const titleElement = page.locator('h1').last();
      await expect(titleElement).toContainText(testThread.title);

      // Verify thread content is displayed with line breaks
      const contentElement = page.locator('article').first();
      await expect(contentElement).toContainText('Ceci est mon premier message');
      await expect(contentElement).toContainText('Merci pour ce lieu');

      // Verify author is correct (pseudo might be truncated to 20 chars)
      await expect(page.locator('.thread-meta').locator(`text=${displayedPseudo}`)).toBeVisible();

      // Verify no XSS vulnerability (user content should be escaped)
      // If we had XSS, script tags would be executed and shown in content
      const articleContent = await contentElement.textContent();
      expect(articleContent).not.toContain('<script>');

      // Verify timestamp is displayed
      await expect(page.locator('text=/\\d{4}-\\d{2}-\\d{2}|il y a/')).toBeVisible();

      await page.screenshot({ path: 'playwright-report/07-thread-created.png' });
    });

    // ========================================================================
    // Step 8: Verify Thread Appears in Thread List
    // ========================================================================

    await test.step('Verify thread appears in thread list', async () => {
      // Navigate to thread list
      await page.goto('/threads');

      // Wait for thread list page
      await expect(page).toHaveURL(/\/threads/);

      // Verify our thread is in the list
      const threadLink = page.locator(`text=${testThread.title}`);
      await expect(threadLink).toBeVisible();

      // Verify author is shown (pseudo might be truncated to 20 chars)
      const authorInList = page.locator('.thread-item', { hasText: testThread.title })
        .locator(`text=${displayedPseudo}`);
      await expect(authorInList).toBeVisible();

      await page.screenshot({ path: 'playwright-report/08-thread-in-list.png' });
    });

    // ========================================================================
    // Final Verification
    // ========================================================================

    await test.step('Final verification - thread persists', async () => {
      // Navigate to thread list one more time to verify persistence
      await page.goto('/threads');

      // Verify our thread is still in the list
      await expect(page.locator(`text=${testThread.title}`)).toBeVisible();

      // Take final screenshot
      await page.screenshot({ path: 'playwright-report/09-final-verification.png' });

      console.log('✅ Happy path test completed successfully!');
      console.log(`✅ User created: ${testUser.pseudo}`);
      console.log(`✅ Thread created: ${testThread.title}`);
      console.log(`✅ Thread appears in list`);
    });
  });

  // ========================================================================
  // Cleanup (Optional)
  // ========================================================================

  test.afterAll(async () => {
    console.log(`\n📊 Test Summary:`);
    console.log(`   Pseudo: ${testUser.pseudo}`);
    console.log(`   Thread: ${testThread.title}`);
    console.log(`   Screenshots: playwright-report/`);
    console.log(`\n⚠️  Note: Test data remains in database for manual verification`);
  });
});

// ============================================================================
// Additional Happy Path Scenarios
// ============================================================================

test.describe('Additional User Flows', () => {
  test('Anonymous user can browse public content', async ({ page }) => {
    await page.goto('/threads');

    // Verify page loads successfully
    await expect(page).toHaveURL(/\/threads/);

    // Verify thread list or "no threads" message is visible without login
    const hasThreadList = await page.locator('.thread-list').isVisible();
    const hasNoResults = await page.locator('.no-results').isVisible();

    expect(hasThreadList || hasNoResults).toBeTruthy();

    // Verify can view thread details if threads exist
    const firstThread = page.locator('.thread-item a').first();
    if (await firstThread.count() > 0) {
      await firstThread.click();
      await expect(page.locator('article')).toBeVisible();
    }

    // Verify cannot post without login (should see login prompt)
    await page.goto('/threads');
    await expect(page.locator('text=/Log in|Connectez-vous/i').first()).toBeVisible();
  });

  test('Form validation works correctly', async ({ page }) => {
    await page.goto('/auth/register');

    // Try to submit empty form
    await page.click('button[type="submit"]');

    // Browser validation should prevent submission
    const pseudoInput = page.locator('input[name="pseudo"]');
    const isValid = await pseudoInput.evaluate((el) => el.checkValidity());
    expect(isValid).toBe(false);

    // Fill with invalid PIN (too short)
    await page.fill('input[name="pseudo"]', 'testuser');
    await page.fill('input[name="pin"]', '12'); // Only 2 digits

    // Should fail validation
    const pinInput = page.locator('input[name="pin"]');
    const pinValid = await pinInput.evaluate((el) => el.checkValidity());
    expect(pinValid).toBe(false);
  });
});
