# Home Transactions and Analytics Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home screen's single transaction dashboard with a borderless two-slide Transactions/Analytics carousel, W/M/Q analytics, and dedicated view-all sheets while leaving fast transaction entry unchanged.

**Architecture:** Keep `TransactionFlow` as the owner of create/edit state and introduce a focused carousel coordinator above it. A lazy TanStack Query supplies complete remote history, a second query supplies unsynced local records, and pure utilities merge and aggregate them by local-calendar range and currency. Reuse one transaction-row component across the compact list and both detail sheets; implement charts with semantic HTML/CSS and existing drawer primitives, without new dependencies or shadow styles.

**Tech Stack:** React 18, TypeScript, TanStack Query v5, date-fns, Vaul drawer primitives, Tailwind CSS, Vitest/Testing Library, Playwright.

---

## File map

### Create

- `src/components/TransactionFlow/analytics.ts` — pure period, total, comparison, bucket, and category calculations.
- `src/components/TransactionFlow/analytics.test.ts` — local-calendar, currency, transfer, and signed-adjustment coverage.
- `src/components/TransactionFlow/transactionQueries.ts` — query keys, full-history/local queries, merge logic, and invalidation helper.
- `src/components/TransactionFlow/transactionQueries.test.ts` — merge and invalidation behavior.
- `src/components/TransactionFlow/TransactionRow.tsx` — the existing compact transaction-row rendering extracted for reuse.
- `src/components/TransactionFlow/TopDashboard.test.tsx` — unchanged-row and transaction `View all` regression coverage.
- `src/components/TransactionFlow/transactionHistory.ts` — pure search, filter, and date-group helpers.
- `src/components/TransactionFlow/transactionHistory.test.ts` — history filter and grouping coverage.
- `src/components/TransactionFlow/TransactionsDrawer.tsx` — searchable/filterable full transaction history sheet.
- `src/components/TransactionFlow/TransactionsDrawer.test.tsx` — sheet filtering and row-selection behavior.
- `src/components/TransactionFlow/AnalyticsRangeToggle.tsx` — shadow-free W/M/Q single-select control.
- `src/components/TransactionFlow/AnalyticsBarChart.tsx` — compact accessible bar chart, optionally selectable.
- `src/components/TransactionFlow/AnalyticsSlide.tsx` — compact analytics carousel slide.
- `src/components/TransactionFlow/AnalyticsSlide.test.tsx` — compact content, state, and range behavior.
- `src/components/TransactionFlow/AnalyticsDrawer.tsx` — expanded analytics sheet and drill-down filters.
- `src/components/TransactionFlow/AnalyticsDrawer.test.tsx` — range, currency, category, chart, and transaction drill-down tests.
- `src/components/TransactionFlow/HomeDashboardCarousel.tsx` — two-slide coordinator, native scroll snap, dots, lazy data, and sheet state.
- `src/components/TransactionFlow/HomeDashboardCarousel.test.tsx` — slide selection, accessibility, lazy loading, and state preservation.
- `src/components/TransactionFlow/transactionMutations.test.tsx` — shared invalidation after add, update, and delete mutations.
- `src/lib/googleTransactions.test.ts` — complete-history Sheets read coverage.
- `e2e/home-carousel.spec.ts` — mobile home carousel and analytics smoke coverage.

### Modify

- `src/lib/google.ts:670-748` — add a complete `A2:K` history reader and reuse the row parser.
- `src/lib/date-utils.ts:1-76` — expose non-fallback date parsing for analytics-validity checks.
- `src/lib/date-utils.test.ts:1-89` — cover strict parsing without changing legacy `parseDate` fallback behavior.
- `src/lib/mock/mockGoogle.ts:229-253` — expose complete mock history.
- `src/components/TransactionFlow/useRecentTransactionsQuery.ts:1-25` — move recent reads under shared transaction query keys.
- `src/components/TransactionFlow/TopDashboard.tsx:1-400` — use the local query/merge helper, extracted row, and `View all` action without restyling.
- `src/components/TransactionFlow/useAddTransactionMutation.ts:1-23` — invalidate all transaction queries after add settles.
- `src/components/TransactionFlow/useUpdateTransactionMutation.ts:1-23` — replace recent-only refetch with shared invalidation.
- `src/components/TransactionFlow/useDeleteTransactionMutation.ts:1-16` — replace recent-only refetch with shared invalidation.
- `src/components/TransactionFlow/index.tsx:1-590` — render the carousel, pass the form currency, and refresh queries after undo.
- `src/test/setup.ts:1` — add only the browser-method shims Vaul needs in component tests.

## Task 1: Build and prove the analytics domain model

**Files:**

- Create: `src/components/TransactionFlow/analytics.ts`
- Create: `src/components/TransactionFlow/analytics.test.ts`
- Modify: `src/lib/date-utils.ts:1-76`
- Modify: `src/lib/date-utils.test.ts:1-89`

- [ ] **Step 1: Write failing tests for W/M/Q boundaries and signed, currency-safe aggregation**

In `src/lib/date-utils.test.ts`, add `tryParseDate` to the existing local import and append:

```ts
describe('tryParseDate', () => {
  it('returns supported legacy dates without applying the current-date fallback', () => {
    expect(tryParseDate('17/8/2026')).toEqual(new Date(2026, 7, 17));
    expect(tryParseDate('invalid-date')).toBeNull();
    expect(tryParseDate(Number.NaN)).toBeNull();
  });
});
```

Create `analytics.test.ts` with deterministic local `Date` values and real `TransactionRecord`
objects:

```ts
import { describe, expect, it } from 'vitest';
import type { TransactionRecord, TransactionType } from '../../lib/types';
import {
  buildAnalyticsSummary,
  getComparisonText,
  getOfflineFreshness,
  getAnalyticsPeriods,
  type AnalyticsRange,
} from './analytics';

function transaction({
  id,
  date,
  type = 'expense',
  amount,
  category = 'Dining Out',
  currency = 'THB',
}: {
  id: string;
  date: string;
  type?: TransactionType;
  amount: number;
  category?: string;
  currency?: string;
}): TransactionRecord {
  return {
    id,
    date,
    type,
    amount,
    category,
    currency,
    account: 'Cash',
    for: 'Me',
    status: 'synced',
    createdAt: date,
    updatedAt: date,
  };
}

describe('getAnalyticsPeriods', () => {
  it('uses rolling seven-day windows for week', () => {
    const result = getAnalyticsPeriods('week', new Date(2026, 7, 17, 12));

    expect(result.current.start).toEqual(new Date(2026, 7, 11));
    expect(result.current.end).toEqual(new Date(2026, 7, 17, 23, 59, 59, 999));
    expect(result.comparison.start).toEqual(new Date(2026, 7, 4));
    expect(result.comparison.end).toEqual(new Date(2026, 7, 10, 23, 59, 59, 999));
  });

  it('caps a prior-month comparison at the prior month end', () => {
    const result = getAnalyticsPeriods('month', new Date(2026, 2, 31, 12));

    expect(result.comparison.start).toEqual(new Date(2026, 1, 1));
    expect(result.comparison.end).toEqual(new Date(2026, 1, 28, 23, 59, 59, 999));
  });

  it('uses the same elapsed days in the previous quarter', () => {
    const result = getAnalyticsPeriods('quarter', new Date(2026, 4, 15, 12));

    expect(result.current.start).toEqual(new Date(2026, 3, 1));
    expect(result.comparison.start).toEqual(new Date(2026, 0, 1));
    expect(result.comparison.end).toEqual(new Date(2026, 1, 14, 23, 59, 59, 999));
  });
});

describe.each<[AnalyticsRange, number]>([
  ['week', 7],
  ['month', 3],
  ['quarter', 3],
])('buildAnalyticsSummary(%s)', (range, minimumBuckets) => {
  it('returns range-appropriate buckets', () => {
    const summary = buildAnalyticsSummary({
      transactions: [],
      range,
      currency: 'THB',
      now: new Date(2026, 7, 17, 12),
    });

    expect(summary.buckets.length).toBeGreaterThanOrEqual(minimumBuckets);
  });
});

describe('buildAnalyticsSummary totals', () => {
  const rows = [
    transaction({ id: 'expense-1', date: '2026-08-17T10:00:00', amount: 100 }),
    transaction({
      id: 'expense-2',
      date: '2026-08-16T10:00:00',
      amount: 50,
      category: 'Transport',
    }),
    transaction({ id: 'undo', date: '2026-08-17T11:00:00', amount: -20 }),
    transaction({
      id: 'income',
      date: '2026-08-17T09:00:00',
      type: 'income',
      amount: 500,
      category: 'Salary',
    }),
    transaction({
      id: 'transfer',
      date: '2026-08-17T08:00:00',
      type: 'transfer',
      amount: 999,
      category: 'Savings',
    }),
    transaction({ id: 'previous', date: '2026-08-10T10:00:00', amount: 200 }),
    transaction({
      id: 'usd',
      date: '2026-08-17T07:00:00',
      amount: 400,
      currency: 'USD',
    }),
    transaction({ id: 'zero', date: '2026-08-17T06:00:00', amount: 0 }),
    transaction({ id: 'malformed-date', date: 'not-a-date', amount: 500 }),
    transaction({ id: 'non-finite', date: '2026-08-17T05:00:00', amount: Number.NaN }),
  ];

  it('separates currencies and types while applying signed adjustments', () => {
    const summary = buildAnalyticsSummary({
      transactions: rows,
      range: 'week',
      currency: 'THB',
      now: new Date(2026, 7, 17, 12),
    });

    expect(summary.expenseTotal).toBe(130);
    expect(summary.incomeTotal).toBe(500);
    expect(summary.netTotal).toBe(370);
    expect(summary.previousExpenseTotal).toBe(200);
    expect(summary.comparison).toEqual({ direction: 'below', percentage: 35 });
    expect(summary.categories).toEqual([
      { category: 'Dining Out', amount: 80, share: 62 },
      { category: 'Transport', amount: 50, share: 38 },
    ]);
    const bucketTransactionIds = summary.buckets.flatMap((bucket) => bucket.transactionIds);
    expect(bucketTransactionIds).not.toContain('income');
    expect(bucketTransactionIds).not.toContain('transfer');
    expect(summary.transactions.map((row) => row.id)).not.toContain('usd');
    expect(summary.transactions.map((row) => row.id)).not.toContain('previous');
    expect(summary.transactions.map((row) => row.id)).not.toContain('zero');
    expect(summary.transactions.map((row) => row.id)).not.toContain('malformed-date');
    expect(summary.transactions.map((row) => row.id)).not.toContain('non-finite');
  });

  it('returns no prior comparison when prior net expense is not positive', () => {
    const summary = buildAnalyticsSummary({
      transactions: [
        rows[0],
        transaction({ id: 'prior-refund', date: '2026-08-10T10:00:00', amount: -10 }),
      ],
      range: 'week',
      currency: 'THB',
      now: new Date(2026, 7, 17, 12),
    });

    expect(summary.comparison).toEqual({ direction: 'none', percentage: null });
  });

  it('reports a 100% decrease when signed current expenses net to zero', () => {
    const summary = buildAnalyticsSummary({
      transactions: [
        transaction({ id: 'charge', date: '2026-08-17T10:00:00', amount: 20 }),
        transaction({ id: 'reversal', date: '2026-08-17T11:00:00', amount: -20 }),
        transaction({ id: 'previous', date: '2026-08-10T10:00:00', amount: 40 }),
      ],
      range: 'week',
      currency: 'THB',
      now: new Date(2026, 7, 17, 12),
    });

    expect(summary.expenseTotal).toBe(0);
    expect(summary.comparison).toEqual({ direction: 'below', percentage: 100 });
    expect(summary.categories).toEqual([]);
  });

  it('uses refund copy when signed adjustments make current expense negative', () => {
    const summary = buildAnalyticsSummary({
      transactions: [
        transaction({ id: 'refund', date: '2026-08-17T10:00:00', amount: -30 }),
        transaction({ id: 'previous', date: '2026-08-10T10:00:00', amount: 20 }),
      ],
      range: 'week',
      currency: 'THB',
      now: new Date(2026, 7, 17, 12),
    });

    expect(summary.comparison).toEqual({ direction: 'refunds', percentage: null });
  });

  it('normalizes category shares across positive net categories after adjustments', () => {
    const summary = buildAnalyticsSummary({
      transactions: [
        transaction({ id: 'dining', date: '2026-08-17T10:00:00', amount: 100 }),
        transaction({ id: 'transport-refund', date: '2026-08-17T11:00:00', amount: -90, category: 'Transport' }),
      ],
      range: 'week',
      currency: 'THB',
      now: new Date(2026, 7, 17, 12),
    });

    expect(summary.expenseTotal).toBe(10);
    expect(summary.categories).toEqual([{ category: 'Dining Out', amount: 100, share: 100 }]);
  });
});

describe('getOfflineFreshness', () => {
  it('reports when the complete cache was last updated', () => {
    expect(getOfflineFreshness(new Date(2026, 7, 17, 9, 30).getTime()))
      .toBe('Offline · saved 09:30');
    expect(getOfflineFreshness()).toBe('Offline · showing saved data');
  });
});

describe('getComparisonText', () => {
  it('uses explicit no-data and net-refund copy', () => {
    expect(getComparisonText({ direction: 'none', percentage: null }, 'month'))
      .toBe('No prior-period data');
    expect(getComparisonText({ direction: 'refunds', percentage: null }, 'week'))
      .toBe('Net refunds exceeded expenses');
    expect(getComparisonText({ direction: 'below', percentage: 12 }, 'month'))
      .toBe('12% below the same days last month');
    expect(getComparisonText({ direction: 'above', percentage: 8 }, 'quarter'))
      .toBe('8% above the same elapsed days last quarter');
  });
});
```

- [ ] **Step 2: Run the analytics test and confirm RED**

Run:

```bash
npm test -- src/lib/date-utils.test.ts src/components/TransactionFlow/analytics.test.ts
```

Expected: FAIL because `tryParseDate` and `./analytics` do not exist.

- [ ] **Step 3: Implement the pure analytics module**

In `src/lib/date-utils.ts`, replace the current `parseDate` function with a non-fallback parser plus
the same public fallback contract:

