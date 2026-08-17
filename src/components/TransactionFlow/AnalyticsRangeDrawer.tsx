import { format, startOfDay } from "date-fns";
import { useEffect, useRef, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerNestedRoot,
  DrawerTitle,
} from "../ui/drawer";
import type { DatePeriod } from "./analytics";

type AnalyticsRangeDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: DatePeriod;
  minDate: Date;
  maxDate: Date;
  onApply: (period: DatePeriod) => void;
  nested?: boolean;
  returnFocusTo?: HTMLButtonElement | null;
};

function draftLabel(draft: DateRange): string {
  if (!draft.from) return "Select a start date";
  if (!draft.to) return `${format(draft.from, "MMM d")} – Select an end date`;
  return `${format(draft.from, "MMM d")} – ${format(draft.to, "MMM d")}`;
}

export function AnalyticsRangeDrawer({
  open,
  onOpenChange,
  value,
  minDate,
  maxDate,
  onApply,
  nested = false,
  returnFocusTo,
}: AnalyticsRangeDrawerProps) {
  const [draft, setDraft] = useState<DateRange>({
    from: value.start,
    to: value.end,
  });
  const titleRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef(returnFocusTo);
  const Root = nested ? DrawerNestedRoot : Drawer;
  const complete = Boolean(draft.from && draft.to);

  useEffect(() => {
    returnFocusRef.current = returnFocusTo;
  }, [returnFocusTo]);

  useEffect(() => {
    if (!open) return;
    setDraft({ from: value.start, to: value.end });
  }, [open, value.end, value.start]);

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      requestAnimationFrame(() => returnFocusRef.current?.focus());
    }
  };

  const apply = () => {
    if (!draft.from || !draft.to) return;
    onApply({
      start: startOfDay(draft.from),
      end: startOfDay(draft.to),
    });
    handleOpenChange(false);
  };

  return (
    <Root open={open} onOpenChange={handleOpenChange}>
      <DrawerContent
        className="sm:mx-auto sm:max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          if (!returnFocusRef.current) return;
          event.preventDefault();
          returnFocusRef.current.focus();
        }}
      >
        <DrawerHeader className="text-left">
          <DrawerTitle ref={titleRef} tabIndex={-1}>
            Custom date range
          </DrawerTitle>
          <DrawerDescription>
            Choose an inclusive start and end date.
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-3" data-vaul-no-drag>
          <p
            className="pb-2 text-sm font-semibold text-foreground"
            aria-live="polite"
          >
            {draftLabel(draft)}
          </p>
          <DayPicker
            mode="range"
            selected={draft}
            onSelect={(nextRange) =>
              setDraft(nextRange ?? { from: undefined })
            }
            resetOnSelect
            min={0}
            numberOfMonths={1}
            defaultMonth={value.end}
            startMonth={startOfDay(minDate)}
            endMonth={startOfDay(maxDate)}
            disabled={{
              before: startOfDay(minDate),
              after: startOfDay(maxDate),
            }}
            showOutsideDays
            navLayout="around"
            className="analytics-calendar"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <DrawerClose asChild>
            <button
              type="button"
              aria-label="Cancel custom range"
              className="min-h-11 rounded-2xl border border-border bg-card px-4 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              Cancel
            </button>
          </DrawerClose>
          <button
            type="button"
            aria-label="Apply custom range"
            disabled={!complete}
            onClick={apply}
            className="min-h-11 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Apply
          </button>
        </div>
      </DrawerContent>
    </Root>
  );
}
