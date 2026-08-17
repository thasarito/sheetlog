import { cn } from '../../lib/utils';
import type { AnalyticsRange } from './analytics';

type AnalyticsRangeToggleProps = {
  value: AnalyticsRange;
  onChange: (range: AnalyticsRange) => void;
};

const OPTIONS: Array<{ value: AnalyticsRange; short: string; label: string }> = [
  { value: 'week', short: 'W', label: 'Week, last 7 days' },
  { value: 'month', short: 'M', label: 'Month, month to date' },
  { value: 'quarter', short: 'Q', label: 'Quarter, quarter to date' },
];

export function AnalyticsRangeToggle({ value, onChange }: AnalyticsRangeToggleProps) {
  return (
    <fieldset className="grid h-11 w-32 grid-cols-3 rounded-xl bg-surface-2 p-1">
      <legend className="sr-only">Analytics range</legend>
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-label={option.label}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
            value === option.value
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground',
          )}
        >
          {option.short}
        </button>
      ))}
    </fieldset>
  );
}
