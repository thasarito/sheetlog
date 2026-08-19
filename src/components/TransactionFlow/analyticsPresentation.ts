import type {
  AnalyticsCategory,
  AnalyticsSeries,
  AnalyticsSeriesTone,
} from './analytics';

export const ANALYTICS_TONE_BACKGROUND_CLASSES: Record<AnalyticsSeriesTone, string> = {
  emerald: 'bg-chart-1',
  cyan: 'bg-chart-2',
  violet: 'bg-chart-3',
  rose: 'bg-chart-4',
  slate: 'bg-chart-5',
};

export const ANALYTICS_TONE_STROKE_CLASSES: Record<AnalyticsSeriesTone, string> = {
  emerald: 'stroke-chart-1',
  cyan: 'stroke-chart-2',
  violet: 'stroke-chart-3',
  rose: 'stroke-chart-4',
  slate: 'stroke-chart-5',
};

export type AnalyticsSeriesBreakdown = AnalyticsSeries & {
  amount: number;
  share: number;
};

export function getAnalyticsSeriesBreakdown(
  series: AnalyticsSeries[],
  categories: AnalyticsCategory[],
): AnalyticsSeriesBreakdown[] {
  const categoryAmounts = new Map(
    categories.map((category) => [category.category, category.amount]),
  );
  const amounts = series.map((item) =>
    item.categoryNames.reduce(
      (total, category) => total + (categoryAmounts.get(category) ?? 0),
      0,
    ),
  );
  const total = amounts.reduce((sum, amount) => sum + Math.max(0, amount), 0);

  return series.map((item, index) => ({
    ...item,
    amount: amounts[index],
    share: total > 0 ? Math.round((Math.max(0, amounts[index]) / total) * 100) : 0,
  }));
}
