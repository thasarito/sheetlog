"use client";

import React from "react";
import { format, addDays, isSameDay, addMonths, subMonths } from "date-fns";

interface DateScrollerProps {
  value: Date;
  onChange: (date: Date) => void;
}

export function DateScroller({ value, onChange }: DateScrollerProps) {
  const today = new Date();
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(value, i - 3));

  const handleMonthChange = (direction: number) => {
    const newDate = direction > 0 ? addMonths(value, 1) : subMonths(value, 1);
    onChange(newDate);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => handleMonthChange(-1)}
          aria-label="Previous month"
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300 hover:border-white/20"
        >
          ←
        </button>
        <div className="text-sm font-semibold text-slate-100">
          {format(value, "MMMM yyyy")}
        </div>
        <button
          type="button"
          onClick={() => handleMonthChange(1)}
          aria-label="Next month"
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300 hover:border-white/20"
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {weekDates.map((date) => {
          const isSelected = isSameDay(date, value);
          const isToday = isSameDay(date, today);

          return (
            <button
              key={date.toISOString()}
              type="button"
              onClick={() => onChange(date)}
              className={`flex flex-col items-center justify-center rounded-xl border px-2 py-2 text-xs transition ${
                isSelected
                  ? "bg-emerald-400 border-emerald-400 text-slate-950"
                  : "bg-white/5 border-white/10 text-slate-300 hover:border-white/20"
              }`}
            >
              <span className="text-[10px] uppercase tracking-wide opacity-70">
                {format(date, "EEE")}
              </span>
              <span className="text-sm font-semibold">{format(date, "d")}</span>
              <span
                className={`mt-1 h-1 w-1 rounded-full ${
                  isToday ? "bg-emerald-200" : "bg-transparent"
                }`}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