```ts
export function tryParseDate(dateValue: string | number): Date | null {
  if (typeof dateValue === 'number') {
    const serialDate = serialNumberToDate(dateValue);
    return isValid(serialDate) ? serialDate : null;
  }

  if (dateValue.includes('T')) {
    const isoDate = new Date(dateValue);
    if (isValid(isoDate)) return isoDate;
  }

  const formats = ['M/d/yyyy HH:mm:ss', 'M/d/yyyy', 'd/M/yyyy', 'yyyy-MM-dd'];
  for (const dateFormat of formats) {
    const parsed = parse(dateValue, dateFormat, new Date());
    if (isValid(parsed)) return parsed;
  }

  return null;
}

export function parseDate(dateValue: string | number): Date {
  return tryParseDate(dateValue) ?? new Date();
}
```

This preserves every existing `parseDate` caller's fallback while allowing analytics ingestion to
identify malformed source values.

Create `analytics.ts` with these public types and functions. Keep all date construction local-time
based; do not call APIs or React hooks here.

```ts
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  endOfQuarter,
  format,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  subDays,
  subMonths,
  subQuarters,
} from 'date-fns';
import { tryParseDate } from '../../lib/date-utils';
import type { TransactionRecord, TransactionType } from '../../lib/types';

export type AnalyticsRange = 'week' | 'month' | 'quarter';

export type DatePeriod = { start: Date; end: Date };

export type AnalyticsPeriods = {
  current: DatePeriod;
  comparison: DatePeriod;
};

export type AnalyticsComparison = {
  direction: 'above' | 'below' | 'same' | 'refunds' | 'none';
  percentage: number | null;
};

export type AnalyticsBucket = {
  key: string;
  label: string;
  amount: number;
  transactionIds: string[];
};

export type AnalyticsCategory = {
  category: string;
  amount: number;
  share: number;
};

export type AnalyticsSummary = {
  range: AnalyticsRange;
  currency: string;
  periods: AnalyticsPeriods;
  expenseTotal: number;
  previousExpenseTotal: number;
  incomeTotal: number;
  netTotal: number;
  comparison: AnalyticsComparison;
  buckets: AnalyticsBucket[];
  categories: AnalyticsCategory[];
  transactions: TransactionRecord[];
  hasExpenseRows: boolean;
};

type BuildAnalyticsSummaryInput = {
  transactions: TransactionRecord[];
  range: AnalyticsRange;
  currency: string;
  now: Date;
};

type AnalyticsAnnotatedTransaction = TransactionRecord & { analyticsExcluded?: boolean };

function minDate(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? left : right;
}

function contains(period: DatePeriod, date: Date): boolean {
  const time = date.getTime();
  return time >= period.start.getTime() && time <= period.end.getTime();
}

export function getAnalyticsPeriods(range: AnalyticsRange, now: Date): AnalyticsPeriods {
  const currentEnd = endOfDay(now);

  if (range === 'week') {
    const currentStart = startOfDay(subDays(now, 6));
    return {
      current: { start: currentStart, end: currentEnd },
      comparison: {
        start: startOfDay(subDays(currentStart, 7)),
        end: endOfDay(subDays(currentStart, 1)),
      },
    };
  }

  if (range === 'month') {
    const currentStart = startOfMonth(now);
    const comparisonStart = startOfMonth(subMonths(now, 1));
    const elapsedDays = differenceInCalendarDays(currentEnd, currentStart);
    return {
      current: { start: currentStart, end: currentEnd },
      comparison: {
        start: comparisonStart,
        end: minDate(
          endOfMonth(comparisonStart),
          endOfDay(addDays(comparisonStart, elapsedDays)),
        ),
      },
    };
  }

  const currentStart = startOfQuarter(now);
  const comparisonStart = startOfQuarter(subQuarters(now, 1));
  const elapsedDays = differenceInCalendarDays(currentEnd, currentStart);
  return {
    current: { start: currentStart, end: currentEnd },
    comparison: {
      start: comparisonStart,
      end: minDate(
        endOfQuarter(comparisonStart),
        endOfDay(addDays(comparisonStart, elapsedDays)),
      ),
    },
  };
}

function finiteAmount(row: TransactionRecord): number {
  const amount = Number(row.amount);
  return Number.isFinite(amount) ? amount : 0;
}

function analyticsDate(row: TransactionRecord): Date | null {
  return tryParseDate(row.date);
}

function sumType(rows: TransactionRecord[], type: TransactionType): number {
  return rows.reduce(
    (total, row) => total + (row.type === type ? finiteAmount(row) : 0),
    0,
  );
}

function rowsInPeriod(
  rows: TransactionRecord[],
  period: DatePeriod,
  currency: string,
): TransactionRecord[] {
  return rows
    .filter((row) => {
      const date = analyticsDate(row);
      const amount = Number(row.amount);
      return !(row as AnalyticsAnnotatedTransaction).analyticsExcluded
        && row.currency === currency
        && date !== null
        && contains(period, date)
        && Number.isFinite(amount)
        && amount !== 0;
    })
    .sort((left, right) => {
      const leftDate = analyticsDate(left);
      const rightDate = analyticsDate(right);
      return (rightDate?.getTime() ?? 0) - (leftDate?.getTime() ?? 0);
    });
}

function buildComparison(current: number, previous: number): AnalyticsComparison {
  if (current < 0) return { direction: 'refunds', percentage: null };
  if (previous <= 0) return { direction: 'none', percentage: null };
  if (current === previous) return { direction: 'same', percentage: 0 };
  return {
    direction: current < previous ? 'below' : 'above',
    percentage: Math.round((Math.abs(current - previous) / previous) * 100),
  };
}

function makeBucket(
  key: string,
  label: string,
  period: DatePeriod,
  rows: TransactionRecord[],
): AnalyticsBucket {
  const matching = rows.filter((row) => {
    const date = analyticsDate(row);
    return date !== null && contains(period, date);
  });
  const expenses = matching.filter((row) => row.type === 'expense');
  return {
    key,
    label,
    amount: sumType(expenses, 'expense'),
    transactionIds: expenses.map((row) => row.id),
  };
}

function buildBuckets(
  range: AnalyticsRange,
  current: DatePeriod,
  rows: TransactionRecord[],
): AnalyticsBucket[] {
  if (range === 'week') {
    return Array.from({ length: 7 }, (_, index) => {
      const start = startOfDay(addDays(current.start, index));
      return makeBucket(format(start, 'yyyy-MM-dd'), format(start, 'EEEEE'), {
        start,
        end: endOfDay(start),
      }, rows);
    });
  }

  if (range === 'month') {
    const elapsedDays = differenceInCalendarDays(current.end, current.start) + 1;
    return Array.from({ length: Math.ceil(elapsedDays / 7) }, (_, index) => {
      const start = startOfDay(addDays(current.start, index * 7));
      const end = minDate(current.end, endOfDay(addDays(start, 6)));
      return makeBucket(`${format(start, 'yyyy-MM-dd')}-week`, `${format(start, 'd')}–${format(end, 'd')}`, {
        start,
        end,
      }, rows);
    });
  }

  return Array.from({ length: 3 }, (_, index) => {
    const start = startOfMonth(addMonths(current.start, index));
    const end = minDate(current.end, endOfMonth(start));
    return makeBucket(format(start, 'yyyy-MM'), format(start, 'MMM'), { start, end }, rows);
  });
}

function buildCategories(rows: TransactionRecord[]): AnalyticsCategory[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.type !== 'expense') continue;
    totals.set(row.category, (totals.get(row.category) ?? 0) + finiteAmount(row));
  }

  const positiveCategories = [...totals.entries()]
    .filter(([, amount]) => amount > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const positiveTotal = positiveCategories.reduce((total, [, amount]) => total + amount, 0);

  return positiveCategories
    .map(([category, amount]) => ({
      category,
      amount,
      share: Math.round((amount / positiveTotal) * 100),
    }));
}

export function buildAnalyticsSummary({
  transactions,
  range,
  currency,
  now,
}: BuildAnalyticsSummaryInput): AnalyticsSummary {
  const periods = getAnalyticsPeriods(range, now);
  const currentRows = rowsInPeriod(transactions, periods.current, currency);
  const comparisonRows = rowsInPeriod(transactions, periods.comparison, currency);
  const expenseTotal = sumType(currentRows, 'expense');
  const incomeTotal = sumType(currentRows, 'income');
  const previousExpenseTotal = sumType(comparisonRows, 'expense');

  return {
    range,
    currency,
    periods,
    expenseTotal,
    previousExpenseTotal,
    incomeTotal,
    netTotal: incomeTotal - expenseTotal,
    comparison: buildComparison(expenseTotal, previousExpenseTotal),
    buckets: buildBuckets(range, periods.current, currentRows),
    categories: buildCategories(currentRows),
    transactions: currentRows,
    hasExpenseRows: currentRows.some((row) => row.type === 'expense' && finiteAmount(row) !== 0),
  };
}

export function formatAnalyticsAmount(amount: number, currency: string): string {
  const prefix = currency === 'THB' ? '฿' : currency === 'USD' ? '$' : currency;
  const sign = amount < 0 ? '-' : '';
  return `${sign}${prefix}${Math.abs(amount).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;
}

export function getComparisonText(comparison: AnalyticsComparison, range: AnalyticsRange): string {
  if (comparison.direction === 'refunds') return 'Net refunds exceeded expenses';
  if (comparison.direction === 'none') return 'No prior-period data';
  if (comparison.direction === 'same') return 'Same as previous period';
  const period = range === 'week'
    ? 'previous 7 days'
    : range === 'month'
      ? 'the same days last month'
      : 'the same elapsed days last quarter';
  return `${comparison.percentage}% ${comparison.direction} ${period}`;
}

export function getOfflineFreshness(updatedAt?: number): string {
  return updatedAt
    ? `Offline · saved ${format(new Date(updatedAt), 'HH:mm')}`
    : 'Offline · showing saved data';
}
```

- [ ] **Step 4: Run the analytics test and confirm GREEN**

Run:

```bash
npm test -- src/lib/date-utils.test.ts src/components/TransactionFlow/analytics.test.ts
npx biome check src/lib/date-utils.ts src/lib/date-utils.test.ts src/components/TransactionFlow/analytics.ts src/components/TransactionFlow/analytics.test.ts
npx tsc --noEmit
```

Expected: both test files PASS, Biome reports no errors, and TypeScript exits 0.

- [ ] **Step 5: Commit the analytics domain**

```bash
git add src/lib/date-utils.ts src/lib/date-utils.test.ts src/components/TransactionFlow/analytics.ts src/components/TransactionFlow/analytics.test.ts
git commit -m "feat: add transaction analytics calculations"
```

## Task 2: Add authoritative history and reactive local transaction queries

**Files:**

- Create: `src/components/TransactionFlow/transactionQueries.ts`
- Create: `src/components/TransactionFlow/transactionQueries.test.ts`
- Create: `src/lib/googleTransactions.test.ts`
- Modify: `src/lib/google.ts:670-748`
- Modify: `src/lib/mock/mockGoogle.ts:229-253`
- Modify: `src/components/TransactionFlow/useRecentTransactionsQuery.ts:1-25`

- [ ] **Step 1: Write failing history-read and merge tests**

Create `src/lib/googleTransactions.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TransactionRecord } from './types';
import { getTransactionHistory } from './google';

type AnalyticsAnnotatedTransaction = TransactionRecord & { analyticsExcluded?: boolean };

describe('getTransactionHistory', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads and reverses the complete A2:K transaction range', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        values: [
          ['2026-08-01T10:00:00', 'expense', 10, 'Coffee', '', 'old', '', 'THB', 'Cash', 'Me', 'old-id'],
          ['17/8/2026', 'expense', 15, 'Legacy', '', 'legacy', '', 'THB', 'Cash', 'Me', 'legacy-id'],
          ['not-a-date', 'expense', 30, 'Bad date', '', 'bad', '', 'THB', 'Cash', 'Me', 'bad-date'],
          ['2026-08-14T10:00:00', 'expense', 'not-a-number', 'Bad amount', '', 'bad', '', 'THB', 'Cash', 'Me', 'bad-amount'],
          ['2026-08-15T10:00:00', 'mystery', 40, 'Bad type', '', 'bad', '', 'THB', 'Cash', 'Me', 'bad-type'],
          ['2026-08-16T10:00:00', 'expense', 0, 'Zero', '', 'zero', '', 'THB', 'Cash', 'Me', 'zero-id'],
          ['2026-08-17T10:00:00', 'expense', 20, 'Food', '', 'new', '', 'THB', 'Cash', 'Me', 'new-id'],
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const rows = await getTransactionHistory('token', 'sheet-id');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/values/Transactions!A2:K?'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token' }) }),
    );
    expect(rows.map((row) => row.id)).toEqual([
      'new-id', 'zero-id', 'bad-type', 'bad-amount', 'bad-date', 'legacy-id', 'old-id',
    ]);
    expect(rows.map((row) => row.sheetRow)).toEqual([8, 7, 6, 5, 4, 3, 2]);
    expect(rows.map((row) => (row as AnalyticsAnnotatedTransaction).analyticsExcluded))
      .toEqual([false, true, true, true, true, false, false]);
  });
});
```

Create `transactionQueries.test.ts`:

```ts
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { TransactionRecord } from '../../lib/types';
import {
  invalidateTransactionQueries,
  mergeTransactions,
  transactionKeys,
} from './transactionQueries';

function row(id: string, status: TransactionRecord['status'], updatedAt: string): TransactionRecord {
  return {
    id,
    status,
    updatedAt,
    createdAt: updatedAt,
    date: updatedAt,
    type: 'expense',
    amount: 10,
    category: 'Food',
    currency: 'THB',
    account: 'Cash',
    for: 'Me',
  };
}

describe('mergeTransactions', () => {
  it('prefers an unsynced local record and sorts by transaction date', () => {
    const remote = [row('same', 'synced', '2026-08-15T10:00:00')];
    const local = [
      { ...row('same', 'pending', '2026-08-16T10:00:00'), amount: 25 },
      row('local-only', 'error', '2026-08-17T10:00:00'),
    ];

    const merged = mergeTransactions(remote, local);

    expect(merged.map((item) => item.id)).toEqual(['local-only', 'same']);
    expect(merged.find((item) => item.id === 'same')?.amount).toBe(25);
  });

  it('keeps a remote row when it is newer than the unsynced local copy', () => {
    const remote = [{ ...row('same', 'synced', '2026-08-17T12:00:00'), amount: 40 }];
    const local = [{ ...row('same', 'pending', '2026-08-17T11:00:00'), amount: 25 }];

    expect(mergeTransactions(remote, local)[0]?.amount).toBe(40);
  });

  it('can preserve the compact dashboard created-at ordering for backdated entries', () => {
    const olderEntry = { ...row('older-entry', 'synced', '2026-08-17T10:00:00'), date: '2026-08-17T10:00:00' };
    const backdatedNewEntry = { ...row('new-entry', 'synced', '2026-08-18T10:00:00'), date: '2026-08-01T10:00:00' };

    expect(mergeTransactions([olderEntry, backdatedNewEntry], [], 'createdAt').map((item) => item.id))
      .toEqual(['new-entry', 'older-entry']);
  });
});

