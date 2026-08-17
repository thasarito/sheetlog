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

  // biome-ignore lint/correctness/useExhaustiveDependencies: changing either analytics scope invalidates its drill-down filter
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
        share:
          positiveCategoryTotal > 0 ? Math.round((otherAmount / positiveCategoryTotal) * 100) : 0,
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
        (row) =>
          row.type === 'expense' &&
          (selectedCategory === 'Other'
            ? otherCategoryNames.has(row.category)
            : row.category === selectedCategory),
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
  const rangeAnnouncement =
    range === 'week'
      ? 'Week, last 7 days'
      : range === 'month'
        ? 'Month, month to date'
        : 'Quarter, quarter to date';
  const analyticsAnnouncement = hasCompleteHistory
    ? `${rangeAnnouncement} · Expenses ${formatAnalyticsAmount(summary.expenseTotal, currency)}`
    : isOffline
      ? 'Full range unavailable offline'
      : isLoading
        ? `Loading ${rangeAnnouncement} analytics`
        : 'Analytics unavailable';

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

        <div className="flex items-center gap-3 px-4 py-3" data-vaul-no-drag>
          <AnalyticsRangeToggle value={range} onChange={onRangeChange} />
          {currencies.length > 1 ? (
            <select
              aria-label="Analytics currency"
              value={currency}
              onChange={(event) => onCurrencyChange(event.target.value)}
              className="h-11 min-w-20 rounded-xl border border-border bg-background px-2 text-sm font-semibold"
            >
              {currencies.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <span className="ml-auto text-xs font-semibold text-muted-foreground">{currency}</span>
          )}
        </div>
        <output
          aria-label="Analytics summary update"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {analyticsAnnouncement}
        </output>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-safe" data-vaul-no-drag>
          {!hasCompleteHistory && isOffline ? (
            <div className="flex min-h-48 items-center text-sm text-muted-foreground">
              Full range unavailable offline
            </div>
          ) : !hasCompleteHistory && isLoading ? (
            <output aria-label="Loading detailed analytics" className="block space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-32 w-full" />
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
          ) : (
            <div className="space-y-6">
              <section aria-labelledby="analytics-overview">
                <h3
                  id="analytics-overview"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Overview
                </h3>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Expenses</p>
                    <p className="text-base font-semibold tabular-nums">
                      {formatAnalyticsAmount(summary.expenseTotal, currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Income</p>
                    <p className="text-base font-semibold tabular-nums text-primary">
                      {formatAnalyticsAmount(summary.incomeTotal, currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Net</p>
                    <p className="text-base font-semibold tabular-nums">
                      {formatAnalyticsAmount(summary.netTotal, currency)}
                    </p>
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Transfers are excluded from totals.
                </p>
              </section>

              <section aria-labelledby="analytics-trend">
                <h3
                  id="analytics-trend"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Trend
                </h3>
                <AnalyticsBarChart
                  buckets={summary.buckets}
                  currency={currency}
                  selectedKey={selectedBucket}
                  onSelect={(key) => {
                    setSelectedBucket((current) => (current === key ? null : key));
                    setSelectedCategory(null);
                  }}
                  className="mt-2 h-36"
                />
              </section>

              <section aria-labelledby="analytics-categories">
                <h3
                  id="analytics-categories"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Top categories
                </h3>
                <div className="mt-2 space-y-1">
                  {displayedCategories.map((category) => (
                    <button
                      key={category.category}
                      type="button"
                      aria-label={`Filter by ${category.category}`}
                      aria-pressed={selectedCategory === category.category}
                      onClick={() => {
                        setSelectedCategory((current) =>
                          current === category.category ? null : category.category,
                        );
                        setSelectedBucket(null);
                      }}
                      className="grid min-h-11 w-full grid-cols-[1fr_auto] items-center gap-3 rounded-lg px-2 text-left aria-pressed:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      <span>
                        <span className="block text-sm font-medium">{category.category}</span>
                        <span className="mt-1 block h-1 rounded-full bg-surface-2">
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${Math.min(100, category.share)}%` }}
                          />
                        </span>
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatAnalyticsAmount(category.amount, currency)} · {category.share}%
                      </span>
                    </button>
                  ))}
                  {summary.categories.length === 0 ? (
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
                      aria-label="Clear analytics filter"
                      onClick={clearFilter}
                      className="min-h-11 text-xs font-semibold text-primary"
                    >
                      Clear filter
                    </button>
                  ) : null}
                </div>
                {filteredTransactions.length > 0 ? (
                  filteredTransactions.map((transaction) => (
                    <TransactionRow
                      key={transaction.id}
                      transaction={transaction}
                      onSelect={selectTransaction}
                    />
                  ))
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
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
