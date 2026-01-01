'use client';

import React from 'react';

interface TagChipsProps {
  tags: string[];
  selected: string[];
  onToggle: (tag: string) => void;
}

export function TagChips({ tags, selected, onToggle }: TagChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const isActive = selected.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onToggle(tag)}
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
              isActive ? 'bg-emerald-400 text-slate-950' : 'bg-white/10 text-slate-200'
            }`}
          >
            #{tag}
          </button>
        );
      })}
    </div>
  );
}
