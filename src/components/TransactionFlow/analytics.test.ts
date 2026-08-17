import { describe, expect, it, vi } from 'vitest';
import { parseTransactionRow } from '../../lib/transactionRows';
import type { TransactionRecord, TransactionType } from '../../lib/types';
import * as analyticsModule from './analytics';
import {
  buildAnalyticsPeriodOptions,
  buildAnalyticsSummary,
  getAnalyticsRateRequest,
  getAnalyticsPeriods,
  getComparisonText,
  getOfflineFreshness,
  type AnalyticsRange,
} from './analytics';

function readySummary(input: Parameters<typeof buildAnalyticsSummary>[0]) {
  const result = buildAnalyticsSummary(input);
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error('Expected ready analytics');
  return result.summary;
}

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
  it('uses a Monday-through-Sunday calendar week', () => {
    const result = getAnalyticsPeriods('week', new Date(2026, 7, 17, 12));

    expect(result).toEqual({
      current: {
        start: new Date(2026, 7, 17),
        end: new Date(2026, 7, 23, 23, 59, 59, 999),
      },
      comparison: {
        start: new Date(2026, 7, 10),
        end: new Date(2026, 7, 16, 23, 59, 59, 999),
      },
    });
  });

  it('uses complete current and prior calendar months', () => {
    const result = getAnalyticsPeriods('month', new Date(2026, 2, 15, 12));

    expect(result).toEqual({
      current: {
        start: new Date(2026, 2, 1),
        end: new Date(2026, 2, 31, 23, 59, 59, 999),
      },
      comparison: {
        start: new Date(2026, 1, 1),
        end: new Date(2026, 1, 28, 23, 59, 59, 999),
      },
    });
  });

  it('uses complete current and prior calendar quarters', () => {
    const result = getAnalyticsPeriods('quarter', new Date(2026, 4, 15, 12));

    expect(result).toEqual({
      current: {
        start: new Date(2026, 3, 1),
        end: new Date(2026, 5, 30, 23, 59, 59, 999),
      },
      comparison: {
        start: new Date(2026, 0, 1),
        end: new Date(2026, 2, 31, 23, 59, 59, 999),
      },
    });
  });

  it('uses complete current and prior calendar years', () => {
    const result = getAnalyticsPeriods('year', new Date(2026, 7, 17, 12));

    expect(result).toEqual({
      current: {
        start: new Date(2026, 0, 1),
        end: new Date(2026, 11, 31, 23, 59, 59, 999),
      },
      comparison: {
        start: new Date(2025, 0, 1),
        end: new Date(2025, 11, 31, 23, 59, 59, 999),
      },
    });
  });

  it('uses an immediately preceding comparison with the same inclusive custom length', () => {
    const result = (
      getAnalyticsPeriods as unknown as (
        range: AnalyticsRange,
        now: Date,
        customPeriod: { start: Date; end: Date },
      ) => ReturnType<typeof getAnalyticsPeriods>
    )(
      'custom' as AnalyticsRange,
      new Date(2026, 7, 17, 12),
      { start: new Date(2026, 7, 5, 12), end: new Date(2026, 7, 12, 8) },
    );

    expect(result.current).toEqual({
      start: new Date(2026, 7, 5),
      end: new Date(2026, 7, 12, 23, 59, 59, 999),
    });
    expect(result.comparison).toEqual({
      start: new Date(2026, 6, 28),
      end: new Date(2026, 7, 4, 23, 59, 59, 999),
    });
  });

  it('uses complete current and historical calendar periods', () => {
    const now = new Date(2026, 7, 17, 12);

    expect(getAnalyticsPeriods('month', now, undefined, 0).current).toEqual({
      start: new Date(2026, 7, 1),
      end: new Date(2026, 7, 31, 23, 59, 59, 999),
    });
    expect(getAnalyticsPeriods('month', now, undefined, -1)).toEqual({
      current: {
        start: new Date(2026, 6, 1),
        end: new Date(2026, 6, 31, 23, 59, 59, 999),
      },
      comparison: {
        start: new Date(2026, 5, 1),
        end: new Date(2026, 5, 30, 23, 59, 59, 999),
      },
    });
  });

  it('moves through adjacent Monday-aligned weeks', () => {
    const result = getAnalyticsPeriods('week', new Date(2026, 7, 17, 12), undefined, -1);

    expect(result.current).toEqual({
      start: new Date(2026, 7, 10),
      end: new Date(2026, 7, 16, 23, 59, 59, 999),
    });
    expect(result.comparison).toEqual({
      start: new Date(2026, 7, 3),
      end: new Date(2026, 7, 9, 23, 59, 59, 999),
    });
  });
});

