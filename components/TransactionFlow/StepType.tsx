"use client";

import React from "react";
import type { TransactionType } from "../../lib/types";
import { TYPE_OPTIONS } from "./constants";

type StepTypeProps = {
  onSelect: (value: TransactionType) => void;
};

export function StepType({ onSelect }: StepTypeProps) {
  return (
    <>
      <h2 className="text-lg font-semibold">What are you logging?</h2>
      <div className="grid grid-cols-1 gap-3">
        {TYPE_OPTIONS.map((item) => (
          <button
            key={item}
            type="button"
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-left text-lg font-semibold capitalize transition hover:border-emerald-400"
            onClick={() => onSelect(item)}
          >
            {item}
          </button>
        ))}
      </div>
    </>
  );
}
