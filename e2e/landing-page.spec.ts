import { expect, test, type Page } from '@playwright/test';
import * as path from 'node:path';

function getVisibleIphoneFrame(page: Page) {
  return page
    .getByRole('img', { name: 'iPhone 17 frame' })
    .filter({ visible: true });
}

async function activateVisibleDemo(page: Page) {
  const iphoneFrame = getVisibleIphoneFrame(page);
  await expect(iphoneFrame).toBeVisible();

  const activateButton = iphoneFrame.getByRole('button', { name: 'Activate demo' });
  await expect(activateButton).toBeVisible();
  await activateButton.click();

  const transactionDemo = iphoneFrame.getByTestId('transaction-flow-demo');
  await expect(transactionDemo).toBeVisible();
  return transactionDemo;
}

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('displays hero section with key messaging', async ({ page }) => {
    // Check main headline emphasizes speed
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Log transactions to Google Sheets in seconds',
    );

    // Check Google Sheets integration is mentioned
    await expect(page.getByText(/Google Sheet/i).first()).toBeVisible();
  });

  test('shows the interactive iPhone demo', async ({ page }) => {
    const iphoneFrame = getVisibleIphoneFrame(page);
    await expect(iphoneFrame).toBeVisible();
  });

  test('demo can be activated and shows transaction flow', async ({ page }) => {
    await activateVisibleDemo(page);
  });

  test('has navigation to app', async ({ page }) => {
    const continueLink = page.getByRole('link', { name: 'Continue in browser' });
    await expect(continueLink).toBeVisible();
    await expect(continueLink).toHaveAttribute('href', '/app');

    const browserLink = page.getByRole('link', { name: 'Try in browser' });
    await expect(browserLink).toBeVisible();
    await expect(browserLink).toHaveAttribute('href', '/app');
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

    const transactionDemo = await activateVisibleDemo(page);
    await transactionDemo
      .getByRole('button', { name: 'Coffee & Snacks', exact: true })
      .click();

    const dateDrawer = getVisibleIphoneFrame(page).getByRole('dialog', {
      name: 'Date & time',
    });
    await expect(dateDrawer).toBeVisible();
    await dateDrawer.getByRole('button', { name: 'Done' }).click();

    const keypad = transactionDemo.getByRole('group', { name: 'Amount keypad' });
    await keypad.getByRole('button', { name: '1', exact: true }).click();
    await transactionDemo.getByRole('button', { name: 'Submit', exact: true }).click();

    await expect(transactionDemo.getByText('Payment Successful')).toBeVisible();
    await expect(transactionDemo.getByText(/^\d+\.\d+s$/)).toBeVisible();
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
    await expect(page.getByRole('heading', { name: 'Lightning fast' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your data in Google Sheets' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Works offline' })).toBeVisible();
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

    const hero = page.locator('main section').first();
    await expect(hero).toBeVisible();

    // Take full page screenshot
    await page.screenshot({
      path: path.join('test-results', 'landing-page-full.png'),
      fullPage: true,
      animations: 'disabled',
    });

    // Take hero section screenshot
    await hero.screenshot({
      path: path.join('test-results', 'landing-page-hero.png'),
      animations: 'disabled',
    });
  });
});

test.describe('Landing Page - Spreadsheet Preview', () => {
  test('shows live sync indicator on desktop', async ({ page }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Check for live sync text (only visible on lg screens)
    const syncText = page
      .getByText('Syncing to Google Sheets', { exact: true })
      .filter({ visible: true });
    await expect(syncText).toBeVisible();
    await expect(
      page.getByText('Real-time sync', { exact: true }).filter({ visible: true }),
    ).toBeVisible();
  });

  test('shows spreadsheet preview on mobile', async ({ page }) => {
    // Set viewport to mobile size
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // On mobile, the spreadsheet preview should be in a dedicated section
    await expect(
      page
        .getByText('SheetLog Transactions', { exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page
        .getByText('Appears in your Google Sheet', { exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
  });
});
