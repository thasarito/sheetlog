"use client";

import { Delete } from "lucide-react";

interface KeypadProps {
  value: string;
  onChange: (next: string) => void;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "DEL"];

export function Keypad({ value, onChange }: KeypadProps) {
  function handleKey(key: string) {
    if (key === "DEL") {
      onChange(value.slice(0, -1));
      return;
    }
    if (key === ".") {
      if (value.includes(".")) {
        return;
      }
      onChange(value ? `${value}.` : "0.");
      return;
    }
    onChange(`${value}${key}`.replace(/^0+(\d)/, "$1"));
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className="flex h-14 select-none touch-manipulation items-center justify-center rounded-2xl text-lg font-semibold text-foreground transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:scale-90"
          onClick={() => handleKey(key)}
          aria-label={key === "DEL" ? "Backspace" : undefined}
        >
          {key === "DEL" ? <Delete className="h-5 w-5" /> : key}
        </button>
      ))}
    </div>
  );
}
