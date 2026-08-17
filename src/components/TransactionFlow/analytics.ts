import {
  addDays,
  addMonths,
  addQuarters,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarQuarters,
  differenceInCalendarYears,
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subQuarters,
  subWeeks,
  subYears,
} from 'date-fns';
import { tryParseDate } from '../../lib/date-utils';
import type { ExchangeRateRecord, TransactionRecord, TransactionType } from '../../lib/types';
import { buildHistoricalRateResolver } from './analyticsSync';
import { buildTransactionBaseAmounts } from './transactionBaseAmounts';

export type AnalyticsRange = 'week' | 'month' | 'quarter' | 'year' | 'custom';

export type DatePeriod = { start: Date; end: Date };

export type AnalyticsPeriods = {
  current: DatePeriod;
  comparison: DatePeriod;
};

export type AnalyticsPeriodOption = {
  key: string;
  offset: number;
  label: string;
  accessibleLabel: string;
  period: DatePeriod;
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

export type AnalyticsAxisGroup = {
  key: string;
  label: string;
  bucketCount: number;
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
  axisGroups: AnalyticsAxisGroup[];
  series: AnalyticsSeries[];
  hasExpenseRows: boolean;
  convertedAmounts: Record<string, number>;
  excludedBigSpendingCount: number;
};

export type AnalyticsBuildResult = { status: 'ready'; summary: AnalyticsSummary };

type BuildAnalyticsSummaryInput = {
  transactions: TransactionRecord[];
  range: AnalyticsRange;
  baseCurrency: string;
  rates: ExchangeRateRecord[];
  now: Date;
  customPeriod?: DatePeriod;
  periodOffset?: number;
  bigSpendingThreshold?: number | null;
};

const SERIES_TONES: AnalyticsSeriesTone[] = ['emerald', 'cyan', 'violet', 'rose'];
const MONDAY_WEEK = { weekStartsOn: 1 as const };

type ConvertedAmount = (row: TransactionRecord) => number;

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

function normalizePeriodOffset(periodOffset: number): number {
  return Number.isFinite(periodOffset) ? Math.min(0, Math.trunc(periodOffset)) : 0;
}

export function getAnalyticsPeriods(
  range: AnalyticsRange,
  now: Date,
  customPeriod?: DatePeriod,
  periodOffset = 0,
): AnalyticsPeriods {
  const offset = normalizePeriodOffset(periodOffset);

  if (range === 'custom') {
    const current = normalizePeriod(
      customPeriod ?? { start: startOfMonth(now), end: endOfDay(now) },
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
    const anchor = addWeeks(now, offset);
    const comparisonAnchor = subWeeks(anchor, 1);
    return {
      current: {
        start: startOfWeek(anchor, MONDAY_WEEK),
        end: endOfWeek(anchor, MONDAY_WEEK),
      },
      comparison: {
        start: startOfWeek(comparisonAnchor, MONDAY_WEEK),
        end: endOfWeek(comparisonAnchor, MONDAY_WEEK),
      },
    };
  }

  if (range === 'month') {
    const anchor = addMonths(now, offset);
    const comparisonAnchor = subMonths(anchor, 1);
    return {
      current: { start: startOfMonth(anchor), end: endOfMonth(anchor) },
      comparison: {
        start: startOfMonth(comparisonAnchor),
        end: endOfMonth(comparisonAnchor),
      },
    };
  }

  if (range === 'year') {
    const anchor = addYears(now, offset);
    const comparisonAnchor = subYears(anchor, 1);
    return {
      current: { start: startOfYear(anchor), end: endOfYear(anchor) },
      comparison: {
        start: startOfYear(comparisonAnchor),
        end: endOfYear(comparisonAnchor),
      },
    };
  }

  const anchor = addQuarters(now, offset);
  const comparisonAnchor = subQuarters(anchor, 1);
  return {
    current: { start: startOfQuarter(anchor), end: endOfQuarter(anchor) },
    comparison: {
      start: startOfQuarter(comparisonAnchor),
      end: endOfQuarter(comparisonAnchor),
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

function formatCompactDateRange(period: DatePeriod): string {
  const sameYear = period.start.getFullYear() === period.end.getFullYear();
  const sameMonth = sameYear && period.start.getMonth() === period.end.getMonth();
  if (sameMonth) return `${format(period.start, 'MMM d')}–${format(period.end, 'd')}`;
  if (sameYear) return `${format(period.start, 'MMM d')}–${format(period.end, 'MMM d')}`;
  return `${format(period.start, 'MMM d, yyyy')}–${format(period.end, 'MMM d, yyyy')}`;
}

function analyticsPeriodOption(
  range: Exclude<AnalyticsRange, 'custom'>,
  now: Date,
  offset: number,
): AnalyticsPeriodOption {
  const period = getAnalyticsPeriods(range, now, undefined, offset).current;
  const quarter = Math.floor(period.start.getMonth() / 3) + 1;
  const label =
    range === 'week'
      ? formatCompactDateRange(period)
      : range === 'month'
        ? format(period.start, 'MMMM yyyy')
        : range === 'quarter'
          ? `Q${quarter} ${format(period.start, 'yyyy')}`
          : format(period.start, 'yyyy');
  const accessibleLabel = `${format(period.start, 'MMMM d, yyyy')} through ${format(period.end, 'MMMM d, yyyy')}`;
  return {
    key: `${range}-${format(period.start, 'yyyy-MM-dd')}-${format(period.end, 'yyyy-MM-dd')}`,
    offset,
    label,
    accessibleLabel,
    period,
  };
}

export function buildAnalyticsPeriodOptions(
  range: AnalyticsRange,
  transactions: TransactionRecord[],
  now: Date,
): AnalyticsPeriodOption[] {
  if (range === 'custom') return [];

  const todayEnd = endOfDay(now).getTime();
  const earliest = transactions.reduce<Date | null>((current, transaction) => {
    if (transaction.sheetRowValid === false) return current;
    const date = analyticsDate(transaction);
    if (!date || date.getTime() > todayEnd) return current;
    return current === null || date.getTime() < current.getTime() ? date : current;
  }, null);
  const distance = earliest
    ? range === 'week'
      ? Math.floor(
          differenceInCalendarDays(
            startOfWeek(now, MONDAY_WEEK),
            startOfWeek(earliest, MONDAY_WEEK),
          ) / 7,
        )
      : range === 'month'
        ? differenceInCalendarMonths(startOfMonth(now), startOfMonth(earliest))
        : range === 'quarter'
          ? differenceInCalendarQuarters(startOfQuarter(now), startOfQuarter(earliest))
          : differenceInCalendarYears(startOfYear(now), startOfYear(earliest))
    : 0;

  return Array.from({ length: Math.max(0, distance) + 1 }, (_, index) =>
    analyticsPeriodOption(range, now, index - Math.max(0, distance)),
  );
}

function sumType(
  rows: TransactionRecord[],
  type: TransactionType,
  convertedAmount: ConvertedAmount,
): number {
  return rows.reduce(
    (total, row) => total + (row.type === type ? convertedAmount(row) : 0),
    0,
  );
}

function rowsInPeriod(rows: TransactionRecord[], period: DatePeriod): TransactionRecord[] {
  return rows
    .filter((row) => {
      const date = analyticsDate(row);
      const amount = Number(row.amount);
      return (
        row.sheetRowValid !== false &&
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

function categoryTotals(
  rows: TransactionRecord[],
  convertedAmount: ConvertedAmount,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.type !== 'expense') continue;
    const name = categoryName(row);
    totals.set(name, (totals.get(name) ?? 0) + convertedAmount(row));
  }
  return totals;
}

function sortCategoryEntries(entries: Array<[string, number]>): Array<[string, number]> {
  return entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

function buildSeries(
  rows: TransactionRecord[],
  convertedAmount: ConvertedAmount,
): AnalyticsSeries[] {
  const totals = categoryTotals(rows, convertedAmount);
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
  convertedAmount: ConvertedAmount,
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
    amount: sumType(expenses, 'expense', convertedAmount),
    segments: series.map((item) => {
      const names = new Set(item.categoryNames);
      return {
        seriesKey: item.key,
        amount: expenses.reduce(
          (total, row) =>
            total + (names.has(categoryName(row)) ? convertedAmount(row) : 0),
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
  convertedAmount: ConvertedAmount,
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
    convertedAmount,
  );
}

function buildBuckets(
  range: AnalyticsRange,
  current: DatePeriod,
  rows: TransactionRecord[],
  series: AnalyticsSeries[],
  convertedAmount: ConvertedAmount,
): AnalyticsBucket[] {
  const elapsedDays = differenceInCalendarDays(current.end, current.start) + 1;
  const daily = range === 'week' || range === 'month' || (range === 'custom' && elapsedDays <= 31);

  if (daily) {
    const crossesMonths = current.start.getMonth() !== current.end.getMonth();
    return Array.from({ length: elapsedDays }, (_, index) =>
      makeDailyBucket(
        addDays(current.start, index),
        rows,
        series,
        convertedAmount,
        range,
        crossesMonths,
      ),
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
        convertedAmount,
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
      convertedAmount,
    );
  });
}

function buildAxisGroups(
  range: AnalyticsRange,
  current: DatePeriod,
  bucketCount: number,
): AnalyticsAxisGroup[] {
  if (range !== 'quarter') return [];
  const groups: AnalyticsAxisGroup[] = [];

  for (let index = 0; index < bucketCount; index += 1) {
    const bucketStart = addDays(current.start, index * 7);
    const key = format(bucketStart, 'yyyy-MM');
    const last = groups.at(-1);
    if (last?.key === key) last.bucketCount += 1;
    else groups.push({ key, label: format(bucketStart, 'MMM'), bucketCount: 1 });
  }

  return groups;
}

function buildCategories(
  rows: TransactionRecord[],
  convertedAmount: ConvertedAmount,
): AnalyticsCategory[] {
  const categories = sortCategoryEntries(
    [...categoryTotals(rows, convertedAmount).entries()].filter(
      ([, amount]) => amount !== 0,
    ),
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
  const convertedAmount: ConvertedAmount = (row) =>
    summary.convertedAmounts[row.id] ?? 0;
  const expenseTotal = sumType(transactions, 'expense', convertedAmount);
  const incomeTotal = sumType(transactions, 'income', convertedAmount);

  return {
    expenseTotal,
    incomeTotal,
    netTotal: incomeTotal - expenseTotal,
    categories: buildCategories(transactions, convertedAmount),
    transactions,
  };
}

export function buildAnalyticsSummary({
  transactions,
  range,
  baseCurrency,
  rates,
  now,
  customPeriod,
  periodOffset = 0,
  bigSpendingThreshold,
}: BuildAnalyticsSummaryInput): AnalyticsBuildResult {
  const periods = getAnalyticsPeriods(range, now, customPeriod, periodOffset);
  const currentRows = rowsInPeriod(transactions, periods.current);
  const comparisonRows = rowsInPeriod(transactions, periods.comparison);
  const resolveRate = buildHistoricalRateResolver(rates, baseCurrency);
  const resolvedRates = new Map<string, number | null>();
  const normalizedBaseCurrency = baseCurrency.trim().toUpperCase();
  const resolveMemoizedRate = (quoteValue: string, dateKey: string) => {
    const quote = quoteValue.trim().toUpperCase();
    const rowKey = `${quote}:${dateKey}`;
    if (resolvedRates.has(rowKey)) return resolvedRates.get(rowKey) ?? null;
    const rate = resolveRate(quote, dateKey);
    resolvedRates.set(rowKey, rate);
    return rate;
  };

  const hasUsableRate = (row: TransactionRecord) => {
    if (row.currency.trim().toUpperCase() === normalizedBaseCurrency) return true;
    const date = analyticsDate(row);
    if (!date) return false;
    const dateKey = format(date, 'yyyy-MM-dd');
    return resolveMemoizedRate(row.currency, dateKey) !== null;
  };
  const rateScopedCurrentRows = currentRows.filter(hasUsableRate);
  const rateScopedComparisonRows = comparisonRows.filter(hasUsableRate);

  const allConvertedAmounts = buildTransactionBaseAmounts(
    [
      ...rateScopedCurrentRows,
      ...rateScopedComparisonRows.filter((row) => row.type === 'expense'),
    ],
    baseCurrency,
    rates,
    resolveMemoizedRate,
  );
  const convertedAmount: ConvertedAmount = (row) =>
    allConvertedAmounts[row.id] ?? 0;
  const threshold =
    typeof bigSpendingThreshold === 'number' &&
    Number.isFinite(bigSpendingThreshold) &&
    bigSpendingThreshold > 0
      ? bigSpendingThreshold
      : null;
  const isBigSpending = (row: TransactionRecord) => {
    if (threshold === null || row.type !== 'expense') return false;
    const amount = convertedAmount(row);
    return amount > 0 && amount >= threshold;
  };
  const scopedCurrentRows = rateScopedCurrentRows.filter((row) => !isBigSpending(row));
  const scopedComparisonRows = rateScopedComparisonRows.filter((row) => !isBigSpending(row));
  const excludedBigSpendingCount = rateScopedCurrentRows.length - scopedCurrentRows.length;
  const expenseTotal = sumType(scopedCurrentRows, 'expense', convertedAmount);
  const incomeTotal = sumType(scopedCurrentRows, 'income', convertedAmount);
  const previousExpenseTotal = sumType(scopedComparisonRows, 'expense', convertedAmount);
  const series = buildSeries(scopedCurrentRows, convertedAmount);
  const convertedAmounts = Object.fromEntries(
    scopedCurrentRows.flatMap((row) =>
      Object.hasOwn(allConvertedAmounts, row.id)
        ? [[row.id, allConvertedAmounts[row.id]]]
        : [],
    ),
  );
  const buckets = buildBuckets(
    range,
    periods.current,
    scopedCurrentRows,
    series,
    convertedAmount,
  );

  return {
    status: 'ready',
    summary: {
      range,
      currency: baseCurrency,
      periods,
      expenseTotal,
      previousExpenseTotal,
      incomeTotal,
      netTotal: incomeTotal - expenseTotal,
      comparison: buildComparison(expenseTotal, previousExpenseTotal),
      buckets,
      axisGroups: buildAxisGroups(range, periods.current, buckets.length),
      series,
      categories: buildCategories(scopedCurrentRows, convertedAmount),
      transactions: scopedCurrentRows,
      hasExpenseRows: scopedCurrentRows.some(
        (row) => row.type === 'expense' && finiteAmount(row) !== 0,
      ),
      convertedAmounts,
      excludedBigSpendingCount,
    },
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
      ? 'previous week'
      : range === 'month'
        ? 'previous month'
        : range === 'quarter'
          ? 'previous quarter'
          : range === 'year'
            ? 'previous year'
            : 'the previous period';
  return `${comparison.percentage}% ${comparison.direction} ${period}`;
}

export function getOfflineFreshness(updatedAt?: number): string {
  return updatedAt
    ? `Offline · saved ${format(new Date(updatedAt), 'HH:mm')}`
    : 'Offline · showing saved data';
}