describe('buildAnalyticsPeriodOptions', () => {
  it('builds every continuous local period including empty gaps', () => {
    const options = buildAnalyticsPeriodOptions(
      'month',
      [transaction({ id: 'old', date: '2026-05-09T12:00:00', amount: 10 })],
      new Date(2026, 7, 17, 12),
    );

    expect(options.map(({ offset, label }) => ({ offset, label }))).toEqual([
      { offset: -3, label: 'May 2026' },
      { offset: -2, label: 'June 2026' },
      { offset: -1, label: 'July 2026' },
      { offset: 0, label: 'August 2026' },
    ]);
    expect(options.at(-1)?.accessibleLabel).toBe(
      'August 1, 2026 through August 31, 2026',
    );
  });

  it('builds continuous Monday-aligned week options', () => {
    const options = buildAnalyticsPeriodOptions(
      'week',
      [transaction({ id: 'old', date: '2026-08-09T12:00:00', amount: 10 })],
      new Date(2026, 7, 17, 12),
    );

    expect(options.map(({ offset, label }) => ({ offset, label }))).toEqual([
      { offset: -2, label: 'Aug 3–9' },
      { offset: -1, label: 'Aug 10–16' },
      { offset: 0, label: 'Aug 17–23' },
    ]);
  });

  it('keeps only current when local history is empty or unavailable', () => {
    const options = buildAnalyticsPeriodOptions(
      'year',
      [
        transaction({ id: 'future', date: '2027-01-01T12:00:00', amount: 10 }),
        {
          ...transaction({ id: 'invalid', date: '2024-01-01T12:00:00', amount: 10 }),
          sheetRowValid: false,
        },
      ],
      new Date(2026, 7, 17, 12),
    );

    expect(options.map(({ offset, label }) => ({ offset, label }))).toEqual([
      { offset: 0, label: '2026' },
    ]);
    expect(options[0]?.accessibleLabel).toBe(
      'January 1, 2026 through December 31, 2026',
    );
  });

  it('uses every valid local transaction regardless of type or currency as its bound', () => {
    const options = buildAnalyticsPeriodOptions(
      'quarter',
      [
        transaction({
          id: 'old-transfer',
          date: '2025-11-02T12:00:00',
          type: 'transfer',
          amount: 10,
          currency: 'USD',
        }),
      ],
      new Date(2026, 7, 17, 12),
    );

    expect(options.map(({ offset, label }) => ({ offset, label }))).toEqual([
      { offset: -3, label: 'Q4 2025' },
      { offset: -2, label: 'Q1 2026' },
      { offset: -1, label: 'Q2 2026' },
      { offset: 0, label: 'Q3 2026' },
    ]);
    expect(options.at(-1)?.accessibleLabel).toBe(
      'July 1, 2026 through September 30, 2026',
    );
  });
});

describe.each<[AnalyticsRange, number]>([
  ['week', 7],
  ['month', 31],
  ['quarter', 14],
  ['year', 12],
])('buildAnalyticsSummary(%s)', (range, expectedBuckets) => {
  it('returns buckets for the complete calendar period', () => {
    const summary = readySummary({
      transactions: [],
      range,
      baseCurrency: 'THB',
      rates: [],
      now: new Date(2026, 7, 17, 12),
    });

    expect(summary.buckets).toHaveLength(expectedBuckets);
  });
});

it('builds a summary for the selected historical offset', () => {
  const summary = readySummary({
    transactions: [
      transaction({ id: 'july', date: '2026-07-20T10:00:00', amount: 70 }),
      transaction({ id: 'august', date: '2026-08-10T10:00:00', amount: 80 }),
    ],
    range: 'month',
    baseCurrency: 'THB',
    rates: [],
    now: new Date(2026, 7, 17, 12),
    periodOffset: -1,
  });

  expect(summary.periods.current).toEqual({
    start: new Date(2026, 6, 1),
    end: new Date(2026, 6, 31, 23, 59, 59, 999),
  });
  expect(summary.expenseTotal).toBe(70);
});

