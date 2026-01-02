"use client";

import { format } from "date-fns";
import { DateScroller } from "./DateScroller";
import { TimePicker } from "./TimePicker";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "./ui/drawer";

type DateTimeDrawerProps = {
  value: Date;
  onChange: (nextValue: Date) => void;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
  onConfirm?: () => void;
};

export function DateTimeDrawer({
  value,
  onChange,
  defaultOpen = false,
  open,
  onOpenChange,
  showTrigger = true,
  onConfirm,
}: DateTimeDrawerProps) {
  const dateLabel = format(value, "EEE, MMM d");
  const timeLabel = format(value, "HH:mm");

  return (
    <Drawer open={open} onOpenChange={onOpenChange} defaultOpen={defaultOpen}>
      {showTrigger ? (
        <DrawerTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left shadow-sm transition hover:border-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <div>
              <div className="text-sm font-semibold text-foreground">
                {dateLabel}
              </div>
              <div className="text-xs text-muted-foreground">{timeLabel}</div>
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest text-primary">
              Edit
            </span>
          </button>
        </DrawerTrigger>
      ) : null}
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>Date & time</DrawerTitle>
          <DrawerDescription>
            Choose when this transaction happened.
          </DrawerDescription>
        </DrawerHeader>
        <div className="space-y-4 px-4 pb-2">
          <DateScroller value={value} onChange={onChange} />
          <TimePicker value={value} onChange={onChange} />
        </div>
        <DrawerFooter className="px-4 pb-6">
          <DrawerClose asChild>
            <button
              type="button"
              className="w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm"
              onClick={onConfirm}
            >
              Done
            </button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
