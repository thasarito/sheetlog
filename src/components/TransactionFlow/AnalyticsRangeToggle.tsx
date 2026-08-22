import { motion, useReducedMotion } from 'framer-motion';
import { useId } from 'react';
import { cn } from '../../lib/utils';
import { HapticSelectionButton } from '../ui/HapticSelectionButton';
import type { AnalyticsRange } from './analytics';

type AnalyticsRangeToggleProps = {
  value: AnalyticsRange;
  onChange: (range: AnalyticsRange, trigger?: HTMLButtonElement) => void;
};

const OPTIONS: Array<{ value: AnalyticsRange; short: string; label: string }> = [
  { value: 'week', short: 'W', label: 'Week' },
  { value: 'month', short: 'M', label: 'Month' },
  { value: 'quarter', short: 'Q', label: 'Quarter' },
  { value: 'year', short: 'Y', label: 'Year' },
  { value: 'custom', short: 'C', label: 'Custom date range' },
];

const RANGE_INDICATOR_SPRING = {
  type: 'spring' as const,
  stiffness: 520,
  damping: 44,
  mass: 0.6,
};

export function AnalyticsRangeToggle({ value, onChange }: AnalyticsRangeToggleProps) {
  const reducedMotion = useReducedMotion();
  const indicatorLayoutId = useId().replaceAll(':', '');
  const indicatorTransition = reducedMotion
    ? { duration: 0 }
    : RANGE_INDICATOR_SPRING;

  return (
    <fieldset
      className="grid h-11 w-44 grid-cols-5 rounded-xl bg-surface-2 p-1"
      aria-label="Analytics range"
    >
      {OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <HapticSelectionButton
            key={option.value}
            type="button"
            aria-label={option.label}
            aria-pressed={selected}
            changesValue={!selected && option.value !== 'custom'}
            onClick={(event) => onChange(option.value, event.currentTarget)}
            className={cn(
              'relative isolate overflow-hidden rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
              selected ? 'text-accent-foreground' : 'text-muted-foreground',
            )}
          >
            {selected ? (
              <motion.span
                layoutId={`analytics-range-indicator-${indicatorLayoutId}`}
                data-testid="analytics-range-indicator"
                data-analytics-range={option.value}
                className="pointer-events-none absolute inset-0 z-0 rounded-lg bg-accent"
                initial={false}
                transition={indicatorTransition}
                aria-hidden="true"
              />
            ) : null}
            <span className="relative z-10">{option.short}</span>
          </HapticSelectionButton>
        );
      })}
    </fieldset>
  );
}
