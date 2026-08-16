"use client";

import { Delete } from "lucide-react";

interface KeypadProps {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "DEL"];

export function Keypad({ value, onChange, disabled = false }: KeypadProps) {
  function handleKey(key: string) {
    if (disabled) {
      return;
    }
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
    <fieldset
      className="m-0 grid grid-cols-3 gap-3 border-0 p-0"
      disabled={disabled}
    >
      <legend className="sr-only">Amount keypad</legend>
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          aria-label={key === "DEL" ? "Delete digit" : key}
          className="flex h-14 items-center justify-center text-lg font-semibold text-foreground transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => handleKey(key)}
          disabled={disabled}
        >
          {key === "DEL" ? (
            <Delete aria-hidden="true" className="h-5 w-5" />
          ) : (
            key
          )}
        </button>
      ))}
    </fieldset>
  );
}
