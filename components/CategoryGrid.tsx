'use client';

import React from 'react';

interface CategoryGridProps {
  frequent: string[];
  others: string[];
  selected: string | null;
  onSelect: (category: string) => void;
}

export function CategoryGrid({ frequent, others, selected, onSelect }: CategoryGridProps) {
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs uppercase tracking-widest text-slate-400">Frequent</p>
        <div className="grid grid-cols-2 gap-2">
          {frequent.map((category) => (
            <button
              key={category}
              type="button"
              className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
                selected === category
                  ? 'border-emerald-400 bg-emerald-400 text-slate-950'
                  : 'border-white/10 bg-white/5 text-slate-100'
              }`}
              onClick={() => onSelect(category)}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-widest text-slate-400">Other</p>
        <div className="grid grid-cols-3 gap-2">
          {others.map((category) => (
            <button
              key={category}
              type="button"
              className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                selected === category
                  ? 'border-emerald-400 bg-emerald-400 text-slate-950'
                  : 'border-white/10 bg-white/5 text-slate-100'
              }`}
              onClick={() => onSelect(category)}
            >
              {category}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
