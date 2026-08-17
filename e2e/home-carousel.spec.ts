import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  differenceInCalendarDays,
  differenceInCalendarMonths,
  format,
  startOfQuarter,
  startOfYear,
  subDays,
} from 'date-fns';
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

async function touchSwipeWithMotionTrace(
  page: Page,
  target: Locator,
  deltaX: number,
  deltaY: number,
) {
  const box = await target.boundingBox();
  if (!box) throw new Error('Swipe target is not visible');
  await target.evaluate((element) => {
    const track = element.querySelector<HTMLElement>('[data-testid="analytics-period-track"]');
    if (!track) throw new Error('Analytics period motion track is missing');
    const motionElement = element as HTMLElement & {
      __analyticsPeriodMotionTrace?: {
        transforms: string[];
        selectedOffsets: Array<string | null>;
        touchEvents: { start: number; move: number; end: number; cancel: number };
        done: boolean;
      };
    };
    const trace = {
      transforms: [] as string[],
      selectedOffsets: [] as Array<string | null>,
      touchEvents: { start: 0, move: 0, end: 0, cancel: 0 },
      done: false,
    };
    motionElement.__analyticsPeriodMotionTrace = trace;
    element.addEventListener('touchstart', () => {
      trace.touchEvents.start += 1;
    });
    element.addEventListener('touchmove', () => {
      trace.touchEvents.move += 1;
    });
    element.addEventListener('touchend', () => {
      trace.touchEvents.end += 1;
    });
    element.addEventListener('touchcancel', () => {
      trace.touchEvents.cancel += 1;
    });

    const sampleFrame = () => {
      trace.transforms.push(track.style.transform);
      trace.selectedOffsets.push(
        element
          .querySelector('[role="option"][aria-selected="true"]')
          ?.getAttribute('data-period-offset') ?? null,
      );
      if (trace.transforms.length >= 150) {
        trace.done = true;
        return;
      }
      requestAnimationFrame(sampleFrame);
    };
    requestAnimationFrame(sampleFrame);
  });
  const client = await page.context().newCDPSession(page);
  const horizontal = Math.abs(deltaX) > Math.abs(deltaY);
  const startX = box.x + box.width * (deltaX < 0 ? 0.85 : deltaX > 0 ? 0.15 : 0.5);
  const startY = box.y + box.height * (horizontal ? 0.65 : deltaY < 0 ? 0.8 : 0.2);
  const touchPoint = (x: number, y: number) => ({
    x,
    y,
    id: 0,
    radiusX: 1,
    radiusY: 1,
    force: 1,
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [touchPoint(startX, startY)],
  });
  for (let step = 1; step <= 16; step += 1) {
    await page.waitForTimeout(16);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        touchPoint(startX + (deltaX * step) / 16, startY + (deltaY * step) / 16),
      ],
    });
  }
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await client.detach();
  return target.evaluate(async (element) => {
    const motionElement = element as HTMLElement & {
      __analyticsPeriodMotionTrace?: {
        transforms: string[];
        selectedOffsets: Array<string | null>;
        touchEvents: { start: number; move: number; end: number; cancel: number };
        done: boolean;
      };
    };
    const trace = motionElement.__analyticsPeriodMotionTrace;
    if (!trace) throw new Error('Analytics period motion trace was not initialized');
    while (!trace.done) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    delete motionElement.__analyticsPeriodMotionTrace;
    return {
      transforms: trace.transforms,
      selectedOffsets: trace.selectedOffsets,
      touchEvents: trace.touchEvents,
    };
  });
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
    await expect(page.getByRole('button', { name: 'Week' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const analyticsSlide = page.getByLabel('Analytics, slide 2 of 2');
    const compactPeriodPicker = analyticsSlide.getByTestId('analytics-period-picker');
    await expect(compactPeriodPicker.getByRole('option')).toHaveCount(3);
    await expect(compactPeriodPicker.getByRole('option', { selected: true })).toHaveAttribute(
      'data-period-offset',
      '0',
    );
    const compactPeriodTrack = compactPeriodPicker.getByTestId('analytics-period-track');
    await expect(compactPeriodTrack).toBeVisible();
    const currentWeekLabel = await compactPeriodPicker
      .getByRole('option', { selected: true })
      .textContent();
    const motionTrace = await touchSwipeWithMotionTrace(page, compactPeriodPicker, 180, 2);
    await expect(analyticsDot).toHaveAttribute('aria-current', 'true');
    expect(motionTrace.touchEvents.start).toBe(1);
    expect(motionTrace.touchEvents.move).toBeGreaterThan(3);
    expect(motionTrace.touchEvents.end).toBe(1);
    expect(motionTrace.touchEvents.cancel).toBe(0);
    const changedSelectionFrame = motionTrace.selectedOffsets.findIndex(
      (offset) => offset !== '0',
    );
    expect(changedSelectionFrame).toBeGreaterThan(2);
    expect(
      new Set(motionTrace.transforms.slice(0, changedSelectionFrame).filter(Boolean)).size,
    ).toBeGreaterThan(3);
    await expect(compactPeriodPicker.getByRole('option', { selected: true })).not.toHaveText(
      currentWeekLabel ?? '',
    );
    const periodBeforeArrow = await compactPeriodPicker
      .getByRole('option', { selected: true })
      .getAttribute('data-period-offset');
    const transformBeforeArrow = await compactPeriodTrack.evaluate(
      (element) => element.style.transform,
    );
    await analyticsSlide.getByRole('button', { name: /^Next period,/ }).click();
    await expect(compactPeriodPicker.getByRole('option', { selected: true })).toHaveAttribute(
      'data-period-offset',
      periodBeforeArrow ?? '',
    );
    await expect
      .poll(() => compactPeriodTrack.evaluate((element) => element.style.transform))
      .not.toBe(transformBeforeArrow);
    await expect(compactPeriodPicker.getByRole('option', { selected: true })).not.toHaveAttribute(
      'data-period-offset',
      periodBeforeArrow ?? '',
    );
    const selectedWeekLabel =
      (await compactPeriodPicker.getByRole('option', { selected: true }).textContent())?.trim() ??
      '';
    await expect
      .poll(() =>
        page
          .locator('figure[aria-label^="Expense trend"] span.absolute')
          .evaluateAll((bars) => Math.max(...bars.map((bar) => bar.getBoundingClientRect().height))),
      )
      .toBeGreaterThan(0);
    await expect
      .poll(async () => (await analyticsSlide.locator('figure[aria-label^="Expense trend"]').boundingBox())?.height ?? 0)
      .toBeGreaterThan(40);
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
    const analyticsViewAll = page.getByRole('button', { name: 'View all analytics' });
    await analyticsViewAll.click();
    let analyticsDialog = page.getByRole('dialog', { name: 'Analytics' });
    await expect(analyticsDialog.getByRole('heading', { name: 'Analytics' })).toBeFocused();
    await expect(
      analyticsDialog
        .getByTestId('analytics-period-picker')
        .getByRole('option', { selected: true }),
    ).toHaveText(selectedWeekLabel);
    await analyticsDialog.getByRole('button', { name: 'Close analytics' }).click();
    await expect(analyticsViewAll).toBeFocused();

    await page.getByRole('button', { name: 'Month' }).click();
    await expect(page.getByRole('button', { name: 'Month' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(analyticsSlide.locator('[data-testid^="analytics-bar-"]')).toHaveCount(
      Number(format(new Date(), 'd')),
    );
    await page.getByRole('button', { name: 'Quarter' }).click();
    const expectedQuarterWeeks = Math.ceil(
      (differenceInCalendarDays(new Date(), startOfQuarter(new Date())) + 1) / 7,
    );
    await expect(analyticsSlide.locator('[data-testid^="analytics-bar-"]')).toHaveCount(
      expectedQuarterWeeks,
    );
    await expect(
      analyticsSlide.locator('[data-testid^="analytics-bar-"][data-testid$="-week"]').first(),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Year' }).click();
    await expect(page.getByRole('button', { name: 'Year' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const expectedYearMonths =
      differenceInCalendarMonths(new Date(), startOfYear(new Date())) + 1;
    await expect(analyticsSlide.locator('[data-testid^="analytics-bar-"]')).toHaveCount(
      expectedYearMonths,
    );
    await expect(
      analyticsSlide.locator('[data-testid^="analytics-bar-"][data-testid$="-month"]').first(),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Custom date range' }).click();
    const standaloneRangeDialog = page.getByRole('dialog', { name: 'Custom date range' });
    await expect(standaloneRangeDialog).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Analytics' })).toHaveCount(0);

    const standaloneStart = subDays(new Date(), 4);
    const standaloneEnd = subDays(new Date(), 2);
    await standaloneRangeDialog
      .getByRole('button', {
        name: new RegExp(format(standaloneStart, 'MMMM do, yyyy')),
      })
      .click();
    await standaloneRangeDialog
      .getByRole('button', {
        name: new RegExp(format(standaloneEnd, 'MMMM do, yyyy')),
      })
      .click();
    await standaloneRangeDialog
      .getByRole('button', { name: 'Apply custom range' })
      .click();

    await expect(standaloneRangeDialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Custom date range' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('dialog', { name: 'Analytics' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Month' }).click();

    await touchSwipe(page, analyticsViewAll, geometry.viewportWidth * 0.7, 4);
    await expect(analyticsDot).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await analyticsViewAll.click();
    analyticsDialog = page.getByRole('dialog', { name: 'Analytics' });
    await expect(analyticsDialog.getByRole('heading', { name: 'Analytics' })).toBeVisible();
    await expect(analyticsDialog.getByRole('heading', { name: 'Analytics' })).toBeFocused();
    await expect(analyticsDialog.getByText('Transfers are excluded from totals.')).toHaveCount(0);

    const firstAnalyticsBar = analyticsDialog
      .getByRole('listbox', { name: 'Select analytics period' })
      .getByRole('option')
      .first();
    await expect(firstAnalyticsBar).toHaveAttribute('aria-selected', 'false');

    await analyticsDialog.getByRole('button', { name: 'Custom date range' }).click();
    const nestedRangeDialog = page.getByRole('dialog', { name: 'Custom date range' });
    await expect(nestedRangeDialog).toBeVisible();
    await expect(analyticsDialog).toBeAttached();

    const nestedStart = subDays(new Date(), 6);
    const nestedEnd = subDays(new Date(), 3);
    await nestedRangeDialog
      .getByRole('button', {
        name: new RegExp(format(nestedStart, 'MMMM do, yyyy')),
      })
      .click();
    await nestedRangeDialog
      .getByRole('button', {
        name: new RegExp(format(nestedEnd, 'MMMM do, yyyy')),
      })
      .click();
    await nestedRangeDialog.getByRole('button', { name: 'Apply custom range' }).click();

    await expect(nestedRangeDialog).toHaveCount(0);
    await expect(analyticsDialog).toBeVisible();
    await expect(firstAnalyticsBar).toHaveAttribute('aria-selected', 'false');
    await expect(
      analyticsDialog.getByRole('button', { name: 'Custom date range' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await analyticsDialog.getByRole('button', { name: 'Month' }).click();
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

    await analyticsDialog.getByRole('button', { name: 'Transport, ฿260, 100%' }).click();
    await expect(
      analyticsDialog.getByRole('button', { name: 'Transport, ฿260, 100%' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await analyticsDialog.getByRole('button', { name: 'Close analytics' }).click();
    await expect(analyticsViewAll).toBeFocused();
    await analyticsViewAll.click();
    analyticsDialog = page.getByRole('dialog', { name: 'Analytics' });
    await expect(
      analyticsDialog.getByRole('button', { name: /Clear selected period filter/ }),
    ).toHaveCount(0);
    await expect(analyticsDialog.getByRole('button', { name: /expense Food Delivery/ })).toBeVisible();
    await expect(analyticsDialog.getByRole('button', { name: /expense Coffee & Snacks/ })).toBeVisible();
    await expect(
      analyticsDialog.getByRole('button', { name: 'Month' }),
    ).toHaveAttribute('aria-pressed', 'true');
    const analyticsTransactions = analyticsDialog.getByRole('region', {
      name: 'Transactions',
    });
    await expect(analyticsTransactions.getByText('Today')).toBeVisible();
    await expect(analyticsTransactions.getByText('Yesterday')).toBeVisible();
    const analyticsTransactionsHeading = analyticsTransactions.getByRole('heading', {
      name: 'Transactions',
    });
    await analyticsTransactionsHeading.evaluate((element) =>
      element.scrollIntoView({ block: 'start' }),
    );
    await expect(analyticsTransactionsHeading).toBeVisible();
    await page.screenshot({
      path: 'test-results/analytics-grouped-transactions-mobile.png',
      fullPage: true,
    });
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
