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
      // Click on "S'inscrire" link
      await page.click('text=Inscription');

      // Verify we're on registration page
      await expect(page).toHaveURL(/\/auth\/register/);
      await expect(page.locator('h2')).toContainText('Inscription');

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

      // Confirm PIN
      await page.fill('input[name="pin_confirm"]', testUser.pin);

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

      // Wait for redirect to forum
      await page.waitForURL(/\/forum/, { timeout: 10000 });

      // Verify we're logged in (check for logout button or user menu)
      await expect(page.locator('text=Déconnexion')).toBeVisible();

      // Verify welcome message or user pseudo displayed
      const pseudoElement = page.locator(`text=${testUser.pseudo}`);
      await expect(pseudoElement).toBeVisible();

      await page.screenshot({ path: 'playwright-report/04-registration-success.png' });
    });

    // ========================================================================
    // Step 5: Navigate to Create Thread Page
    // ========================================================================

    await test.step('Navigate to create new thread', async () => {
      // Click on "Nouveau fil" or "Créer un fil" button
      await page.click('text=Nouveau fil');

      // Verify we're on thread creation page
      await expect(page).toHaveURL(/\/forum\/threads\/new/);
      await expect(page.locator('h2')).toContainText('Nouveau fil');

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
      await page.waitForURL(/\/forum\/threads\/\d+/, { timeout: 10000 });
    });

    // ========================================================================
    // Step 7: Verify Thread Created Successfully
    // ========================================================================

    await test.step('Verify thread appears correctly', async () => {
      // Verify thread title is displayed
      const titleElement = page.locator('h1');
      await expect(titleElement).toContainText(testThread.title);

      // Verify thread content is displayed with line breaks
      const contentElement = page.locator('article').first();
      await expect(contentElement).toContainText('Mon premier message sur le forum');
      await expect(contentElement).toContainText('Merci pour ce lieu');

      // Verify author is correct
      await expect(page.locator(`text=${testUser.pseudo}`)).toBeVisible();

      // Verify no XSS vulnerability (content should be escaped)
      const pageContent = await page.content();
      expect(pageContent).not.toContain('<script>');

      // Verify timestamp is displayed
      await expect(page.locator('text=/\\d{4}-\\d{2}-\\d{2}|il y a/')).toBeVisible();

      await page.screenshot({ path: 'playwright-report/07-thread-created.png' });
    });

    // ========================================================================
    // Step 8: Verify Thread Appears in Thread List
    // ========================================================================

    await test.step('Verify thread appears in thread list', async () => {
      // Navigate to thread list
      await page.click('text=Tous les fils');

      // Wait for thread list page
      await expect(page).toHaveURL(/\/forum\/threads/);

      // Verify our thread is in the list
      const threadLink = page.locator(`text=${testThread.title}`);
      await expect(threadLink).toBeVisible();

      // Verify author is shown
      const authorInList = page.locator('.thread-item', { hasText: testThread.title })
        .locator(`text=${testUser.pseudo}`);
      await expect(authorInList).toBeVisible();

      await page.screenshot({ path: 'playwright-report/08-thread-in-list.png' });
    });

    // ========================================================================
    // Step 9: Test Search Functionality
    // ========================================================================

    await test.step('Search for created thread', async () => {
      // Navigate to search
      await page.click('text=Rechercher');

      // Wait for search page
      await expect(page).toHaveURL(/\/forum\/search/);

      // Search for unique part of our thread title
      const searchQuery = `Test ${timestamp}`;
      await page.fill('input[name="q"]', searchQuery);
      await page.click('button[type="submit"]');

      // Wait for results
      await page.waitForTimeout(1000);

      // Verify our thread appears in search results
      const searchResult = page.locator(`text=${testThread.title}`);
      await expect(searchResult).toBeVisible();

      // Verify search highlighting (if implemented)
      await expect(page.locator('text=résultat')).toBeVisible();

      await page.screenshot({ path: 'playwright-report/09-search-results.png' });
    });

    // ========================================================================
    // Step 10: Test Reply Functionality
    // ========================================================================

    await test.step('Add a reply to the thread', async () => {
      // Click on our thread in search results
      await page.click(`text=${testThread.title}`);

      // Wait for thread detail page
      await page.waitForURL(/\/forum\/threads\/\d+/);

      // Scroll down to reply form
      const replyTextarea = page.locator('textarea[name="content"]');
      await replyTextarea.scrollIntoViewIfNeeded();

      // Fill reply
      const replyContent = `Merci pour ce forum!\n\nJe suis content d'être ici.\n\n- ${testUser.pseudo}`;
      await replyTextarea.fill(replyContent);

      await page.screenshot({ path: 'playwright-report/10-reply-form.png' });

      // Submit reply
      await page.click('button:has-text("Publier")');

      // Wait for page reload
      await page.waitForTimeout(2000);

      // Verify reply appears
      await expect(page.locator(`text=${replyContent.split('\n')[0]}`)).toBeVisible();

      // Verify reply count increased
      const replySection = page.locator('text=Réponse');
      await expect(replySection).toBeVisible();

      await page.screenshot({ path: 'playwright-report/11-reply-posted.png' });
    });

    // ========================================================================
    // Step 11: Test Logout
    // ========================================================================

    await test.step('Logout successfully', async () => {
      // Click logout button
      await page.click('text=Déconnexion');

      // Wait for redirect to home or login page
      await page.waitForURL(/\/(auth\/login|forum)?$/);

      // Verify we're logged out (register/login links visible)
      await expect(page.locator('text=Connexion')).toBeVisible();
      await expect(page.locator('text=Inscription')).toBeVisible();

      // Verify user menu is gone
      await expect(page.locator(`text=${testUser.pseudo}`)).not.toBeVisible();

      await page.screenshot({ path: 'playwright-report/12-logged-out.png' });
    });

    // ========================================================================
    // Step 12: Test Login with Created Account
    // ========================================================================

    await test.step('Login with created account', async () => {
      // Navigate to login page
      await page.click('text=Connexion');

      // Fill login form
      await page.fill('input[name="pseudo"]', testUser.pseudo);
      await page.fill('input[name="pin"]', testUser.pin);

      await page.screenshot({ path: 'playwright-report/13-login-form.png' });

      // Submit login
      await page.click('button[type="submit"]');

      // Wait for redirect
      await page.waitForURL(/\/forum/);

      // Verify logged in
      await expect(page.locator('text=Déconnexion')).toBeVisible();
      await expect(page.locator(`text=${testUser.pseudo}`)).toBeVisible();

      await page.screenshot({ path: 'playwright-report/14-logged-in-again.png' });
    });

    // ========================================================================
    // Final Verification
    // ========================================================================

    await test.step('Final verification - all features work', async () => {
      // Navigate to our thread one more time
      await page.goto('/forum/threads');
      await page.click(`text=${testThread.title}`);

      // Verify everything is still there
      await expect(page.locator('h1')).toContainText(testThread.title);
      await expect(page.locator(`text=${testUser.pseudo}`)).toBeVisible();

      // Take final screenshot
      await page.screenshot({ path: 'playwright-report/15-final-verification.png' });

      console.log('✅ Happy path test completed successfully!');
      console.log(`✅ User created: ${testUser.pseudo}`);
      console.log(`✅ Thread created: ${testThread.title}`);
      console.log(`✅ Reply posted successfully`);
      console.log(`✅ Login/logout works correctly`);
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
    await page.goto('/forum/threads');

    // Verify thread list is visible without login
    await expect(page.locator('.thread-list, .thread-item')).toBeVisible();

    // Verify can view thread details
    const firstThread = page.locator('.thread-item a').first();
    if (await firstThread.count() > 0) {
      await firstThread.click();
      await expect(page.locator('article')).toBeVisible();
    }

    // Verify cannot post without login
    await expect(page.locator('text=Connectez-vous')).toBeVisible();
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
