'use client';

import { Delete } from 'lucide-react';
import React from 'react';

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
        const isDelete = key === 'DEL';
        return (
          <button
            key={key}
            type="button"
            aria-label={isDelete ? 'Delete' : key === '.' ? 'Decimal separator' : key}
            className="flex h-14 items-center justify-center rounded-2xl bg-card text-lg font-semibold text-foreground transition active:scale-95 active:bg-surface-2 hover:bg-surface"
            onClick={() => handleKey(key)}
          >
            {isDelete ? <Delete className="h-6 w-6" /> : key}
          </button>
        );
      })}
    </div>
  );
}
