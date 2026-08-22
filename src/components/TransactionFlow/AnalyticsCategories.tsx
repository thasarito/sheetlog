import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { HapticSelectionButton } from '../ui/HapticSelectionButton';
import {
  formatAnalyticsAmount,
  type AnalyticsCategory,
  type AnalyticsSeries,
} from './analytics';
import {
  DEFAULT_ANALYTICS_MOTION_INTENT,
  type AnalyticsMotionIntent,
} from './analyticsMotion';
import {
  ANALYTICS_TONE_BACKGROUND_CLASSES,
  getAnalyticsSeriesBreakdown,
  type AnalyticsSeriesBreakdown,
} from './analyticsPresentation';

type AnalyticsCategoriesProps = {
  series: AnalyticsSeries[];
  categories: AnalyticsCategory[];
  currency: string;
  selectedKey?: string | null;
  onSelect: (key: string | null) => void;
  motionIntent?: AnalyticsMotionIntent;
};

type AnalyticsCategorySceneProps = {
  children: (isPresent: boolean) => ReactNode;
  reducedMotion: boolean | null;
  sceneKey: string;
};

const TRACK_SEGMENTS = 16;
const CALM_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const MotionHapticSelectionButton = motion(HapticSelectionButton);

function getSeriesSignature(series: AnalyticsSeries[]): string {
  return series.map((item) => `${item.label}\u0000${item.tone}`).join('\u0001');
}

function AnalyticsCategoryScene({
  children,
  reducedMotion,
  sceneKey,
}: AnalyticsCategorySceneProps) {
  const isPresent = useIsPresent();
  const transition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.16, ease: CALM_EASE };

  return (
    <motion.div
      data-testid={isPresent ? 'analytics-category-scene' : undefined}
      data-category-scene-key={sceneKey}
      aria-hidden={isPresent ? undefined : true}
      style={{ pointerEvents: isPresent ? 'auto' : 'none' }}
      className="col-start-1 row-start-1 space-y-1"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={transition}
    >
      {children(isPresent)}
    </motion.div>
  );
}

function AnalyticsCategoryRow({
  item,
  currency,
  selected,
  interactive,
  onSelect,
}: {
  item: AnalyticsSeriesBreakdown;
  currency: string;
  selected: boolean;
  interactive: boolean;
  onSelect: (key: string | null) => void;
}) {
  const reducedMotion = useReducedMotion();
  const filledSegments = Math.round((item.share / 100) * TRACK_SEGMENTS);
  const clampedShare = Math.max(0, Math.min(100, item.share));
  const geometryTransition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: CALM_EASE };

  return (
    <MotionHapticSelectionButton
      layout="position"
      type="button"
      aria-label={`${item.label}, ${formatAnalyticsAmount(item.amount, currency)}, ${item.share}%`}
      aria-pressed={selected}
      disabled={!interactive}
      changesValue={interactive}
      tabIndex={interactive ? undefined : -1}
      data-series-key={item.key}
      data-semantic-key={item.label}
      data-zero={String(item.amount === 0)}
      data-nonpositive={String(item.amount <= 0)}
      onClick={() => onSelect(selected ? null : item.key)}
      className="w-full rounded-xl px-2 py-2 text-left transition-colors aria-pressed:bg-surface-2 data-[nonpositive=true]:opacity-55 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      initial={false}
      transition={{ layout: geometryTransition }}
    >
      <span className="flex items-center gap-2">
        <span
          className={cn(
            'h-2.5 w-2.5 shrink-0 rounded-full',
            ANALYTICS_TONE_BACKGROUND_CLASSES[item.tone],
          )}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</span>
        <span className="text-sm font-semibold tabular-nums">
          {formatAnalyticsAmount(item.amount, currency)}
        </span>
        <span className="w-8 text-right text-[11px] tabular-nums text-muted-foreground">
          {item.share}%
        </span>
      </span>
      <span
        data-testid={interactive ? `category-track-${item.key}` : undefined}
        data-filled-segments={filledSegments}
        data-share={item.share}
        className="relative mt-2 block h-1"
        aria-hidden="true"
      >
        <span className="absolute inset-0 grid grid-cols-16 gap-0.5">
          {Array.from({ length: TRACK_SEGMENTS }, (_, index) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative track positions have no identity
              key={index}
              data-testid={interactive ? 'category-track-segment' : undefined}
              data-filled={String(index < filledSegments)}
              className="h-1 rounded-full bg-surface-3"
            />
          ))}
        </span>
        <motion.span
          data-testid={interactive ? 'category-track-fill' : undefined}
          className="absolute inset-0 grid grid-cols-16 gap-0.5"
          style={{ willChange: reducedMotion ? undefined : 'clip-path' }}
          initial={false}
          animate={{ clipPath: `inset(0 ${100 - clampedShare}% 0 0)` }}
          transition={geometryTransition}
        >
          {Array.from({ length: TRACK_SEGMENTS }, (_, index) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative track positions have no identity
              key={index}
              data-testid={interactive ? 'category-track-fill-segment' : undefined}
              className={cn(
                'h-1 rounded-full',
                ANALYTICS_TONE_BACKGROUND_CLASSES[item.tone],
              )}
            />
          ))}
        </motion.span>
      </span>
    </MotionHapticSelectionButton>
  );
}

export function AnalyticsCategories({
  series,
  categories,
  currency,
  selectedKey,
  onSelect,
  motionIntent = DEFAULT_ANALYTICS_MOTION_INTENT,
}: AnalyticsCategoriesProps) {
  const reducedMotion = useReducedMotion();
  const breakdown = getAnalyticsSeriesBreakdown(series, categories);
  const sceneKey = `${motionIntent.transitionKey}:${getSeriesSignature(series)}`;

  return (
    <div
      className="grid"
      data-motion-reason={motionIntent.reason}
      data-category-scene-key={sceneKey}
    >
      <AnimatePresence initial={false}>
        <AnalyticsCategoryScene
          key={sceneKey}
          reducedMotion={reducedMotion}
          sceneKey={sceneKey}
        >
          {(isPresent) =>
            breakdown.map((item) => (
              <AnalyticsCategoryRow
                key={item.label}
                item={item}
                currency={currency}
                selected={selectedKey === item.key}
                interactive={isPresent}
                onSelect={onSelect}
              />
            ))
          }
        </AnalyticsCategoryScene>
      </AnimatePresence>
    </div>
  );
}
