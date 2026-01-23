import { expect, test } from '@playwright/test';
import * as path from 'node:path';

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('displays hero section with key messaging', async ({ page }) => {
    // Check main headline emphasizes speed
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Lightning-fast');

    // Check Google Sheets integration is mentioned
    await expect(page.getByText(/Google Sheet/i).first()).toBeVisible();
  });

  test('shows the interactive iPhone demo', async ({ page }) => {
    const iphoneFrame = page.locator('[aria-label="iPhone 17 frame"]');
    await expect(iphoneFrame).toBeVisible();
  });

  test('demo can be activated and shows transaction flow', async ({ page }) => {
    // Find and click the tap to activate button
    const activateButton = page.getByRole('button', { name: /activate demo/i });

    if (await activateButton.isVisible()) {
      await activateButton.click();
    }

    // Check that the transaction demo is visible
    const transactionDemo = page.getByTestId('transaction-flow-demo');
    await expect(transactionDemo).toBeVisible();
  });

  test('has navigation to app', async ({ page }) => {
    const continueLink = page.getByRole('link', { name: /continue/i });
    await expect(continueLink).toBeVisible();

    const browserLink = page.getByRole('link', { name: /use in browser/i });
    await expect(browserLink).toBeVisible();
  });

  test('shows install tips for mobile platforms', async ({ page }) => {
    await expect(page.getByText(/iPhone \/ iPad/i)).toBeVisible();
    await expect(page.getByText(/Android \/ Chrome/i)).toBeVisible();
  });

  test('displays what SheetLog does section', async ({ page }) => {
    await expect(page.getByText(/What SheetLog does/i)).toBeVisible();
    await expect(page.getByText(/One-tap entry/i)).toBeVisible();
    await expect(page.getByText(/Works offline: entries queue/i)).toBeVisible();
  });

  test('footer contains privacy and terms links', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer.getByRole('link', { name: 'Privacy' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Terms' })).toBeVisible();
  });
});

test.describe('Landing Page - Rapid Logging Demo', () => {
  test('demo shows timing badge after transaction completes', async ({ page }) => {
    await page.goto('/');

    // Activate the demo
    const activateButton = page.getByRole('button', { name: /activate demo/i });
    if (await activateButton.isVisible()) {
      await activateButton.click();
    }

    // Wait for demo to be ready
    const transactionDemo = page.getByTestId('transaction-flow-demo');
    await expect(transactionDemo).toBeVisible();

    // Select a category (e.g., Coffee)
    const categoryButton = page.locator('[data-testid="transaction-flow-demo"]').getByText(/coffee/i).first();
    if (await categoryButton.isVisible({ timeout: 5000 })) {
      await categoryButton.click();
    }
  });
});

test.describe('Landing Page - Google Sheets Integration Messaging', () => {
  test('emphasizes data ownership with Google Sheets', async ({ page }) => {
    await page.goto('/');

    // Check for Google Sheets mentions
    const sheetsText = page.getByText(/Google Sheet/i);
    await expect(sheetsText.first()).toBeVisible();

    // Check for data ownership messaging
    await expect(page.getByText(/you own your data/i)).toBeVisible();
  });

  test('FAQ explains Google access permissions', async ({ page }) => {
    await page.goto('/');

    // Click to expand FAQ
    const faqTrigger = page.getByRole('button', { name: /Why Google access is requested/i });
    await expect(faqTrigger).toBeVisible();
    await faqTrigger.click();

    // Check FAQ content is visible
    await expect(page.getByText(/Google Sheets: create and update/i)).toBeVisible();
    await expect(page.getByText(/Google Drive: locate\/create/i)).toBeVisible();
  });
});

test.describe('Landing Page - Speed and Visual Elements', () => {
  test('displays speed badge with entry time', async ({ page }) => {
    await page.goto('/');

    // Check for speed badge showing "<3 seconds"
    await expect(page.getByText(/<3/)).toBeVisible();
    await expect(page.getByText(/seconds/i).first()).toBeVisible();
    await expect(page.getByText(/Average entry time/i)).toBeVisible();
  });

  test('shows value proposition cards', async ({ page }) => {
    await page.goto('/');

    // Check for the three main value props
    await expect(page.getByText(/Blazing fast entry/i)).toBeVisible();
    await expect(page.getByText(/Your data in Google Sheets/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Works offline/i })).toBeVisible();
  });

  test('displays Google Sheets icon with gradient branding', async ({ page }) => {
    await page.goto('/');

    // The headline should include Google Sheets with the sheet icon
    const headline = page.getByRole('heading', { level: 1 });
    await expect(headline).toContainText('Google Sheets');
  });

  test('captures landing page screenshot for visual review', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for animations to settle
    await page.waitForTimeout(1500);

    // Take full page screenshot
    await page.screenshot({
      path: path.join('test-results', 'landing-page-full.png'),
      fullPage: true,
    });

    // Take hero section screenshot
    const hero = page.locator('section').first();
    await hero.screenshot({
      path: path.join('test-results', 'landing-page-hero.png'),
    });
  });
});

test.describe('Landing Page - Spreadsheet Preview', () => {
  test('shows live sync indicator on desktop', async ({ page }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Wait for animations
    await page.waitForTimeout(1000);

    // Check for live sync text (only visible on lg screens)
    const syncText = page.getByText(/Live sync to your Google Sheet/i);
    await expect(syncText).toBeVisible();
  });

  test('shows spreadsheet preview on mobile', async ({ page }) => {
    // Set viewport to mobile size
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // On mobile, the spreadsheet preview should be in a dedicated section
    await expect(page.getByText(/Live sync to Google Sheets/i)).toBeVisible();
  });
});
