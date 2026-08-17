import { describe, expect, it, vi } from 'vitest';
import { parseTransactionRow } from '../../lib/transactionRows';
import type { TransactionRecord, TransactionType } from '../../lib/types';
import * as analyticsModule from './analytics';
import {
  buildAnalyticsSummary,
  getAnalyticsPeriods,
  getComparisonText,
  getOfflineFreshness,
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
});

describe.each<[AnalyticsRange, number]>([
  ['week', 7],
  ['month', 17],
  ['quarter', 7],
])('buildAnalyticsSummary(%s)', (range, expectedBuckets) => {
  it('returns range-appropriate buckets', () => {
    const summary = buildAnalyticsSummary({
      transactions: [],
      range,
      currency: 'THB',
      now: new Date(2026, 7, 17, 12),
    });

    expect(summary.buckets).toHaveLength(expectedBuckets);
  });
});

describe('stacked category series', () => {
  const categoryRows = [
    transaction({ id: 'food', date: '2026-08-17T10:00:00', amount: 500, category: 'Food' }),
    transaction({ id: 'rent', date: '2026-08-16T10:00:00', amount: 400, category: 'Rent' }),
    transaction({ id: 'travel', date: '2026-08-15T10:00:00', amount: 300, category: 'Travel' }),
    transaction({ id: 'health', date: '2026-08-14T10:00:00', amount: 200, category: 'Health' }),
    transaction({ id: 'books', date: '2026-08-13T10:00:00', amount: 100, category: 'Books' }),
    transaction({ id: 'gifts', date: '2026-08-12T10:00:00', amount: 50, category: 'Gifts' }),
  ];

  it('keeps four ranked category series and groups the remainder as Other', () => {
    const summary = buildAnalyticsSummary({
      transactions: categoryRows,
      range: 'week',
      currency: 'THB',
      now: new Date(2026, 7, 17, 12),
    }) as ReturnType<typeof buildAnalyticsSummary> & {
      series: Array<{ label: string; tone: string; categoryNames: string[] }>;
    };

    expect(summary.series).toEqual([
      expect.objectContaining({ label: 'Food', tone: 'emerald', categoryNames: ['Food'] }),
      expect.objectContaining({ label: 'Rent', tone: 'cyan', categoryNames: ['Rent'] }),
      expect.objectContaining({ label: 'Travel', tone: 'violet', categoryNames: ['Travel'] }),
      expect.objectContaining({ label: 'Health', tone: 'rose', categoryNames: ['Health'] }),
      expect.objectContaining({ label: 'Other', tone: 'slate', categoryNames: ['Books', 'Gifts'] }),
    ]);
  });

  it('uses every stable series in every bucket and keeps all transaction types filterable', () => {
    const summary = buildAnalyticsSummary({
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
      currency: 'THB',
      now: new Date(2026, 7, 17, 12),
    }) as ReturnType<typeof buildAnalyticsSummary> & {
      buckets: Array<
        ReturnType<typeof buildAnalyticsSummary>['buckets'][number] & {
          segments: Array<{ seriesKey: string; amount: number }>;
        }
      >;
      series: Array<{ key: string }>;
    };

    expect(summary.buckets.every((bucket) => bucket.segments.length === 5)).toBe(true);
    expect(summary.buckets.at(-1)?.segments.map((segment) => segment.seriesKey)).toEqual(
      summary.series.map((series) => series.key),
    );
    expect(summary.buckets.at(-1)?.transactionIds).toEqual(
      expect.arrayContaining(['food', 'salary', 'move']),
    );
  });

  it('uses daily custom buckets through 31 days and weekly buckets above 31 days', () => {
    const daily = buildAnalyticsSummary({
      transactions: [],
      range: 'custom' as AnalyticsRange,
      currency: 'THB',
      now: new Date(2026, 7, 17, 12),
      customPeriod: { start: new Date(2026, 7, 1), end: new Date(2026, 7, 12) },
    } as Parameters<typeof buildAnalyticsSummary>[0] & {
      customPeriod: { start: Date; end: Date };
    });
    const weekly = buildAnalyticsSummary({
      transactions: [],
      range: 'custom' as AnalyticsRange,
      currency: 'THB',
      now: new Date(2026, 7, 17, 12),
      customPeriod: { start: new Date(2026, 5, 1), end: new Date(2026, 7, 17) },
    } as Parameters<typeof buildAnalyticsSummary>[0] & {
      customPeriod: { start: Date; end: Date };
    });

    expect(daily.buckets).toHaveLength(12);
    expect(weekly.buckets).toHaveLength(12);
    expect(weekly.buckets[0].accessibleLabel).toBe('June 1 through June 7');
  });
});

