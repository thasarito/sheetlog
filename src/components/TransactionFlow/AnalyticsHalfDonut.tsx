import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'framer-motion';
import { formatAnalyticsAmount, type AnalyticsCategory, type AnalyticsSeries } from './analytics';
import { AnalyticsNumber } from './AnalyticsNumber';
import {
  ANALYTICS_TONE_STROKE_CLASSES,
  getAnalyticsSeriesBreakdown,
  type AnalyticsSeriesBreakdown,
} from './analyticsPresentation';

type AnalyticsHalfDonutProps = {
  series: AnalyticsSeries[];
  categories: AnalyticsCategory[];
  expenseTotal: number;
  currency: string;
};

type DonutArc = AnalyticsSeriesBreakdown & {
  offset: number;
  visibleShare: number;
};

const ARC_PATH = 'M 12 96 A 88 88 0 0 1 188 96';

function AnalyticsDonutArc({ item }: { item: DonutArc }) {
  const isPresent = useIsPresent();
  const reducedMotion = useReducedMotion();
  const transition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.32, ease: 'easeOut' as const };

  return (
    <motion.path
      data-testid={`donut-segment-${item.key}`}
      data-semantic-key={item.label}
      data-tone={item.tone}
      aria-hidden={isPresent ? undefined : true}
      d={ARC_PATH}
      pathLength="100"
      fill="none"
      strokeWidth="18"
      strokeLinecap="butt"
      className={ANALYTICS_TONE_STROKE_CLASSES[item.tone]}
      initial={{ opacity: 0, strokeDasharray: '0 100', strokeDashoffset: -item.offset }}
      animate={{
        opacity: 1,
        strokeDasharray: `${item.visibleShare} ${100 - item.visibleShare}`,
        strokeDashoffset: -item.offset,
      }}
      exit={{ opacity: 0, strokeDasharray: '0 100' }}
      transition={transition}
    />
  );
}

export function AnalyticsHalfDonut({
  series,
  categories,
  expenseTotal,
  currency,
}: AnalyticsHalfDonutProps) {
  const breakdown = getAnalyticsSeriesBreakdown(series, categories);
  const accessibleBreakdown = breakdown
    .map((item) => `${item.label} ${item.share}%`)
    .join(', ');
  let offset = 0;
  const arcs: DonutArc[] = [];
  for (const item of breakdown) {
    if (item.share <= 0) continue;
    const currentOffset = offset;
    offset += item.share;
    arcs.push({
      ...item,
      offset: currentOffset,
      visibleShare: Math.max(0.75, item.share - 1.1),
    });
  }

  return (
    <figure
      aria-label={`Spending by category: ${accessibleBreakdown}. Expenses ${formatAnalyticsAmount(expenseTotal, currency)}`}
      className="relative mx-auto w-full max-w-60"
    >
      <svg viewBox="0 -3 200 112" aria-hidden="true" className="block w-full overflow-visible">
        <path
          d={ARC_PATH}
          pathLength="100"
          fill="none"
          strokeWidth="18"
          strokeLinecap="butt"
          className="stroke-surface-3"
        />
        <AnimatePresence initial={false}>
          {arcs.map((item) => (
            <AnalyticsDonutArc key={item.label} item={item} />
          ))}
        </AnimatePresence>
        <text
          x="100"
          y="99"
          textAnchor="middle"
          className="fill-muted-foreground text-[9px] font-medium uppercase tracking-wider"
        >
          Expenses
        </text>
      </svg>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[69%] -translate-x-1/2 -translate-y-1/2 text-[18px] font-semibold tabular-nums"
      >
        <AnalyticsNumber value={expenseTotal} presentation="currency" currency={currency} />
      </div>
    </figure>
  );
}
