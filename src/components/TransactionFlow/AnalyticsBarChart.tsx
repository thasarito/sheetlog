import { cn } from '../../lib/utils';
import { formatAnalyticsAmount, type AnalyticsBucket } from './analytics';

type AnalyticsBarChartProps = {
  buckets: AnalyticsBucket[];
  currency: string;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  className?: string;
};

export function AnalyticsBarChart({
  buckets,
  currency,
  selectedKey,
  onSelect,
  className,
}: AnalyticsBarChartProps) {
  const maximum = Math.max(1, ...buckets.map((bucket) => Math.abs(bucket.amount)));
  const hasNegative = buckets.some((bucket) => bucket.amount < 0);
  const summary = buckets
    .map((bucket) => `${bucket.label} ${formatAnalyticsAmount(bucket.amount, currency)}`)
    .join(', ');

  return (
    <figure className={className} aria-label={`Expense trend: ${summary}`}>
      <div className="flex h-full items-stretch gap-2" aria-hidden={onSelect ? undefined : true}>
        {buckets.map((bucket) => {
          const negative = bucket.amount < 0;
          const availableHeight = hasNegative ? 50 : 100;
          const bar = (
            <span
              className={cn(
                'absolute inset-x-1 bg-primary/55',
                negative ? 'top-1/2 rounded-b-sm bg-warning/55' : 'rounded-t-sm',
                selectedKey === bucket.key && 'bg-primary',
              )}
              style={{
                height:
                  bucket.amount === 0
                    ? '0%'
                    : `${Math.max(4, (Math.abs(bucket.amount) / maximum) * availableHeight)}%`,
                bottom: negative ? undefined : hasNegative ? '50%' : 0,
              }}
            />
          );

          return (
            <div key={bucket.key} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1">
              {onSelect ? (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => onSelect(bucket.key)}
                  className="relative h-full w-full"
                >
                  {hasNegative ? (
                    <span className="absolute inset-x-0 top-1/2 border-t border-border/70" />
                  ) : null}
                  {bar}
                </button>
              ) : (
                <div className="relative h-full w-full">
                  {hasNegative ? (
                    <span className="absolute inset-x-0 top-1/2 border-t border-border/70" />
                  ) : null}
                  {bar}
                </div>
              )}
              <span className="text-[10px] text-muted-foreground">{bucket.label}</span>
            </div>
          );
        })}
      </div>
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}
