import { format, parseISO } from 'date-fns';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  type KeyboardEvent,
  type MouseEvent,
  type TouchEvent as ReactTouchEvent,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { cn } from '../../lib/utils';
import {
  getAnalyticsBucketDescription,
  type AnalyticsAxisGroup,
  type AnalyticsBucket,
  type AnalyticsRange,
  type AnalyticsSeries,
} from './analytics';
import { ANALYTICS_TONE_BACKGROUND_CLASSES } from './analyticsPresentation';

type AnalyticsBarChartProps = {
  buckets: AnalyticsBucket[];
  axisGroups?: AnalyticsAxisGroup[];
  series: AnalyticsSeries[];
  currency: string;
  range: AnalyticsRange;
  selectedKey?: string | null;
  onSelect?: (key: string | null) => void;
  onBucketActivate?: (key: string, trigger: HTMLElement) => void;
  className?: string;
};

type SwipeDirection = 'earlier' | 'later';

type IdentifiedTouch = {
  identifier: number;
  pageX: number;
  pageY: number;
  clientX: number;
};

type ChartTouch = {
  identifier: number;
  startX: number;
  startY: number;
  axis: 'horizontal' | 'vertical' | null;
  cancelled: boolean;
};

const AXIS_LOCK_THRESHOLD_PX = 6;
const SWIPE_COMMIT_THRESHOLD_PX = 32;
const MOTION_DURATION_SECONDS = 0.32;
const EXIT_DURATION_SECONDS = 0.24;

function findTouch(
  touches: ArrayLike<IdentifiedTouch>,
  identifier: number,
): IdentifiedTouch | null {
  for (let index = 0; index < touches.length; index += 1) {
    const touch = touches[index];
    if (touch.identifier === identifier) return touch;
  }
  return null;
}

export function resolveAdjacentBucketKey(
  buckets: AnalyticsBucket[],
  selectedKey: string | null | undefined,
  direction: SwipeDirection,
): string | null {
  if (buckets.length === 0) return null;
  const selectedIndex = buckets.findIndex((bucket) => bucket.key === selectedKey);
  if (selectedIndex < 0) {
    return direction === 'later' ? buckets[0].key : buckets[buckets.length - 1].key;
  }
  const nextIndex =
    direction === 'later'
      ? Math.min(buckets.length - 1, selectedIndex + 1)
      : Math.max(0, selectedIndex - 1);
  return buckets[nextIndex].key;
}

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

function getMonthAxisLabel(bucket: AnalyticsBucket, index: number): string {
  if (index % 7 === 0) return bucket.label;
  return format(parseISO(bucket.key), 'EEEEE');
}

