import { cn } from '../../lib/utils';
import type { AnalyticsRange } from './analytics';

type AnalyticsRangeToggleProps = {
  value: AnalyticsRange;
  onChange: (range: AnalyticsRange, trigger?: HTMLButtonElement) => void;
};

const OPTIONS: Array<{ value: AnalyticsRange; short: string; label: string }> = [
  { value: 'week', short: 'W', label: 'Week, last 7 days' },
  { value: 'month', short: 'M', label: 'Month, month to date' },
  { value: 'quarter', short: 'Q', label: 'Quarter, quarter to date' },
  { value: 'year', short: 'Y', label: 'Year, year to date' },
  { value: 'custom', short: 'C', label: 'Custom date range' },
];

export function AnalyticsRangeToggle({ value, onChange }: AnalyticsRangeToggleProps) {
  return (
    <fieldset
      className="grid h-11 w-44 grid-cols-5 rounded-xl bg-surface-2 p-1"
      aria-label="Analytics range"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-label={option.label}
          aria-pressed={value === option.value}
          onClick={(event) => onChange(option.value, event.currentTarget)}
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
