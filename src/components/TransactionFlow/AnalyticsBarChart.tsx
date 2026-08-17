import type { KeyboardEvent, MouseEvent } from 'react';
import { cn } from '../../lib/utils';
import {
  getAnalyticsBucketDescription,
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
  onBucketActivate?: (key: string, trigger: HTMLElement) => void;
  className?: string;
};

function stackTotal(bucket: AnalyticsBucket, direction: 'positive' | 'negative'): number {
  return bucket.segments.reduce((total, segment) => {
    if (direction === 'positive' && segment.amount > 0) return total + segment.amount;
    if (direction === 'negative' && segment.amount < 0) return total + Math.abs(segment.amount);
    return total;
  }, 0);
}

function showLabel(index: number, buckets: AnalyticsBucket[]): boolean {
  if (buckets.length <= 8) return true;
  if (buckets.every((bucket) => bucket.key.endsWith('-month'))) return true;
  const weekly = buckets.every((bucket) => bucket.key.endsWith('-week'));
  const interval = weekly ? 4 : 7;
  return index === 0 || index === buckets.length - 1 || index % interval === 0;
}

export function AnalyticsBarChart({
  buckets,
  series,
  currency,
  selectedKey,
  onSelect,
  onBucketActivate,
  className,
}: AnalyticsBarChartProps) {
  const seriesByKey = new Map(series.map((item) => [item.key, item]));
  const maximumPositive = Math.max(1, ...buckets.map((bucket) => stackTotal(bucket, 'positive')));
  const maximumNegative = Math.max(0, ...buckets.map((bucket) => stackTotal(bucket, 'negative')));
  const negativeArea = maximumNegative > 0 ? 28 : 0;
  const positiveArea = 100 - negativeArea;
  const summary = buckets
    .map((bucket) => getAnalyticsBucketDescription(bucket, series, currency))
    .join(', ');
  const selectedOptionId = selectedKey
    ? `analytics-option-${selectedKey}`
    : undefined;
  const interactive = Boolean(onSelect || onBucketActivate);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || buckets.length === 0) return;
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
      if (onSelect) {
        event.preventDefault();
        onSelect(null);
      }
      return;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const key = buckets[nextIndex].key;
    onSelect?.(key);
    onBucketActivate?.(key, event.currentTarget);
  };

  const handlePlotClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!interactive || buckets.length === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    let index: number;

    if (bounds.width > 0) {
      const position = (event.clientX - bounds.left) / bounds.width;
      index = Math.floor(position * buckets.length);
    } else {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-bucket-index]');
      index = Number(target?.dataset.bucketIndex ?? 0);
    }

    const boundedIndex = Math.max(0, Math.min(buckets.length - 1, index));
    const key = buckets[boundedIndex].key;
    onSelect?.(key);
    onBucketActivate?.(key, event.currentTarget);
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
                    height: `${(positiveTotal / maximumPositive) * positiveArea}%`,
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
                    height: `${(negativeTotal / maximumNegative) * negativeArea}%`,
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
        {interactive ? (
          <div
            id={`analytics-option-${bucket.key}`}
            role="option"
            tabIndex={-1}
            aria-label={getAnalyticsBucketDescription(bucket, series, currency)}
            aria-selected={selectedKey === bucket.key}
            data-bucket-index={index}
            data-testid={`analytics-bar-${bucket.key}`}
            data-muted={String(muted)}
            className="relative h-full min-h-11 w-full cursor-pointer"
          >
            {stack}
          </div>
        ) : (
          <div
            data-testid={`analytics-bar-${bucket.key}`}
            data-muted={String(muted)}
            className="relative h-full w-full"
          >
            {stack}
          </div>
        )}
        <span
          data-testid={`analytics-label-${bucket.key}`}
          className="min-h-2.5 truncate text-center text-[9px] leading-none text-muted-foreground"
        >
          {showLabel(index, buckets) ? bucket.label : null}
        </span>
      </div>
    );
  });

  return (
    <figure className={className} aria-label={`Expense trend: ${summary}`}>
      {interactive ? (
        <div
          role="listbox"
          aria-label="Select analytics period"
          aria-activedescendant={selectedOptionId}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onClick={handlePlotClick}
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