it('builds all twelve labeled month buckets for the current year', () => {
  const summary = readySummary({
    transactions: [],
    range: 'year',
    baseCurrency: 'THB',
    rates: [],
    now: new Date(2026, 7, 17, 12),
  });

  expect(summary.buckets.map((bucket) => bucket.label)).toEqual([
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]);
  expect(summary.buckets[0].accessibleLabel).toBe('January 1 through January 31');
  expect(summary.buckets.at(-1)?.accessibleLabel).toBe('December 1 through December 31');
});

it.each([
  ['week', '2026-08-23T12:00:00'],
  ['month', '2026-08-31T12:00:00'],
  ['quarter', '2026-09-30T12:00:00'],
  ['year', '2026-12-31T12:00:00'],
] as const)('includes future rows inside the current %s', (range, date) => {
  const summary = readySummary({
    transactions: [transaction({ id: 'future', date, amount: 25 })],
    range,
    baseCurrency: 'THB',
    rates: [],
    now: new Date(2026, 7, 17, 12),
  });

  expect(summary.expenseTotal).toBe(25);
  expect(summary.transactions.map((row) => row.id)).toContain('future');
});

it('groups full-quarter weekly buckets beneath their start month', () => {
  const summary = readySummary({
    transactions: [],
    range: 'quarter',
    baseCurrency: 'THB',
    rates: [],
    now: new Date(2026, 4, 15, 12),
  });

  expect(summary.buckets).toHaveLength(13);
  expect(summary.axisGroups).toEqual([
    { key: '2026-04', label: 'Apr', bucketCount: 5 },
    { key: '2026-05', label: 'May', bucketCount: 4 },
    { key: '2026-06', label: 'Jun', bucketCount: 4 },
  ]);
});

describe('stacked category series', () => {
  const categoryRows = [
    transaction({ id: 'food', date: '2026-08-17T10:00:00', amount: 500, category: 'Food' }),
    transaction({ id: 'rent', date: '2026-08-18T10:00:00', amount: 400, category: 'Rent' }),
    transaction({ id: 'travel', date: '2026-08-19T10:00:00', amount: 300, category: 'Travel' }),
    transaction({ id: 'health', date: '2026-08-20T10:00:00', amount: 200, category: 'Health' }),
    transaction({ id: 'books', date: '2026-08-21T10:00:00', amount: 100, category: 'Books' }),
    transaction({ id: 'gifts', date: '2026-08-22T10:00:00', amount: 50, category: 'Gifts' }),
  ];

  it('keeps four ranked category series and groups the remainder as Other', () => {
    const summary = readySummary({
      transactions: categoryRows,
      range: 'week',
      baseCurrency: 'THB',
      rates: [],
      now: new Date(2026, 7, 17, 12),
    });

    expect(summary.series).toEqual([
      expect.objectContaining({ label: 'Food', tone: 'emerald', categoryNames: ['Food'] }),
      expect.objectContaining({ label: 'Rent', tone: 'cyan', categoryNames: ['Rent'] }),
      expect.objectContaining({ label: 'Travel', tone: 'violet', categoryNames: ['Travel'] }),
      expect.objectContaining({ label: 'Health', tone: 'rose', categoryNames: ['Health'] }),
      expect.objectContaining({ label: 'Other', tone: 'slate', categoryNames: ['Books', 'Gifts'] }),
    ]);
  });

  it('uses every stable series in every bucket and keeps all transaction types filterable', () => {
    const summary = readySummary({
      transactions: [
        ...categoryRows,
        transaction({
          id: 'salary',
          date: '2026-08-17T09:00:00',
          type: 'income',
          amount: 2000,
          category: 'Salary',
        }),
        transaction({
          id: 'move',
          date: '2026-08-17T08:00:00',
          type: 'transfer',
          amount: 1000,
          category: 'Savings',
        }),
      ],
      range: 'week',
      baseCurrency: 'THB',
      rates: [],
      now: new Date(2026, 7, 17, 12),
    });

    expect(summary.buckets.every((bucket) => bucket.segments.length === 5)).toBe(true);
    expect(summary.buckets[0]?.segments.map((segment) => segment.seriesKey)).toEqual(
      summary.series.map((series) => series.key),
    );
    expect(summary.buckets[0]?.transactionIds).toEqual(
      expect.arrayContaining(['food', 'salary', 'move']),
    );
  });

  it('uses daily custom buckets through 31 days and weekly buckets above 31 days', () => {
    const daily = readySummary({
      transactions: [],
      range: 'custom' as AnalyticsRange,
      baseCurrency: 'THB',
      rates: [],
      now: new Date(2026, 7, 17, 12),
      customPeriod: { start: new Date(2026, 7, 1), end: new Date(2026, 7, 12) },
    });
    const weekly = readySummary({
      transactions: [],
      range: 'custom' as AnalyticsRange,
      baseCurrency: 'THB',
      rates: [],
      now: new Date(2026, 7, 17, 12),
      customPeriod: { start: new Date(2026, 5, 1), end: new Date(2026, 7, 17) },
    });

    expect(daily.buckets).toHaveLength(12);
    expect(weekly.buckets).toHaveLength(12);
    expect(weekly.buckets[0].accessibleLabel).toBe('June 1 through June 7');
  });
});