describe('invalidateTransactionQueries', () => {
  it('invalidates the shared transaction-key prefix', async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await invalidateTransactionQueries(queryClient);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: transactionKeys.all });
  });
});
```

- [ ] **Step 2: Run the new tests and confirm RED**

Run:

```bash
npm test -- src/lib/googleTransactions.test.ts src/components/TransactionFlow/transactionQueries.test.ts
```

Expected: FAIL because `getTransactionHistory` and `transactionQueries.ts` do not exist.

- [ ] **Step 3: Add complete-history readers to real and mock Google adapters**

In `src/lib/google.ts`, add the complete reader immediately before `getRecentTransactions`:

```ts
type AnalyticsAnnotatedTransaction = TransactionRecord & { analyticsExcluded?: boolean };

export async function getTransactionHistory(
  accessToken: string,
  spreadsheetId: string,
): Promise<TransactionRecord[]> {
  const range = `${TAB_NAME}!A2:K`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
  const data = await fetchWithAuth<{ values?: unknown[][] }>(url, accessToken);
  return (data.values ?? [])
    .map((row, index): AnalyticsAnnotatedTransaction => {
      const parsed = parseTransactionRow(row, index + 2);
      const rawType = String(row[1] ?? '').toLowerCase();
      const rawAmount = typeof row[2] === 'number' ? row[2] : Number(row[2]);
      const rawDate = typeof row[0] === 'string' || typeof row[0] === 'number' ? row[0] : '';
      const analyticsExcluded = tryParseDate(rawDate) === null
        || !['expense', 'income', 'transfer'].includes(rawType)
        || !Number.isFinite(rawAmount)
        || rawAmount === 0;
      return { ...parsed, analyticsExcluded };
    })
    .reverse();
}
```

Add `tryParseDate` beside the existing `parseDate` import at the top of `google.ts`.

Leave the existing private `parseTransactionRow` declaration and body in place; function
declaration hoisting lets both recent and complete readers reuse that one parser without moving or
duplicating it.

In `src/lib/mock/mockGoogle.ts`, add:

```ts
export async function getTransactionHistory(
  _accessToken: string,
  _spreadsheetId: string,
): Promise<TransactionRecord[]> {
  await delay();
  return getMockTransactions()
    .map((transaction, index) => {
      const amount = Number(transaction.amount);
      const analyticsExcluded = tryParseDate(transaction.date) === null
        || !['expense', 'income', 'transfer'].includes(transaction.type)
        || !Number.isFinite(amount)
        || amount === 0;
      return { ...transaction, sheetRow: index + 2, analyticsExcluded };
    })
    .reverse();
}
```

Add `tryParseDate` from `../date-utils` to `mockGoogle.ts`. Rows remain in full history even when
`analyticsExcluded` is true; the marker affects aggregation only.

- [ ] **Step 4: Implement shared query keys, local reads, merging, and invalidation**

Create `transactionQueries.ts`:

```ts
import { type QueryClient, useQuery } from '@tanstack/react-query';
import { useSession, useWorkspace } from '../../app/providers';
import { db } from '../../lib/db';
import {
  getTransactionHistory as realGetTransactionHistory,
} from '../../lib/google';
import {
  IS_DEV_MODE,
  getTransactionHistory as mockGetTransactionHistory,
} from '../../lib/mock';
import { parseDate, tryParseDate } from '../../lib/date-utils';
import type { TransactionRecord } from '../../lib/types';

const getTransactionHistory = IS_DEV_MODE
  ? mockGetTransactionHistory
  : realGetTransactionHistory;

export const transactionKeys = {
  all: ['transactions'] as const,
  recent: (sheetId: string | null, limit: number) =>
    [...transactionKeys.all, 'recent', sheetId, limit] as const,
  history: (sheetId: string | null) =>
    [...transactionKeys.all, 'history', sheetId] as const,
  local: () => [...transactionKeys.all, 'local'] as const,
};

