import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'framer-motion';
import { formatAnalyticsAmount, type AnalyticsCategory, type AnalyticsSeries } from './analytics';
import {
  DEFAULT_ANALYTICS_MOTION_INTENT,
  type AnalyticsMotionIntent,
} from './analyticsMotion';
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
  motionIntent?: AnalyticsMotionIntent;
};

type DonutArc = AnalyticsSeriesBreakdown & {
  offset: number;
  visibleShare: number;
};

type AnalyticsDonutSceneProps = {
  arcs: DonutArc[];
  reducedMotion: boolean | null;
  sceneKey: string;
};

const ARC_PATH = 'M 12 96 A 88 88 0 0 1 188 96';
const CALM_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

function getSeriesSignature(series: AnalyticsSeries[]): string {
  return series.map((item) => `${item.label}\u0000${item.tone}`).join('\u0001');
}

function AnalyticsDonutArc({
  item,
  scenePresent,
}: {
  item: DonutArc;
  scenePresent: boolean;
}) {
  const isPresent = useIsPresent();
  const reducedMotion = useReducedMotion();
  const geometryTransition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.24, ease: CALM_EASE };
  const opacityTransition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.14, ease: CALM_EASE };

  return (
    <motion.path
      data-testid={scenePresent && isPresent ? `donut-segment-${item.key}` : undefined}
      data-semantic-key={item.label}
      data-tone={item.tone}
      aria-hidden={scenePresent && isPresent ? undefined : true}
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
      transition={{
        opacity: opacityTransition,
        strokeDasharray: geometryTransition,
        strokeDashoffset: geometryTransition,
      }}
    />
  );
}

function AnalyticsDonutScene({
  arcs,
  reducedMotion,
  sceneKey,
}: AnalyticsDonutSceneProps) {
  const isPresent = useIsPresent();
  const transition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.16, ease: CALM_EASE };

  return (
    <motion.g
      data-testid={isPresent ? 'analytics-donut-scene' : undefined}
      data-donut-scene-key={sceneKey}
      aria-hidden={isPresent ? undefined : true}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={transition}
    >
      <AnimatePresence initial={false}>
        {arcs.map((item) => (
          <AnalyticsDonutArc key={item.label} item={item} scenePresent={isPresent} />
        ))}
      </AnimatePresence>
    </motion.g>
  );
}

export function AnalyticsHalfDonut({
  series,
  categories,
  expenseTotal,
  currency,
  motionIntent = DEFAULT_ANALYTICS_MOTION_INTENT,
}: AnalyticsHalfDonutProps) {
  const reducedMotion = useReducedMotion();
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
  const sceneKey = `${motionIntent.transitionKey}:${getSeriesSignature(series)}`;

  return (
    <figure
      aria-label={`Spending by category: ${accessibleBreakdown}. Expenses ${formatAnalyticsAmount(expenseTotal, currency)}`}
      className="relative mx-auto w-full max-w-60"
      data-motion-reason={motionIntent.reason}
      data-donut-scene-key={sceneKey}
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
          <AnalyticsDonutScene
            key={sceneKey}
            arcs={arcs}
            reducedMotion={reducedMotion}
            sceneKey={sceneKey}
          />
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
