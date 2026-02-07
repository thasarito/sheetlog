"use client";

import { Delete } from "lucide-react";
import { cn } from "../lib/utils";

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
          aria-label={
            key === "DEL"
              ? "Delete last digit"
              : key === "."
                ? "Decimal point"
                : key
          }
          className={cn(
            "flex h-14 items-center justify-center rounded-2xl text-lg font-semibold text-foreground transition-all duration-100",
            "hover:bg-surface active:scale-90 active:bg-muted",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            "touch-manipulation select-none"
          )}
          onClick={() => handleKey(key)}
        >
          {key === "DEL" ? <Delete className="h-5 w-5" /> : key}
        </button>
      ))}
    </div>
  );
}
