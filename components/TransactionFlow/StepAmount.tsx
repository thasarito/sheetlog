"use client";

import React, { useMemo } from "react";
import { Check } from "lucide-react";
import type { TransactionType } from "../../lib/types";
import { CurrencyPicker } from "../CurrencyPicker";
import { Keypad } from "../Keypad";
import { InlinePicker } from "../ui/inline-picker";
import { FOR_OPTIONS } from "./constants";

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
    <div className="flex min-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col gap-5">
      <div className="flex-1 flex flex-col">
        <div className="flex flex-1 items-center justify-between px-4 py-3 text-4xl font-semibold text-foreground">
          <span>{amount ? amount : "0"}</span>
          <CurrencyPicker value={currency} onChange={onCurrencyChange} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {isTransfer ? (
            <InlinePicker
              label="To"
              value={selectedFor}
              options={toAccountOptions}
              onChange={onForChange}
              disabled={!hasTransferAccounts}
            />
          ) : (
            <InlinePicker
              label="For"
              value={selectedFor}
              options={FOR_OPTIONS}
              onChange={onForChange}
            />
          )}

          <InlinePicker
            label={accountLabel}
            value={account}
            options={accounts}
            onChange={onAccountSelect}
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
