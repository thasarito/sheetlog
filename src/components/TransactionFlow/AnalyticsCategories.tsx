import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'framer-motion';
import { cn } from '../../lib/utils';
import {
  formatAnalyticsAmount,
  type AnalyticsCategory,
  type AnalyticsSeries,
} from './analytics';
import { AnalyticsNumber } from './AnalyticsNumber';
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
};

const TRACK_SEGMENTS = 16;

function AnalyticsCategoryRow({
  item,
  currency,
  selected,
  onSelect,
}: {
  item: AnalyticsSeriesBreakdown;
  currency: string;
  selected: boolean;
  onSelect: (key: string | null) => void;
}) {
  const isPresent = useIsPresent();
  const reducedMotion = useReducedMotion();
  const filledSegments = Math.round((item.share / 100) * TRACK_SEGMENTS);
  const geometryTransition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.32, ease: 'easeOut' as const };
  const presenceTransition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.24, ease: 'easeOut' as const };

  return (
    <motion.button
      layout="position"
      type="button"
      aria-label={`${item.label}, ${formatAnalyticsAmount(item.amount, currency)}, ${item.share}%`}
      aria-pressed={selected}
      aria-hidden={isPresent ? undefined : true}
      disabled={!isPresent}
      tabIndex={isPresent ? undefined : -1}
      data-series-key={item.key}
      data-semantic-key={item.label}
      data-zero={String(item.amount === 0)}
      data-nonpositive={String(item.amount <= 0)}
      onClick={() => onSelect(selected ? null : item.key)}
      className="w-full rounded-xl px-2 py-2 text-left transition-colors aria-pressed:bg-surface-2 data-[nonpositive=true]:opacity-55 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{
        layout: geometryTransition,
        opacity: presenceTransition,
        y: presenceTransition,
      }}
    >
      <span className="flex items-center gap-2">
        <span
          className={cn(
            'h-2.5 w-2.5 shrink-0 rounded-full',
            ANALYTICS_TONE_BACKGROUND_CLASSES[item.tone],
          )}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</span>
        <AnalyticsNumber
          value={item.amount}
          presentation="currency"
          currency={currency}
          className="text-sm font-semibold"
        />
        <AnalyticsNumber
          value={item.share}
          presentation="percentage"
          className="w-8 justify-end text-[11px] text-muted-foreground"
        />
      </span>
      <span
        data-testid={`category-track-${item.key}`}
        className="mt-2 grid grid-cols-16 gap-0.5"
        aria-hidden="true"
      >
        {Array.from({ length: TRACK_SEGMENTS }, (_, index) => {
          const filled = index < filledSegments;
          return (
            <motion.span
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative track positions have no identity
              key={index}
              data-testid="category-track-segment"
              data-filled={String(filled)}
              className={cn(
                'h-1 origin-left rounded-full',
                filled ? ANALYTICS_TONE_BACKGROUND_CLASSES[item.tone] : 'bg-surface-3',
              )}
              initial={false}
              animate={{ opacity: filled ? 1 : 0.45, scaleX: filled ? 1 : 0.72 }}
              transition={geometryTransition}
            />
          );
        })}
      </span>
    </motion.button>
  );
}

export function AnalyticsCategories({
  series,
  categories,
  currency,
  selectedKey,
  onSelect,
}: AnalyticsCategoriesProps) {
  const breakdown = getAnalyticsSeriesBreakdown(series, categories);

  return (
    <div className="space-y-1">
      <AnimatePresence initial={false}>
        {breakdown.map((item) => (
          <AnalyticsCategoryRow
            key={item.label}
            item={item}
            currency={currency}
            selected={selectedKey === item.key}
            onSelect={onSelect}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
