import { expect, test, type Locator, type Page } from '@playwright/test';
import { format, subDays } from 'date-fns';
import type { TransactionRecord } from '../src/lib/types';

function expense(id: string, daysAgo: number, amount: number, category: string): TransactionRecord {
  const timestamp = format(subDays(new Date(), daysAgo), "yyyy-MM-dd'T'12:00:00");
  return {
    id,
    type: 'expense',
    amount,
    currency: 'THB',
    account: 'Cash',
    for: 'Me',
    category,
    date: timestamp,
    status: 'synced',
    sheetRowValid: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const transactions = [
  expense('today-food', 0, 120, 'Food'),
  expense('coffee', 1, 80, 'Coffee'),
  expense('travel', 2, 260, 'Travel'),
  expense('rent', 3, 480, 'Rent'),
  expense('health', 4, 200, 'Health'),
  expense('books', 5, 90, 'Books'),
];

async function touchSwipe(page: Page, target: Locator, deltaX: number, deltaY: number) {
  const box = await target.boundingBox();
  if (!box) throw new Error('Swipe target is not visible');
  const client = await page.context().newCDPSession(page);
  const start = {
    x: box.x + box.width * 0.5,
    y: box.y + box.height * 0.5,
  };
  const point = (x: number, y: number) => ({
    x,
    y,
    id: 0,
    radiusX: 1,
    radiusY: 1,
    force: 1,
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point(start.x, start.y)],
  });
  for (let step = 1; step <= 8; step += 1) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        point(
          start.x + (deltaX * step) / 8,
          start.y + (deltaY * step) / 8,
        ),
      ],
    });
    await page.waitForTimeout(16);
  }
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await client.detach();
}

async function selectedBucketIndex(chart: Locator) {
  const selected = chart.locator('[role="option"][aria-selected="true"]');
  await expect(selected).toHaveCount(1);
  return Number(await selected.getAttribute('data-bucket-index'));
}

test.describe('Analytics motion and chart swipe', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((rows: TransactionRecord[]) => {
      window.localStorage.setItem('sheetlog.mock.transactions', JSON.stringify(rows));
    }, transactions);
    await page.route('https://api.frankfurter.dev/v2/rates**', async (route) => {
      const rows = Array.from({ length: 30 }, (_, index) => ({
        date: format(subDays(new Date(), index), 'yyyy-MM-dd'),
        base: 'THB',
        quote: 'USD',
        rate: 0.03,
      }));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(rows),
      });
    });
    await page.goto('/app');
    await expect(page.getByRole('region', { name: 'Home activity' })).toBeVisible();
    await page.getByRole('button', { name: 'Collapse transaction entry' }).click();
    await expect(page.getByLabel('Analytics, slide 1 of 2')).toHaveAttribute('aria-hidden', 'false');
  });

  test('swipes one bucket at a time, passes vertical scroll, and stays on Analytics', async ({
    page,
  }, testInfo) => {
    const analyticsSlide = page.getByLabel('Analytics, slide 1 of 2');
    const chart = analyticsSlide.getByRole('listbox', { name: 'Select analytics period' });
    const analyticsScroll = analyticsSlide.getByTestId('analytics-dashboard-scroll');
    await expect(chart).toHaveAttribute('data-home-carousel-swipe-lock', 'true');
    await expect(chart.locator('[role="option"][aria-selected="true"]')).toHaveCount(0);

    await touchSwipe(page, chart, -64, 2);
    expect(await selectedBucketIndex(chart)).toBe(0);

    await touchSwipe(page, chart, -64, 2);
    expect(await selectedBucketIndex(chart)).toBe(1);

    await touchSwipe(page, chart, 64, 2);
    expect(await selectedBucketIndex(chart)).toBe(0);

    await touchSwipe(page, chart, 64, 2);
    expect(await selectedBucketIndex(chart)).toBe(0);
    await expect(analyticsSlide).toHaveAttribute('aria-hidden', 'false');

    await analyticsScroll.evaluate((element) => {
      element.scrollTop = 0;
    });
    await touchSwipe(page, chart, 2, -140);
    await expect.poll(() => analyticsScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await selectedBucketIndex(chart)).toBe(0);
    await expect(analyticsSlide).toHaveAttribute('aria-hidden', 'false');

    const controls = analyticsSlide.getByTestId('analytics-range-controls');
    const trend = analyticsSlide.getByTestId('analytics-trend-block');
    const periodPicker = analyticsSlide.getByTestId('analytics-period-picker');
    const [controlsBox, chartBox, pickerBox] = await Promise.all([
      controls.boundingBox(),
      chart.boundingBox(),
      periodPicker.boundingBox(),
    ]);
    if (!controlsBox || !chartBox || !pickerBox) throw new Error('Analytics layout is not visible');
    expect(chartBox.y).toBeGreaterThan(controlsBox.y);
    expect(pickerBox.y).toBeGreaterThanOrEqual(chartBox.y + chartBox.height - 1);
    await expect(trend.locator('svg[viewBox="0 -3 200 112"]')).toHaveCount(0);
    await expect(analyticsSlide.locator('svg[viewBox="0 -3 200 112"]')).toHaveCount(1);

    await testInfo.attach('analytics-motion-layout', {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
  });
});
