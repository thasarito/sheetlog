'use client';

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
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className="h-14 rounded-2xl border border-white/10 bg-white/5 text-lg font-semibold text-slate-100"
          onClick={() => handleKey(key)}
        >
          {key}
        </button>
      ))}
      <button
        type="button"
        className="col-span-3 h-12 rounded-2xl border border-white/10 bg-white/10 text-sm font-semibold uppercase tracking-wide"
        onClick={() => onChange('')}
      >
        Clear
      </button>
    </div>
  );
}