export function mergeTransactions(
  remote: TransactionRecord[],
  local: TransactionRecord[],
  sortBy: 'date' | 'createdAt' = 'date',
): TransactionRecord[] {
  const byId = new Map(remote.map((row) => [row.id, row]));
  for (const row of local) {
    const current = byId.get(row.id);
    const localUpdatedAt = tryParseDate(row.updatedAt)?.getTime() ?? Number.NEGATIVE_INFINITY;
    const currentUpdatedAt = current
      ? tryParseDate(current.updatedAt)?.getTime() ?? Number.NEGATIVE_INFINITY
      : Number.NEGATIVE_INFINITY;
    if (!current || localUpdatedAt >= currentUpdatedAt) {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()].sort(
    (left, right) => parseDate(right[sortBy]).getTime() - parseDate(left[sortBy]).getTime(),
  );
}

export function useTransactionHistoryQuery(enabled: boolean) {
  const { accessToken } = useSession();
  const { sheetId } = useWorkspace();

  return useQuery<TransactionRecord[]>({
    queryKey: transactionKeys.history(sheetId),
    queryFn: async () => {
      if (!accessToken || !sheetId) return [];
      return getTransactionHistory(accessToken, sheetId);
    },
    enabled: enabled && Boolean(accessToken && sheetId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useLocalTransactionsQuery(enabled = true) {
  return useQuery<TransactionRecord[]>({
    queryKey: transactionKeys.local(),
    queryFn: async () => {
      const rows = await db.transactions
        .where('status')
        .anyOf(['pending', 'error'])
        .toArray();
      return rows.sort(
        (left, right) => parseDate(right.date).getTime() - parseDate(left.date).getTime(),
      );
    },
    enabled,
    networkMode: 'always',
    staleTime: Infinity,
  });
}

export function invalidateTransactionQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: transactionKeys.all });
}
```

- [ ] **Step 5: Move the recent query under the shared key prefix**

Update `useRecentTransactionsQuery.ts` to import `transactionKeys` and replace its current key:

```ts
import { useQuery } from '@tanstack/react-query';
import { useSession, useWorkspace } from '../../app/providers';
import { getRecentTransactions as realGetRecentTransactions } from '../../lib/google';
import { IS_DEV_MODE, getRecentTransactions as mockGetRecentTransactions } from '../../lib/mock';
import type { TransactionRecord } from '../../lib/types';
import { transactionKeys } from './transactionQueries';

const getRecentTransactions = IS_DEV_MODE ? mockGetRecentTransactions : realGetRecentTransactions;

export function useRecentTransactionsQuery(limit = 50) {
  const { accessToken } = useSession();
  const { sheetId } = useWorkspace();

  return useQuery<TransactionRecord[]>({
    queryKey: transactionKeys.recent(sheetId, limit),
    queryFn: async () => {
      if (!accessToken || !sheetId) return [];
      return getRecentTransactions(accessToken, sheetId, limit);
    },
    enabled: Boolean(accessToken && sheetId),
    staleTime: 60 * 1000,
  });
}
```

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
npm test -- src/lib/googleTransactions.test.ts src/components/TransactionFlow/transactionQueries.test.ts
npx biome check src/lib/google.ts src/lib/mock/mockGoogle.ts src/lib/googleTransactions.test.ts src/components/TransactionFlow/transactionQueries.ts src/components/TransactionFlow/transactionQueries.test.ts src/components/TransactionFlow/useRecentTransactionsQuery.ts
npx tsc --noEmit
```

Expected: both test files PASS, Biome reports no errors, and TypeScript exits 0.

- [ ] **Step 7: Commit the history/query layer**

```bash
git add src/lib/google.ts src/lib/mock/mockGoogle.ts src/lib/googleTransactions.test.ts src/components/TransactionFlow/transactionQueries.ts src/components/TransactionFlow/transactionQueries.test.ts src/components/TransactionFlow/useRecentTransactionsQuery.ts
git commit -m "feat: query complete transaction history"
```

## Task 3: Extract transaction presentation and add the Transactions detail sheet

**Files:**

- Create: `src/components/TransactionFlow/TransactionRow.tsx`
- Create: `src/components/TransactionFlow/transactionHistory.ts`
- Create: `src/components/TransactionFlow/transactionHistory.test.ts`
- Create: `src/components/TransactionFlow/TransactionsDrawer.tsx`
- Create: `src/components/TransactionFlow/TransactionsDrawer.test.tsx`
- Create: `src/components/TransactionFlow/TopDashboard.test.tsx`
- Modify: `src/components/TransactionFlow/TopDashboard.tsx:1-400`
- Modify: `src/test/setup.ts:1`

- [ ] **Step 1: Write failing pure history tests**

Create `transactionHistory.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { TransactionRecord } from '../../lib/types';
import {
  filterTransactionHistory,
  groupTransactionHistory,
  type TransactionHistoryFilters,
} from './transactionHistory';

const rows: TransactionRecord[] = [
  {
    id: 'food',
    type: 'expense',
    amount: 120,
    currency: 'THB',
    account: 'Cash',
    for: 'Me',
    category: 'Food Delivery',
    note: 'Lunch',
    date: '2026-08-17T12:00:00',
    status: 'synced',
    createdAt: '2026-08-17T12:00:00',
    updatedAt: '2026-08-17T12:00:00',
  },
  {
    id: 'salary',
    type: 'income',
    amount: 2500,
    currency: 'THB',
    account: 'Bank',
    for: 'Me',
    category: 'Salary',
    date: '2026-08-16T12:00:00',
    status: 'synced',
    createdAt: '2026-08-16T12:00:00',
    updatedAt: '2026-08-16T12:00:00',
  },
];

const emptyFilters: TransactionHistoryFilters = {
  query: '',
  type: 'all',
  startDate: '',
  endDate: '',
};

describe('filterTransactionHistory', () => {
  it('matches category, note, and account case-insensitively', () => {
    expect(filterTransactionHistory(rows, { ...emptyFilters, query: 'food' })[0]?.id).toBe('food');
    expect(filterTransactionHistory(rows, { ...emptyFilters, query: 'lunch' })).toHaveLength(1);
    expect(filterTransactionHistory(rows, { ...emptyFilters, query: 'BANK' })[0]?.id).toBe('salary');
  });

  it('applies type and inclusive local date bounds', () => {
    expect(
      filterTransactionHistory(rows, {
        query: '',
        type: 'expense',
        startDate: '2026-08-17',
        endDate: '2026-08-17',
      }).map((row) => row.id),
    ).toEqual(['food']);
  });
});

describe('groupTransactionHistory', () => {
  it('groups newest first and totals signed expenses by currency', () => {
    const groups = groupTransactionHistory([
      ...rows,
      { ...rows[0], id: 'undo', amount: -20 },
    ]);

    expect(groups.map((group) => group.dateKey)).toEqual(['2026-08-17', '2026-08-16']);
    expect(groups[0]?.expenseTotals).toEqual({ THB: 100 });
  });
});
```

- [ ] **Step 2: Run the pure history test and confirm RED**

Run:

```bash
npm test -- src/components/TransactionFlow/transactionHistory.test.ts
```

Expected: FAIL because `transactionHistory.ts` does not exist.

- [ ] **Step 3: Implement pure history filtering and grouping**

Create `transactionHistory.ts`:

```ts
import { endOfDay, format, startOfDay } from 'date-fns';
import { parseDate } from '../../lib/date-utils';
import type { TransactionRecord, TransactionType } from '../../lib/types';

export type TransactionHistoryType = TransactionType | 'all';

export type TransactionHistoryFilters = {
  query: string;
  type: TransactionHistoryType;
  startDate: string;
  endDate: string;
};

export type TransactionDateGroup = {
  dateKey: string;
  rows: TransactionRecord[];
  expenseTotals: Record<string, number>;
};

function localDateBoundary(value: string, end: boolean): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : end ? endOfDay(date) : startOfDay(date);
}

export function filterTransactionHistory(
  rows: TransactionRecord[],
  filters: TransactionHistoryFilters,
): TransactionRecord[] {
  const query = filters.query.trim().toLowerCase();
  const start = localDateBoundary(filters.startDate, false);
  const end = localDateBoundary(filters.endDate, true);

  return rows
    .filter((row) => {
      if (filters.type !== 'all' && row.type !== filters.type) return false;
      const date = parseDate(row.date);
      if (start && date < start) return false;
      if (end && date > end) return false;
      if (!query) return true;
      return [row.category, row.note ?? '', row.account]
        .some((value) => value.toLowerCase().includes(query));
    })
    .sort((left, right) => parseDate(right.date).getTime() - parseDate(left.date).getTime());
}

export function groupTransactionHistory(rows: TransactionRecord[]): TransactionDateGroup[] {
  const groups = new Map<string, TransactionDateGroup>();
  for (const row of rows) {
    const dateKey = format(parseDate(row.date), 'yyyy-MM-dd');
    const group = groups.get(dateKey) ?? { dateKey, rows: [], expenseTotals: {} };
    group.rows.push(row);
    if (row.type === 'expense' && Number.isFinite(Number(row.amount))) {
      group.expenseTotals[row.currency] =
        (group.expenseTotals[row.currency] ?? 0) + Number(row.amount);
    }
    groups.set(dateKey, group);
  }
  return [...groups.values()].sort((left, right) => right.dateKey.localeCompare(left.dateKey));
}
```

- [ ] **Step 4: Write failing presentation tests for the compact list and drawer**

Add the browser shims Vaul and the existing dashboard observers need to `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';

Object.defineProperties(HTMLElement.prototype, {
  hasPointerCapture: { value: () => false },
  setPointerCapture: { value: () => undefined },
  releasePointerCapture: { value: () => undefined },
  scrollIntoView: { value: () => undefined },
});

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

Object.defineProperty(window, 'scrollTo', {
  configurable: true,
  value: () => undefined,
});

Object.defineProperties(window, {
  requestAnimationFrame: {
    configurable: true,
    value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0),
  },
  cancelAnimationFrame: {
    configurable: true,
    value: (handle: number) => window.clearTimeout(handle),
  },
});

class ResizeObserverStub implements ResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: ResizeObserverStub,
});

class IntersectionObserverStub implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0];
  disconnect() {}
  observe() {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
  unobserve() {}
}

Object.defineProperty(globalThis, 'IntersectionObserver', {
  configurable: true,
  value: IntersectionObserverStub,
});
```

Create `TopDashboard.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { TransactionRecord } from '../../lib/types';
import { TopDashboard } from './TopDashboard';

vi.mock('./useRecentTransactionsQuery', () => ({
  useRecentTransactionsQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('./transactionQueries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./transactionQueries')>();
  return { ...actual, useLocalTransactionsQuery: () => ({ data: [] }) };
});

const example: TransactionRecord = {
  id: 'food',
  type: 'expense',
  amount: 120,
  currency: 'THB',
  account: 'Cash',
  for: 'Me',
  category: 'Food Delivery',
  note: 'Lunch',
  date: '2026-08-17T12:00:00',
  status: 'synced',
  createdAt: '2026-08-17T12:00:00',
  updatedAt: '2026-08-17T12:00:00',
};

function renderDashboard(props: ComponentProps<typeof TopDashboard>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TopDashboard {...props} />
    </QueryClientProvider>,
  );
}

describe('TopDashboard', () => {
  it('keeps transaction row content and exposes View all', async () => {
    const user = userEvent.setup();
    const onEditTransaction = vi.fn();
    const onViewAll = vi.fn();
    renderDashboard({
      transactionsOverride: [example],
      onEditTransaction,
      onViewAll,
    });

    expect(screen.getByRole('button', { name: /12:00.*Food Delivery.*Lunch.*฿120.00/i }))
      .toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View all transactions' }));
    expect(onViewAll).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /12:00.*Food Delivery/i }));
    expect(onEditTransaction).toHaveBeenCalledWith(example);
  });

  it('hides View all when no transactions exist', () => {
    renderDashboard({ transactionsOverride: [] });
    expect(screen.queryByRole('button', { name: 'View all transactions' })).not.toBeInTheDocument();
  });

  it('keeps a compact retry inside the existing dashboard height', async () => {
    const user = userEvent.setup();
    const onRetryOverride = vi.fn();
    renderDashboard({
      transactionsOverride: [],
      errorOverride: new Error('network'),
      onRetryOverride,
    });

    expect(screen.getByText('Transactions unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No transactions yet')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry transactions' }));
    expect(onRetryOverride).toHaveBeenCalledTimes(1);
  });
});
```

Create `TransactionsDrawer.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TransactionRecord } from '../../lib/types';
import { TransactionsDrawer } from './TransactionsDrawer';

const transactions: TransactionRecord[] = [
  {
    id: 'food', type: 'expense', amount: 120, currency: 'THB', account: 'Cash', for: 'Me',
    category: 'Food Delivery', note: 'Lunch', date: '2026-08-17T12:00:00', status: 'synced',
    createdAt: '2026-08-17T12:00:00', updatedAt: '2026-08-17T12:00:00',
  },
  {
    id: 'salary', type: 'income', amount: 2500, currency: 'THB', account: 'Bank', for: 'Me',
    category: 'Salary', date: '2026-08-16T12:00:00', status: 'synced',
    createdAt: '2026-08-16T12:00:00', updatedAt: '2026-08-16T12:00:00',
  },
];

describe('TransactionsDrawer', () => {
  it('searches and filters without changing source data', async () => {
    const user = userEvent.setup();
    render(
      <TransactionsDrawer
        open
        onOpenChange={vi.fn()}
        transactions={transactions}
        isLoading={false}
        hasCompleteHistory
        isOffline={false}
        error={null}
        onRetry={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Transactions' })).toHaveFocus());
    await user.type(screen.getByRole('searchbox', { name: 'Search transactions' }), 'lunch');
    expect(screen.getByText('Food Delivery')).toBeInTheDocument();
    expect(screen.queryByText('Salary')).not.toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: 'Search transactions' }));
    await user.click(screen.getByRole('button', { name: 'Income' }));
    expect(screen.getByText('Salary')).toBeInTheDocument();
    expect(screen.queryByText('Food Delivery')).not.toBeInTheDocument();
  });

  it('closes and returns the selected transaction', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSelect = vi.fn();
    render(
      <TransactionsDrawer
        open
        onOpenChange={onOpenChange}
        transactions={transactions}
        isLoading={false}
        hasCompleteHistory
        isOffline={false}
        error={null}
        onRetry={vi.fn()}
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole('button', { name: /12:00.*Food Delivery/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSelect).toHaveBeenCalledWith(transactions[0]);
  });
});
```

- [ ] **Step 5: Run the component tests and confirm RED**

Run:

```bash
npm test -- src/components/TransactionFlow/TopDashboard.test.tsx src/components/TransactionFlow/TransactionsDrawer.test.tsx
```

Expected: FAIL because the drawer, row component, and `onViewAll` contract do not exist.

- [ ] **Step 6: Extract the existing transaction row without changing its classes**

Create `TransactionRow.tsx`:

```tsx
import { format } from 'date-fns';
import { parseDate } from '../../lib/date-utils';
import type { TransactionRecord } from '../../lib/types';
import { cn } from '../../lib/utils';

type TransactionRowProps = {
  transaction: TransactionRecord;
  itemId?: string;
  onSelect?: (transaction: TransactionRecord) => void;
};

export function TransactionRow({ transaction, itemId, onSelect }: TransactionRowProps) {
  const amount = Number(transaction.amount);
  const symbol = transaction.currency === 'THB'
    ? '฿'
    : transaction.currency === 'USD'
      ? '$'
      : transaction.currency;
  const displayAmount = amount.toLocaleString(undefined, { minimumFractionDigits: 2 });

  return (
    <button
      type="button"
      data-item-id={itemId}
      onClick={() => onSelect?.(transaction)}
      aria-label={`${format(parseDate(transaction.date), 'HH:mm')} ${transaction.type} ${transaction.category}${transaction.note ? ` ${transaction.note}` : ''} ${symbol}${displayAmount}`}
      className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors active:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <span className="w-9 text-xs font-medium tabular-nums text-muted-foreground">
        {format(parseDate(transaction.date), 'HH:mm')}
      </span>
      <div className="flex min-w-0 items-center gap-2 pr-2">
        <span className="truncate font-medium text-foreground">
          {transaction.category}
          {transaction.note ? (
            <span className="ml-1 font-normal text-muted-foreground">- {transaction.note}</span>
          ) : null}
        </span>
      </div>
      <span
        className={cn(
          'whitespace-nowrap font-medium tabular-nums',
          transaction.type === 'income'
            ? 'text-emerald-500'
            : transaction.type === 'expense'
              ? 'text-foreground'
              : 'text-blue-500',
        )}
      >
        {transaction.type === 'expense' ? '' : '+'}{symbol}{displayAmount}
      </span>
    </button>
  );
}
```

- [ ] **Step 7: Implement the Transactions drawer**

Create `TransactionsDrawer.tsx`:

```tsx
import { format, isSameDay, subDays } from 'date-fns';
import { X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { parseDate } from '../../lib/date-utils';
import type { TransactionRecord } from '../../lib/types';
import { cn } from '../../lib/utils';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '../ui/drawer';
import { Skeleton } from '../ui/skeleton';
import { formatAnalyticsAmount } from './analytics';
import {
  filterTransactionHistory,
  groupTransactionHistory,
  type TransactionHistoryType,
} from './transactionHistory';
import { TransactionRow } from './TransactionRow';

type TransactionsDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: TransactionRecord[];
  isLoading: boolean;
  hasCompleteHistory: boolean;
  isOffline: boolean;
  error: Error | null;
  onRetry: () => void;
  onSelect: (transaction: TransactionRecord) => void;
};

const TYPES: Array<{ value: TransactionHistoryType; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
];

function dateLabel(dateKey: string): string {
  const date = parseDate(dateKey);
  const now = new Date();
  if (isSameDay(date, now)) return 'Today';
  if (isSameDay(date, subDays(now, 1))) return 'Yesterday';
  return format(date, 'EEEE, MMM d');
}

export function TransactionsDrawer({
  open,
  onOpenChange,
  transactions,
  isLoading,
  hasCompleteHistory,
  isOffline,
  error,
  onRetry,
  onSelect,
}: TransactionsDrawerProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<TransactionHistoryType>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [visibleCount, setVisibleCount] = useState(100);
  const filtered = useMemo(
    () => filterTransactionHistory(transactions, { query, type, startDate, endDate }),
    [endDate, query, startDate, transactions, type],
  );
  const visible = filtered.slice(0, visibleCount);
  const groups = useMemo(() => groupTransactionHistory(visible), [visible]);

  useEffect(() => setVisibleCount(100), [endDate, query, startDate, type]);

  const handleSelect = (transaction: TransactionRecord) => {
    onOpenChange(false);
    onSelect(transaction);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className="h-[90dvh]! sm:mx-auto sm:max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
      >
        <DrawerHeader className="grid grid-cols-[1fr_auto] items-center text-left">
          <DrawerTitle ref={titleRef} tabIndex={-1}>Transactions</DrawerTitle>
          <DrawerDescription className="sr-only">Search and filter your complete transaction history.</DrawerDescription>
          <DrawerClose asChild>
            <button type="button" aria-label="Close transactions" className="flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
              <X className="h-5 w-5" />
            </button>
          </DrawerClose>
        </DrawerHeader>
        <div className="space-y-3 px-4 pb-3" data-vaul-no-drag>
          <input
            type="search"
            aria-label="Search transactions"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search category, note, or account"
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-ring"
          />
          <div className="grid grid-cols-4 rounded-xl bg-surface-2 p-1" role="group" aria-label="Transaction type">
            {TYPES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={type === option.value}
                onClick={() => setType(option.value)}
                className={cn('h-11 rounded-lg text-xs font-semibold', type === option.value ? 'bg-accent text-accent-foreground' : 'text-muted-foreground')}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted-foreground">From<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-border bg-background px-2 text-foreground" /></label>
            <label className="text-xs text-muted-foreground">To<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-border bg-background px-2 text-foreground" /></label>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-safe" data-vaul-no-drag>
          {!hasCompleteHistory && isOffline ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Full transaction history unavailable offline</div>
          ) : !hasCompleteHistory && isLoading ? (
            <div className="space-y-3 px-3">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton
                  // biome-ignore lint/suspicious/noArrayIndexKey: stable loading placeholders
                  key={index}
                  className="h-9 w-full"
                />
              ))}
            </div>
          ) : !hasCompleteHistory && error ? (
            <div className="flex h-full items-center justify-between px-3 text-sm"><span className="text-muted-foreground">Transaction history unavailable</span><button type="button" onClick={onRetry} className="min-h-11 font-semibold text-primary">Retry</button></div>
          ) : !hasCompleteHistory ? (
            <div className="flex h-full items-center justify-between px-3 text-sm"><span className="text-muted-foreground">Transaction history unavailable</span><button type="button" onClick={onRetry} className="min-h-11 font-semibold text-primary">Retry</button></div>
          ) : groups.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {transactions.length === 0 ? 'No transactions yet' : 'No matching transactions'}
            </div>
          ) : (
            groups.map((group) => (
              <section key={group.dateKey}>
                <div className="flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>{dateLabel(group.dateKey)}</span>
                  <span>{Object.entries(group.expenseTotals).filter(([, amount]) => amount !== 0).map(([currency, amount]) => formatAnalyticsAmount(amount, currency)).join(' · ')}</span>
                </div>
                {group.rows.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} onSelect={handleSelect} />)}
              </section>
            ))
          )}
          {visibleCount < filtered.length ? (
            <button type="button" onClick={() => setVisibleCount((count) => count + 100)} className="min-h-11 w-full text-sm font-semibold text-primary">Load older</button>
          ) : groups.length > 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">End of history</p>
          ) : null}
          {hasCompleteHistory && error ? <p className="py-2 text-center text-xs text-muted-foreground">Couldn't refresh · showing saved data</p> : null}
          {hasCompleteHistory && !error && isOffline ? <p className="py-2 text-center text-xs text-muted-foreground">Offline · showing saved data</p> : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 8: Refactor `TopDashboard` to use shared queries/rows and add `View all`**

Replace the direct Dexie effect, recent-only invalidation, and local merge block with:

```tsx
type TopDashboardProps = {
  onEditTransaction?: (transaction: TransactionRecord) => void;
  onViewAll?: (event: MouseEvent<HTMLButtonElement>) => void;
  transactionsOverride?: TransactionRecord[];
  isLoadingOverride?: boolean;
  errorOverride?: Error | null;
  onRetryOverride?: () => void;
};

const {
  data: sheetTransactions,
  isLoading: isSheetLoading,
  error: sheetError,
  refetch,
} = useRecentTransactionsQuery();
const { data: localTransactions = [] } = useLocalTransactionsQuery(!transactionsOverride);
const isLoading = isLoadingOverride ?? isSheetLoading;
const error = errorOverride === undefined ? sheetError : errorOverride;
const retry = onRetryOverride ?? (() => { void refetch(); });
const transactions = useMemo(
  () => transactionsOverride ?? mergeTransactions(sheetTransactions ?? [], localTransactions, 'createdAt'),
  [localTransactions, sheetTransactions, transactionsOverride],
);
```

Remove imports for `useQueryClient`, `db`, and `useTransactions`. Import `type MouseEvent` from
React, plus `mergeTransactions`, `useLocalTransactionsQuery`, and `TransactionRow`.
Add `errorOverride` and `onRetryOverride` to the existing `TopDashboard` prop destructuring.
Add `data-testid="transaction-scroll"` to the existing timeline element that already receives
`ref={scrollContainerRef}`; this is a test-only attribute and must not change its classes.

Inside the timeline container, immediately before the existing loading/empty/list conditional, add
the compact cached-data refresh affordance without changing the container height:

```tsx
{error && displayList.length > 0 ? (
  <div className="flex min-h-11 items-center justify-between gap-2 px-3 text-xs">
    <span className="text-muted-foreground">Couldn't refresh · showing saved data</span>
    <button type="button" aria-label="Retry transactions" onClick={retry} className="min-h-11 shrink-0 font-semibold text-primary">
      Retry
    </button>
  </div>
) : null}
```

Then add an exclusive uncached-error branch between the existing loading and empty branches:

```tsx
) : error ? (
  <div className="flex flex-1 items-center justify-between gap-2 px-3 text-xs">
    <span className="text-muted-foreground">Transactions unavailable</span>
    <button type="button" aria-label="Retry transactions" onClick={retry} className="min-h-11 shrink-0 font-semibold text-primary">
      Retry
    </button>
  </div>
) : displayList.length === 0 ? (
```

This branch replaces the original `) : displayList.length === 0 ? (` line; do not render
`No transactions yet` at the same time as `Transactions unavailable`.

Replace each date separator and row in the existing list with this exact block while leaving the
header animation, total calculation, intersection observer, and classes around the list unchanged:

```tsx
<div key={transaction.id}>
  {showDateSeparator ? (
    <div className="relative px-3 py-2 text-xs font-medium text-muted-foreground">
      <span>{formatDateLabel(currentDate)}</span>
      {index === 0 && onViewAll ? (
        <button
          type="button"
          aria-label="View all transactions"
          onClick={onViewAll}
          className="absolute right-3 top-1/2 min-h-11 -translate-y-1/2 px-1 text-xs font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          View all
        </button>
      ) : null}
    </div>
  ) : null}
  <TransactionRow
    transaction={transaction}
    itemId={`${currentDate}:${transaction.id}`}
    onSelect={onEditTransaction}
  />
</div>
```

Rename the map callback variables from `(t, idx)` to `(transaction, index)` and update its current
date/previous-date expressions accordingly. No outer card, border, radius, background, or shadow is
added.

- [ ] **Step 9: Run the focused tests and typecheck**

Run:

```bash
npm test -- src/components/TransactionFlow/transactionHistory.test.ts src/components/TransactionFlow/TopDashboard.test.tsx src/components/TransactionFlow/TransactionsDrawer.test.tsx
npx biome check src/test/setup.ts src/components/TransactionFlow/TransactionRow.tsx src/components/TransactionFlow/transactionHistory.ts src/components/TransactionFlow/transactionHistory.test.ts src/components/TransactionFlow/TransactionsDrawer.tsx src/components/TransactionFlow/TransactionsDrawer.test.tsx src/components/TransactionFlow/TopDashboard.tsx src/components/TransactionFlow/TopDashboard.test.tsx
npx tsc --noEmit
```

Expected: all focused tests PASS, Biome reports no errors, and TypeScript exits 0.

- [ ] **Step 10: Commit the transaction presentation and detail sheet**

```bash
git add src/test/setup.ts src/components/TransactionFlow/TransactionRow.tsx src/components/TransactionFlow/transactionHistory.ts src/components/TransactionFlow/transactionHistory.test.ts src/components/TransactionFlow/TransactionsDrawer.tsx src/components/TransactionFlow/TransactionsDrawer.test.tsx src/components/TransactionFlow/TopDashboard.tsx src/components/TransactionFlow/TopDashboard.test.tsx
git commit -m "feat: add complete transaction history sheet"
```

## Task 4: Build the compact Analytics slide and accessible chart primitives

**Files:**

- Create: `src/components/TransactionFlow/AnalyticsRangeToggle.tsx`
- Create: `src/components/TransactionFlow/AnalyticsBarChart.tsx`
- Create: `src/components/TransactionFlow/AnalyticsSlide.tsx`
- Create: `src/components/TransactionFlow/AnalyticsSlide.test.tsx`

- [ ] **Step 1: Write failing compact Analytics tests**

Create `AnalyticsSlide.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AnalyticsSummary } from './analytics';
import { AnalyticsSlide } from './AnalyticsSlide';

const summary: AnalyticsSummary = {
  range: 'week',
  currency: 'THB',
  periods: {
    current: { start: new Date(2026, 7, 11), end: new Date(2026, 7, 17, 23, 59, 59, 999) },
    comparison: { start: new Date(2026, 7, 4), end: new Date(2026, 7, 10, 23, 59, 59, 999) },
  },
  expenseTotal: 3240,
  previousExpenseTotal: 3682,
  incomeTotal: 0,
  netTotal: -3240,
  comparison: { direction: 'below', percentage: 12 },
  buckets: ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => ({
    key: `day-${index}`,
    label,
    amount: 100 + index * 25,
    transactionIds: [],
  })),
  categories: [{ category: 'Dining Out', amount: 920, share: 28 }],
  transactions: [],
  hasExpenseRows: true,
};

