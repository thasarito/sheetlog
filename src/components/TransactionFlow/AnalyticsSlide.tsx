import { format } from 'date-fns';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { MouseEvent } from 'react';
import { Skeleton } from '../ui/skeleton';
import {
  formatAnalyticsAmount,
  getComparisonText,
  getOfflineFreshness,
  type AnalyticsPeriodOption,
  type AnalyticsRange,
  type AnalyticsSummary,
  type DatePeriod,
} from './analytics';
import { AnalyticsBarChart } from './AnalyticsBarChart';
import { AnalyticsPeriodPicker } from './AnalyticsPeriodPicker';
import { AnalyticsRangeToggle } from './AnalyticsRangeToggle';
import { CarouselActionButton } from './CarouselActionButton';

type AnalyticsSlideProps = {
  range: AnalyticsRange;
  onRangeChange: (range: AnalyticsRange) => void;
  periodOptions: AnalyticsPeriodOption[];
  periodOffset: number;
  onPeriodChange: (offset: number) => void;
  onCustomRequest?: (trigger: HTMLButtonElement) => void;
  summary?: AnalyticsSummary;
  isLoading: boolean;
  isOffline: boolean;
  updatedAt?: number;
  error: Error | null;
  onRetry: () => void;
  onBucketSelect: (key: string, trigger: HTMLElement) => void;
  onViewAll: (event: MouseEvent<HTMLButtonElement>) => void;
};

function rangeLabel(
  range: AnalyticsRange,
  periodOffset: number,
  selectedPeriodLabel?: string,
): string {
  if (periodOffset < 0 && selectedPeriodLabel) return `spent · ${selectedPeriodLabel}`;
  if (range === 'week') return 'spent · last 7 days';
  if (range === 'month') return 'spent · month to date';
  if (range === 'quarter') return 'spent · quarter to date';
  if (range === 'year') return 'spent · year to date';
  return 'spent · custom range';
}

function customPeriodLabel(period: DatePeriod): string {
  const sameYear = period.start.getFullYear() === period.end.getFullYear();
  const sameMonth = sameYear && period.start.getMonth() === period.end.getMonth();
  if (sameMonth) return `${format(period.start, 'MMM d')}–${format(period.end, 'd, yyyy')}`;
  if (sameYear) return `${format(period.start, 'MMM d')}–${format(period.end, 'MMM d, yyyy')}`;
  return `${format(period.start, 'MMM d, yyyy')}–${format(period.end, 'MMM d, yyyy')}`;
}

export function AnalyticsSlide({
  range,
  onRangeChange,
  periodOptions,
  periodOffset,
  onPeriodChange,
  onCustomRequest,
  summary,
  isLoading,
  isOffline,
  updatedAt,
  error,
  onRetry,
  onBucketSelect,
  onViewAll,
}: AnalyticsSlideProps) {
  const selectedPeriod = periodOptions.find((option) => option.offset === periodOffset);
  const periodControl =
    range === 'custom' ? (
      summary ? (
        <p
          data-testid="analytics-custom-period"
          className="flex min-h-11 items-center justify-center text-xs font-semibold text-foreground"
        >
          {customPeriodLabel(summary.periods.current)}
        </p>
      ) : null
    ) : (
      <AnalyticsPeriodPicker
        options={periodOptions}
        value={periodOffset}
        onChange={onPeriodChange}
        className="-mx-2"
      />
    );

  return (
    <div className="flex h-full min-h-0 flex-col px-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">Analytics</h2>
        <AnalyticsRangeToggle
          value={range}
          onChange={(nextRange, trigger) => {
            if (nextRange === 'custom') {
              if (trigger) onCustomRequest?.(trigger);
              return;
            }
            onRangeChange(nextRange);
          }}
        />
      </div>

      {isOffline && !summary ? (
        <>
          {periodControl}
          <div className="flex flex-1 items-center text-sm text-muted-foreground">
            Full range unavailable offline
          </div>
        </>
      ) : isLoading && !summary ? (
        <>
          {periodControl}
          <output
            className="flex flex-1 flex-col gap-2 pt-2"
            aria-label="Loading analytics"
          >
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-44" />
            <Skeleton className="mt-auto h-14 w-full" />
          </output>
        </>
      ) : error && !summary ? (
        <>
          {periodControl}
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
        </>
      ) : !summary ? (
        <>
          {periodControl}
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
        </>
      ) : summary.hasExpenseRows ? (
        <>
          <div aria-live="polite" aria-atomic="true">
            <div className="flex items-baseline gap-2">
              <p className="text-[28px] font-semibold leading-none tabular-nums tracking-tight">
                {formatAnalyticsAmount(summary.expenseTotal, summary.currency)}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {rangeLabel(range, periodOffset, selectedPeriod?.label)}
              </p>
            </div>
            <p className="mt-1 flex items-center gap-1 text-[11px] leading-none text-muted-foreground">
              {summary.comparison.direction === 'below' ? (
                <ArrowDown className="h-3.5 w-3.5 text-primary" />
              ) : null}
              {summary.comparison.direction === 'above' ? (
                <ArrowUp className="h-3.5 w-3.5 text-warning" />
              ) : null}
              {getComparisonText(summary.comparison, range, periodOffset)}
            </p>
          </div>
          {periodControl}
          <AnalyticsBarChart
            buckets={summary.buckets}
            axisGroups={summary.axisGroups}
            series={summary.series}
            currency={summary.currency}
            onBucketActivate={onBucketSelect}
            className="mt-1 min-h-10 flex-1"
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
      ) : (
        <>
          {periodControl}
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
        </>
      )}

      <div className="mt-auto flex h-5 items-end justify-between gap-2 text-xs">
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
