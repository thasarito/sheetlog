import type { KeyboardEvent } from 'react';
import { cn } from '../../lib/utils';
import {
  formatAnalyticsAmount,
  type AnalyticsBucket,
  type AnalyticsSeries,
} from './analytics';
import { ANALYTICS_TONE_BACKGROUND_CLASSES } from './analyticsPresentation';

type AnalyticsBarChartProps = {
  buckets: AnalyticsBucket[];
  series: AnalyticsSeries[];
  currency: string;
  selectedKey?: string | null;
  onSelect?: (key: string | null) => void;
  className?: string;
};

function stackTotal(bucket: AnalyticsBucket, direction: 'positive' | 'negative'): number {
  return bucket.segments.reduce((total, segment) => {
    if (direction === 'positive' && segment.amount > 0) return total + segment.amount;
    if (direction === 'negative' && segment.amount < 0) return total + Math.abs(segment.amount);
    return total;
  }, 0);
}

function showLabel(index: number, count: number): boolean {
  if (count <= 8) return true;
  const interval = Math.ceil((count - 1) / 4);
  return index === 0 || index === count - 1 || index % interval === 0;
}

export function AnalyticsBarChart({
  buckets,
  series,
  currency,
  selectedKey,
  onSelect,
  className,
}: AnalyticsBarChartProps) {
  const seriesByKey = new Map(series.map((item) => [item.key, item]));
  const maximumPositive = Math.max(1, ...buckets.map((bucket) => stackTotal(bucket, 'positive')));
  const maximumNegative = Math.max(0, ...buckets.map((bucket) => stackTotal(bucket, 'negative')));
  const negativeArea = maximumNegative > 0 ? 28 : 0;
  const positiveArea = 100 - negativeArea;
  const summary = buckets
    .map(
      (bucket) =>
        `${bucket.accessibleLabel} ${formatAnalyticsAmount(bucket.amount, currency)}`,
    )
    .join(', ');

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onSelect || buckets.length === 0) return;
    const selectedIndex = buckets.findIndex((bucket) => bucket.key === selectedKey);
    let nextIndex: number | null = null;

    if (event.key === 'ArrowRight') {
      nextIndex = selectedIndex < 0 ? 0 : Math.min(buckets.length - 1, selectedIndex + 1);
    } else if (event.key === 'ArrowLeft') {
      nextIndex = selectedIndex < 0 ? buckets.length - 1 : Math.max(0, selectedIndex - 1);
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = buckets.length - 1;
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onSelect(null);
      return;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    onSelect(buckets[nextIndex].key);
  };

  const bars = buckets.map((bucket, index) => {
          const positiveTotal = stackTotal(bucket, 'positive');
          const negativeTotal = stackTotal(bucket, 'negative');
          const muted = selectedKey !== null && selectedKey !== undefined && selectedKey !== bucket.key;
          const stack = (
            <>
              {positiveTotal > 0 ? (
                <span
                  className={cn(
                    'absolute inset-x-1 flex flex-col-reverse overflow-hidden rounded-t-[3px] transition-[filter,opacity] motion-reduce:transition-none',
                    muted && 'grayscale opacity-25',
                  )}
                  style={{
                    bottom: `${negativeArea}%`,
                    height: `${Math.max(3, (positiveTotal / maximumPositive) * positiveArea)}%`,
                  }}
                >
                  {bucket.segments
                    .filter((segment) => segment.amount > 0)
                    .map((segment) => {
                      const item = seriesByKey.get(segment.seriesKey);
                      if (!item) return null;
                      return (
                        <span
                          key={segment.seriesKey}
                          data-testid={`segment-${bucket.key}-${segment.seriesKey}`}
                          data-tone={item.tone}
                          data-direction="positive"
                          className={ANALYTICS_TONE_BACKGROUND_CLASSES[item.tone]}
                          style={{ flexBasis: 0, flexGrow: segment.amount }}
                        />
                      );
                    })}
                </span>
              ) : null}
              {negativeTotal > 0 ? (
                <span
                  className={cn(
                    'absolute inset-x-1 flex flex-col overflow-hidden rounded-b-[3px] transition-[filter,opacity] motion-reduce:transition-none',
                    muted && 'grayscale opacity-25',
                  )}
                  style={{
                    top: `${positiveArea}%`,
                    height: `${Math.max(3, (negativeTotal / maximumNegative) * negativeArea)}%`,
                  }}
                >
                  {bucket.segments
                    .filter((segment) => segment.amount < 0)
                    .map((segment) => {
                      const item = seriesByKey.get(segment.seriesKey);
                      if (!item) return null;
                      return (
                        <span
                          key={segment.seriesKey}
                          data-testid={`segment-${bucket.key}-${segment.seriesKey}`}
                          data-tone={item.tone}
                          data-direction="negative"
                          className={ANALYTICS_TONE_BACKGROUND_CLASSES[item.tone]}
                          style={{ flexBasis: 0, flexGrow: Math.abs(segment.amount) }}
                        />
                      );
                    })}
                </span>
              ) : null}
              {maximumNegative > 0 ? (
                <span
                  className="absolute inset-x-0 border-t border-border/70"
                  style={{ top: `${positiveArea}%` }}
                />
              ) : null}
            </>
          );

    return (
      <div
        key={bucket.key}
        className="grid h-full min-w-0 flex-1 grid-rows-[minmax(4px,1fr)_auto] items-center gap-1"
      >
        {onSelect ? (
          <button
            type="button"
            role="option"
            aria-label={`${bucket.accessibleLabel}, ${formatAnalyticsAmount(bucket.amount, currency)}`}
            aria-selected={selectedKey === bucket.key}
            tabIndex={-1}
            data-testid={`analytics-bar-${bucket.key}`}
            data-muted={String(muted)}
            onClick={() => onSelect(bucket.key)}
            className="relative h-full min-h-11 w-full"
          >
            {stack}
          </button>
        ) : (
          <div
            data-testid={`analytics-bar-${bucket.key}`}
            data-muted={String(muted)}
            className="relative h-full w-full"
          >
            {stack}
          </div>
        )}
        <span className="min-h-2.5 truncate text-center text-[9px] leading-none text-muted-foreground">
          {showLabel(index, buckets.length) ? bucket.label : null}
        </span>
      </div>
    );
  });

  return (
    <figure className={className} aria-label={`Expense trend: ${summary}`}>
      {onSelect ? (
        <div
          role="listbox"
          aria-label="Select analytics period"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="flex h-full items-stretch gap-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {bars}
        </div>
      ) : (
        <div className="flex h-full items-stretch gap-1" aria-hidden="true">
          {bars}
        </div>
      )}
    </figure>
  );
}
