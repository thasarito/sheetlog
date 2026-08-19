import { format } from 'date-fns';
import { BadgeDollarSign, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { tryParseDate } from '../../lib/date-utils';
import type { TransactionRecord } from '../../lib/types';
import { cn } from '../../lib/utils';
import { Skeleton } from '../ui/skeleton';
import {
  buildAnalyticsScope,
  formatAnalyticsAmount,
  getAnalyticsBucketDescription,
  getOfflineFreshness,
  type AnalyticsPeriodOption,
  type AnalyticsRange,
  type AnalyticsSummary,
  type DatePeriod,
} from './analytics';
import { AnalyticsBarChart } from './AnalyticsBarChart';
import { AnalyticsCategories } from './AnalyticsCategories';
import { AnalyticsHalfDonut } from './AnalyticsHalfDonut';
import {
  resolveAnalyticsMotionIntent,
  type AnalyticsMotionSnapshot,
} from './analyticsMotion';
import { AnalyticsNumber } from './AnalyticsNumber';
import { AnalyticsPeriodPicker } from './AnalyticsPeriodPicker';
import { AnalyticsRangeDrawer } from './AnalyticsRangeDrawer';
import { AnalyticsRangeToggle } from './AnalyticsRangeToggle';
import { buildTransactionBaseAmountStates } from './transactionBaseAmounts';
import {
  flattenTransactionHistory,
  TransactionHistoryDateHeader,
  TransactionHistoryRow,
} from './TransactionHistoryItems';

export type AnalyticsViewProps = {
  transactions: TransactionRecord[];
  summary?: AnalyticsSummary;
  baseCurrency: string;
  bigSpendingThreshold: number | null;
  noBigSpending: boolean;
  onNoBigSpendingToggle: () => void;
  range: AnalyticsRange;
  onRangeChange: (range: AnalyticsRange) => void;
  periodOptions: AnalyticsPeriodOption[];
  periodOffset: number;
  onPeriodChange: (offset: number) => void;
  customPeriod: DatePeriod;
  onCustomPeriodChange: (period: DatePeriod) => void;
  isLoading: boolean;
  hasCompleteHistory: boolean;
  isOffline: boolean;
  updatedAt?: number;
  error: Error | null;
  onRetry: () => void;
  onSelectTransaction: (transaction: TransactionRecord) => void;
  now?: Date;
};

export function AnalyticsView({
  transactions,
  summary: incomingSummary,
  baseCurrency,
  bigSpendingThreshold,
  noBigSpending,
  onNoBigSpendingToggle,
  range,
  onRangeChange,
  periodOptions,
  periodOffset,
  onPeriodChange,
  customPeriod,
  onCustomPeriodChange,
  isLoading,
  hasCompleteHistory,
  isOffline,
  updatedAt,
  error,
  onRetry,
  onSelectTransaction,
  now = new Date(),
}: AnalyticsViewProps) {
  const customRangeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const previousMotionSnapshotRef = useRef<AnalyticsMotionSnapshot | null>(null);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const customStart = customPeriod.start.getTime();
  const customEnd = customPeriod.end.getTime();
  const motionSnapshot: AnalyticsMotionSnapshot = {
    range,
    periodOffset,
    customStart,
    customEnd,
    noBigSpending,
    selectedBucket,
    selectedCategory,
  };
  const motionIntent = resolveAnalyticsMotionIntent(
    previousMotionSnapshotRef.current,
    motionSnapshot,
  );

  useLayoutEffect(() => {
    previousMotionSnapshotRef.current = {
      range,
      periodOffset,
      customStart,
      customEnd,
      noBigSpending,
      selectedBucket,
      selectedCategory,
    };
  }, [
    customEnd,
    customStart,
    noBigSpending,
    periodOffset,
    range,
    selectedBucket,
    selectedCategory,
  ]);

  const summary = useMemo(
    () => (hasCompleteHistory ? incomingSummary ?? null : null),
    [hasCompleteHistory, incomingSummary],
  );
  const scope = useMemo(
    () => (summary ? buildAnalyticsScope(summary, selectedBucket) : null),
    [selectedBucket, summary],
  );
  const selectedBucketDetails = summary?.buckets.find(
    (bucket) => bucket.key === selectedBucket,
  );
  const selectedSeries = summary?.series.find((item) => item.key === selectedCategory);
  const earliestDate = useMemo(() => {
    const dates = transactions
      .map((transaction) => tryParseDate(transaction.date))
      .filter((date): date is Date => date !== null);
    if (dates.length === 0) return customPeriod.start;
    return new Date(Math.min(...dates.map((date) => date.getTime())));
  }, [customPeriod.start, transactions]);

  const clearFilters = useCallback(() => {
    setSelectedBucket(null);
    setSelectedCategory(null);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scalar custom endpoints intentionally define the controlled date scope
  useEffect(() => {
    clearFilters();
  }, [
    clearFilters,
    customEnd,
    customStart,
    noBigSpending,
    periodOffset,
    range,
    summary?.currency,
  ]);

  const filteredTransactions = useMemo(() => {
    if (!scope) return [];
    if (!selectedSeries) return scope.transactions;
    const categoryNames = new Set(selectedSeries.categoryNames);
    return scope.transactions.filter(
      (row) => row.type === 'expense' && categoryNames.has(row.category.trim() || 'Uncategorized'),
    );
  }, [scope, selectedSeries]);
  const transactionBaseCurrency = summary?.currency ?? baseCurrency;
  const convertedAmounts = summary?.convertedAmounts;
  const transactionBaseAmountStates = useMemo(
    () =>
      buildTransactionBaseAmountStates(
        filteredTransactions,
        transactionBaseCurrency,
        convertedAmounts ?? {},
        false,
      ),
    [convertedAmounts, filteredTransactions, transactionBaseCurrency],
  );
  const transactionItems = useMemo(
    () => flattenTransactionHistory(filteredTransactions),
    [filteredTransactions],
  );

  const selectTransaction = (transaction: TransactionRecord) => {
    clearFilters();
    onSelectTransaction(transaction);
  };
  const handleRangeChange = (
    nextRange: AnalyticsRange,
    trigger?: HTMLButtonElement,
  ) => {
    if (nextRange === 'custom') {
      customRangeTriggerRef.current = trigger ?? null;
      setCustomRangeOpen(true);
      return;
    }
    clearFilters();
    onRangeChange(nextRange);
  };
  const applyCustomPeriod = (period: DatePeriod) => {
    clearFilters();
    onCustomPeriodChange(period);
    onRangeChange('custom');
  };
  const handlePeriodChange = (nextOffset: number) => {
    clearFilters();
    onPeriodChange(nextOffset);
  };
  const handleNoBigSpendingToggle = () => {
    clearFilters();
    onNoBigSpendingToggle();
  };
  const handleBucketSelect = useCallback((key: string | null) => {
    setSelectedBucket((current) => (key === null || current === key ? null : key));
  }, []);
  const selectedPeriod = periodOptions.find((option) => option.offset === periodOffset);
  const rangeAnnouncement =
    range === 'custom'
      ? `Custom, ${format(customPeriod.start, 'MMM d')} through ${format(customPeriod.end, 'MMM d')}`
      : selectedPeriod?.accessibleLabel ?? range;
  const analyticsAnnouncement = hasCompleteHistory && summary && scope
    ? selectedBucketDetails
      ? `${getAnalyticsBucketDescription(selectedBucketDetails, summary.series, summary.currency)} · Income ${formatAnalyticsAmount(scope.incomeTotal, summary.currency)} · Net ${formatAnalyticsAmount(scope.netTotal, summary.currency)}`
      : `${rangeAnnouncement} · Expenses ${formatAnalyticsAmount(summary.expenseTotal, summary.currency)}`
    : isOffline
      ? 'Full range unavailable offline'
      : isLoading
        ? `Loading ${rangeAnnouncement} analytics`
        : 'Analytics unavailable';
  const thresholdLabel =
    bigSpendingThreshold === null
      ? null
      : formatAnalyticsAmount(bigSpendingThreshold, baseCurrency);
  const excludedCount = summary?.excludedBigSpendingCount ?? 0;
  const noBigSpendingLabel =
    thresholdLabel === null
      ? 'No big spending mode unavailable; set a big spending cutoff in Settings'
      : noBigSpending
        ? `No big spending mode on; ${excludedCount} ${excludedCount === 1 ? 'expense' : 'expenses'} at or above ${thresholdLabel} excluded`
        : `Turn on no big spending mode; exclude expenses at or above ${thresholdLabel}`;

  const periodPicker =
    range !== 'custom' ? (
      <AnalyticsPeriodPicker
        options={periodOptions}
        value={periodOffset}
        onChange={handlePeriodChange}
      />
    ) : null;

  return (
    <section className="flex h-full min-h-0 flex-col bg-transparent">
      <header className="sr-only">
        <h2 className="sr-only">Analytics</h2>
        <p>Review spending analytics and filter matching transactions.</p>
      </header>

      <output
        aria-label="Analytics summary update"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {analyticsAnnouncement}
      </output>

      <div
        data-testid="analytics-dashboard-scroll"
        data-dashboard-scroll="true"
        data-analytics-motion-reason={motionIntent.reason}
        data-analytics-motion-direction={motionIntent.direction}
        className="min-h-0 flex-1 overflow-y-auto px-4"
        style={{
          paddingTop: 'calc(var(--dashboard-header-height, 68px) + 0.75rem)',
          paddingBottom: 'var(--category-sheet-occlusion, env(safe-area-inset-bottom))',
          scrollPaddingTop: 'var(--dashboard-header-height, 68px)',
          scrollPaddingBottom: 'var(--category-sheet-occlusion, env(safe-area-inset-bottom))',
        }}
      >
        <div className="space-y-7 pb-8">
          <div
            data-testid="analytics-range-controls"
            className="flex items-center justify-between gap-3"
          >
            <AnalyticsRangeToggle value={range} onChange={handleRangeChange} />
            <button
              type="button"
              aria-label={noBigSpendingLabel}
              aria-pressed={noBigSpending}
              onClick={handleNoBigSpendingToggle}
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                noBigSpending && 'bg-primary/10 text-primary',
              )}
            >
              <BadgeDollarSign className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {!hasCompleteHistory || !summary || !scope ? periodPicker : null}

          {!hasCompleteHistory && isOffline ? (
            <div className="flex min-h-48 items-center text-sm text-muted-foreground">
              Full range unavailable offline
            </div>
          ) : !hasCompleteHistory && isLoading ? (
            <output aria-label="Loading detailed analytics" className="block space-y-4 pt-4">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-40 w-full" />
            </output>
          ) : !hasCompleteHistory ? (
            <div className="flex min-h-48 items-center justify-between">
              <span className="text-sm text-muted-foreground">Analytics unavailable</span>
              <button
                type="button"
                onClick={onRetry}
                className="min-h-11 font-semibold text-primary"
              >
                Retry
              </button>
            </div>
          ) : !summary || !scope ? null : (
            <>
              <div
                data-testid="analytics-trend-block"
                data-motion-reason={motionIntent.reason}
                className="space-y-2"
              >
                <section aria-label="Spending trend">
                  <AnalyticsBarChart
                    buckets={summary.buckets}
                    axisGroups={summary.axisGroups}
                    series={summary.series}
                    currency={summary.currency}
                    range={summary.range}
                    selectedKey={selectedBucket}
                    onSelect={handleBucketSelect}
                    motionIntent={motionIntent}
                    className="h-44"
                  />
                </section>

                {periodPicker}

                {selectedBucketDetails ? (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      aria-label={`Clear selected period filter, ${getAnalyticsBucketDescription(selectedBucketDetails, summary.series, summary.currency)}`}
                      onClick={() => setSelectedBucket(null)}
                      className="flex min-h-11 items-center rounded-full bg-surface-2 px-3 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      {selectedBucketDetails.accessibleLabel} ·{' '}
                      <AnalyticsNumber
                        value={selectedBucketDetails.amount}
                        presentation="currency"
                        currency={summary.currency}
                      />
                      <X className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
              </div>

              <section aria-labelledby="analytics-overview">
                <h3
                  id="analytics-overview"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Overview
                </h3>
                <AnalyticsHalfDonut
                  series={summary.series}
                  categories={scope.categories}
                  expenseTotal={scope.expenseTotal}
                  currency={summary.currency}
                  motionIntent={motionIntent}
                />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Expenses</p>
                    <p className="text-base font-semibold tabular-nums">
                      <AnalyticsNumber
                        value={scope.expenseTotal}
                        presentation="currency"
                        currency={summary.currency}
                      />
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Income</p>
                    <p className="text-base font-semibold tabular-nums text-primary">
                      <AnalyticsNumber
                        value={scope.incomeTotal}
                        presentation="currency"
                        currency={summary.currency}
                      />
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Net</p>
                    <p className="text-base font-semibold tabular-nums">
                      <AnalyticsNumber
                        value={scope.netTotal}
                        presentation="currency"
                        currency={summary.currency}
                      />
                    </p>
                  </div>
                </div>
              </section>

              <section aria-labelledby="analytics-categories">
                <h3
                  id="analytics-categories"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Top categories
                </h3>
                <div className="mt-2">
                  <AnalyticsCategories
                    series={summary.series}
                    categories={scope.categories}
                    currency={summary.currency}
                    selectedKey={selectedCategory}
                    onSelect={setSelectedCategory}
                    motionIntent={motionIntent}
                  />
                  {summary.series.length === 0 ? (
                    <p className="py-3 text-sm text-muted-foreground">
                      No positive category spend
                    </p>
                  ) : null}
                </div>
              </section>

              <section aria-labelledby="analytics-transactions">
                <div className="flex min-h-11 items-center justify-between">
                  <h3
                    id="analytics-transactions"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Transactions
                  </h3>
                  {selectedBucket || selectedCategory ? (
                    <button
                      type="button"
                      aria-label="Clear analytics filters"
                      onClick={clearFilters}
                      className="min-h-11 text-xs font-semibold text-primary"
                    >
                      Clear filter
                    </button>
                  ) : null}
                </div>
                {transactionItems.length > 0 ? (
                  transactionItems.map((item) =>
                    item.kind === 'date' ? (
                      <TransactionHistoryDateHeader
                        key={item.key}
                        dateKey={item.dateKey}
                        today={now}
                      />
                    ) : (
                      <TransactionHistoryRow
                        key={item.key}
                        transaction={item.transaction}
                        onSelect={selectTransaction}
                        baseAmount={transactionBaseAmountStates[item.transaction.id]}
                      />
                    ),
                  )
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No matching transactions
                  </p>
                )}
              </section>

              {error ? (
                <p className="text-xs text-muted-foreground">
                  Couldn't refresh · showing saved data
                </p>
              ) : null}
              {!error && isOffline ? (
                <p className="text-xs text-muted-foreground">{getOfflineFreshness(updatedAt)}</p>
              ) : null}
            </>
          )}
        </div>
      </div>
      <AnalyticsRangeDrawer
        open={customRangeOpen}
        onOpenChange={setCustomRangeOpen}
        value={customPeriod}
        minDate={earliestDate}
        maxDate={now}
        onApply={applyCustomPeriod}
        returnFocusTo={customRangeTriggerRef.current}
      />
    </section>
  );
}
