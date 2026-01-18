'use client';

import { Delete } from 'lucide-react';
import { cn } from '../lib/utils';

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

  const getAriaLabel = (key: string) => {
    if (key === 'DEL') return 'Delete last digit';
    if (key === '.') return 'Decimal separator';
    return key;
  };

  return (
    <div className="grid grid-cols-3 gap-3">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          aria-label={getAriaLabel(key)}
          className={cn(
            'flex h-14 items-center justify-center rounded-xl text-lg font-semibold text-foreground transition-all duration-200',
            'hover:bg-surface active:scale-90 touch-manipulation',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          )}
          onClick={() => handleKey(key)}
        >
          {key === 'DEL' ? <Delete className="h-5 w-5" /> : key}
        </button>
      ))}
    </div>
  );
}