describe('AnalyticsSlide', () => {
  it('renders the approved W/M/Q summary and actions', async () => {
    const user = userEvent.setup();
    const onRangeChange = vi.fn();
    const onViewAll = vi.fn();
    render(
      <AnalyticsSlide
        range="week"
        onRangeChange={onRangeChange}
        summary={summary}
        isLoading={false}
        isOffline={false}
        error={null}
        onRetry={vi.fn()}
        onViewAll={onViewAll}
      />,
    );

    expect(screen.getByText('฿3,240')).toBeInTheDocument();
    expect(screen.getByText('12% below previous 7 days')).toBeInTheDocument();
    expect(screen.getByText(/Dining Out/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Month, month to date' }));
    expect(onRangeChange).toHaveBeenCalledWith('month');
    await user.click(screen.getByRole('button', { name: 'View all analytics' }));
    expect(onViewAll).toHaveBeenCalledTimes(1);
  });

  it('renders fixed in-slide loading, empty, and uncached-error states', () => {
    const { rerender } = render(
      <AnalyticsSlide range="week" onRangeChange={vi.fn()} isLoading isOffline={false} error={null} onRetry={vi.fn()} onViewAll={vi.fn()} />,
    );
    expect(screen.getByLabelText('Loading analytics')).toBeInTheDocument();

    rerender(
      <AnalyticsSlide range="week" onRangeChange={vi.fn()} summary={{ ...summary, hasExpenseRows: false }} isLoading={false} isOffline={false} error={null} onRetry={vi.fn()} onViewAll={vi.fn()} />,
    );
    expect(screen.getByText('No expenses in this period')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View all analytics' })).toBeInTheDocument();

    rerender(
      <AnalyticsSlide range="week" onRangeChange={vi.fn()} isLoading={false} isOffline error={null} onRetry={vi.fn()} onViewAll={vi.fn()} />,
    );
    expect(screen.getByText('Full range unavailable offline')).toBeInTheDocument();

    rerender(
      <AnalyticsSlide range="week" onRangeChange={vi.fn()} isLoading={false} isOffline={false} error={new Error('network')} onRetry={vi.fn()} onViewAll={vi.fn()} />,
    );
    expect(screen.getByText('Analytics unavailable')).toBeInTheDocument();

    rerender(
      <AnalyticsSlide range="week" onRangeChange={vi.fn()} summary={summary} isLoading={false} isOffline updatedAt={new Date(2026, 7, 17, 9, 30).getTime()} error={null} onRetry={vi.fn()} onViewAll={vi.fn()} />,
    );
    expect(screen.getByText('Offline · saved 09:30')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the compact Analytics test and confirm RED**

Run:

```bash
npm test -- src/components/TransactionFlow/AnalyticsSlide.test.tsx
```

Expected: FAIL because the Analytics UI components do not exist.

- [ ] **Step 3: Implement a shadow-free W/M/Q control**

Create `AnalyticsRangeToggle.tsx`:

```tsx
import { cn } from '../../lib/utils';
import type { AnalyticsRange } from './analytics';

type AnalyticsRangeToggleProps = {
  value: AnalyticsRange;
  onChange: (range: AnalyticsRange) => void;
};

const OPTIONS: Array<{ value: AnalyticsRange; short: string; label: string }> = [
  { value: 'week', short: 'W', label: 'Week, last 7 days' },
  { value: 'month', short: 'M', label: 'Month, month to date' },
  { value: 'quarter', short: 'Q', label: 'Quarter, quarter to date' },
];

export function AnalyticsRangeToggle({ value, onChange }: AnalyticsRangeToggleProps) {
  return (
    <div className="grid h-11 w-32 grid-cols-3 rounded-xl bg-surface-2 p-1" role="group" aria-label="Analytics range">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-label={option.label}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
            value === option.value
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground',
          )}
        >
          {option.short}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Implement the accessible bar chart**

Create `AnalyticsBarChart.tsx`:

```tsx
import { cn } from '../../lib/utils';
import type { AnalyticsBucket } from './analytics';
import { formatAnalyticsAmount } from './analytics';

type AnalyticsBarChartProps = {
  buckets: AnalyticsBucket[];
  currency: string;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  className?: string;
};

export function AnalyticsBarChart({
  buckets,
  currency,
  selectedKey,
  onSelect,
  className,
}: AnalyticsBarChartProps) {
  const maximum = Math.max(1, ...buckets.map((bucket) => Math.abs(bucket.amount)));
  const hasNegative = buckets.some((bucket) => bucket.amount < 0);
  const summary = buckets
    .map((bucket) => `${bucket.label} ${formatAnalyticsAmount(bucket.amount, currency)}`)
    .join(', ');

  return (
    <figure className={className} aria-label={`Expense trend: ${summary}`}>
      <div className="flex h-full items-stretch gap-2" aria-hidden={onSelect ? undefined : true}>
        {buckets.map((bucket) => {
          const negative = bucket.amount < 0;
          const availableHeight = hasNegative ? 50 : 100;
          const bar = (
            <span
              className={cn(
                'absolute inset-x-1 bg-primary/55',
                negative ? 'top-1/2 rounded-b-sm bg-warning/55' : 'rounded-t-sm',
                selectedKey === bucket.key && 'bg-primary',
              )}
              style={{
                height: bucket.amount === 0
                  ? '0%'
                  : `${Math.max(4, (Math.abs(bucket.amount) / maximum) * availableHeight)}%`,
                bottom: negative ? undefined : hasNegative ? '50%' : 0,
              }}
            />
          );
          return (
            <div key={bucket.key} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1">
              {onSelect ? (
                <button type="button" tabIndex={-1} onClick={() => onSelect(bucket.key)} className="relative h-full w-full">{hasNegative ? <span className="absolute inset-x-0 top-1/2 border-t border-border/70" /> : null}{bar}</button>
              ) : (
                <div className="relative h-full w-full">{hasNegative ? <span className="absolute inset-x-0 top-1/2 border-t border-border/70" /> : null}{bar}</div>
              )}
              <span className="text-[10px] text-muted-foreground">{bucket.label}</span>
            </div>
          );
        })}
      </div>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}
```

The selectable detailed chart receives separate visible 44-pixel controls in Task 5; compact bars
remain presentational.

- [ ] **Step 5: Implement the compact Analytics slide**

Create `AnalyticsSlide.tsx`:

```tsx
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { MouseEvent } from 'react';
import { Skeleton } from '../ui/skeleton';
import {
  formatAnalyticsAmount,
  getComparisonText,
  getOfflineFreshness,
  type AnalyticsRange,
  type AnalyticsSummary,
} from './analytics';
import { AnalyticsBarChart } from './AnalyticsBarChart';
import { AnalyticsRangeToggle } from './AnalyticsRangeToggle';

type AnalyticsSlideProps = {
  range: AnalyticsRange;
  onRangeChange: (range: AnalyticsRange) => void;
  summary?: AnalyticsSummary;
  isLoading: boolean;
  isOffline: boolean;
  updatedAt?: number;
  error: Error | null;
  onRetry: () => void;
  onViewAll: (event: MouseEvent<HTMLButtonElement>) => void;
};

function rangeLabel(range: AnalyticsRange): string {
  if (range === 'week') return 'spent · last 7 days';
  if (range === 'month') return 'spent · month to date';
  return 'spent · quarter to date';
}

export function AnalyticsSlide({
  range,
  onRangeChange,
  summary,
  isLoading,
  isOffline,
  updatedAt,
  error,
  onRetry,
  onViewAll,
}: AnalyticsSlideProps) {
  return (
    <div className="flex h-full min-h-0 flex-col px-5 py-1">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">Analytics</h2>
        <AnalyticsRangeToggle value={range} onChange={onRangeChange} />
      </div>

      {isOffline && !summary ? (
        <div className="flex flex-1 items-center text-sm text-muted-foreground">
          Full range unavailable offline
        </div>
      ) : isLoading && !summary ? (
        <div className="flex flex-1 flex-col gap-2 pt-2" aria-label="Loading analytics">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-44" />
          <Skeleton className="mt-auto h-14 w-full" />
        </div>
      ) : error && !summary ? (
        <div className="flex flex-1 items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Analytics unavailable</span>
          <button type="button" onClick={onRetry} className="min-h-11 font-semibold text-primary">Retry</button>
        </div>
      ) : !summary ? (
        <div className="flex flex-1 items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Analytics unavailable</span>
          <button type="button" onClick={onRetry} className="min-h-11 font-semibold text-primary">Retry</button>
        </div>
      ) : summary && !summary.hasExpenseRows ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-sm font-medium">No expenses in this period</p>
          <p className="mt-1 text-xs text-muted-foreground">Log an expense below to see insights.</p>
          {error ? <p className="mt-1 text-[10px] text-muted-foreground">Couldn't refresh · showing saved data</p> : null}
          {!error && isOffline ? <p className="mt-1 text-[10px] text-muted-foreground">{getOfflineFreshness(updatedAt)}</p> : null}
        </div>
      ) : summary ? (
        <>
          <div className="pt-1" aria-live="polite" aria-atomic="true">
            <div className="flex items-baseline gap-2">
              <p className="text-[28px] font-semibold leading-none tabular-nums tracking-tight">{formatAnalyticsAmount(summary.expenseTotal, summary.currency)}</p>
              <p className="truncate text-[10px] text-muted-foreground">{rangeLabel(range)}</p>
            </div>
            <p className="mt-1 flex items-center gap-1 text-[11px] leading-none text-muted-foreground">
              {summary.comparison.direction === 'below' ? <ArrowDown className="h-3.5 w-3.5 text-primary" /> : null}
              {summary.comparison.direction === 'above' ? <ArrowUp className="h-3.5 w-3.5 text-warning" /> : null}
              {getComparisonText(summary.comparison, range)}
            </p>
          </div>
          <AnalyticsBarChart buckets={summary.buckets} currency={summary.currency} className="mt-1 h-10" />
          {error ? <p className="text-[10px] text-muted-foreground">Couldn't refresh · showing saved data</p> : null}
          {!error && isOffline ? <p className="text-[10px] text-muted-foreground">{getOfflineFreshness(updatedAt)}</p> : null}
        </>
      ) : null}
      <div className="mt-auto flex h-6 items-center justify-between gap-2 text-xs">
        <span className="truncate text-muted-foreground">
          {summary?.categories[0]
            ? `Top · ${summary.categories[0].category} · ${formatAnalyticsAmount(summary.categories[0].amount, summary.currency)}`
            : 'Detailed insights'}
        </span>
        <button type="button" aria-label="View all analytics" onClick={onViewAll} className="min-h-11 shrink-0 px-1 font-semibold text-primary">View all</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run focused tests, lint the new files, and typecheck**

Run:

```bash
npm test -- src/components/TransactionFlow/AnalyticsSlide.test.tsx
npx biome check src/components/TransactionFlow/AnalyticsRangeToggle.tsx src/components/TransactionFlow/AnalyticsBarChart.tsx src/components/TransactionFlow/AnalyticsSlide.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx
npx tsc --noEmit
```

Expected: test PASS, Biome reports no errors, and TypeScript exits 0.

- [ ] **Step 7: Commit the compact Analytics UI**

```bash
git add src/components/TransactionFlow/AnalyticsRangeToggle.tsx src/components/TransactionFlow/AnalyticsBarChart.tsx src/components/TransactionFlow/AnalyticsSlide.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx
git commit -m "feat: add compact transaction analytics"
```

## Task 5: Add the expanded Analytics sheet and drill-down filters

**Files:**

- Create: `src/components/TransactionFlow/AnalyticsDrawer.tsx`
- Create: `src/components/TransactionFlow/AnalyticsDrawer.test.tsx`
- Modify: `src/components/TransactionFlow/AnalyticsBarChart.tsx`

- [ ] **Step 1: Write failing Analytics drawer tests**

Create `AnalyticsDrawer.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TransactionRecord } from '../../lib/types';
import { AnalyticsDrawer } from './AnalyticsDrawer';

const transactions: TransactionRecord[] = [
  {
    id: 'dining', type: 'expense', amount: 120, currency: 'THB', account: 'Cash', for: 'Me',
    category: 'Dining Out', date: '2026-08-17T12:00:00', status: 'synced',
    createdAt: '2026-08-17T12:00:00', updatedAt: '2026-08-17T12:00:00',
  },
  {
    id: 'coffee', type: 'expense', amount: 80, currency: 'THB', account: 'Cash', for: 'Me',
    category: 'Coffee', date: '2026-08-16T12:00:00', status: 'synced',
    createdAt: '2026-08-16T12:00:00', updatedAt: '2026-08-16T12:00:00',
  },
  {
    id: 'income', type: 'income', amount: 500, currency: 'THB', account: 'Bank', for: 'Me',
    category: 'Salary', date: '2026-08-15T12:00:00', status: 'synced',
    createdAt: '2026-08-15T12:00:00', updatedAt: '2026-08-15T12:00:00',
  },
];

describe('AnalyticsDrawer', () => {
  it('shows overview metrics and drills into a category', async () => {
    const user = userEvent.setup();
    render(
      <AnalyticsDrawer
        open
        onOpenChange={vi.fn()}
        transactions={transactions}
        range="week"
        onRangeChange={vi.fn()}
        currency="THB"
        onCurrencyChange={vi.fn()}
        currencies={['THB']}
        isLoading={false}
        hasCompleteHistory
        isOffline={false}
        error={null}
        onRetry={vi.fn()}
        onSelectTransaction={vi.fn()}
        now={new Date(2026, 7, 17, 12)}
      />,
    );

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Analytics' })).toHaveFocus());
    expect(screen.getByText('฿200')).toBeInTheDocument();
    expect(screen.getByText('฿500')).toBeInTheDocument();
    expect(screen.getByText('฿300')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Filter by Dining Out' }));
    expect(screen.getByRole('button', { name: /expense Dining Out/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /expense Coffee/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear analytics filter' }));
    expect(screen.getByRole('button', { name: /expense Coffee/ })).toBeInTheDocument();
  });

  it('shares range/currency controls and closes before editing a row', async () => {
    const user = userEvent.setup();
    const onRangeChange = vi.fn();
    const onCurrencyChange = vi.fn();
    const onOpenChange = vi.fn();
    const onSelectTransaction = vi.fn();
    render(
      <AnalyticsDrawer
        open
        onOpenChange={onOpenChange}
        transactions={transactions}
        range="week"
        onRangeChange={onRangeChange}
        currency="THB"
        onCurrencyChange={onCurrencyChange}
        currencies={['THB', 'USD']}
        isLoading={false}
        hasCompleteHistory
        isOffline={false}
        error={null}
        onRetry={vi.fn()}
        onSelectTransaction={onSelectTransaction}
        now={new Date(2026, 7, 17, 12)}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Quarter, quarter to date' }));
    expect(onRangeChange).toHaveBeenCalledWith('quarter');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Analytics currency' }), 'USD');
    expect(onCurrencyChange).toHaveBeenCalledWith('USD');
    await user.click(screen.getByRole('button', { name: /expense Dining Out/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSelectTransaction).toHaveBeenCalledWith(transactions[0]);
  });

  it('groups categories after the top five into a selectable Other row', async () => {
    const user = userEvent.setup();
    const categories = ['Category A', 'Category B', 'Category C', 'Category D', 'Category E', 'Category F', 'Category G'];
    const manyCategories = categories.map((category, index): TransactionRecord => ({
      id: `category-${index}`,
      type: 'expense',
      amount: 70 - index * 10,
      currency: 'THB',
      account: 'Cash',
      for: 'Me',
      category,
      date: '2026-08-17T12:00:00',
      status: 'synced',
      createdAt: '2026-08-17T12:00:00',
      updatedAt: '2026-08-17T12:00:00',
    }));
    render(
      <AnalyticsDrawer
        open
        onOpenChange={vi.fn()}
        transactions={manyCategories}
        range="week"
        onRangeChange={vi.fn()}
        currency="THB"
        onCurrencyChange={vi.fn()}
        currencies={['THB']}
        isLoading={false}
        hasCompleteHistory
        isOffline={false}
        error={null}
        onRetry={vi.fn()}
        onSelectTransaction={vi.fn()}
        now={new Date(2026, 7, 17, 12)}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Filter by Other' }));
    expect(screen.getByRole('button', { name: /expense Category F/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /expense Category G/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /expense Category A/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the drawer test and confirm RED**

Run:

```bash
npm test -- src/components/TransactionFlow/AnalyticsDrawer.test.tsx
```

Expected: FAIL because `AnalyticsDrawer` does not exist.

- [ ] **Step 3: Make detailed chart bars keyboard-selectable**

In `AnalyticsBarChart.tsx`, replace the `onSelect` button branch with:

```tsx
<button
  type="button"
  aria-label={`Filter by ${bucket.label}, ${formatAnalyticsAmount(bucket.amount, currency)}`}
  aria-pressed={selectedKey === bucket.key}
  onClick={() => onSelect(bucket.key)}
  className={cn(
    'relative h-full min-h-11 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
    selectedKey === bucket.key && 'ring-2 ring-primary/30',
  )}
>
  {hasNegative ? <span className="absolute inset-x-0 top-1/2 border-t border-border/70" /> : null}
  {bar}
</button>
```

Keep the non-selectable compact-chart branch unchanged.

- [ ] **Step 4: Implement the Analytics detail sheet**

Create `AnalyticsDrawer.tsx`:

```tsx
import { X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { TransactionRecord } from '../../lib/types';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '../ui/drawer';
import { Skeleton } from '../ui/skeleton';
import {
  buildAnalyticsSummary,
  formatAnalyticsAmount,
  getOfflineFreshness,
  type AnalyticsRange,
} from './analytics';
import { AnalyticsBarChart } from './AnalyticsBarChart';
import { AnalyticsRangeToggle } from './AnalyticsRangeToggle';
import { TransactionRow } from './TransactionRow';

type AnalyticsDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: TransactionRecord[];
  range: AnalyticsRange;
  onRangeChange: (range: AnalyticsRange) => void;
  currency: string;
  onCurrencyChange: (currency: string) => void;
  currencies: string[];
  isLoading: boolean;
  hasCompleteHistory: boolean;
  isOffline: boolean;
  updatedAt?: number;
  error: Error | null;
  onRetry: () => void;
  onSelectTransaction: (transaction: TransactionRecord) => void;
  now?: Date;
};

export function AnalyticsDrawer({
  open,
  onOpenChange,
  transactions,
  range,
  onRangeChange,
  currency,
  onCurrencyChange,
  currencies,
  isLoading,
  hasCompleteHistory,
  isOffline,
  updatedAt,
  error,
  onRetry,
  onSelectTransaction,
  now = new Date(),
}: AnalyticsDrawerProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const summary = useMemo(
    () => buildAnalyticsSummary({ transactions, range, currency, now }),
    [currency, now, range, transactions],
  );

  useEffect(() => {
    setSelectedBucket(null);
    setSelectedCategory(null);
  }, [currency, range]);

  const otherCategoryNames = useMemo(
    () => new Set(summary.categories.slice(5).map((category) => category.category)),
    [summary.categories],
  );
  const displayedCategories = useMemo(() => {
    const top = summary.categories.slice(0, 5);
    const other = summary.categories.slice(5);
    if (other.length === 0) return top;
    const otherAmount = other.reduce((total, category) => total + category.amount, 0);
    const positiveCategoryTotal = summary.categories.reduce(
      (total, category) => total + category.amount,
      0,
    );
    return [
      ...top,
      {
        category: 'Other',
        amount: otherAmount,
        share: positiveCategoryTotal > 0
          ? Math.round((otherAmount / positiveCategoryTotal) * 100)
          : 0,
      },
    ];
  }, [summary.categories]);

  const filteredTransactions = useMemo(() => {
    let rows = summary.transactions;
    if (selectedBucket) {
      const ids = new Set(
        summary.buckets.find((bucket) => bucket.key === selectedBucket)?.transactionIds ?? [],
      );
      rows = rows.filter((row) => ids.has(row.id));
    }
    if (selectedCategory) {
      rows = rows.filter(
        (row) => row.type === 'expense' && (
          selectedCategory === 'Other'
            ? otherCategoryNames.has(row.category)
            : row.category === selectedCategory
        ),
      );
    }
    return rows;
  }, [otherCategoryNames, selectedBucket, selectedCategory, summary]);

  const clearFilter = () => {
    setSelectedBucket(null);
    setSelectedCategory(null);
  };

  const selectTransaction = (transaction: TransactionRecord) => {
    onOpenChange(false);
    onSelectTransaction(transaction);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className="h-[92dvh]! sm:mx-auto sm:max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
      >
        <DrawerHeader className="grid grid-cols-[1fr_auto] items-center border-b border-border/60 text-left">
          <DrawerTitle ref={titleRef} tabIndex={-1}>Analytics</DrawerTitle>
          <DrawerDescription className="sr-only">Review spending analytics and filter matching transactions.</DrawerDescription>
          <DrawerClose asChild>
            <button type="button" aria-label="Close analytics" className="flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"><X className="h-5 w-5" /></button>
          </DrawerClose>
        </DrawerHeader>

        <div className="flex items-center gap-3 px-4 py-3" data-vaul-no-drag>
          <AnalyticsRangeToggle value={range} onChange={onRangeChange} />
          {currencies.length > 1 ? (
            <select aria-label="Analytics currency" value={currency} onChange={(event) => onCurrencyChange(event.target.value)} className="h-11 min-w-20 rounded-xl border border-border bg-background px-2 text-sm font-semibold">
              {currencies.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          ) : (
            <span className="ml-auto text-xs font-semibold text-muted-foreground">{currency}</span>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-safe" data-vaul-no-drag>
          {!hasCompleteHistory && isOffline ? (
            <div className="flex min-h-48 items-center text-sm text-muted-foreground">Full range unavailable offline</div>
          ) : !hasCompleteHistory && isLoading ? (
            <div aria-label="Loading detailed analytics" className="space-y-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /><Skeleton className="h-32 w-full" /></div>
          ) : !hasCompleteHistory && error ? (
            <div className="flex min-h-48 items-center justify-between"><span className="text-sm text-muted-foreground">Analytics unavailable</span><button type="button" onClick={onRetry} className="min-h-11 font-semibold text-primary">Retry</button></div>
          ) : !hasCompleteHistory ? (
            <div className="flex min-h-48 items-center justify-between"><span className="text-sm text-muted-foreground">Analytics unavailable</span><button type="button" onClick={onRetry} className="min-h-11 font-semibold text-primary">Retry</button></div>
          ) : (
            <div className="space-y-6">
              <section aria-labelledby="analytics-overview">
                <h3 id="analytics-overview" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overview</h3>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div><p className="text-[10px] text-muted-foreground">Expenses</p><p className="text-base font-semibold tabular-nums">{formatAnalyticsAmount(summary.expenseTotal, currency)}</p></div>
                  <div><p className="text-[10px] text-muted-foreground">Income</p><p className="text-base font-semibold tabular-nums text-primary">{formatAnalyticsAmount(summary.incomeTotal, currency)}</p></div>
                  <div><p className="text-[10px] text-muted-foreground">Net</p><p className="text-base font-semibold tabular-nums">{formatAnalyticsAmount(summary.netTotal, currency)}</p></div>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">Transfers are excluded from totals.</p>
              </section>

              <section aria-labelledby="analytics-trend">
                <h3 id="analytics-trend" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Trend</h3>
                <AnalyticsBarChart buckets={summary.buckets} currency={currency} selectedKey={selectedBucket} onSelect={(key) => { setSelectedBucket((current) => current === key ? null : key); setSelectedCategory(null); }} className="mt-2 h-36" />
              </section>

              <section aria-labelledby="analytics-categories">
                <h3 id="analytics-categories" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top categories</h3>
                <div className="mt-2 space-y-1">
                  {displayedCategories.map((category) => (
                    <button key={category.category} type="button" aria-label={`Filter by ${category.category}`} aria-pressed={selectedCategory === category.category} onClick={() => { setSelectedCategory((current) => current === category.category ? null : category.category); setSelectedBucket(null); }} className="grid min-h-11 w-full grid-cols-[1fr_auto] items-center gap-3 rounded-lg px-2 text-left aria-pressed:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                      <span><span className="block text-sm font-medium">{category.category}</span><span className="mt-1 block h-1 rounded-full bg-surface-2"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, category.share)}%` }} /></span></span>
                      <span className="text-xs tabular-nums text-muted-foreground">{formatAnalyticsAmount(category.amount, currency)} · {category.share}%</span>
                    </button>
                  ))}
                  {summary.categories.length === 0 ? <p className="py-3 text-sm text-muted-foreground">No positive category spend</p> : null}
                </div>
              </section>

              <section aria-labelledby="analytics-transactions">
                <div className="flex min-h-11 items-center justify-between">
                  <h3 id="analytics-transactions" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transactions</h3>
                  {selectedBucket || selectedCategory ? <button type="button" aria-label="Clear analytics filter" onClick={clearFilter} className="min-h-11 text-xs font-semibold text-primary">Clear filter</button> : null}
                </div>
                {filteredTransactions.length > 0 ? filteredTransactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} onSelect={selectTransaction} />) : <p className="py-6 text-center text-sm text-muted-foreground">No matching transactions</p>}
              </section>

              {error ? <p className="text-xs text-muted-foreground">Couldn't refresh · showing saved data</p> : null}
              {!error && isOffline ? <p className="text-xs text-muted-foreground">{getOfflineFreshness(updatedAt)}</p> : null}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 5: Run the drawer and chart tests, then typecheck**

Run:

```bash
npm test -- src/components/TransactionFlow/AnalyticsDrawer.test.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx
npx biome check src/components/TransactionFlow/AnalyticsBarChart.tsx src/components/TransactionFlow/AnalyticsDrawer.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx
npx tsc --noEmit
```

Expected: both tests PASS, Biome reports no errors, and TypeScript exits 0.

- [ ] **Step 6: Commit the Analytics detail sheet**

```bash
git add src/components/TransactionFlow/AnalyticsBarChart.tsx src/components/TransactionFlow/AnalyticsDrawer.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx
git commit -m "feat: add analytics detail sheet"
```

## Task 6: Integrate the two-slide carousel and transaction-query invalidation

**Files:**

- Create: `src/components/TransactionFlow/HomeDashboardCarousel.tsx`
- Create: `src/components/TransactionFlow/HomeDashboardCarousel.test.tsx`
- Create: `src/components/TransactionFlow/transactionMutations.test.tsx`
- Modify: `src/components/TransactionFlow/useAddTransactionMutation.ts:1-23`
- Modify: `src/components/TransactionFlow/useUpdateTransactionMutation.ts:1-23`
- Modify: `src/components/TransactionFlow/useDeleteTransactionMutation.ts:1-16`
- Modify: `src/components/TransactionFlow/index.tsx:1-590`

- [ ] **Step 1: Write failing carousel coordinator and mutation-invalidation tests**

Create `HomeDashboardCarousel.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MouseEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeDashboardCarousel } from './HomeDashboardCarousel';

const historyEnabledCalls: boolean[] = [];

vi.mock('../../app/providers', () => ({
  useConnectivity: () => ({ isOnline: true }),
  useTransactions: () => ({ queueCount: 0, lastSyncAt: null, lastSyncErrorAt: null }),
}));
vi.mock('./transactionQueries', () => ({
  invalidateTransactionQueries: vi.fn().mockResolvedValue(undefined),
  mergeTransactions: (remote: unknown[]) => remote,
  useLocalTransactionsQuery: () => ({ data: [] }),
  useTransactionHistoryQuery: (enabled: boolean) => {
    historyEnabledCalls.push(enabled);
    return { data: [], isLoading: false, error: null, refetch: vi.fn() };
  },
}));
vi.mock('./TopDashboard', () => ({
  TopDashboard: ({ onViewAll }: { onViewAll: (event: MouseEvent<HTMLButtonElement>) => void }) => (
    <button type="button" onClick={onViewAll}>Transactions content</button>
  ),
}));
vi.mock('./AnalyticsSlide', () => ({
  AnalyticsSlide: ({ onViewAll }: { onViewAll: (event: MouseEvent<HTMLButtonElement>) => void }) => (
    <button type="button" onClick={onViewAll}>Analytics content</button>
  ),
}));
vi.mock('./TransactionsDrawer', () => ({
  TransactionsDrawer: ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => open ? <button type="button" onClick={() => onOpenChange(false)}>Close transactions drawer</button> : null,
}));
vi.mock('./AnalyticsDrawer', () => ({
  AnalyticsDrawer: ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => open ? <button type="button" onClick={() => onOpenChange(false)}>Close analytics drawer</button> : null,
}));

function renderCarousel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <HomeDashboardCarousel currency="THB" onEditTransaction={vi.fn()} />
    </QueryClientProvider>,
  );
  const viewport = screen.getByTestId('home-carousel-viewport');
  Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 300 });
  Object.defineProperty(viewport, 'scrollTo', {
    configurable: true,
    value: ({ left }: ScrollToOptions) => {
      viewport.scrollLeft = Number(left ?? 0);
      fireEvent.scroll(viewport);
    },
  });
  return viewport;
}

describe('HomeDashboardCarousel', () => {
  beforeEach(() => historyEnabledCalls.splice(0));

  it('starts on Transactions and lazily enables history on Analytics', async () => {
    const user = userEvent.setup();
    renderCarousel();

    expect(screen.getByRole('button', { name: 'Transactions slide' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByLabelText('Transactions, slide 1 of 2')).not.toHaveAttribute('aria-hidden', 'true');
    expect(historyEnabledCalls.at(-1)).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Analytics slide' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Analytics slide' })).toHaveAttribute('aria-current', 'true'));
    expect(screen.getByLabelText('Analytics, slide 2 of 2')).not.toHaveAttribute('aria-hidden', 'true');
    expect(historyEnabledCalls.at(-1)).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Transactions slide' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Transactions slide' })).toHaveAttribute('aria-current', 'true'));
    expect(historyEnabledCalls.at(-1)).toBe(true);
  });

  it('supports arrow keys and opens each dedicated sheet', async () => {
    const user = userEvent.setup();
    const viewport = renderCarousel();
    fireEvent.keyDown(viewport, { key: 'ArrowRight' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Analytics slide' })).toHaveAttribute('aria-current', 'true'));
    const analyticsTrigger = screen.getByText('Analytics content');
    await user.click(analyticsTrigger);
    await user.click(screen.getByText('Close analytics drawer'));
    await waitFor(() => expect(analyticsTrigger).toHaveFocus());
    fireEvent.keyDown(viewport, { key: 'ArrowLeft' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Transactions slide' })).toHaveAttribute('aria-current', 'true'));
    const transactionsTrigger = screen.getByText('Transactions content');
    await user.click(transactionsTrigger);
    await user.click(screen.getByText('Close transactions drawer'));
    await waitFor(() => expect(transactionsTrigger).toHaveFocus());
  });

  it('suppresses an accidental action click after a horizontal drag', () => {
    const viewport = renderCarousel();
    const trigger = screen.getByText('Transactions content');

    fireEvent.pointerDown(trigger, { clientX: 250, clientY: 80 });
    fireEvent.pointerMove(viewport, { clientX: 120, clientY: 84 });
    fireEvent.pointerUp(viewport, { clientX: 120, clientY: 84 });
    fireEvent.click(trigger);

    expect(screen.queryByText('Close transactions drawer')).not.toBeInTheDocument();
  });
});
```

Create `transactionMutations.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransactionFormValues } from './transactionSchema';
import { useAddTransactionMutation } from './useAddTransactionMutation';
import { useDeleteTransactionMutation } from './useDeleteTransactionMutation';
import { useUpdateTransactionMutation } from './useUpdateTransactionMutation';

const transactionMocks = vi.hoisted(() => ({
  addTransaction: vi.fn().mockResolvedValue(undefined),
  updateTransaction: vi.fn().mockResolvedValue(undefined),
  deleteTransaction: vi.fn().mockResolvedValue({ ok: true, message: 'Deleted' }),
}));
const invalidateTransactionQueries = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../../app/providers', () => ({
  useTransactions: () => transactionMocks,
}));
vi.mock('./transactionQueries', () => ({ invalidateTransactionQueries }));

const values: TransactionFormValues = {
  type: 'expense',
  category: 'Food Delivery',
  amount: '120',
  currency: 'THB',
  account: 'Cash',
  forValue: 'Me',
  dateObject: new Date(2026, 7, 17, 12),
  note: 'Lunch',
};

function wrapper(client: QueryClient) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('transaction mutation invalidation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('invalidates the shared transaction prefix after add, update, and delete settle', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const options = { wrapper: wrapper(client) };
    const addHook = renderHook(() => useAddTransactionMutation(), options);
    const updateHook = renderHook(() => useUpdateTransactionMutation(), options);
    const deleteHook = renderHook(() => useDeleteTransactionMutation(), options);

    await act(async () => { await addHook.result.current.mutateAsync(values); });
    await act(async () => {
      await updateHook.result.current.mutateAsync({ id: 'food', input: { amount: 90 } });
    });
    await act(async () => { await deleteHook.result.current.mutateAsync('food'); });

    expect(transactionMocks.addTransaction).toHaveBeenCalledTimes(1);
    expect(transactionMocks.updateTransaction).toHaveBeenCalledWith('food', { amount: 90 });
    expect(transactionMocks.deleteTransaction).toHaveBeenCalledWith('food');
    expect(invalidateTransactionQueries).toHaveBeenCalledTimes(3);
    expect(invalidateTransactionQueries).toHaveBeenNthCalledWith(1, client);
    expect(invalidateTransactionQueries).toHaveBeenNthCalledWith(2, client);
    expect(invalidateTransactionQueries).toHaveBeenNthCalledWith(3, client);
  });
});
```

- [ ] **Step 2: Run both integration tests and confirm RED**

Run:

```bash
npm test -- src/components/TransactionFlow/HomeDashboardCarousel.test.tsx src/components/TransactionFlow/transactionMutations.test.tsx
```

Expected: FAIL because `HomeDashboardCarousel` and shared mutation invalidation do not exist.

- [ ] **Step 3: Implement the borderless native-scroll carousel coordinator**

Create `HomeDashboardCarousel.tsx`:

```tsx
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useConnectivity, useTransactions } from '../../app/providers';
import type { TransactionRecord } from '../../lib/types';
import { cn } from '../../lib/utils';
import { AnalyticsDrawer } from './AnalyticsDrawer';
import type { AnalyticsRange } from './analytics';
import { buildAnalyticsSummary } from './analytics';
import { AnalyticsSlide } from './AnalyticsSlide';
import { TopDashboard } from './TopDashboard';
import {
  invalidateTransactionQueries,
  mergeTransactions,
  useLocalTransactionsQuery,
  useTransactionHistoryQuery,
} from './transactionQueries';
import { TransactionsDrawer } from './TransactionsDrawer';

type HomeDashboardCarouselProps = {
  currency: string;
  onEditTransaction: (transaction: TransactionRecord) => void;
};

const SLIDES = ['Transactions', 'Analytics'] as const;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function HomeDashboardCarousel({
  currency,
  onEditTransaction,
}: HomeDashboardCarouselProps) {
  const queryClient = useQueryClient();
  const { isOnline } = useConnectivity();
  const { lastSyncAt, lastSyncErrorAt } = useTransactions();
  const [activeIndex, setActiveIndex] = useState(0);
  const [historyActivated, setHistoryActivated] = useState(false);
  const [range, setRange] = useState<AnalyticsRange>('week');
  const [transactionsOpen, setTransactionsOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [drawerCurrency, setDrawerCurrency] = useState(currency);
  const [analyticsNow, setAnalyticsNow] = useState(() => new Date());
  const viewportRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Array<HTMLElement | null>>([]);
  const transactionsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const analyticsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const settleTimerRef = useRef<number | null>(null);
  const historyEnabled = historyActivated || transactionsOpen || analyticsOpen;
  const historyQuery = useTransactionHistoryQuery(historyEnabled);
  const localQuery = useLocalTransactionsQuery();
  const transactions = useMemo(
    () => mergeTransactions(historyQuery.data ?? [], localQuery.data ?? []),
    [historyQuery.data, localQuery.data],
  );
  const summary = useMemo(
    () => historyQuery.data === undefined
      ? undefined
      : buildAnalyticsSummary({ transactions, range, currency, now: analyticsNow }),
    [analyticsNow, currency, historyQuery.data, range, transactions],
  );
  const currencies = useMemo(() => {
    const values = new Set(transactions.map((transaction) => transaction.currency));
    values.add(currency);
    return [...values].sort();
  }, [currency, transactions]);

  useEffect(() => {
    for (const [index, slide] of slideRefs.current.entries()) {
      if (slide) slide.inert = index !== activeIndex;
    }
  }, [activeIndex]);

  useEffect(() => {
    if (lastSyncAt || lastSyncErrorAt) {
      void invalidateTransactionQueries(queryClient);
    }
  }, [lastSyncAt, lastSyncErrorAt, queryClient]);

  useEffect(() => {
    if (analyticsOpen) setDrawerCurrency(currency);
  }, [analyticsOpen, currency]);

  useEffect(() => {
    let timer: number | undefined;
    const scheduleMidnightRefresh = () => {
      const nextMidnight = new Date();
      nextMidnight.setHours(24, 0, 0, 50);
      timer = window.setTimeout(() => {
        setAnalyticsNow(new Date());
        scheduleMidnightRefresh();
      }, nextMidnight.getTime() - Date.now());
    };
    scheduleMidnightRefresh();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => () => {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
  }, []);

  const commitActiveIndex = (index: number) => {
    setActiveIndex(index);
    if (index === 1) setHistoryActivated(true);
  };

  const scrollToSlide = (index: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const reducedMotion = prefersReducedMotion();
    viewport.scrollTo({
      left: index * viewport.clientWidth,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
    if (reducedMotion) commitActiveIndex(index);
  };

  const handleScroll = () => {
    const viewport = viewportRef.current;
    if (!viewport || viewport.clientWidth === 0) return;
    const index = Math.max(0, Math.min(1, Math.round(viewport.scrollLeft / viewport.clientWidth)));
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => commitActiveIndex(index), 80);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerStart.current = { x: event.clientX, y: event.clientY };
    suppressClick.current = false;
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointerStart.current) return;
    const x = Math.abs(event.clientX - pointerStart.current.x);
    const y = Math.abs(event.clientY - pointerStart.current.y);
    if (x > 8 && x > y) suppressClick.current = true;
  };

  const handlePointerUp = () => {
    pointerStart.current = null;
    window.setTimeout(() => { suppressClick.current = false; }, 0);
  };

  const handleClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClick.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick.current = false;
  };

  const handleTransactionsOpenChange = (open: boolean) => {
    setTransactionsOpen(open);
    if (!open) window.requestAnimationFrame(() => transactionsTriggerRef.current?.focus());
  };

  const handleAnalyticsOpenChange = (open: boolean) => {
    setAnalyticsOpen(open);
    if (!open) window.requestAnimationFrame(() => analyticsTriggerRef.current?.focus());
  };

  return (
    <>
      <div
        className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_1.5rem]"
        role="region"
        aria-roledescription="carousel"
        aria-label="Home activity"
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (target !== viewportRef.current && target.dataset.carouselDot !== 'true') return;
          if (event.key === 'ArrowRight') { event.preventDefault(); scrollToSlide(1); }
          if (event.key === 'ArrowLeft') { event.preventDefault(); scrollToSlide(0); }
        }}
      >
        <div
          ref={viewportRef}
          data-testid="home-carousel-viewport"
          tabIndex={0}
          onScroll={handleScroll}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onClickCapture={handleClickCapture}
          className="flex min-h-0 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [touch-action:pan-x_pan-y] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <section ref={(node) => { slideRefs.current[0] = node; }} aria-label="Transactions, slide 1 of 2" aria-hidden={activeIndex !== 0} className="h-full min-w-full snap-center snap-always">
            <TopDashboard
              onEditTransaction={onEditTransaction}
              onViewAll={(event) => {
                transactionsTriggerRef.current = event.currentTarget;
                setTransactionsOpen(true);
              }}
            />
          </section>
          <section ref={(node) => { slideRefs.current[1] = node; }} aria-label="Analytics, slide 2 of 2" aria-hidden={activeIndex !== 1} className="h-full min-w-full snap-center snap-always">
            <AnalyticsSlide
              range={range}
              onRangeChange={setRange}
              summary={summary}
              isLoading={historyQuery.isLoading}
              isOffline={!isOnline}
              updatedAt={historyQuery.dataUpdatedAt || undefined}
              error={historyQuery.error}
              onRetry={() => { void historyQuery.refetch(); }}
              onViewAll={(event) => {
                analyticsTriggerRef.current = event.currentTarget;
                setAnalyticsOpen(true);
              }}
            />
          </section>
        </div>

        <div className="flex items-center justify-center" role="group" aria-label="Carousel slides">
          {SLIDES.map((slide, index) => (
            <button
              key={slide}
              type="button"
              data-carousel-dot="true"
              aria-label={`${slide} slide`}
              aria-current={activeIndex === index ? 'true' : undefined}
              onClick={() => scrollToSlide(index)}
              className="flex h-11 w-11 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <span className={cn('block bg-muted-foreground/35 transition-[width,background-color] motion-reduce:transition-none', activeIndex === index ? 'h-1.5 w-4 rounded-full bg-primary' : 'h-1.5 w-1.5 rounded-full')} />
            </button>
          ))}
        </div>
        <p className="sr-only" aria-live="polite">{SLIDES[activeIndex]}, slide {activeIndex + 1} of 2</p>
      </div>

      <TransactionsDrawer
        open={transactionsOpen}
        onOpenChange={handleTransactionsOpenChange}
        transactions={transactions}
        isLoading={historyQuery.isLoading}
        hasCompleteHistory={historyQuery.data !== undefined}
        isOffline={!isOnline}
        error={historyQuery.error}
        onRetry={() => { void historyQuery.refetch(); }}
        onSelect={onEditTransaction}
      />
      <AnalyticsDrawer
        open={analyticsOpen}
        onOpenChange={handleAnalyticsOpenChange}
        transactions={transactions}
        range={range}
        onRangeChange={setRange}
        currency={drawerCurrency}
        onCurrencyChange={setDrawerCurrency}
        currencies={currencies}
        isLoading={historyQuery.isLoading}
        hasCompleteHistory={historyQuery.data !== undefined}
        isOffline={!isOnline}
        updatedAt={historyQuery.dataUpdatedAt || undefined}
        error={historyQuery.error}
        onRetry={() => { void historyQuery.refetch(); }}
        onSelectTransaction={onEditTransaction}
        now={analyticsNow}
      />
    </>
  );
}
```

- [ ] **Step 4: Make all transaction mutations invalidate the shared prefix**

Update `useAddTransactionMutation.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useTransactions } from '../../app/providers';
import type { TransactionFormValues } from './transactionSchema';
import { invalidateTransactionQueries } from './transactionQueries';

export function useAddTransactionMutation() {
  const { addTransaction } = useTransactions();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: TransactionFormValues) => {
      await addTransaction({
        type: values.type,
        amount: Number.parseFloat(values.amount),
        currency: values.currency,
        account: values.account,
        for: values.forValue.trim() || values.forValue,
        category: values.category,
        date: format(values.dateObject, "yyyy-MM-dd'T'HH:mm:ss"),
        note: values.note.trim() || undefined,
      });
    },
    onSettled: async () => invalidateTransactionQueries(queryClient),
  });
}
```

In both `useUpdateTransactionMutation.ts` and `useDeleteTransactionMutation.ts`, import
`invalidateTransactionQueries` and replace the existing `onSuccess` blocks with:

```ts
onSettled: async () => invalidateTransactionQueries(queryClient),
```

- [ ] **Step 5: Replace `TopDashboard` with the carousel in `TransactionFlow`**

In `src/components/TransactionFlow/index.tsx`:

1. Replace the `TopDashboard` import with `HomeDashboardCarousel`.
2. Import `useQueryClient` and `invalidateTransactionQueries`.
3. Create `const queryClient = useQueryClient();` beside the existing mutation hooks.
4. Update `handleUndo` to refresh every transaction-backed view:

```ts
async function handleUndo() {
  const result = await undoLast();
  await invalidateTransactionQueries(queryClient);
  handleToast(result.message);
}
```

5. Replace the upper home render with:

```tsx
<HomeDashboardCarousel
  currency={currency}
  onEditTransaction={handleEditTransaction}
/>
```

Keep the outer `grid h-full grid-rows-[1fr_3fr] gap-4`, lower `StepCard`, and all non-home steps
unchanged.

- [ ] **Step 6: Run the carousel, mutation, dashboard, and type tests**

Run:

```bash
npm test -- src/components/TransactionFlow/HomeDashboardCarousel.test.tsx src/components/TransactionFlow/transactionMutations.test.tsx src/components/TransactionFlow/TopDashboard.test.tsx src/components/TransactionFlow/AnalyticsSlide.test.tsx src/components/TransactionFlow/AnalyticsDrawer.test.tsx
npx biome check src/components/TransactionFlow/HomeDashboardCarousel.tsx src/components/TransactionFlow/HomeDashboardCarousel.test.tsx src/components/TransactionFlow/transactionMutations.test.tsx src/components/TransactionFlow/useAddTransactionMutation.ts src/components/TransactionFlow/useUpdateTransactionMutation.ts src/components/TransactionFlow/useDeleteTransactionMutation.ts src/components/TransactionFlow/index.tsx
npx tsc --noEmit
```

Expected: all focused tests PASS, Biome reports no errors, and TypeScript exits 0.

- [ ] **Step 7: Check the new UI for forbidden shadow utilities**

Run:

```bash
rg -n "\bshadow(?:-|\b)" src/components/TransactionFlow/HomeDashboardCarousel.tsx src/components/TransactionFlow/AnalyticsRangeToggle.tsx src/components/TransactionFlow/AnalyticsBarChart.tsx src/components/TransactionFlow/AnalyticsSlide.tsx src/components/TransactionFlow/AnalyticsDrawer.tsx src/components/TransactionFlow/TransactionsDrawer.tsx src/components/TransactionFlow/TransactionRow.tsx
```

Expected: no matches.

- [ ] **Step 8: Commit the integrated carousel**

```bash
git add src/components/TransactionFlow/HomeDashboardCarousel.tsx src/components/TransactionFlow/HomeDashboardCarousel.test.tsx src/components/TransactionFlow/transactionMutations.test.tsx src/components/TransactionFlow/useAddTransactionMutation.ts src/components/TransactionFlow/useUpdateTransactionMutation.ts src/components/TransactionFlow/useDeleteTransactionMutation.ts src/components/TransactionFlow/index.tsx
git commit -m "feat: add home analytics carousel"
```

## Task 7: Prove the mobile flow and publish the Tailscale preview

**Files:**

- Create: `e2e/home-carousel.spec.ts`

- [ ] **Step 1: Write the mobile carousel acceptance test**

Create `e2e/home-carousel.spec.ts`:

```ts
import { expect, test, type Locator, type Page } from '@playwright/test';
import { format, subDays } from 'date-fns';
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
  transaction('salary', 2, 'income', 2500, 'Salary'),
  ...Array.from({ length: 12 }, (_, index) =>
    transaction(`history-${index}`, index + 3, 'expense', 20 + index, 'Groceries & Home Supplies')),
];

async function touchSwipe(page: Page, target: Locator, deltaX: number, deltaY: number) {
  const box = await target.boundingBox();
  if (!box) throw new Error('Swipe target is not visible');
  const client = await page.context().newCDPSession(page);
  const start = {
    x: box.x + box.width * (deltaX < 0 ? 0.85 : deltaX > 0 ? 0.15 : 0.5),
    y: box.y + box.height * (deltaY < 0 ? 0.8 : deltaY > 0 ? 0.2 : 0.5),
  };
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [start],
  });
  for (let step = 1; step <= 6; step += 1) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{
        x: start.x + (deltaX * step) / 6,
        y: start.y + (deltaY * step) / 6,
      }],
    });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.detach();
}

test.describe('Home Transactions and Analytics carousel', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((transactions: TransactionRecord[]) => {
      window.localStorage.setItem('sheetlog.mock.transactions', JSON.stringify(transactions));
    }, seededTransactions);
    await page.goto('/app');
    await expect(page.getByRole('region', { name: 'Home activity' })).toBeVisible();
  });

  test('keeps Transactions full-width, swipes to Analytics, and opens both sheets', async ({ page }) => {
    const viewport = page.getByTestId('home-carousel-viewport');
    const transactionsDot = page.getByRole('button', { name: 'Transactions slide' });
    const analyticsDot = page.getByRole('button', { name: 'Analytics slide' });

    await expect(transactionsDot).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('button', { name: /Food Delivery/ })).toBeVisible();
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

    await touchSwipe(page, viewport, -geometry.viewportWidth * 0.7, 4);
    await expect(analyticsDot).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await incomeEntryTab.boundingBox())?.y).toBe(lowerYBefore);
    await expect(page.getByText('Bonus', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Week, last 7 days' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Month, month to date' }).click();
    await expect(page.getByRole('button', { name: 'Month, month to date' })).toHaveAttribute('aria-pressed', 'true');

    const analyticsViewAll = page.getByRole('button', { name: 'View all analytics' });
    await analyticsViewAll.click();
    const analyticsDialog = page.getByRole('dialog');
    await expect(analyticsDialog.getByRole('heading', { name: 'Analytics' })).toBeVisible();
    await expect(analyticsDialog.getByRole('heading', { name: 'Analytics' })).toBeFocused();
    await expect(analyticsDialog.getByText('Transfers are excluded from totals.')).toBeVisible();
    await analyticsDialog.getByRole('button', { name: 'Close analytics' }).click();
    await expect(analyticsViewAll).toBeFocused();

    await transactionsDot.click();
    await expect(transactionsDot).toHaveAttribute('aria-current', 'true');
    const transactionScroll = page.getByTestId('transaction-scroll');
    const scrollTopBefore = await transactionScroll.evaluate((element) => element.scrollTop);
    await touchSwipe(page, transactionScroll, 3, -120);
    await expect.poll(() => transactionScroll.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(scrollTopBefore);
    await expect(transactionsDot).toHaveAttribute('aria-current', 'true');
    const transactionsViewAll = page.getByRole('button', { name: 'View all transactions' });
    await transactionsViewAll.click();
    const transactionsDialog = page.getByRole('dialog');
    await expect(transactionsDialog.getByRole('heading', { name: 'Transactions' })).toBeVisible();
    await expect(transactionsDialog.getByRole('heading', { name: 'Transactions' })).toBeFocused();
    await transactionsDialog.getByRole('searchbox', { name: 'Search transactions' }).fill('lunch');
    await expect(transactionsDialog.getByText('Food Delivery')).toBeVisible();
    await expect(transactionsDialog.getByText('Salary')).toHaveCount(0);
    await transactionsDialog.getByRole('button', { name: 'Close transactions' }).click();
    await expect(transactionsViewAll).toBeFocused();

    await analyticsDot.click();
    await page.screenshot({ path: 'test-results/home-carousel-mobile.png', fullPage: true });
  });
});
```

- [ ] **Step 2: Run the new browser test in mock mode**

Run:

```bash
CI=1 VITE_DEV_MODE=true npx playwright test e2e/home-carousel.spec.ts --project="Mobile Chrome"
```

Expected: the single mobile test PASSes and writes
`test-results/home-carousel-mobile.png` for visual inspection.

- [ ] **Step 3: Run the repository verification suite**

Run each command independently so the first failure remains visible:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
CI=1 VITE_DEV_MODE=true npx playwright test --project="Mobile Chrome"
```

Expected: unit tests, AGENTS-required lint, typecheck, production build, and mobile E2E all exit 0.
If a pre-existing unrelated failure appears, record the exact command/output and keep it separate
from carousel regressions.

- [ ] **Step 4: Inspect the final app in a real mobile browser**

Use the Playwright skill to open `http://127.0.0.1:5173/app` at a Pixel 5-sized viewport with mock
transactions. Verify all of the following manually and retain a screenshot:

- Transactions is the first of exactly two slides and remains visually identical/full-width.
- A horizontal gesture changes the selected dot without triggering a row or `View all` click.
- Analytics keeps its selected W/M/Q range after swiping away and back.
- Neither slide has a card border, radius treatment, shadow, clipped focus ring, or adjacent-slide peek.
- Both sheets open, filter, close by button/Escape/downward drag, and restore focus.
- The lower fast-entry workflow never moves or resets while the upper carousel changes.

- [ ] **Step 5: Keep the approved app preview reachable over Tailscale**

First check whether the existing long-lived mock server is still serving port 5173:

```bash
curl -fsS http://127.0.0.1:5173/app >/dev/null
```

If that check fails, start it in a long-lived terminal:

```bash
VITE_DEV_MODE=true SHEETLOG_DEV_PORT=5173 npm run dev -- --host 0.0.0.0
```

From a second terminal, verify the current Tailscale address:

```bash
curl -fsS http://100.69.2.40:5173/app >/dev/null
```

Leave the server running and hand off `http://100.69.2.40:5173/app` as the preview URL. If the
machine's Tailscale address changes, obtain the replacement with `tailscale ip -4`, verify it with
the same `curl` command, and report the verified replacement instead.

- [ ] **Step 6: Commit the browser coverage**

```bash
git add e2e/home-carousel.spec.ts
git commit -m "test: cover home analytics carousel"
```
