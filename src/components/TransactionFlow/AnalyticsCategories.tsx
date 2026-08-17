import { cn } from '../../lib/utils';
import {
  formatAnalyticsAmount,
  type AnalyticsCategory,
  type AnalyticsSeries,
} from './analytics';
import {
  ANALYTICS_TONE_BACKGROUND_CLASSES,
  getAnalyticsSeriesBreakdown,
} from './analyticsPresentation';

type AnalyticsCategoriesProps = {
  series: AnalyticsSeries[];
  categories: AnalyticsCategory[];
  currency: string;
  selectedKey?: string | null;
  onSelect: (key: string | null) => void;
};

const TRACK_SEGMENTS = 16;

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
      {breakdown.map((item) => {
        const filledSegments = Math.round((item.share / 100) * TRACK_SEGMENTS);
        const selected = selectedKey === item.key;
        return (
          <button
            key={item.key}
            type="button"
            aria-label={`${item.label}, ${formatAnalyticsAmount(item.amount, currency)}, ${item.share}%`}
            aria-pressed={selected}
            data-series-key={item.key}
            data-zero={String(item.amount === 0)}
            onClick={() => onSelect(selected ? null : item.key)}
            className="w-full rounded-xl px-2 py-2 text-left transition-colors aria-pressed:bg-surface-2 data-[zero=true]:opacity-55 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <span className="flex items-center gap-2">
              <span
                className={cn('h-2.5 w-2.5 shrink-0 rounded-full', ANALYTICS_TONE_BACKGROUND_CLASSES[item.tone])}
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
              data-testid={`category-track-${item.key}`}
              className="mt-2 grid grid-cols-16 gap-0.5"
              aria-hidden="true"
            >
              {Array.from({ length: TRACK_SEGMENTS }, (_, index) => {
                const filled = index < filledSegments;
                return (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative track positions have no identity
                    key={index}
                    data-testid="category-track-segment"
                    data-filled={String(filled)}
                    className={cn(
                      'h-1 rounded-full',
                      filled ? ANALYTICS_TONE_BACKGROUND_CLASSES[item.tone] : 'bg-surface-3',
                    )}
                  />
                );
              })}
            </span>
          </button>
        );
      })}
    </div>
  );
}
