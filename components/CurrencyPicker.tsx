"use client";

import React from "react";
import { motion } from "framer-motion";

const CURRENCIES = ["THB", "USD", "EUR", "JPY", "GBP"];

interface CurrencyPickerProps {
  value: string;
  onChange: (value: string) => void;
}

export function CurrencyPicker({ value, onChange }: CurrencyPickerProps) {
  return (
    <div className="flex gap-2 p-1 overflow-x-auto no-scrollbar">
      {CURRENCIES.map((currency) => (
        <button
          key={currency}
          type="button"
          onClick={() => onChange(currency)}
          className={`relative px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
            value === currency
              ? "text-slate-950 bg-emerald-400"
              : "text-slate-400 hover:text-slate-200 bg-white/5"
          }`}
        >
          {currency}
          {value === currency && (
            <motion.div
              layoutId="activeCurrency"
              className="absolute inset-0 bg-emerald-400 rounded-full -z-10"
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          )}
        </button>
      ))}
    </div>
  );
}
