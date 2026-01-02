"use client";

import React, { useCallback, useMemo } from "react";
import { Picker } from "../Picker";
import { cn } from "../../lib/utils";

type InlinePickerValue = {
  selection: string;
};

type InlinePickerProps = {
  label: string;
  value: string | null;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
};

const INLINE_PICKER_ITEM_HEIGHT = 28;
const INLINE_PICKER_VISIBLE_ITEMS = 3;

export function InlinePicker({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: InlinePickerProps) {
  const hasOptions = options.length > 0;
  const pickerValue = useMemo<InlinePickerValue>(
    () => ({ selection: value ?? "" }),
    [value]
  );

  const handlePickerChange = useCallback(
    (nextValue: InlinePickerValue) => {
      onChange(nextValue.selection);
    },
    [onChange]
  );

  return (
    <div
      className={cn(
        "flex flex-1 items-center gap-2",
        disabled ? "pointer-events-none opacity-60" : null
      )}
    >
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {hasOptions ? (
        <Picker
          value={pickerValue}
          onChange={(nextValue) =>
            handlePickerChange(nextValue as InlinePickerValue)
          }
          height={INLINE_PICKER_ITEM_HEIGHT * INLINE_PICKER_VISIBLE_ITEMS}
          itemHeight={INLINE_PICKER_ITEM_HEIGHT}
          wheelMode="natural"
          className="min-w-0 flex-1"
          aria-label={label}
        >
          <Picker.Column name="selection" className="text-sm font-semibold">
            {options.map((item) => (
              <Picker.Item key={item} value={item}>
                {({ selected }) => (
                  <span
                    className={
                      selected ? "text-primary" : "text-muted-foreground"
                    }
                  >
                    {item}
                  </span>
                )}
              </Picker.Item>
            ))}
          </Picker.Column>
        </Picker>
      ) : (
        <span className="text-xs text-muted-foreground">
          No options available yet.
        </span>
      )}
    </div>
  );
}
