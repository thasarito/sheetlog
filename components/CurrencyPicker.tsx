"use client";

import { useCallback, useMemo } from "react";
import { CURRENCIES } from "../lib/currencies";
import { Picker } from "./Picker";

interface CurrencyPickerProps {
  value: string;
  onChange: (value: string) => void;
}

type CurrencyPickerValue = {
  currency: string;
};

export function CurrencyPicker({ value, onChange }: CurrencyPickerProps) {
  const pickerValue = useMemo<CurrencyPickerValue>(
    () => ({ currency: value }),
    [value]
  );

  const handlePickerChange = useCallback(
    (nextValue: CurrencyPickerValue) => {
      onChange(nextValue.currency);
    },
    [onChange]
  );

  return (
    <Picker
      value={pickerValue}
      onChange={(nextValue) => handlePickerChange(nextValue)}
      height={72}
      itemHeight={24}
      wheelMode="natural"
      className="w-20 shrink-0 rounded-xl bg-surface-2"
      aria-label="Select currency"
    >
      <Picker.Column name="currency" className="text-xs font-semibold">
        {CURRENCIES.map((currency) => (
          <Picker.Item key={currency} value={currency}>
            {({ selected }) => (
              <span
                className={selected ? "text-primary" : "text-muted-foreground"}
              >
                {currency}
              </span>
            )}
          </Picker.Item>
        ))}
      </Picker.Column>
    </Picker>
  );
}
