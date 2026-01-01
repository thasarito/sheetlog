"use client";

import React, { useRef, useEffect } from "react";
import { format, addDays, isSameDay, subDays } from "date-fns";

interface DateScrollerProps {
  value: Date;
  onChange: (date: Date) => void;
}

export function DateScroller({ value, onChange }: DateScrollerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = new Date();

  // Generate a range of dates: 30 days past, 7 days future
  const dates = Array.from({ length: 38 }, (_, i) => subDays(today, 30 - i));

  useEffect(() => {
    // Scroll to selected date on mount or value change if needed
    // Simple implementation: Just ensure it's visible?
    // Better: Scroll center
    if (scrollRef.current) {
      // Find the selected element or default to today (usually end of list)
      // This is a rough approximation for auto-scroll
    }
  }, []);

  return (
    <div className="relative w-full overflow-hidden mask-gradient-x">
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto px-[50%] no-scrollbar snap-x snap-mandatory py-4"
      >
        {dates.map((date) => {
          const isSelected = isSameDay(date, value);
          const isToday = isSameDay(date, today);
          const isYesterday = isSameDay(date, subDays(today, 1));

          let label = format(date, "d");
          let subLabel = format(date, "MMM");

          if (isToday) {
            subLabel = "Today";
          } else if (isYesterday) {
            subLabel = "Yest";
          }

          return (
            <button
              key={date.toISOString()}
              type="button"
              onClick={() => onChange(date)}
              className={`snap-center shrink-0 flex flex-col items-center justify-center w-12 h-14 rounded-xl border transition-all ${
                isSelected
                  ? "bg-emerald-400 border-emerald-400 text-slate-950 scale-110 z-10"
                  : "bg-white/5 border-white/10 text-slate-400"
              }`}
            >
              <span className="text-sm font-bold leading-none">{label}</span>
              <span className="text-[10px] uppercase leading-tight opacity-80">
                {subLabel}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
