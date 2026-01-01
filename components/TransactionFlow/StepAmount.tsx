"use client";

import React from "react";
import { Check } from "lucide-react";
import type { TransactionType } from "../../lib/types";
import { CurrencyPicker } from "../CurrencyPicker";
import { DateScroller } from "../DateScroller";
import { Keypad } from "../Keypad";
import { TimePicker } from "../TimePicker";
import { AccountButtons } from "./AccountButtons";

type StepAmountProps = {
  type: TransactionType | null;
  amount: string;
  currency: string;
  account: string | null;
  forValue: string;
  dateObject: Date;
  note: string;
  accounts: string[];
  onBack: () => void;
  onAmountChange: (value: string) => void;
  onCurrencyChange: (value: string) => void;
  onAccountSelect: (value: string) => void;
  onForChange: (value: string) => void;
  onDateChange: (value: Date) => void;
  onNoteChange: (value: string) => void;
  onSubmit: () => void;
};

export function StepAmount({
  type,
  amount,
  currency,
  account,
  forValue,
  dateObject,
  note,
  accounts,
  onBack,
  onAmountChange,
  onCurrencyChange,
  onAccountSelect,
  onForChange,
  onDateChange,
  onNoteChange,
  onSubmit,
}: StepAmountProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Amount & details</h2>
        <button
          type="button"
          className="text-xs text-slate-400"
          onClick={onBack}
        >
          Back
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex flex-1 items-center justify-between rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-2xl font-semibold">
          <span>{amount ? amount : "0"}</span>
          <CurrencyPicker value={currency} onChange={onCurrencyChange} />
        </div>
      </div>

      <Keypad value={amount} onChange={onAmountChange} />

      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-slate-400">
          {type === "transfer" ? "From account" : "Account"}
        </p>
        <AccountButtons
          accounts={accounts}
          selected={account}
          onSelect={onAccountSelect}
        />
      </div>

      {type === "transfer" ? (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-widest text-slate-400">
            To account
          </p>
          <AccountButtons
            accounts={accounts}
            selected={forValue}
            onSelect={onForChange}
            isDisabled={(item) => item === account}
          />
          {accounts.length < 2 ? (
            <p className="text-xs text-slate-400">
              Add another account in onboarding to log transfers.
            </p>
          ) : null}
        </div>
      ) : (
        <div>
          <label
            htmlFor="forValue"
            className="text-xs uppercase tracking-widest text-slate-400"
          >
            For
          </label>
          <input
            type="text"
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100"
            placeholder="Optional"
            value={forValue}
            onChange={(event) => onForChange(event.target.value)}
          />
        </div>
      )}

      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-slate-400">
          Date & Time
        </p>
        <DateScroller value={dateObject} onChange={onDateChange} />
        <TimePicker value={dateObject} onChange={onDateChange} />
      </div>

      <div>
        <label
          htmlFor="note"
          className="text-xs uppercase tracking-widest text-slate-400"
        >
          Note
        </label>
        <input
          type="text"
          className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100"
          placeholder="Optional"
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
        />
      </div>

      <button
        type="button"
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 py-3 text-sm font-semibold text-slate-950"
        onClick={onSubmit}
      >
        <Check className="h-4 w-4" />
        Submit
      </button>
    </>
  );
}
