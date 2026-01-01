"use client";

import React, { useRef, useEffect } from "react";

interface TimePickerProps {
  value: Date; // We extract time from this date
  onChange: (newDate: Date) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

export function TimePicker({ value, onChange }: TimePickerProps) {
  const currentHour = value.getHours();
  const currentMinute = value.getMinutes();

  const handleHourChange = (hour: number) => {
    const newDate = new Date(value);
    newDate.setHours(hour);
    onChange(newDate);
  };

  const handleMinuteChange = (minute: number) => {
    const newDate = new Date(value);
    newDate.setMinutes(minute);
    onChange(newDate);
  };

  return (
    <div className="flex h-32 overflow-hidden rounded-2xl bg-white/5 border border-white/10 relative">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-10 bg-white/5 border-y border-white/10 pointer-events-none" />

      {/* Hours */}
      <div className="flex-1 overflow-y-auto snap-y snap-mandatory no-scrollbar py-[calc(50%-1.25rem)] text-center">
        {HOURS.map((hour) => (
          <button
            key={hour}
            type="button"
            onClick={() => handleHourChange(hour)}
            className={`snap-center h-10 flex items-center justify-center w-full text-lg font-semibold transition-opacity ${
              hour === currentHour
                ? "text-emerald-400 opacity-100"
                : "text-slate-400 opacity-30"
            }`}
          >
            {hour.toString().padStart(2, "0")}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-center text-slate-500 pb-1">
        :
      </div>

      {/* Minutes */}
      <div className="flex-1 overflow-y-auto snap-y snap-mandatory no-scrollbar py-[calc(50%-1.25rem)] text-center">
        {MINUTES.map((minute) => (
          <button
            key={minute}
            type="button"
            onClick={() => handleMinuteChange(minute)}
            className={`snap-center h-10 flex items-center justify-center w-full text-lg font-semibold transition-opacity ${
              minute === currentMinute
                ? "text-emerald-400 opacity-100"
                : "text-slate-400 opacity-30"
            }`}
          >
            {minute.toString().padStart(2, "0")}
          </button>
        ))}
      </div>
    </div>
  );
}
