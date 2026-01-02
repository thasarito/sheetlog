"use client";

import React, { useCallback, useMemo } from "react";
import { Check } from "lucide-react";
import type { TransactionType } from "../../lib/types";
import { CurrencyPicker } from "../CurrencyPicker";
import { Keypad } from "../Keypad";
import { Picker } from "../Picker";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "../ui/drawer";

type StepAmountProps = {
  type: TransactionType | null;
  amount: string;
  currency: string;
  account: string | null;
  forValue: string;
  note: string;
  accounts: string[];
  onBack: () => void;
  onAmountChange: (value: string) => void;
  onCurrencyChange: (value: string) => void;
  onAccountSelect: (value: string) => void;
  onForChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onSubmit: () => void;
};

type DrawerPickerValue = {
  selection: string;
};

type DrawerPickerProps = {
  label: string;
  title: string;
  value: string | null;
  options: string[];
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
};

const FOR_OPTIONS = ["Me", "Partner", "Family", "Work", "Gift"];

function DrawerPicker({
  label,
  title,
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
}: DrawerPickerProps) {
  const hasOptions = options.length > 0;
  const hasValue = Boolean(value);
  const pickerValue = useMemo<DrawerPickerValue>(
    () => ({ selection: value ?? "" }),
    [value]
  );

  const handlePickerChange = useCallback(
    (nextValue: DrawerPickerValue) => {
      onChange(nextValue.selection);
    },
    [onChange]
  );

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 bg-card px-4 py-3 text-left transition hover:bg-surface/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled || !hasOptions}
        >
          <span className="shrink-0 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {label}
          </span>
          <span
            className={`min-w-0 flex-1 truncate text-sm ${
              hasValue
                ? "font-semibold text-foreground"
                : "text-muted-foreground"
            }`}
          >
            {hasValue ? value : placeholder}
          </span>
        </button>
      </DrawerTrigger>
      <DrawerContent className="shadow-none">
        <DrawerHeader className="text-left">
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-2">
          {hasOptions ? (
            <Picker
              value={pickerValue}
              onChange={(nextValue) =>
                handlePickerChange(nextValue as DrawerPickerValue)
              }
              height={168}
              itemHeight={32}
              wheelMode="natural"
              className="w-full rounded-2xl border border-border bg-card"
              aria-label={title}
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
            <div className="rounded-2xl border border-border bg-surface-2 px-4 py-6 text-center text-sm text-muted-foreground">
              No options available yet.
            </div>
          )}
        </div>
        <DrawerFooter className="px-4 pb-6">
          <DrawerClose asChild>
            <button
              type="button"
              className="w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
            >
              Done
            </button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

export function StepAmount({
  type,
  amount,
  currency,
  account,
  forValue,
  note,
  accounts,
  onBack,
  onAmountChange,
  onCurrencyChange,
  onAccountSelect,
  onForChange,
  onNoteChange,
  onSubmit,
}: StepAmountProps) {
  const isTransfer = type === "transfer";
  const accountTitle = isTransfer ? "From account" : "Account";
  const accountLabel = isTransfer ? "From" : "Account";
  const hasTransferAccounts = accounts.length > 1;
  const selectedFor = forValue || null;
  const toAccountOptions = useMemo(() => {
    if (!isTransfer || !hasTransferAccounts) {
      return [];
    }
    if (!account) {
      return accounts;
    }
    return accounts.filter((item) => item !== account);
  }, [account, accounts, hasTransferAccounts, isTransfer]);

  return (
    <div className="flex min-h-[100dvh] flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Amount & details</h2>
        <button
          type="button"
          className="text-xs font-semibold text-muted-foreground"
          onClick={onBack}
        >
          Back
        </button>
      </div>

      <div className="overflow-hidden flex-1 flex rounded-2xl">
        <div className="space-y-px w-full flex justify-between flex-col">
          {isTransfer ? (
            <DrawerPicker
              label="To"
              title="To account"
              value={selectedFor}
              options={toAccountOptions}
              onChange={onForChange}
              placeholder="Select account"
              disabled={!hasTransferAccounts}
            />
          ) : (
            <DrawerPicker
              label="For"
              title="For"
              value={selectedFor}
              options={FOR_OPTIONS}
              onChange={onForChange}
              placeholder="Select"
            />
          )}

          <div className="flex items-center justify-between bg-card px-4 py-3 text-2xl font-semibold text-foreground">
            <span>{amount ? amount : "0"}</span>
            <CurrencyPicker value={currency} onChange={onCurrencyChange} />
          </div>

          <DrawerPicker
            label={accountLabel}
            title={accountTitle}
            value={account}
            options={accounts}
            onChange={onAccountSelect}
            placeholder="Select account"
          />
        </div>
      </div>

      {isTransfer && !hasTransferAccounts ? (
        <p className="text-xs text-muted-foreground">
          Add another account in onboarding to log transfers.
        </p>
      ) : null}

      <div className="flex flex-col gap-5 pb-6">
        <Keypad value={amount} onChange={onAmountChange} />

        <div>
          <label
            htmlFor="note"
            className="text-xs uppercase tracking-widest text-muted-foreground"
          >
            Note
          </label>
          <input
            type="text"
            className="mt-2 w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground"
            placeholder="Optional"
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
          />
        </div>

        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
          onClick={onSubmit}
        >
          <Check className="h-4 w-4" />
          Submit
        </button>
      </div>
    </div>
  );
}
