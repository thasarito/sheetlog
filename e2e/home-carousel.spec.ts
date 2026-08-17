import { expect, test, type Locator, type Page } from '@playwright/test';
import { differenceInCalendarDays, format, startOfQuarter, subDays } from 'date-fns';
import type { TransactionRecord, TransactionType } from '../src/lib/types';

function transaction(
  id: string,
  daysAgo: number,
  type: TransactionType,
  amount: number,
  category: string,
): TransactionRecord {
  const timestamp = format(subDays(new Date(), daysAgo), "yyyy-MM-dd'T'12:00:00");
  return {
    id,
    type,
    amount,
    currency: 'THB',
    account: type === 'income' ? 'Bank' : 'Cash',
    for: 'Me',
    category,
    note: id === 'food' ? 'Lunch' : undefined,
    date: timestamp,
    status: 'synced',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const seededTransactions = [
  transaction('food', 0, 'expense', 120, 'Food Delivery'),
  transaction('coffee', 1, 'expense', 80, 'Coffee & Snacks'),
  transaction('transport', 2, 'expense', 260, 'Transport'),
  transaction('salary', 2, 'income', 2500, 'Salary'),
  transaction('rent', 3, 'expense', 480, 'Rent & Utilities'),
  transaction('health', 4, 'expense', 200, 'Health'),
  transaction('books', 5, 'expense', 90, 'Books'),
  transaction('savings', 0, 'transfer', 300, 'Savings'),
  ...Array.from({ length: 12 }, (_, index) =>
    transaction(
      `history-${index}`,
      index + 3,
      'expense',
      20 + index,
      'Groceries & Home Supplies',
    ),
  ),
];

async function touchSwipe(page: Page, target: Locator, deltaX: number, deltaY: number) {
  const box = await target.boundingBox();
  if (!box) throw new Error('Swipe target is not visible');
  const client = await page.context().newCDPSession(page);
  const horizontal = Math.abs(deltaX) > Math.abs(deltaY);
  await client.send('Input.synthesizeScrollGesture', {
    x: box.x + box.width * (deltaX < 0 ? 0.85 : deltaX > 0 ? 0.15 : 0.5),
    y: box.y + box.height * (horizontal ? 0.65 : deltaY < 0 ? 0.8 : 0.2),
    xDistance: deltaX,
    yDistance: deltaY,
    gestureSourceType: 'touch',
    speed: 900,
  });
  await client.detach();
}

test.describe('Home Transactions and Analytics carousel', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((transactions: TransactionRecord[]) => {
      window.localStorage.setItem('sheetlog.mock.transactions', JSON.stringify(transactions));
    }, seededTransactions);
    await page.goto('/app');
    await expect(page.getByRole('region', { name: 'Home activity' })).toBeVisible();
  });

  test('keeps Transactions full-width, swipes to Analytics, and opens both sheets', async ({
    page,
  }) => {
    const viewport = page.getByTestId('home-carousel-viewport');
    const transactionsSlide = page.getByLabel('Transactions, slide 1 of 2');
    const transactionsDot = page.getByRole('button', { name: 'Transactions slide' });
    const analyticsDot = page.getByRole('button', { name: 'Analytics slide' });

    await expect(transactionsDot).toHaveAttribute('aria-current', 'true');
    await expect(transactionsSlide.getByRole('button', { name: /Food Delivery/ })).toBeVisible();
    await expect(page.getByText('Budget', { exact: true })).toHaveCount(0);
    const incomeEntryTab = page.getByRole('button', { name: 'Income', exact: true });
    const lowerYBefore = (await incomeEntryTab.boundingBox())?.y;
    await incomeEntryTab.click();
    await expect(page.getByText('Bonus', { exact: true })).toBeVisible();
    const geometry = await viewport.evaluate((element) => {
      const slide = element.querySelector('section');
      if (!slide) throw new Error('Transactions slide missing');
      return {
        viewportWidth: element.getBoundingClientRect().width,
        slideWidth: slide.getBoundingClientRect().width,
        borderWidth: getComputedStyle(slide).borderWidth,
        borderRadius: getComputedStyle(slide).borderRadius,
        boxShadow: getComputedStyle(slide).boxShadow,
      };
    });
    expect(Math.abs(geometry.viewportWidth - geometry.slideWidth)).toBeLessThan(1);
    expect(geometry.borderWidth).toBe('0px');
    expect(geometry.borderRadius).toBe('0px');
    expect(geometry.boxShadow).toBe('none');

    const transactionsViewAll = page.getByRole('button', { name: 'View all transactions' });
    await touchSwipe(page, transactionsViewAll, -geometry.viewportWidth * 0.7, 4);
    await expect(transactionsDot).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await touchSwipe(page, viewport, -geometry.viewportWidth * 0.7, 4);
    await expect(analyticsDot).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await incomeEntryTab.boundingBox())?.y).toBe(lowerYBefore);
    await expect(page.getByText('Bonus', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Week, last 7 days' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect
      .poll(() =>
        page
          .locator('figure[aria-label^="Expense trend"] span.absolute')
          .evaluateAll((bars) => Math.max(...bars.map((bar) => bar.getBoundingClientRect().height))),
      )
      .toBeGreaterThan(0);
    const compactLayout = await viewport.evaluate((element) => {
      const slide = element.querySelector('section[aria-label^="Analytics,"]');
      const viewAll = element.querySelector('button[aria-label="View all analytics"]');
      if (!slide || !viewAll) throw new Error('Analytics compact layout missing');
      return {
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        slideBottom: slide.getBoundingClientRect().bottom,
        viewAllBottom: viewAll.getBoundingClientRect().bottom,
      };
    });
    expect(compactLayout.scrollHeight).toBe(compactLayout.clientHeight);
    expect(compactLayout.viewAllBottom).toBeLessThanOrEqual(compactLayout.slideBottom + 1);
    const pageWidth = await page.evaluate(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(pageWidth.bodyScrollWidth).toBe(pageWidth.clientWidth);
    await page.getByRole('button', { name: 'Month, month to date' }).click();
    await expect(page.getByRole('button', { name: 'Month, month to date' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const analyticsSlide = page.getByLabel('Analytics, slide 2 of 2');
    await expect(analyticsSlide.locator('[data-testid^="analytics-bar-"]')).toHaveCount(
      Number(format(new Date(), 'd')),
    );
    await page.getByRole('button', { name: 'Quarter, quarter to date' }).click();
    const expectedQuarterWeeks = Math.ceil(
      (differenceInCalendarDays(new Date(), startOfQuarter(new Date())) + 1) / 7,
    );
    await expect(analyticsSlide.locator('[data-testid^="analytics-bar-"]')).toHaveCount(
      expectedQuarterWeeks,
    );
    await expect(
      analyticsSlide.locator('[data-testid^="analytics-bar-"][data-testid$="-week"]').first(),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Month, month to date' }).click();

    const analyticsViewAll = page.getByRole('button', { name: 'View all analytics' });
    await touchSwipe(page, analyticsViewAll, geometry.viewportWidth * 0.7, 4);
    await expect(analyticsDot).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await analyticsViewAll.click();
    const analyticsDialog = page.getByRole('dialog', { name: 'Analytics' });
    await expect(analyticsDialog.getByRole('heading', { name: 'Analytics' })).toBeVisible();
    await expect(analyticsDialog.getByRole('heading', { name: 'Analytics' })).toBeFocused();
    await expect(analyticsDialog.getByText('Transfers are excluded from totals.')).toBeVisible();

    await analyticsDialog.getByRole('button', { name: 'Custom date range' }).click();
    await expect(
      page.getByRole('button', { name: /Custom date range, / }),
    ).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Choose custom date range' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Choose custom date range' })).toHaveCount(0);
    await expect(analyticsDialog).toBeVisible();

    await analyticsDialog.getByRole('button', { name: 'Month, month to date' }).click();
    const selectedDay = format(subDays(new Date(), 2), 'EEEE, MMMM d');
    const selectedBar = analyticsDialog.getByRole('option', {
      name: new RegExp(`${selectedDay}, ฿260`),
    });
    await selectedBar.click();
    await expect(selectedBar).toHaveAttribute('aria-selected', 'true');
    await expect(selectedBar).not.toHaveClass(/ring|border|outline/);
    await expect(
      analyticsDialog.locator('[data-testid^="analytics-bar-"][data-muted="true"]').first(),
    ).toBeVisible();

    const overview = analyticsDialog.getByRole('region', { name: 'Overview' });
    await expect(overview.getByText('฿2,500')).toBeVisible();
    await expect(overview.getByText('฿2,240')).toBeVisible();
    await expect(
      overview.getByLabel(/Spending by category: .*Transport 100%.*Expenses ฿260/),
    ).toBeVisible();
    await expect(
      analyticsDialog.getByRole('button', { name: 'Transport, ฿260, 100%' }),
    ).toBeVisible();
    await expect(analyticsDialog.getByRole('button', { name: /expense Transport/ })).toBeVisible();
    await expect(analyticsDialog.getByRole('button', { name: /income Salary/ })).toBeVisible();
    await page.screenshot({ path: 'test-results/stacked-analytics-selected-mobile.png', fullPage: true });

    await analyticsDialog.getByRole('button', { name: 'Close analytics' }).click();
    await expect(analyticsViewAll).toBeFocused();

    await transactionsDot.click();
    await expect(transactionsDot).toHaveAttribute('aria-current', 'true');
    const transactionScroll = page.getByTestId('transaction-scroll');
    const transactionScrollGeometry = await transactionScroll.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(transactionScrollGeometry.scrollHeight).toBeGreaterThan(
      transactionScrollGeometry.clientHeight,
    );
    const scrollTopBefore = await transactionScroll.evaluate((element) => element.scrollTop);
    await transactionScroll.evaluate((element) => element.scrollBy({ top: 120 }));
    await expect
      .poll(() => transactionScroll.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(scrollTopBefore);
    await expect(transactionsDot).toHaveAttribute('aria-current', 'true');
    await transactionsViewAll.click();
    const transactionsDialog = page.getByRole('dialog', { name: 'Transactions' });
    await expect(transactionsDialog.getByRole('heading', { name: 'Transactions' })).toBeVisible();
    await expect(transactionsDialog.getByRole('heading', { name: 'Transactions' })).toBeFocused();
    await transactionsDialog
      .getByRole('searchbox', { name: 'Search transaction history' })
      .fill('lunch');
    await expect(transactionsDialog.getByText('Food Delivery')).toBeVisible();
    await expect(transactionsDialog.getByText('Salary')).toHaveCount(0);
    await transactionsDialog
      .getByRole('button', { name: 'Close transaction history' })
      .click();
    await expect(transactionsViewAll).toBeFocused();

    await analyticsDot.click();
    await expect(analyticsDot).toHaveAttribute('aria-current', 'true');
    await page.screenshot({ path: 'test-results/home-carousel-mobile.png', fullPage: true });
  });
});
