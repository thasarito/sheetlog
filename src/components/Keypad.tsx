'use client';

import { Delete } from 'lucide-react';

interface KeypadProps {
  value: string;
  onChange: (next: string) => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'DEL'];

export function Keypad({ value, onChange }: KeypadProps) {
  function handleKey(key: string) {
    if (key === 'DEL') {
      onChange(value.slice(0, -1));
      return;
    }
    if (key === '.') {
      if (value.includes('.')) {
        return;
      }
      onChange(value ? `${value}.` : '0.');
      return;
    }
    onChange(`${value}${key}`.replace(/^0+(\d)/, '$1'));
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {KEYS.map((key) => {
        let ariaLabel = key;
        if (key === 'DEL') ariaLabel = 'Delete';
        if (key === '.') ariaLabel = 'Decimal point';

        return (
          <button
            key={key}
            type="button"
            aria-label={ariaLabel}
            className="flex h-14 touch-manipulation items-center justify-center rounded-2xl text-lg font-semibold text-foreground transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary hover:bg-surface"
            onClick={() => handleKey(key)}
          >
            {key === 'DEL' ? <Delete className="h-5 w-5" /> : key}
          </button>
        );
      })}
    </div>
  );
}
