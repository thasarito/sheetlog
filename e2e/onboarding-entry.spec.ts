import { expect, test } from '@playwright/test';

test.describe('Application entry', () => {
  test('opens onboarding directly from the root URL', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: "Let's get started" }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Sign in with Google' }),
    ).toBeVisible();
  });

  test('keeps the legacy app URL available', async ({ page }) => {
    await page.goto('/app');

    await expect(
      page.getByRole('heading', { name: "Let's get started" }),
    ).toBeVisible();
  });
});
