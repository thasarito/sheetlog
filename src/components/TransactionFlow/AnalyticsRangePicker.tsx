import * as Popover from '@radix-ui/react-popover';
import { format, startOfDay } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
import type { DatePeriod } from './analytics';

type AnalyticsRangePickerProps = {
  value: DatePeriod;
  minDate: Date;
  maxDate: Date;
  onChange: (period: DatePeriod) => void;
};

function rangeLabel(period: DatePeriod): string {
  return `${format(period.start, 'MMM d')} – ${format(period.end, 'MMM d')}`;
}

export function AnalyticsRangePicker({
  value,
  minDate,
  maxDate,
  onChange,
}: AnalyticsRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>({ from: value.start, to: value.end });

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) setDraft({ from: value.start, to: value.end });
  };

  const handleSelect = (nextRange: DateRange | undefined) => {
    setDraft(nextRange ?? { from: undefined });
    if (!nextRange?.from || !nextRange.to) return;
    onChange({ start: startOfDay(nextRange.from), end: startOfDay(nextRange.to) });
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Custom date range, ${rangeLabel(value)}`}
          className="flex min-h-11 items-center gap-2 rounded-xl bg-surface-2 px-3 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span>{rangeLabel(value)}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          role="dialog"
          aria-label="Choose custom date range"
          align="end"
          sideOffset={8}
          collisionPadding={16}
          className="z-60 w-[calc(100vw-2rem)] max-w-84 rounded-2xl border border-border bg-background p-3 text-foreground focus:outline-none"
        >
          <DayPicker
            mode="range"
            selected={draft}
            onSelect={handleSelect}
            resetOnSelect
            numberOfMonths={1}
            defaultMonth={value.end}
            startMonth={startOfDay(minDate)}
            endMonth={startOfDay(maxDate)}
            disabled={{ before: startOfDay(minDate), after: startOfDay(maxDate) }}
            showOutsideDays
            navLayout="around"
            className="analytics-calendar"
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
