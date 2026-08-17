import { describe, expect, it } from 'vitest';
import type { TransactionRecord, TransactionType } from '../../lib/types';
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
    expect(summary.categories).toEqual([{ category: 'Dining Out', amount: 100, share: 100 }]);
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
