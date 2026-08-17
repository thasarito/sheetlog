import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
  subMonths,
  subQuarters,
  subYears,
} from 'date-fns';
import { tryParseDate } from '../../lib/date-utils';
import type { TransactionRecord, TransactionType } from '../../lib/types';

export type AnalyticsRange = 'week' | 'month' | 'quarter' | 'year' | 'custom';

export type DatePeriod = { start: Date; end: Date };

export type AnalyticsPeriods = {
  current: DatePeriod;
  comparison: DatePeriod;
};

export type AnalyticsComparison = {
  direction: 'above' | 'below' | 'same' | 'refunds' | 'none';
  percentage: number | null;
};

export type AnalyticsSeriesTone = 'emerald' | 'cyan' | 'violet' | 'rose' | 'slate';

export type AnalyticsSeries = {
  key: string;
  label: string;
  tone: AnalyticsSeriesTone;
  categoryNames: string[];
};

export type AnalyticsBucketSegment = {
  seriesKey: string;
  amount: number;
};

export type AnalyticsBucket = {
  key: string;
  label: string;
  accessibleLabel: string;
  amount: number;
  segments: AnalyticsBucketSegment[];
  transactionIds: string[];
};

export type AnalyticsCategory = {
  category: string;
  amount: number;
  share: number;
};

export type AnalyticsScope = {
  expenseTotal: number;
  incomeTotal: number;
  netTotal: number;
  categories: AnalyticsCategory[];
  transactions: TransactionRecord[];
};

export type AnalyticsSummary = AnalyticsScope & {
  range: AnalyticsRange;
  currency: string;
  periods: AnalyticsPeriods;
  previousExpenseTotal: number;
  comparison: AnalyticsComparison;
  buckets: AnalyticsBucket[];
  series: AnalyticsSeries[];
  hasExpenseRows: boolean;
};

type BuildAnalyticsSummaryInput = {
  transactions: TransactionRecord[];
  range: AnalyticsRange;
  currency: string;
  now: Date;
  customPeriod?: DatePeriod;
};

const SERIES_TONES: AnalyticsSeriesTone[] = ['emerald', 'cyan', 'violet', 'rose'];

function minDate(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? left : right;
}

function normalizePeriod(period: DatePeriod): DatePeriod {
  const startsFirst = period.start.getTime() <= period.end.getTime();
  return {
    start: startOfDay(startsFirst ? period.start : period.end),
    end: endOfDay(startsFirst ? period.end : period.start),
  };
}

function contains(period: DatePeriod, date: Date): boolean {
  const time = date.getTime();
  return time >= period.start.getTime() && time <= period.end.getTime();
}