describe('analytics bucket accessibility', () => {
  it('gives every compact weekly bucket a unique full-day accessible label', () => {
    const summary = readySummary({
      transactions: [],
      range: 'week',
      baseCurrency: 'THB',
      rates: [],
      now: new Date(2026, 7, 17, 12),
    });

    expect(new Set(summary.buckets.map((bucket) => bucket.accessibleLabel)).size).toBe(7);
    expect(summary.buckets.map((bucket) => bucket.accessibleLabel)).toEqual([
      'Monday, August 17',
      'Tuesday, August 18',
      'Wednesday, August 19',
      'Thursday, August 20',
      'Friday, August 21',
      'Saturday, August 22',
      'Sunday, August 23',
    ]);
  });
});

describe('buildAnalyticsSummary totals', () => {
  const rows = [
    transaction({ id: 'expense-1', date: '2026-08-17T10:00:00', amount: 100 }),
    transaction({
      id: 'expense-2',
      date: '2026-08-18T10:00:00',
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

  it('separates types while applying signed adjustments', () => {
    const summary = readySummary({
      transactions: rows,
      range: 'week',
      baseCurrency: 'THB',
      rates: [
        {
          id: 'THB:USD:2026-08-17',
          base: 'THB',
          quote: 'USD',
          date: '2026-08-17',
          rate: 4,
          fetchedAt: '2026-08-17T12:00:00.000Z',
        },
      ],
      now: new Date(2026, 7, 17, 12),
    });

    expect(summary.expenseTotal).toBe(230);
    expect(summary.incomeTotal).toBe(500);
    expect(summary.netTotal).toBe(270);
    expect(summary.previousExpenseTotal).toBe(200);
    expect(summary.comparison).toEqual({ direction: 'above', percentage: 15 });
    expect(summary.categories).toEqual([
      { category: 'Dining Out', amount: 180, share: 78 },
      { category: 'Transport', amount: 50, share: 22 },
    ]);
    const bucketTransactionIds = summary.buckets.flatMap((bucket) => bucket.transactionIds);
    expect(bucketTransactionIds).toContain('income');
    expect(bucketTransactionIds).toContain('transfer');
    expect(summary.transactions.map((row) => row.id)).toContain('usd');
    expect(summary.transactions.map((row) => row.id)).not.toContain('previous');
    expect(summary.transactions.map((row) => row.id)).not.toContain('zero');
    expect(summary.transactions.map((row) => row.id)).not.toContain('malformed-date');
    expect(summary.transactions.map((row) => row.id)).not.toContain('non-finite');
  });

  it('excludes malformed Sheet rows after parsing safe fallbacks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 17, 12));

    try {
      const invalidDate = parseTransactionRow(
        [
          'not-a-date',
          'expense',
          900,
          'Malformed date',
          '',
          '2026-08-17T12:00:00',
          'PWA',
          'THB',
          'Cash',
          'Me',
          'invalid-date',
        ],
        2,
      );
      const invalidType = parseTransactionRow(
        [
          '2026-08-17T10:00:00',
          'refund',
          500,
          'Malformed type',
          '',
          '2026-08-17T10:00:00',
          'PWA',
          'THB',
          'Cash',
          'Me',
          'invalid-type',
        ],
        3,
      );

      expect(invalidDate.sheetRowValid).toBe(false);
      expect(invalidType.sheetRowValid).toBe(false);

      const summary = readySummary({
        transactions: [invalidDate, invalidType],
        range: 'week',
        baseCurrency: 'THB',
        rates: [],
        now: new Date(2026, 7, 17, 12),
      });

      expect(summary.expenseTotal).toBe(0);
      expect(summary.transactions).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns no prior comparison when prior net expense is not positive', () => {
    const summary = readySummary({
      transactions: [
        rows[0],
        transaction({ id: 'prior-refund', date: '2026-08-10T10:00:00', amount: -10 }),
      ],
      range: 'week',
      baseCurrency: 'THB',
      rates: [],
      now: new Date(2026, 7, 17, 12),
    });

    expect(summary.comparison).toEqual({ direction: 'none', percentage: null });
  });

  it('reports a 100% decrease when signed current expenses net to zero', () => {
    const summary = readySummary({
      transactions: [
        transaction({ id: 'charge', date: '2026-08-17T10:00:00', amount: 20 }),
        transaction({ id: 'reversal', date: '2026-08-17T11:00:00', amount: -20 }),
        transaction({ id: 'previous', date: '2026-08-10T10:00:00', amount: 40 }),
      ],
      range: 'week',
      baseCurrency: 'THB',
      rates: [],
      now: new Date(2026, 7, 17, 12),
    });

    expect(summary.expenseTotal).toBe(0);
    expect(summary.comparison).toEqual({ direction: 'below', percentage: 100 });
    expect(summary.categories).toEqual([]);
  });

  it('uses refund copy when signed adjustments make current expense negative', () => {
    const summary = readySummary({
      transactions: [
        transaction({ id: 'refund', date: '2026-08-17T10:00:00', amount: -30 }),
        transaction({ id: 'previous', date: '2026-08-10T10:00:00', amount: 20 }),
      ],
      range: 'week',
      baseCurrency: 'THB',
      rates: [],
      now: new Date(2026, 7, 17, 12),
    });

    expect(summary.comparison).toEqual({ direction: 'refunds', percentage: null });
  });

  it('normalizes category shares across positive net categories after adjustments', () => {
    const summary = readySummary({
      transactions: [
        transaction({ id: 'dining', date: '2026-08-17T10:00:00', amount: 100 }),
        transaction({
          id: 'transport-refund',
          date: '2026-08-17T11:00:00',
          amount: -90,
          category: 'Transport',
        }),
      ],
      range: 'week',
      baseCurrency: 'THB',
      rates: [],
      now: new Date(2026, 7, 17, 12),
    });

    expect(summary.expenseTotal).toBe(10);
    expect(summary.categories).toEqual([
      { category: 'Dining Out', amount: 100, share: 100 },
      { category: 'Transport', amount: -90, share: 0 },
    ]);
  });
});

describe('buildAnalyticsScope', () => {
  it('recomputes all overview values for a selected bucket', () => {
    const summary = readySummary({
      transactions: [
        transaction({ id: 'expense', date: '2026-08-17T10:00:00', amount: 100 }),
        transaction({
          id: 'income',
          date: '2026-08-17T09:00:00',
          type: 'income',
          amount: 250,
          category: 'Salary',
        }),
        transaction({ id: 'older', date: '2026-08-18T10:00:00', amount: 40 }),
      ],
      range: 'week',
      baseCurrency: 'THB',
      rates: [],
      now: new Date(2026, 7, 17, 12),
    });
    const buildAnalyticsScope = (
      analyticsModule as unknown as {
        buildAnalyticsScope: (
          value: typeof summary,
          key?: string,
        ) => {
          expenseTotal: number;
          incomeTotal: number;
          netTotal: number;
          transactions: TransactionRecord[];
        };
      }
    ).buildAnalyticsScope;

    const scope = buildAnalyticsScope(summary, summary.buckets[0]?.key);

    expect(scope.expenseTotal).toBe(100);
    expect(scope.incomeTotal).toBe(250);
    expect(scope.netTotal).toBe(150);
    expect(scope.transactions.map((row) => row.id)).toEqual(['expense', 'income']);
  });

  it('preserves a refund-only category in the selected bucket breakdown', () => {
    const summary = readySummary({
      transactions: [
        transaction({ id: 'dining', date: '2026-08-18T10:00:00', amount: 100 }),
        transaction({
          id: 'refund',
          date: '2026-08-17T10:00:00',
          amount: -40,
          category: 'Dining Out',
        }),
      ],
      range: 'week',
      baseCurrency: 'THB',
      rates: [],
      now: new Date(2026, 7, 17, 12),
    });

    const scope = analyticsModule.buildAnalyticsScope(summary, summary.buckets[0]?.key);

    expect(scope.expenseTotal).toBe(-40);
    expect(scope.categories).toEqual([{ category: 'Dining Out', amount: -40, share: 0 }]);
  });
});

describe('multi-currency analytics', () => {
  it('converts every currency into the base using the latest preceding observation', () => {
    const result = buildAnalyticsSummary({
      transactions: [
        transaction({ id: 'thb', date: '2026-08-17T10:00:00', amount: 100 }),
        transaction({
          id: 'usd',
          date: '2026-08-17T09:00:00',
          amount: 3,
          currency: 'USD',
        }),
      ],
      range: 'week',
      baseCurrency: 'THB',
      rates: [
        {
          id: 'THB:USD:2026-08-14',
          base: 'THB',
          quote: 'USD',
          date: '2026-08-14',
          rate: 0.03,
          fetchedAt: '2026-08-17T00:00:00.000Z',
        },
      ],
      now: new Date(2026, 7, 17, 12),
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('Expected ready analytics');
    expect(result.summary.expenseTotal).toBe(200);
    expect(result.summary.transactions.map((row) => [row.id, row.currency])).toEqual([
      ['thb', 'THB'],
      ['usd', 'USD'],
    ]);
  });

  it('returns missing-rate metadata instead of a partial total', () => {
    const result = buildAnalyticsSummary({
      transactions: [
        transaction({
          id: 'usd',
          date: '2026-08-16T10:00:00',
          amount: 3,
          currency: 'USD',
        }),
      ],
      range: 'week',
      baseCurrency: 'THB',
      rates: [],
      now: new Date(2026, 7, 17, 12),
    });

    expect(result).toEqual({
      status: 'missing-rates',
      missingRates: [{ currency: 'USD', date: '2026-08-16' }],
    });
  });

  it('batches sorted contributing quotes with a seven-day lookback', () => {
    const request = getAnalyticsRateRequest({
      transactions: [
        transaction({ id: 'usd', date: '2026-08-16T10:00:00', amount: 3, currency: 'USD' }),
        transaction({ id: 'usd-2', date: '2026-08-15T10:00:00', amount: 2, currency: 'USD' }),
        transaction({ id: 'eur-prior', date: '2026-08-10T10:00:00', amount: 2, currency: 'EUR' }),
        transaction({
          id: 'gbp-transfer',
          date: '2026-08-17T10:00:00',
          type: 'transfer',
          amount: 2,
          currency: 'GBP',
        }),
        transaction({
          id: 'jpy-prior-income',
          date: '2026-08-10T10:00:00',
          type: 'income',
          amount: 2,
          currency: 'JPY',
        }),
      ],
      range: 'week',
      baseCurrency: 'THB',
      now: new Date(2026, 7, 17, 12),
    });

    expect(request).toEqual({
      base: 'THB',
      quotes: ['EUR', 'USD'],
      from: '2026-08-03',
      to: '2026-08-23',
    });
  });

  it('needs no rate request for base rows or foreign transfers', () => {
    expect(
      getAnalyticsRateRequest({
        transactions: [
          transaction({ id: 'thb', date: '2026-08-17T10:00:00', amount: 100 }),
          transaction({
            id: 'transfer',
            date: '2026-08-17T09:00:00',
            type: 'transfer',
            amount: 3,
            currency: 'USD',
          }),
        ],
        range: 'week',
        baseCurrency: 'THB',
        now: new Date(2026, 7, 17, 12),
      }),
    ).toBeNull();
  });
});

describe('getOfflineFreshness', () => {
  it('reports when the complete cache was last updated', () => {
    expect(getOfflineFreshness(new Date(2026, 7, 17, 9, 30).getTime())).toBe(
      'Offline · saved 09:30',
    );
    expect(getOfflineFreshness()).toBe('Offline · showing saved data');
  });
});

describe('getComparisonText', () => {
  it('uses explicit no-data and net-refund copy', () => {
    expect(getComparisonText({ direction: 'none', percentage: null }, 'month')).toBe(
      'No prior-period data',
    );
    expect(getComparisonText({ direction: 'refunds', percentage: null }, 'week')).toBe(
      'Net refunds exceeded expenses',
    );
    expect(getComparisonText({ direction: 'below', percentage: 12 }, 'week')).toBe(
      '12% below previous week',
    );
    expect(getComparisonText({ direction: 'below', percentage: 12 }, 'month')).toBe(
      '12% below previous month',
    );
    expect(getComparisonText({ direction: 'above', percentage: 8 }, 'quarter')).toBe(
      '8% above previous quarter',
    );
    expect(getComparisonText({ direction: 'above', percentage: 8 }, 'year')).toBe(
      '8% above previous year',
    );
  });
});
