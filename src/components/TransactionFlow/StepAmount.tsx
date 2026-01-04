import React, { useMemo } from "react";
import { Check, X } from "lucide-react";
import { CurrencyPicker } from "../CurrencyPicker";
import { Keypad } from "../Keypad";
import { InlinePicker } from "../ui/inline-picker";
import { FOR_OPTIONS } from "./constants";
import type { TransactionFormApi } from "./useTransactionForm";

type StepAmountProps = {
  form: TransactionFormApi;
  accounts: string[];
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
};

export function StepAmount({
  form,
  accounts,
  onBack,
  onSubmit,
  isSubmitting = false,
}: StepAmountProps) {
  const { type, category, amount, currency, account, forValue, note } =
    form.useStore((state) => state.values);
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
        {category ? (
          <div className="px-4 pt-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/90 px-3 py-1.5 text-xs font-semibold text-foreground backdrop-blur">
              <span className="max-w-[240px] truncate">{category}</span>
              <button
                type="button"
                aria-label="Change category"
                className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                onClick={onBack}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-1 items-center justify-between px-4 py-3 text-4xl font-semibold text-foreground">
          <span>{amount ? amount : "0"}</span>
          <CurrencyPicker
            value={currency}
            onChange={(value) => form.setFieldValue("currency", value)}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <InlinePicker
            label={accountLabel}
            value={account || null}
            options={accounts}
            onChange={(value) => form.setFieldValue("account", value)}
          />

          {isTransfer ? (
            <InlinePicker
              label="To"
              value={selectedFor}
              options={toAccountOptions}
              onChange={(value) => form.setFieldValue("forValue", value)}
              disabled={!hasTransferAccounts}
            />
          ) : (
            <InlinePicker
              label="For"
              value={selectedFor}
              options={FOR_OPTIONS}
              onChange={(value) => form.setFieldValue("forValue", value)}
            />
          )}
        </div>
      </div>

      {isTransfer && !hasTransferAccounts ? (
        <p className="text-xs text-muted-foreground">
          Add another account in onboarding to log transfers.
        </p>
      ) : null}

      <div className="flex flex-col gap-5 pb-6">
        <Keypad
          value={amount}
          onChange={(value) => form.setFieldValue("amount", value)}
        />

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
            onChange={(event) => form.setFieldValue("note", event.target.value)}
          />
        </div>

        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onSubmit}
          disabled={isSubmitting}
        >
          <Check className="h-4 w-4" />
          {isSubmitting ? "Submitting" : "Submit"}
        </button>
      </div>
    </div>
  );
}
