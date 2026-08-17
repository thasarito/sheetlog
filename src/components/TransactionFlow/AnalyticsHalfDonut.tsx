import { formatAnalyticsAmount, type AnalyticsCategory, type AnalyticsSeries } from './analytics';
import {
  ANALYTICS_TONE_STROKE_CLASSES,
  getAnalyticsSeriesBreakdown,
} from './analyticsPresentation';

type AnalyticsHalfDonutProps = {
  series: AnalyticsSeries[];
  categories: AnalyticsCategory[];
  expenseTotal: number;
  currency: string;
};

const ARC_PATH = 'M 12 96 A 88 88 0 0 1 188 96';

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

  return (
    <figure
      aria-label={`Spending by category: ${accessibleBreakdown}. Expenses ${formatAnalyticsAmount(expenseTotal, currency)}`}
      className="relative mx-auto w-full max-w-60"
    >
      <svg viewBox="0 0 200 108" aria-hidden="true" className="block w-full">
        <path
          d={ARC_PATH}
          pathLength="100"
          fill="none"
          strokeWidth="18"
          strokeLinecap="butt"
          className="stroke-surface-3"
        />
        {breakdown.map((item) => {
          if (item.share <= 0) return null;
          const currentOffset = offset;
          offset += item.share;
          const visibleShare = Math.max(0.75, item.share - 1.1);
          return (
            <path
              key={item.key}
              data-testid={`donut-segment-${item.key}`}
              data-tone={item.tone}
              d={ARC_PATH}
              pathLength="100"
              fill="none"
              strokeWidth="18"
              strokeLinecap="butt"
              strokeDasharray={`${visibleShare} ${100 - visibleShare}`}
              strokeDashoffset={-currentOffset}
              className={ANALYTICS_TONE_STROKE_CLASSES[item.tone]}
            />
          );
        })}
        <text
          x="100"
          y="81"
          textAnchor="middle"
          className="fill-foreground text-[18px] font-semibold tabular-nums"
        >
          {formatAnalyticsAmount(expenseTotal, currency)}
        </text>
        <text
          x="100"
          y="99"
          textAnchor="middle"
          className="fill-muted-foreground text-[9px] font-medium uppercase tracking-wider"
        >
          Expenses
        </text>
      </svg>
    </figure>
  );
}
