import { format, parseISO } from 'date-fns';
import {
  AnimatePresence,
  motion,
  type Variants,
  useIsPresent,
  useReducedMotion,
} from 'framer-motion';
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
  useCallback,
  useEffect,
  useId,
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
import {
  DEFAULT_ANALYTICS_MOTION_INTENT,
  type AnalyticsMotionIntent,
} from './analyticsMotion';
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
  motionIntent?: AnalyticsMotionIntent;
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

type ChartSceneCustom = {
  intent: AnalyticsMotionIntent;
  reducedMotion: boolean;
};

type AnalyticsChartSceneProps = {
  children: (isPresent: boolean) => ReactNode;
  intent: AnalyticsMotionIntent;
  reducedMotion: boolean | null;
  sceneKey: string;
};

const AXIS_LOCK_THRESHOLD_PX = 6;
const SWIPE_COMMIT_THRESHOLD_PX = 32;
const GEOMETRY_DURATION_SECONDS = 0.24;
const EMPHASIS_DURATION_SECONDS = 0.16;
const SCENE_DURATION_SECONDS = 0.2;
const CALM_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const CHART_SCENE_VARIANTS: Variants = {
  enter: ({ intent, reducedMotion }: ChartSceneCustom) => {
    if (reducedMotion) return { opacity: 1, x: 0, scale: 1, transition: { duration: 0 } };
    if (intent.reason === 'period') {
      return {
        opacity: 0,
        x: intent.direction * 10,
        scale: 1,
        transition: { duration: SCENE_DURATION_SECONDS, ease: CALM_EASE },
      };
    }
    if (intent.reason === 'range') {
      return {
        opacity: 0,
        x: 0,
        scale: 1.01,
        transition: { duration: SCENE_DURATION_SECONDS, ease: CALM_EASE },
      };
    }
    return {
      opacity: 0,
      x: 0,
      scale: 1,
      transition: { duration: EMPHASIS_DURATION_SECONDS, ease: CALM_EASE },
    };
  },
  center: ({ reducedMotion }: ChartSceneCustom) => ({
    opacity: 1,
    x: 0,
    scale: 1,
    transition: reducedMotion
      ? { duration: 0 }
      : { duration: SCENE_DURATION_SECONDS, ease: CALM_EASE },
  }),
  exit: ({ intent, reducedMotion }: ChartSceneCustom) => {
    if (reducedMotion) return { opacity: 0, x: 0, scale: 1, transition: { duration: 0 } };
    if (intent.reason === 'period') {
      return {
        opacity: 0,
        x: intent.direction * -8,
        scale: 1,
        transition: { duration: SCENE_DURATION_SECONDS, ease: CALM_EASE },
      };
    }
    if (intent.reason === 'range') {
      return {
        opacity: 0,
        x: 0,
        scale: 0.99,
        transition: { duration: SCENE_DURATION_SECONDS, ease: CALM_EASE },
      };
    }
    return {
      opacity: 0,
      x: 0,
      scale: 1,
      transition: { duration: EMPHASIS_DURATION_SECONDS, ease: CALM_EASE },
    };
  },
};

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

function getSeriesSignature(series: AnalyticsSeries[]): string {
  return series.map((item) => `${item.label}\u0000${item.tone}`).join('\u0001');
}

