import { format, parseISO } from 'date-fns';
import { X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tryParseDate } from '../../lib/date-utils';
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
  buildAnalyticsScope,
  formatAnalyticsAmount,
  getAnalyticsBucketDescription,
  getOfflineFreshness,
  type AnalyticsPeriodOption,
  type AnalyticsRange,
  type AnalyticsSummary,
  type DatePeriod,
  type MissingAnalyticsRate,
} from './analytics';
import { AnalyticsBarChart } from './AnalyticsBarChart';
import { AnalyticsCategories } from './AnalyticsCategories';
import { AnalyticsHalfDonut } from './AnalyticsHalfDonut';
import { AnalyticsPeriodPicker } from './AnalyticsPeriodPicker';
import { AnalyticsRangeDrawer } from './AnalyticsRangeDrawer';
import { AnalyticsRangeToggle } from './AnalyticsRangeToggle';
import {
  flattenTransactionHistory,
  TransactionHistoryDateHeader,
  TransactionHistoryRow,
} from './TransactionHistoryItems';

type AnalyticsDrawerProps = {
  open: boolean;
  initialSelectedBucket?: string | null;
  onOpenChange: (open: boolean) => void;
  transactions: TransactionRecord[];
  summary?: AnalyticsSummary;
  missingRate?: MissingAnalyticsRate;
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

export function AnalyticsDrawer({
  open,
  initialSelectedBucket,
  onOpenChange,
  transactions,
  summary: incomingSummary,
  missingRate,
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
}: AnalyticsDrawerProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const customRangeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const customStart = customPeriod.start.getTime();
  const customEnd = customPeriod.end.getTime();
  const activeSummary = useMemo(
    () => (open && hasCompleteHistory ? incomingSummary ?? null : null),
    [hasCompleteHistory, incomingSummary, open],
  );
  const retainedSummary = useRef(activeSummary);
  if (activeSummary) retainedSummary.current = activeSummary;
  const summary = activeSummary ?? retainedSummary.current;
  const activeScope = useMemo(
    () => (open && activeSummary ? buildAnalyticsScope(activeSummary, selectedBucket) : null),
    [activeSummary, open, selectedBucket],
  );
  const retainedScope = useRef(activeScope);
  if (activeScope) retainedScope.current = activeScope;
  const scope = activeScope ?? retainedScope.current;
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
  }, [clearFilters, customEnd, customStart, periodOffset, range, summary?.currency]);

  useEffect(() => {
    if (!open) clearFilters();
  }, [clearFilters, open]);

  useEffect(() => {
    if (!open) return;
    setSelectedBucket(initialSelectedBucket ?? null);
    setSelectedCategory(null);
  }, [initialSelectedBucket, open]);

  useEffect(() => {
    if (!open) setCustomRangeOpen(false);
  }, [open]);

  const activeFilteredTransactions = useMemo(() => {
    if (!open || !activeScope) return null;
    if (!selectedSeries) return activeScope.transactions;
    const categoryNames = new Set(selectedSeries.categoryNames);
    return activeScope.transactions.filter(
      (row) => row.type === 'expense' && categoryNames.has(row.category.trim() || 'Uncategorized'),
    );
  }, [activeScope, open, selectedSeries]);
  const retainedFilteredTransactions = useRef(activeFilteredTransactions);
  if (activeFilteredTransactions) {
    retainedFilteredTransactions.current = activeFilteredTransactions;
  }
  const filteredTransactions =
    activeFilteredTransactions ?? retainedFilteredTransactions.current ?? [];
  const activeTransactionItems = useMemo(
    () => (open ? flattenTransactionHistory(filteredTransactions) : null),
    [filteredTransactions, open],
  );
  const retainedTransactionItems = useRef(activeTransactionItems);
  if (activeTransactionItems) retainedTransactionItems.current = activeTransactionItems;
  const transactionItems = activeTransactionItems ?? retainedTransactionItems.current ?? [];

  const selectTransaction = (transaction: TransactionRecord) => {
    clearFilters();
    onOpenChange(false);
    onSelectTransaction(transaction);
  };
  const handleDrawerOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setCustomRangeOpen(false);
      clearFilters();
    }
    onOpenChange(nextOpen);
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
    onRangeChange(nextRange);
  };
  const applyCustomPeriod = (period: DatePeriod) => {
    onCustomPeriodChange(period);
    onRangeChange('custom');
  };
  const handlePeriodChange = (nextOffset: number) => {
    clearFilters();
    onPeriodChange(nextOffset);
  };
  const selectedPeriod = periodOptions.find((option) => option.offset === periodOffset);
  const rangeAnnouncement =
    periodOffset < 0 && selectedPeriod
      ? selectedPeriod.accessibleLabel
      : range === 'week'
      ? 'Week, last 7 days'
      : range === 'month'
        ? 'Month, month to date'
        : range === 'quarter'
          ? 'Quarter, quarter to date'
          : range === 'year'
            ? 'Year, year to date'
            : `Custom, ${format(customPeriod.start, 'MMM d')} through ${format(customPeriod.end, 'MMM d')}`;
  const analyticsAnnouncement = !open
    ? ''
    : missingRate
      ? `Analytics unavailable · Rate unavailable for ${missingRate.currency} on ${format(parseISO(missingRate.date), 'MMM d')}`
      : hasCompleteHistory && summary && scope
      ? selectedBucketDetails
        ? `${getAnalyticsBucketDescription(selectedBucketDetails, summary.series, summary.currency)} · Income ${formatAnalyticsAmount(scope.incomeTotal, summary.currency)} · Net ${formatAnalyticsAmount(scope.netTotal, summary.currency)}`
        : `${rangeAnnouncement} · Expenses ${formatAnalyticsAmount(summary.expenseTotal, summary.currency)}`
    : isOffline
      ? 'Full range unavailable offline'
      : isLoading
        ? `Loading ${rangeAnnouncement} analytics`
        : 'Analytics unavailable';

  return (
    <Drawer open={open} onOpenChange={handleDrawerOpenChange}>
      <DrawerContent
        className="h-[92dvh]! sm:mx-auto sm:max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
      >
        <DrawerHeader className="grid grid-cols-[1fr_auto] items-center border-b border-border/60 text-left">
          <DrawerTitle ref={titleRef} tabIndex={-1}>
            Analytics
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            Review spending analytics and filter matching transactions.
          </DrawerDescription>
          <DrawerClose asChild>
            <button
              type="button"
              aria-label="Close analytics"
              className="flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <X className="h-5 w-5" />
            </button>
          </DrawerClose>
        </DrawerHeader>

        <output
          aria-label="Analytics summary update"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {analyticsAnnouncement}
        </output>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-safe" data-vaul-no-drag>
          <div className="space-y-7 pb-8">
            <div
              data-testid="analytics-range-controls"
              className="flex items-center justify-end gap-3 pt-3"
            >
              <AnalyticsRangeToggle value={range} onChange={handleRangeChange} />
            </div>

            {range !== 'custom' ? (
              <AnalyticsPeriodPicker
                options={periodOptions}
                value={periodOffset}
                onChange={handlePeriodChange}
              />
            ) : null}

            {missingRate ? (
              <div className="flex min-h-48 items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">
                  Rate unavailable for {missingRate.currency} on{' '}
                  {format(parseISO(missingRate.date), 'MMM d')}
                </span>
                <button
                  type="button"
                  onClick={onRetry}
                  className="min-h-11 font-semibold text-primary"
                >
                  Retry
                </button>
              </div>
            ) : !hasCompleteHistory && isOffline ? (
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
                <section aria-label="Spending trend">
                  <AnalyticsBarChart
                    buckets={summary.buckets}
                    series={summary.series}
                    currency={summary.currency}
                    selectedKey={selectedBucket}
                    onSelect={(key) =>
                      setSelectedBucket((current) =>
                        key === null || current === key ? null : key,
                      )
                    }
                    className="h-44"
                  />
                  {selectedBucketDetails ? (
                    <div className="mt-2 flex justify-center">
                      <button
                        type="button"
                        aria-label={`Clear selected period filter, ${getAnalyticsBucketDescription(selectedBucketDetails, summary.series, summary.currency)}`}
                        onClick={() => setSelectedBucket(null)}
                        className="flex min-h-11 items-center rounded-full bg-surface-2 px-3 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        {selectedBucketDetails.accessibleLabel} ·{' '}
                        {formatAnalyticsAmount(selectedBucketDetails.amount, summary.currency)}
                        <X className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                </section>
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
                />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Expenses</p>
                    <p className="text-base font-semibold tabular-nums">
                      {formatAnalyticsAmount(scope.expenseTotal, summary.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Income</p>
                    <p className="text-base font-semibold tabular-nums text-primary">
                      {formatAnalyticsAmount(scope.incomeTotal, summary.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Net</p>
                    <p className="text-base font-semibold tabular-nums">
                      {formatAnalyticsAmount(scope.netTotal, summary.currency)}
                    </p>
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Transfers are excluded from totals.
                </p>
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
                <p className="text-xs text-muted-foreground">
                  {getOfflineFreshness(updatedAt)}
                </p>
              ) : null}
              </>
            )}
          </div>
        </div>
      </DrawerContent>
      <AnalyticsRangeDrawer
        nested
        open={customRangeOpen}
        onOpenChange={setCustomRangeOpen}
        value={customPeriod}
        minDate={earliestDate}
        maxDate={now}
        onApply={applyCustomPeriod}
        returnFocusTo={customRangeTriggerRef.current}
      />
    </Drawer>
  );
}