export function getAnalyticsPeriods(
  range: AnalyticsRange,
  now: Date,
  customPeriod?: DatePeriod,
): AnalyticsPeriods {
  const currentEnd = endOfDay(now);

  if (range === 'custom') {
    const current = normalizePeriod(
      customPeriod ?? { start: startOfMonth(now), end: currentEnd },
    );
    const inclusiveDays = differenceInCalendarDays(current.end, current.start) + 1;
    return {
      current,
      comparison: {
        start: startOfDay(subDays(current.start, inclusiveDays)),
        end: endOfDay(subDays(current.start, 1)),
      },
    };
  }

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

  if (range === 'year') {
    const currentStart = startOfYear(now);
    const comparisonStart = startOfYear(subYears(now, 1));
    const elapsedDays = differenceInCalendarDays(currentEnd, currentStart);
    return {
      current: { start: currentStart, end: currentEnd },
      comparison: {
        start: comparisonStart,
        end: minDate(
          endOfYear(comparisonStart),
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
      end: minDate(endOfQuarter(comparisonStart), endOfDay(addDays(comparisonStart, elapsedDays))),
    },
  };
}

function finiteAmount(row: TransactionRecord): number {
  const amount = Number(row.amount);
  return Number.isFinite(amount) ? amount : 0;
}

function categoryName(row: TransactionRecord): string {
  return row.category.trim() || 'Uncategorized';
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
        row.sheetRowValid !== false &&
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

function categoryTotals(rows: TransactionRecord[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.type !== 'expense') continue;
    const name = categoryName(row);
    totals.set(name, (totals.get(name) ?? 0) + finiteAmount(row));
  }
  return totals;
}

function sortCategoryEntries(entries: Array<[string, number]>): Array<[string, number]> {
  return entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

function buildSeries(rows: TransactionRecord[]): AnalyticsSeries[] {
  const totals = categoryTotals(rows);
  const top = sortCategoryEntries([...totals.entries()].filter(([, amount]) => amount > 0)).slice(
    0,
    4,
  );
  const topNames = new Set(top.map(([name]) => name));
  const series: AnalyticsSeries[] = top.map(([name], index) => ({
    key: `category-${index}`,
    label: name,
    tone: SERIES_TONES[index],
    categoryNames: [name],
  }));
  const remaining = sortCategoryEntries(
    [...totals.entries()].filter(([name]) => !topNames.has(name)),
  ).map(([name]) => name);

  if (remaining.length > 0) {
    series.push({
      key: 'other',
      label: 'Other',
      tone: 'slate',
      categoryNames: remaining,
    });
  }
  return series;
}

function makeBucket(
  key: string,
  label: string,
  accessibleLabel: string,
  period: DatePeriod,
  rows: TransactionRecord[],
  series: AnalyticsSeries[],
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
    segments: series.map((item) => {
      const names = new Set(item.categoryNames);
      return {
        seriesKey: item.key,
        amount: expenses.reduce(
          (total, row) => total + (names.has(categoryName(row)) ? finiteAmount(row) : 0),
          0,
        ),
      };
    }),
    transactionIds: matching.map((row) => row.id),
  };
}

function makeDailyBucket(
  date: Date,
  rows: TransactionRecord[],
  series: AnalyticsSeries[],
  range: AnalyticsRange,
  crossesMonths: boolean,
): AnalyticsBucket {
  const label =
    range === 'week'
      ? format(date, 'EEEEE')
      : crossesMonths
        ? format(date, 'MMM d')
        : format(date, 'd');
  return makeBucket(
    format(date, 'yyyy-MM-dd'),
    label,
    format(date, 'EEEE, MMMM d'),
    { start: startOfDay(date), end: endOfDay(date) },
    rows,
    series,
  );
}

function buildBuckets(
  range: AnalyticsRange,
  current: DatePeriod,
  rows: TransactionRecord[],
  series: AnalyticsSeries[],
): AnalyticsBucket[] {
  const elapsedDays = differenceInCalendarDays(current.end, current.start) + 1;
  const daily = range === 'week' || range === 'month' || (range === 'custom' && elapsedDays <= 31);

  if (daily) {
    const crossesMonths = current.start.getMonth() !== current.end.getMonth();
    return Array.from({ length: elapsedDays }, (_, index) =>
      makeDailyBucket(addDays(current.start, index), rows, series, range, crossesMonths),
    );
  }

  if (range === 'year') {
    const elapsedMonths = differenceInCalendarMonths(current.end, current.start) + 1;
    return Array.from({ length: elapsedMonths }, (_, index) => {
      const start = startOfMonth(addMonths(current.start, index));
      const end = minDate(current.end, endOfMonth(start));
      return makeBucket(
        `${format(start, 'yyyy-MM')}-month`,
        format(start, 'MMM'),
        `${format(start, 'MMMM d')} through ${format(end, 'MMMM d')}`,
        { start, end },
        rows,
        series,
      );
    });
  }

  return Array.from({ length: Math.ceil(elapsedDays / 7) }, (_, index) => {
    const start = startOfDay(addDays(current.start, index * 7));
    const end = minDate(current.end, endOfDay(addDays(start, 6)));
    return makeBucket(
      `${format(start, 'yyyy-MM-dd')}-week`,
      format(start, 'MMM d'),
      `${format(start, 'MMMM d')} through ${format(end, 'MMMM d')}`,
      { start, end },
      rows,
      series,
    );
  });
}

function buildCategories(rows: TransactionRecord[]): AnalyticsCategory[] {
  const categories = sortCategoryEntries(
    [...categoryTotals(rows).entries()].filter(([, amount]) => amount !== 0),
  );
  const positiveTotal = categories.reduce(
    (total, [, amount]) => total + Math.max(0, amount),
    0,
  );

  return categories.map(([category, amount]) => ({
    category,
    amount,
    share: amount > 0 && positiveTotal > 0 ? Math.round((amount / positiveTotal) * 100) : 0,
  }));
}

export function buildAnalyticsScope(
  summary: AnalyticsSummary,
  bucketKey?: string | null,
): AnalyticsScope {
  const selectedIds = bucketKey
    ? new Set(summary.buckets.find((bucket) => bucket.key === bucketKey)?.transactionIds ?? [])
    : null;
  const transactions = selectedIds
    ? summary.transactions.filter((row) => selectedIds.has(row.id))
    : summary.transactions;
  const expenseTotal = sumType(transactions, 'expense');
  const incomeTotal = sumType(transactions, 'income');

  return {
    expenseTotal,
    incomeTotal,
    netTotal: incomeTotal - expenseTotal,
    categories: buildCategories(transactions),
    transactions,
  };
}

export function buildAnalyticsSummary({
  transactions,
  range,
  currency,
  now,
  customPeriod,
}: BuildAnalyticsSummaryInput): AnalyticsSummary {
  const periods = getAnalyticsPeriods(range, now, customPeriod);
  const currentRows = rowsInPeriod(transactions, periods.current, currency);
  const comparisonRows = rowsInPeriod(transactions, periods.comparison, currency);
  const expenseTotal = sumType(currentRows, 'expense');
  const incomeTotal = sumType(currentRows, 'income');
  const previousExpenseTotal = sumType(comparisonRows, 'expense');
  const series = buildSeries(currentRows);

  return {
    range,
    currency,
    periods,
    expenseTotal,
    previousExpenseTotal,
    incomeTotal,
    netTotal: incomeTotal - expenseTotal,
    comparison: buildComparison(expenseTotal, previousExpenseTotal),
    buckets: buildBuckets(range, periods.current, currentRows, series),
    series,
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

export function getAnalyticsBucketDescription(
  bucket: AnalyticsBucket,
  series: AnalyticsSeries[],
  currency: string,
): string {
  const seriesByKey = new Map(series.map((item) => [item.key, item]));
  const breakdown = bucket.segments
    .filter((segment) => segment.amount !== 0)
    .map((segment) => {
      const item = seriesByKey.get(segment.seriesKey);
      return item
        ? `${item.label} ${formatAnalyticsAmount(segment.amount, currency)}`
        : null;
    })
    .filter((item): item is string => item !== null)
    .join(', ');

  return `${bucket.accessibleLabel}, ${formatAnalyticsAmount(bucket.amount, currency)}${breakdown ? ` · ${breakdown}` : ''}`;
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
        : range === 'quarter'
          ? 'the same elapsed days last quarter'
          : range === 'year'
            ? 'the same elapsed days last year'
            : 'the previous period';
  return `${comparison.percentage}% ${comparison.direction} ${period}`;
}

export function getOfflineFreshness(updatedAt?: number): string {
  return updatedAt
    ? `Offline · saved ${format(new Date(updatedAt), 'HH:mm')}`
    : 'Offline · showing saved data';
}
