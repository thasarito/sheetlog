import type {
  AnalyticsCategory,
  AnalyticsSeries,
  AnalyticsSeriesTone,
} from './analytics';

export const ANALYTICS_TONE_BACKGROUND_CLASSES: Record<AnalyticsSeriesTone, string> = {
  emerald: 'bg-emerald-500 dark:bg-emerald-400',
  cyan: 'bg-cyan-500 dark:bg-cyan-400',
  violet: 'bg-violet-500 dark:bg-violet-400',
  rose: 'bg-rose-500 dark:bg-rose-400',
  slate: 'bg-slate-400 dark:bg-slate-500',
};

export const ANALYTICS_TONE_STROKE_CLASSES: Record<AnalyticsSeriesTone, string> = {
  emerald: 'stroke-emerald-500 dark:stroke-emerald-400',
  cyan: 'stroke-cyan-500 dark:stroke-cyan-400',
  violet: 'stroke-violet-500 dark:stroke-violet-400',
  rose: 'stroke-rose-500 dark:stroke-rose-400',
  slate: 'stroke-slate-400 dark:stroke-slate-500',
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