export function AnalyticsBarChart({
  buckets,
  axisGroups = [],
  series,
  currency,
  range,
  selectedKey,
  onSelect,
  onBucketActivate,
  className,
}: AnalyticsBarChartProps) {
  const reducedMotion = useReducedMotion();
  const plotRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<ChartTouch | null>(null);
  const suppressClickRef = useRef(false);
  const clickResetTimerRef = useRef<number | null>(null);
  const seriesByKey = new Map(series.map((item) => [item.key, item]));
  const maximumPositive = Math.max(1, ...buckets.map((bucket) => stackTotal(bucket, 'positive')));
  const maximumNegative = Math.max(0, ...buckets.map((bucket) => stackTotal(bucket, 'negative')));
  const negativeArea = maximumNegative > 0 ? 28 : 0;
  const positiveArea = 100 - negativeArea;
  const summary = buckets
    .map((bucket) => getAnalyticsBucketDescription(bucket, series, currency))
    .join(', ');
  const selectedOptionId = selectedKey ? `analytics-option-${selectedKey}` : undefined;
  const interactive = Boolean(onSelect || onBucketActivate);
  const hasGroupedAxis = axisGroups.length > 0;
  const isDenseMonth = range === 'month';
  const topologyKey = `${range}:${buckets.map((bucket) => bucket.key).join('|')}`;
  const geometryTransition = reducedMotion
    ? { duration: 0 }
    : { duration: MOTION_DURATION_SECONDS, ease: 'easeOut' as const };
  const exitTransition = reducedMotion
    ? { duration: 0 }
    : { duration: EXIT_DURATION_SECONDS, ease: 'easeOut' as const };

  const activateBucket = useCallback(
    (key: string, trigger: HTMLElement) => {
      onSelect?.(key);
      onBucketActivate?.(key, trigger);
    },
    [onBucketActivate, onSelect],
  );

  const activateBucketAtClientX = useCallback(
    (clientX: number, target: HTMLElement, trigger: HTMLElement) => {
      if (!interactive || buckets.length === 0) return;
      const bounds = trigger.getBoundingClientRect();
      let index: number;

      if (bounds.width > 0) {
        const position = (clientX - bounds.left) / bounds.width;
        index = Math.floor(position * buckets.length);
      } else {
        const bucketTarget = target.closest<HTMLElement>('[data-bucket-index]');
        index = Number(bucketTarget?.dataset.bucketIndex ?? 0);
      }

      const boundedIndex = Math.max(0, Math.min(buckets.length - 1, index));
      activateBucket(buckets[boundedIndex].key, trigger);
    },
    [activateBucket, buckets, interactive],
  );

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
    activateBucket(buckets[nextIndex].key, event.currentTarget);
  };

  const handlePlotClick = (event: MouseEvent<HTMLDivElement>) => {
    activateBucketAtClientX(event.clientX, event.target as HTMLElement, event.currentTarget);
  };

  const handleTouchStart = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) {
      touchRef.current = null;
      suppressClickRef.current = true;
      return;
    }
    if (clickResetTimerRef.current !== null) {
      window.clearTimeout(clickResetTimerRef.current);
      clickResetTimerRef.current = null;
    }
    suppressClickRef.current = false;
    const touch = event.touches[0];
    touchRef.current = {
      identifier: touch.identifier,
      startX: touch.pageX,
      startY: touch.pageY,
      axis: null,
      cancelled: false,
    };
  }, []);

  const handleTouchMove = useCallback((event: TouchEvent) => {
    const gesture = touchRef.current;
    if (!gesture || gesture.cancelled) return;
    if (event.touches.length !== 1) {
      gesture.cancelled = true;
      suppressClickRef.current = true;
      return;
    }
    const touch = findTouch(event.touches, gesture.identifier);
    if (!touch) {
      gesture.cancelled = true;
      suppressClickRef.current = true;
      return;
    }
    const deltaX = touch.pageX - gesture.startX;
    const deltaY = touch.pageY - gesture.startY;
    if (gesture.axis === null) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < AXIS_LOCK_THRESHOLD_PX) return;
      gesture.axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
    }
    if (gesture.axis !== 'horizontal') return;
    if (event.cancelable) event.preventDefault();
    suppressClickRef.current = true;
  }, []);

  const scheduleClickReset = useCallback(() => {
    if (!suppressClickRef.current) return;
    if (clickResetTimerRef.current !== null) window.clearTimeout(clickResetTimerRef.current);
    clickResetTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      clickResetTimerRef.current = null;
    }, 0);
  }, []);

  const finishTouch = useCallback(
    (touch: IdentifiedTouch | null, cancelled: boolean, target: HTMLElement) => {
      const gesture = touchRef.current;
      if (!gesture) return;
      touchRef.current = null;
      if (cancelled || gesture.cancelled || !touch) {
        scheduleClickReset();
        return;
      }
      if (gesture.axis !== 'horizontal') return;

      suppressClickRef.current = true;
      const deltaX = touch.pageX - gesture.startX;
      if (Math.abs(deltaX) >= SWIPE_COMMIT_THRESHOLD_PX) {
        const nextKey = resolveAdjacentBucketKey(
          buckets,
          selectedKey,
          deltaX < 0 ? 'later' : 'earlier',
        );
        if (nextKey && nextKey !== selectedKey && plotRef.current) {
          activateBucket(nextKey, plotRef.current);
        }
      } else if (plotRef.current) {
        activateBucketAtClientX(touch.clientX, target, plotRef.current);
      }
      scheduleClickReset();
    },
    [
      activateBucket,
      activateBucketAtClientX,
      buckets,
      scheduleClickReset,
      selectedKey,
    ],
  );

  const handleTouchEnd = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      const gesture = touchRef.current;
      if (!gesture || findTouch(event.touches, gesture.identifier)) return;
      const touch = findTouch(event.changedTouches, gesture.identifier);
      finishTouch(touch, false, event.target as HTMLElement);
    },
    [finishTouch],
  );

  const handleTouchCancel = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      const gesture = touchRef.current;
      if (!gesture) return;
      const touch = findTouch(event.changedTouches, gesture.identifier);
      if (touch) finishTouch(touch, true, event.target as HTMLElement);
    },
    [finishTouch],
  );

  useEffect(() => {
    const plot = plotRef.current;
    if (!plot || !interactive) return;
    plot.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => plot.removeEventListener('touchmove', handleTouchMove);
  }, [handleTouchMove, interactive]);

  useEffect(
    () => () => {
      if (clickResetTimerRef.current !== null) window.clearTimeout(clickResetTimerRef.current);
    },
    [],
  );

  const bars = buckets.map((bucket, index) => {
    const positiveTotal = stackTotal(bucket, 'positive');
    const negativeTotal = stackTotal(bucket, 'negative');
    const muted = selectedKey !== null && selectedKey !== undefined && selectedKey !== bucket.key;
    const positiveHeight = `${(positiveTotal / maximumPositive) * positiveArea}%`;
    const negativeHeight = maximumNegative > 0
      ? `${(negativeTotal / maximumNegative) * negativeArea}%`
      : '0%';
    const stack = (
      <>
        <motion.span
          data-testid={`positive-stack-${bucket.key}`}
          className={cn(
            'absolute flex flex-col-reverse overflow-hidden rounded-t-[3px]',
            isDenseMonth ? 'inset-x-0' : 'inset-x-1',
          )}
          initial={{ height: '0%', opacity: 0 }}
          animate={{
            bottom: `${negativeArea}%`,
            height: positiveHeight,
            opacity: muted ? 0.25 : 1,
            filter: muted ? 'grayscale(1)' : 'grayscale(0)',
          }}
          transition={geometryTransition}
        >
          <AnimatePresence initial={false}>
            {bucket.segments
              .filter((segment) => segment.amount > 0)
              .map((segment) => {
                const item = seriesByKey.get(segment.seriesKey);
                if (!item) return null;
                return (
                  <motion.span
                    key={segment.seriesKey}
                    data-testid={`segment-${bucket.key}-${segment.seriesKey}`}
                    data-tone={item.tone}
                    data-direction="positive"
                    className={ANALYTICS_TONE_BACKGROUND_CLASSES[item.tone]}
                    style={{ flexBasis: 0 }}
                    initial={{ flexGrow: 0, opacity: 0 }}
                    animate={{ flexGrow: segment.amount, opacity: 1 }}
                    exit={{ flexGrow: 0, opacity: 0 }}
                    transition={geometryTransition}
                  />
                );
              })}
          </AnimatePresence>
        </motion.span>
        <motion.span
          data-testid={`negative-stack-${bucket.key}`}
          className={cn(
            'absolute flex flex-col overflow-hidden rounded-b-[3px]',
            isDenseMonth ? 'inset-x-0' : 'inset-x-1',
          )}
          initial={{ height: '0%', opacity: 0 }}
          animate={{
            top: `${positiveArea}%`,
            height: negativeHeight,
            opacity: muted ? 0.25 : 1,
            filter: muted ? 'grayscale(1)' : 'grayscale(0)',
          }}
          transition={geometryTransition}
        >
          <AnimatePresence initial={false}>
            {bucket.segments
              .filter((segment) => segment.amount < 0)
              .map((segment) => {
                const item = seriesByKey.get(segment.seriesKey);
                if (!item) return null;
                return (
                  <motion.span
                    key={segment.seriesKey}
                    data-testid={`segment-${bucket.key}-${segment.seriesKey}`}
                    data-tone={item.tone}
                    data-direction="negative"
                    className={ANALYTICS_TONE_BACKGROUND_CLASSES[item.tone]}
                    style={{ flexBasis: 0 }}
                    initial={{ flexGrow: 0, opacity: 0 }}
                    animate={{ flexGrow: Math.abs(segment.amount), opacity: 1 }}
                    exit={{ flexGrow: 0, opacity: 0 }}
                    transition={geometryTransition}
                  />
                );
              })}
          </AnimatePresence>
        </motion.span>
        {maximumNegative > 0 ? (
          <motion.span
            className="absolute inset-x-0 border-t border-border/70"
            animate={{ top: `${positiveArea}%` }}
            transition={geometryTransition}
          />
        ) : null}
      </>
    );

    return (
      <motion.div
        key={`${topologyKey}:${bucket.key}`}
        layout="position"
        className={cn(
          'grid h-full min-w-0 flex-1 items-center',
          hasGroupedAxis || isDenseMonth
            ? 'grid-rows-[minmax(4px,1fr)]'
            : 'grid-rows-[minmax(4px,1fr)_auto] gap-1',
        )}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{
          layout: geometryTransition,
          opacity: exitTransition,
          y: geometryTransition,
        }}
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
        {hasGroupedAxis || isDenseMonth ? null : (
          <span
            data-testid={`analytics-label-${bucket.key}`}
            className="min-h-2.5 truncate text-center text-[9px] leading-none text-muted-foreground"
          >
            {showLabel(index, buckets) ? bucket.label : null}
          </span>
        )}
      </motion.div>
    );
  });

  return (
    <figure className={cn('flex flex-col', className)} aria-label={`Expense trend: ${summary}`}>
      {interactive ? (
        <div
          ref={plotRef}
          role="listbox"
          aria-label="Select analytics period"
          aria-activedescendant={selectedOptionId}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onClick={handlePlotClick}
          onClickCapture={(event) => {
            if (!suppressClickRef.current) return;
            event.preventDefault();
            event.stopPropagation();
            suppressClickRef.current = false;
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
          data-testid="analytics-chart-plot"
          data-home-carousel-swipe-lock="true"
          className={cn(
            'flex min-h-0 flex-1 items-stretch rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
            isDenseMonth ? 'gap-px' : 'gap-1',
          )}
        >
          <AnimatePresence initial={false} mode="popLayout">{bars}</AnimatePresence>
        </div>
      ) : (
        <div
          data-testid="analytics-chart-plot"
          data-home-carousel-swipe-lock="true"
          className={cn(
            'flex min-h-0 flex-1 items-stretch',
            isDenseMonth ? 'gap-px' : 'gap-1',
          )}
          aria-hidden="true"
        >
          <AnimatePresence initial={false} mode="popLayout">{bars}</AnimatePresence>
        </div>
      )}
      {isDenseMonth ? (
        <div
          data-testid="analytics-month-axis"
          aria-hidden="true"
          className="mt-1 flex shrink-0 gap-px text-[9px] leading-none text-muted-foreground"
        >
          {buckets.map((bucket, index) => (
            <span
              key={bucket.key}
              data-testid="analytics-month-axis-label"
              className="min-w-0 flex-1 text-center"
            >
              {getMonthAxisLabel(bucket, index)}
            </span>
          ))}
        </div>
      ) : hasGroupedAxis ? (
        <div
          data-testid="analytics-grouped-axis"
          aria-hidden="true"
          className="mt-1 flex shrink-0 gap-1 text-[9px] leading-none text-muted-foreground"
        >
          {axisGroups.map((group) => (
            <span
              key={group.key}
              className="flex min-w-0 items-center gap-1"
              style={{ flexBasis: 0, flexGrow: group.bucketCount }}
            >
              <span
                data-testid="analytics-axis-rule"
                className="h-px min-w-0 flex-1 bg-border/70"
              />
              <span>{group.label}</span>
              <span
                data-testid="analytics-axis-rule"
                className="h-px min-w-0 flex-1 bg-border/70"
              />
            </span>
          ))}
        </div>
      ) : null}
    </figure>
  );
}
