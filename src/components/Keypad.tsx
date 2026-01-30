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
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          aria-label={key === 'DEL' ? 'Delete' : key}
          className="flex h-14 w-full select-none touch-manipulation items-center justify-center rounded-2xl text-xl font-medium text-foreground transition-all hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-90"
          onClick={() => handleKey(key)}
        >
          {key === 'DEL' ? <Delete className="h-6 w-6" /> : key}
        </button>
      ))}
    </div>
  );
}
