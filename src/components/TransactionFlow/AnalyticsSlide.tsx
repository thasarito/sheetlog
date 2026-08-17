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
import { CarouselActionButton } from './CarouselActionButton';

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
    <div className="flex h-full min-h-0 flex-col px-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">Analytics</h2>
        <AnalyticsRangeToggle value={range} onChange={onRangeChange} />
      </div>

      {isOffline && !summary ? (
        <div className="flex flex-1 items-center text-sm text-muted-foreground">
          Full range unavailable offline
        </div>
      ) : isLoading && !summary ? (
        <output
          className="flex flex-1 flex-col gap-2 pt-2"
          aria-label="Loading analytics"
        >
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-44" />
          <Skeleton className="mt-auto h-14 w-full" />
        </output>
      ) : error && !summary ? (
        <div className="flex flex-1 items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Analytics unavailable</span>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 font-semibold text-primary"
          >
            Retry
          </button>
        </div>
      ) : !summary ? (
        <div className="flex flex-1 items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Analytics unavailable</span>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 font-semibold text-primary"
          >
            Retry
          </button>
        </div>
      ) : !summary.hasExpenseRows ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-sm font-medium">No expenses in this period</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Log an expense below to see insights.
          </p>
          {error ? (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Couldn't refresh · showing saved data
            </p>
          ) : null}
          {!error && isOffline ? (
            <p className="mt-1 text-[10px] text-muted-foreground">
              {getOfflineFreshness(updatedAt)}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div aria-live="polite" aria-atomic="true">
            <div className="flex items-baseline gap-2">
              <p className="text-[28px] font-semibold leading-none tabular-nums tracking-tight">
                {formatAnalyticsAmount(summary.expenseTotal, summary.currency)}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">{rangeLabel(range)}</p>
            </div>
            <p className="mt-1 flex items-center gap-1 text-[11px] leading-none text-muted-foreground">
              {summary.comparison.direction === 'below' ? (
                <ArrowDown className="h-3.5 w-3.5 text-primary" />
              ) : null}
              {summary.comparison.direction === 'above' ? (
                <ArrowUp className="h-3.5 w-3.5 text-warning" />
              ) : null}
              {getComparisonText(summary.comparison, range)}
            </p>
          </div>
          <AnalyticsBarChart
            buckets={summary.buckets}
            currency={summary.currency}
            className="mt-1 h-10"
          />
          {error ? (
            <p className="text-[10px] text-muted-foreground">
              Couldn't refresh · showing saved data
            </p>
          ) : null}
          {!error && isOffline ? (
            <p className="text-[10px] text-muted-foreground">
              {getOfflineFreshness(updatedAt)}
            </p>
          ) : null}
        </>
      )}

      <div className="mt-auto flex h-6 items-end justify-between gap-2 text-xs">
        <span className="truncate text-muted-foreground">
          {summary?.categories[0]
            ? `Top · ${summary.categories[0].category} · ${formatAnalyticsAmount(summary.categories[0].amount, summary.currency)}`
            : 'Detailed insights'}
        </span>
        <CarouselActionButton
          type="button"
          aria-label="View all analytics"
          onClick={onViewAll}
          className="flex min-h-11 shrink-0 items-end px-1 font-semibold text-primary"
        >
          View all
        </CarouselActionButton>
      </div>
    </div>
  );
}
