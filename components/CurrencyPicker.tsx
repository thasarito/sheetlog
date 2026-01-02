"use client";

import { CURRENCIES } from "../lib/currencies";
import { InlinePicker } from "./ui/inline-picker";

interface CurrencyPickerProps {
  value: string;
  onChange: (value: string) => void;
}

export function CurrencyPicker({ value, onChange }: CurrencyPickerProps) {
  return (
    <InlinePicker
      label="Select currency"
      labelHidden
      value={value}
      options={CURRENCIES}
      onChange={onChange}
      itemHeight={24}
      visibleItems={3}
      stretch={false}
      className="w-20 shrink-0"
      columnClassName="text-xs font-semibold"
    />
  );
}
