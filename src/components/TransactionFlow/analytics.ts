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
  accessibleLabel: string;
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
        end: minDate(endOfMonth(comparisonStart), endOfDay(addDays(comparisonStart, elapsedDays))),
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
      end: minDate(endOfQuarter(comparisonStart), endOfDay(addDays(comparisonStart, elapsedDays))),
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
  return rows.reduce((total, row) => total + (row.type === type ? finiteAmount(row) : 0), 0);
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
      return (
        !(row as AnalyticsAnnotatedTransaction).analyticsExcluded &&
        row.currency === currency &&
        date !== null &&
        contains(period, date) &&
        Number.isFinite(amount) &&
        amount !== 0
      );
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
  accessibleLabel: string,
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
    accessibleLabel,
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
      return makeBucket(
        format(start, 'yyyy-MM-dd'),
        format(start, 'EEEEE'),
        format(start, 'EEEE, MMMM d'),
        { start, end: endOfDay(start) },
        rows,
      );
    });
  }

  if (range === 'month') {
    const elapsedDays = differenceInCalendarDays(current.end, current.start) + 1;
    return Array.from({ length: Math.ceil(elapsedDays / 7) }, (_, index) => {
      const start = startOfDay(addDays(current.start, index * 7));
      const end = minDate(current.end, endOfDay(addDays(start, 6)));
      return makeBucket(
        `${format(start, 'yyyy-MM-dd')}-week`,
        `${format(start, 'd')}–${format(end, 'd')}`,
        `${format(start, 'MMMM d')} through ${format(end, 'MMMM d')}`,
        { start, end },
        rows,
      );
    });
  }

  return Array.from({ length: 3 }, (_, index) => {
    const start = startOfMonth(addMonths(current.start, index));
    const end = minDate(current.end, endOfMonth(start));
    return makeBucket(
      format(start, 'yyyy-MM'),
      format(start, 'MMM'),
      format(start, 'MMMM yyyy'),
      { start, end },
      rows,
    );
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

  return positiveCategories.map(([category, amount]) => ({
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

export function getComparisonText(
  comparison: AnalyticsComparison,
  range: AnalyticsRange,
): string {
  if (comparison.direction === 'refunds') return 'Net refunds exceeded expenses';
  if (comparison.direction === 'none') return 'No prior-period data';
  if (comparison.direction === 'same') return 'Same as previous period';
  const period =
    range === 'week'
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