describe('analytics bucket accessibility', () => {
  it('gives every compact weekly bucket a unique full-day accessible label', () => {
    const summary = buildAnalyticsSummary({
      transactions: [],
      range: 'week',
      currency: 'THB',
      now: new Date(2026, 7, 17, 12),
    });

    expect(new Set(summary.buckets.map((bucket) => bucket.accessibleLabel)).size).toBe(7);
    expect(summary.buckets.map((bucket) => bucket.accessibleLabel)).toEqual([
      'Tuesday, August 11',
      'Wednesday, August 12',
      'Thursday, August 13',
      'Friday, August 14',
      'Saturday, August 15',
      'Sunday, August 16',
      'Monday, August 17',
    ]);
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
    expect(bucketTransactionIds).toContain('income');
    expect(bucketTransactionIds).toContain('transfer');
    expect(summary.transactions.map((row) => row.id)).not.toContain('usd');
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

      const summary = buildAnalyticsSummary({
        transactions: [invalidDate, invalidType],
        range: 'week',
        currency: 'THB',
        now: new Date(2026, 7, 17, 12),
      });

      expect(summary.expenseTotal).toBe(0);
      expect(summary.transactions).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
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
        transaction({
          id: 'transport-refund',
          date: '2026-08-17T11:00:00',
          amount: -90,
          category: 'Transport',
        }),
      ],
      range: 'week',
      currency: 'THB',
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
    const summary = buildAnalyticsSummary({
      transactions: [
        transaction({ id: 'expense', date: '2026-08-17T10:00:00', amount: 100 }),
        transaction({
          id: 'income',
          date: '2026-08-17T09:00:00',
          type: 'income',
          amount: 250,
          category: 'Salary',
        }),
        transaction({ id: 'older', date: '2026-08-16T10:00:00', amount: 40 }),
      ],
      range: 'week',
      currency: 'THB',
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

    const scope = buildAnalyticsScope(summary, summary.buckets.at(-1)?.key);

    expect(scope.expenseTotal).toBe(100);
    expect(scope.incomeTotal).toBe(250);
    expect(scope.netTotal).toBe(150);
    expect(scope.transactions.map((row) => row.id)).toEqual(['expense', 'income']);
  });

  it('preserves a refund-only category in the selected bucket breakdown', () => {
    const summary = buildAnalyticsSummary({
      transactions: [
        transaction({ id: 'dining', date: '2026-08-16T10:00:00', amount: 100 }),
        transaction({
          id: 'refund',
          date: '2026-08-17T10:00:00',
          amount: -40,
          category: 'Dining Out',
        }),
      ],
      range: 'week',
      currency: 'THB',
      now: new Date(2026, 7, 17, 12),
    });

    const scope = analyticsModule.buildAnalyticsScope(summary, summary.buckets.at(-1)?.key);

    expect(scope.expenseTotal).toBe(-40);
    expect(scope.categories).toEqual([{ category: 'Dining Out', amount: -40, share: 0 }]);
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
    expect(getComparisonText({ direction: 'below', percentage: 12 }, 'month')).toBe(
      '12% below the same days last month',
    );
    expect(getComparisonText({ direction: 'above', percentage: 8 }, 'quarter')).toBe(
      '8% above the same elapsed days last quarter',
    );
  });
});
