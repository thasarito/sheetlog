"use client";

import React from "react";

interface TimePickerProps {
  value: Date; // We extract time from this date
  onChange: (newDate: Date) => void;
}

const MINUTES_IN_DAY = 24 * 60;
const TICK_COUNT = 24 * 4 + 1; // 15-min ticks

export function TimePicker({ value, onChange }: TimePickerProps) {
  const currentHour = value.getHours();
  const currentMinute = value.getMinutes();
  const totalMinutes = currentHour * 60 + currentMinute;
  const percent = (totalMinutes / (MINUTES_IN_DAY - 1)) * 100;

  const setTimeFromMinutes = (minutes: number) => {
    const clamped = Math.max(0, Math.min(MINUTES_IN_DAY - 1, minutes));
    const newDate = new Date(value);
    newDate.setHours(Math.floor(clamped / 60));
    newDate.setMinutes(clamped % 60);
    newDate.setSeconds(0);
    newDate.setMilliseconds(0);
    onChange(newDate);
  };

  const setTimeFromDate = (source: Date) => {
    const newDate = new Date(value);
    newDate.setHours(source.getHours());
    newDate.setMinutes(source.getMinutes());
    newDate.setSeconds(0);
    newDate.setMilliseconds(0);
    onChange(newDate);
  };

  const handleQuickOffset = (offsetMinutes: number) => {
    const base = new Date();
    base.setMinutes(base.getMinutes() + offsetMinutes);
    setTimeFromDate(base);
  };

  const formattedTime = `${currentHour
    .toString()
    .padStart(2, "0")}:${currentMinute.toString().padStart(2, "0")}`;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold text-slate-100">
          {formattedTime}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setTimeFromDate(new Date())}
            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300 hover:border-white/20"
          >
            Now
          </button>
          <button
            type="button"
            onClick={() => handleQuickOffset(15)}
            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300 hover:border-white/20"
          >
            +15
          </button>
          <button
            type="button"
            onClick={() => handleQuickOffset(30)}
            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300 hover:border-white/20"
          >
            +30
          </button>
        </div>
      </div>

      <div className="relative mt-4 h-12 w-full overflow-visible">
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-white/10" />
        <div
          className="absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-emerald-400/30"
          style={{ width: `${percent}%` }}
        />
        <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between px-1">
          {Array.from({ length: TICK_COUNT }).map((_, i) => {
            const isHour = i % 4 === 0;
            return (
              <span
                key={`tick-${i.toString()}`}
                className={`block w-px ${
                  isHour ? "h-4 bg-white/30" : "h-2 bg-white/15"
                }`}
                aria-hidden="true"
              />
            );
          })}
        </div>
        <div
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-200 bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.45)]"
          style={{ left: `${percent}%` }}
        />
        <input
          type="range"
          min={0}
          max={MINUTES_IN_DAY - 1}
          step={1}
          value={totalMinutes}
          onChange={(event) => setTimeFromMinutes(Number(event.target.value))}
          className="absolute inset-0 h-12 w-full cursor-pointer opacity-0"
          aria-label="Time slider"
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-slate-500">
        <span>00:00</span>
        <span>12:00</span>
        <span>23:59</span>
      </div>
    </div>
  );
}