function AnalyticsChartScene({
  children,
  intent,
  reducedMotion,
  sceneKey,
}: AnalyticsChartSceneProps) {
  const isPresent = useIsPresent();
  return (
    <motion.div
      data-testid={isPresent ? 'analytics-chart-scene' : undefined}
      data-chart-scene-key={sceneKey}
      data-motion-reason={intent.reason}
      data-motion-direction={intent.direction}
      variants={CHART_SCENE_VARIANTS}
      custom={{ intent, reducedMotion: Boolean(reducedMotion) }}
      initial={reducedMotion ? false : 'enter'}
      animate="center"
      exit="exit"
      aria-hidden={isPresent ? undefined : true}
      style={{ pointerEvents: isPresent ? 'auto' : 'none' }}
      className="col-start-1 row-start-1 flex min-h-0 flex-col"
    >
      {children(isPresent)}
    </motion.div>
  );
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
  motionIntent = DEFAULT_ANALYTICS_MOTION_INTENT,
  className,
}: AnalyticsBarChartProps) {
  const reducedMotion = useReducedMotion();
  const plotRef = useRef<HTMLDivElement | null>(null);
  const touchRef = useRef<ChartTouch | null>(null);
  const suppressClickRef = useRef(false);
  const clickResetTimerRef = useRef<number | null>(null);
  const selectionLayoutId = useId().replaceAll(':', '');
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
  const sceneKey = `${range}:${buckets.map((bucket) => bucket.key).join('|')}:${getSeriesSignature(series)}`;
  const geometryTransition = reducedMotion
    ? { duration: 0 }
    : { duration: GEOMETRY_DURATION_SECONDS, ease: CALM_EASE };
  const emphasisTransition = reducedMotion
    ? { duration: 0 }
    : { duration: EMPHASIS_DURATION_SECONDS, ease: CALM_EASE };
  const selectionTransition = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 520, damping: 42, mass: 0.55 };

  const setPlotRef = useCallback((node: HTMLDivElement | null) => {
    if (node) plotRef.current = node;
  }, []);

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
  }, [handleTouchMove, interactive, sceneKey]);

  useEffect(
    () => () => {
      if (clickResetTimerRef.current !== null) window.clearTimeout(clickResetTimerRef.current);
    },
    [],
  );

  const renderBars = (isPresent: boolean) => buckets.map((bucket, index) => {
    const positiveTotal = stackTotal(bucket, 'positive');
    const negativeTotal = stackTotal(bucket, 'negative');
    const muted = selectedKey !== null && selectedKey !== undefined && selectedKey !== bucket.key;
    const positiveHeight = `${(positiveTotal / maximumPositive) * positiveArea}%`;
    const negativeHeight =
      maximumNegative > 0 ? `${(negativeTotal / maximumNegative) * negativeArea}%` : '0%';
    const selectionMarker =
      selectedKey === bucket.key ? (
        <motion.span
          layoutId={`analytics-selected-bucket-${selectionLayoutId}-${sceneKey}`}
          data-testid={isPresent ? 'analytics-selected-bucket-marker' : undefined}
          className="pointer-events-none absolute inset-0 rounded-md bg-foreground/[0.045] dark:bg-foreground/[0.065]"
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={selectionTransition}
          aria-hidden="true"
        />
      ) : null;
    const stack = (
      <>
        <motion.span
          data-testid={isPresent ? `positive-stack-${bucket.key}` : undefined}
          data-muted={String(muted)}
          className={cn(
            'absolute flex flex-col-reverse overflow-hidden rounded-t-[3px]',
            isDenseMonth ? 'inset-x-0' : 'inset-x-1',
          )}
          initial={false}
          animate={{
            bottom: `${negativeArea}%`,
            height: positiveHeight,
            opacity: muted ? 0.45 : 1,
          }}
          transition={{
            bottom: geometryTransition,
            height: geometryTransition,
            opacity: emphasisTransition,
          }}
        >
          {bucket.segments.map((segment) => {
            const item = seriesByKey.get(segment.seriesKey);
            if (!item) return null;
            const amount = Math.max(0, segment.amount);
            return (
              <motion.span
                key={segment.seriesKey}
                data-testid={
                  isPresent && segment.amount >= 0
                    ? `segment-${bucket.key}-${segment.seriesKey}`
                    : undefined
                }
                data-tone={item.tone}
                data-direction="positive"
                className={ANALYTICS_TONE_BACKGROUND_CLASSES[item.tone]}
                style={{ flexBasis: 0 }}
                initial={false}
                animate={{ flexGrow: amount, opacity: amount > 0 ? 1 : 0 }}
                transition={geometryTransition}
              />
            );
          })}
        </motion.span>
        <motion.span
          data-testid={isPresent ? `negative-stack-${bucket.key}` : undefined}
          data-muted={String(muted)}
          className={cn(
            'absolute flex flex-col overflow-hidden rounded-b-[3px]',
            isDenseMonth ? 'inset-x-0' : 'inset-x-1',
          )}
          initial={false}
          animate={{
            top: `${positiveArea}%`,
            height: negativeHeight,
            opacity: muted ? 0.45 : 1,
          }}
          transition={{
            top: geometryTransition,
            height: geometryTransition,
            opacity: emphasisTransition,
          }}
        >
          {bucket.segments.map((segment) => {
            const item = seriesByKey.get(segment.seriesKey);
            if (!item) return null;
            const amount = Math.max(0, -segment.amount);
            return (
              <motion.span
                key={segment.seriesKey}
                data-testid={
                  isPresent && segment.amount < 0
                    ? `segment-${bucket.key}-${segment.seriesKey}`
                    : undefined
                }
                data-tone={item.tone}
                data-direction="negative"
                className={ANALYTICS_TONE_BACKGROUND_CLASSES[item.tone]}
                style={{ flexBasis: 0 }}
                initial={false}
                animate={{ flexGrow: amount, opacity: amount > 0 ? 1 : 0 }}
                transition={geometryTransition}
              />
            );
          })}
        </motion.span>
        {maximumNegative > 0 ? (
          <motion.span
            className="absolute inset-x-0 border-t border-border/70"
            initial={false}
            animate={{ top: `${positiveArea}%` }}
            transition={geometryTransition}
          />
        ) : null}
      </>
    );

    return (
      <div
        key={bucket.key}
        className={cn(
          'grid h-full min-w-0 flex-1 items-center',
          hasGroupedAxis || isDenseMonth
            ? 'grid-rows-[minmax(4px,1fr)]'
            : 'grid-rows-[minmax(4px,1fr)_auto] gap-1',
        )}
      >
        {interactive ? (
          <div
            id={isPresent ? `analytics-option-${bucket.key}` : undefined}
            role={isPresent ? 'option' : undefined}
            tabIndex={-1}
            aria-label={
              isPresent ? getAnalyticsBucketDescription(bucket, series, currency) : undefined
            }
            aria-selected={isPresent ? selectedKey === bucket.key : undefined}
            data-bucket-index={isPresent ? index : undefined}
            data-testid={isPresent ? `analytics-bar-${bucket.key}` : undefined}
            data-muted={String(muted)}
            className="relative isolate h-full min-h-11 w-full cursor-pointer"
          >
            {selectionMarker}
            {stack}
          </div>
        ) : (
          <div
            data-testid={isPresent ? `analytics-bar-${bucket.key}` : undefined}
            data-muted={String(muted)}
            className="relative isolate h-full w-full"
          >
            {selectionMarker}
            {stack}
          </div>
        )}
        {hasGroupedAxis || isDenseMonth ? null : (
          <span
            data-testid={isPresent ? `analytics-label-${bucket.key}` : undefined}
            className="min-h-2.5 truncate text-center text-[9px] leading-none text-muted-foreground"
          >
            {showLabel(index, buckets) ? bucket.label : null}
          </span>
        )}
      </div>
    );
  });

  const renderAxis = (isPresent: boolean) => {
    if (isDenseMonth) {
      return (
        <div
          data-testid={isPresent ? 'analytics-month-axis' : undefined}
          aria-hidden="true"
          className="mt-1 flex shrink-0 gap-px text-[9px] leading-none text-muted-foreground"
        >
          {buckets.map((bucket, index) => (
            <span
              key={bucket.key}
              data-testid={isPresent ? 'analytics-month-axis-label' : undefined}
              className="min-w-0 flex-1 text-center"
            >
              {getMonthAxisLabel(bucket, index)}
            </span>
          ))}
        </div>
      );
    }

    if (hasGroupedAxis) {
      return (
        <div
          data-testid={isPresent ? 'analytics-grouped-axis' : undefined}
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
                data-testid={isPresent ? 'analytics-axis-rule' : undefined}
                className="h-px min-w-0 flex-1 bg-border/70"
              />
              <span>{group.label}</span>
              <span
                data-testid={isPresent ? 'analytics-axis-rule' : undefined}
                className="h-px min-w-0 flex-1 bg-border/70"
              />
            </span>
          ))}
        </div>
      );
    }

    return null;
  };

  return (
    <figure
      className={cn('flex flex-col', className)}
      aria-label={`Expense trend: ${summary}`}
      data-motion-reason={motionIntent.reason}
      data-motion-direction={motionIntent.direction}
      data-chart-scene-key={sceneKey}
    >
      <div className="grid min-h-0 flex-1">
        <AnimatePresence
          initial={false}
          custom={{ intent: motionIntent, reducedMotion: Boolean(reducedMotion) }}
        >
          <AnalyticsChartScene
            key={sceneKey}
            intent={motionIntent}
            reducedMotion={reducedMotion}
            sceneKey={sceneKey}
          >
            {(isPresent) => (
              <>
                {interactive ? (
                  <div
                    ref={isPresent ? setPlotRef : undefined}
                    role={isPresent ? 'listbox' : undefined}
                    aria-label={isPresent ? 'Select analytics period' : undefined}
                    aria-activedescendant={isPresent ? selectedOptionId : undefined}
                    tabIndex={isPresent ? 0 : -1}
                    onKeyDown={handleKeyDown}
                    onClick={handlePlotClick}
                    onClickCapture={(event: MouseEvent<HTMLDivElement>) => {
                      if (!suppressClickRef.current) return;
                      event.preventDefault();
                      event.stopPropagation();
                      suppressClickRef.current = false;
                    }}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchCancel}
                    data-testid={isPresent ? 'analytics-chart-plot' : undefined}
                    data-home-carousel-swipe-lock="true"
                    className={cn(
                      'flex min-h-0 flex-1 items-stretch rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                      isDenseMonth ? 'gap-px' : 'gap-1',
                    )}
                  >
                    {renderBars(isPresent)}
                  </div>
                ) : (
                  <div
                    data-testid={isPresent ? 'analytics-chart-plot' : undefined}
                    data-home-carousel-swipe-lock="true"
                    className={cn(
                      'flex min-h-0 flex-1 items-stretch',
                      isDenseMonth ? 'gap-px' : 'gap-1',
                    )}
                    aria-hidden="true"
                  >
                    {renderBars(isPresent)}
                  </div>
                )}
                {renderAxis(isPresent)}
              </>
            )}
          </AnalyticsChartScene>
        </AnimatePresence>
      </div>
    </figure>
  );
}
