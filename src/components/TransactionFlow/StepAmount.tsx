import { useCallback, useMemo, useState } from "react";
import { format } from "date-fns";
import { Check, ChevronLeft, Pencil, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { CurrencyPicker } from "../CurrencyPicker";
import { Keypad } from "../Keypad";
import { InlinePicker } from "../ui/inline-picker";
import { FOR_OPTIONS } from "./constants";
import { STORAGE_KEYS } from "../../lib/constants";
import {
  clearTransactionNote,
  selectGooglePlace,
  setManualTransactionNote,
} from "./transactionNoteForm";
import {
  TransactionNoteField,
  type PlaceNoteOptions,
} from "./TransactionNoteField";
import type { TransactionFormApi } from "./useTransactionForm";

type StepAmountProps = {
  form: TransactionFormApi;
  accounts: string[];
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
  // Edit mode props
  onDelete?: () => void;
  isDeleting?: boolean;
  onCategoryClick?: () => void;
  onDateClick?: () => void;
  submitLabel?: string;
  // Quick note mode props
  customHeader?: React.ReactNode;
  optionalAmount?: boolean;
  places?: PlaceNoteOptions;
  noteInputRef?: React.Ref<HTMLInputElement>;
  currencyLocked?: boolean;
  forLocked?: boolean;
  amountLocked?: boolean;
  preserveCurrencyOnAccountChange?: boolean;
  middleAction?: React.ReactNode;
  formNotice?: React.ReactNode;
};

export function StepAmount({
  form,
  accounts,
  onBack,
  onSubmit,
  isSubmitting = false,
  onDelete,
  isDeleting = false,
  onCategoryClick,
  onDateClick,
  submitLabel,
  customHeader,
  optionalAmount = false,
  places,
  noteInputRef,
  currencyLocked = false,
  forLocked = false,
  amountLocked = false,
  preserveCurrencyOnAccountChange = false,
  middleAction,
  formNotice,
}: StepAmountProps) {
  const { type, category, amount, currency, account, forValue, note, dateObject } =
    form.useStore((state) => state.values);
  const [searchOverlayTarget, setSearchOverlayTarget] =
    useState<HTMLDivElement | null>(null);
  const isTransfer = type === "transfer";
  const accountLabel = isTransfer ? "From" : "Account";
  const hasTransferAccounts = accounts.length > 1;
  const selectedFor = forValue || null;
  const handleAccountChange = useCallback(
    (value: string) => {
      form.setFieldValue("account", value);
      if (
        preserveCurrencyOnAccountChange ||
        typeof window === "undefined"
      ) {
        return;
      }
      const accountCurrency = window.localStorage.getItem(
        `${STORAGE_KEYS.LAST_CURRENCY}_${value}`
      );
      if (accountCurrency) {
        form.setFieldValue("currency", accountCurrency);
        return;
      }
      const fallbackCurrency = window.localStorage.getItem(
        STORAGE_KEYS.LAST_CURRENCY
      );
      if (fallbackCurrency) {
        form.setFieldValue("currency", fallbackCurrency);
      }
    },
    [form, preserveCurrencyOnAccountChange]
  );
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
    <div
      data-testid="step-amount"
      data-transaction-step="amount"
      className="flex h-full min-h-0 flex-col gap-5 overflow-x-hidden overflow-y-hidden px-4"
    >
      <div
        data-step-amount-fields
        className="flex min-h-0 flex-1 flex-col"
      >
        {customHeader ? (
          <div className="shrink-0">{customHeader}</div>
        ) : category ? (
          <div className="flex shrink-0 items-center gap-3 border-b border-border/20 pt-4 pb-3">
            <button
              type="button"
              aria-label="Go back"
              className="rounded-full p-2 hover:bg-muted transition-colors -ml-2 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onBack}
              disabled={isDeleting}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            {onCategoryClick ? (
              <button
                type="button"
                className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors"
                onClick={onCategoryClick}
              >
                {category}
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ) : (
              <span className="text-sm font-medium text-foreground">{category}</span>
            )}
            {onDateClick ? (
              <button
                type="button"
                className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors tabular-nums"
                onClick={onDateClick}
              >
                {format(dateObject, "dd MMM · HH:mm")}
                <Pencil className="h-3.5 w-3.5" />
              </button>
            ) : (
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {format(dateObject, "dd MMM · HH:mm")}
              </span>
            )}
          </div>
        ) : null}

        <div
          data-step-amount-search-canvas
          className="relative isolate flex min-h-0 flex-1 flex-col"
        >
          <div
            data-testid="place-search-stage"
            className="relative min-h-0 flex-1"
          >
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex min-h-[72px] flex-1 items-center justify-between px-4 py-3 text-4xl font-semibold text-foreground">
                <span>{amount ? amount : "0"}</span>
                <CurrencyPicker
                  value={currency}
                  onChange={(value) => form.setFieldValue("currency", value)}
                  disabled={currencyLocked}
                />
              </div>

              <div className="mt-4 grid shrink-0 grid-cols-2 gap-3">
                <InlinePicker
                  label={accountLabel}
                  value={account || null}
                  options={accounts}
                  onChange={handleAccountChange}
                />

                {isTransfer ? (
                  <InlinePicker
                    label="To"
                    value={selectedFor}
                    options={toAccountOptions}
                    onChange={(value) => form.setFieldValue("forValue", value)}
                    disabled={!hasTransferAccounts || forLocked}
                  />
                ) : (
                  <InlinePicker
                    label="For"
                    value={selectedFor}
                    options={FOR_OPTIONS}
                    onChange={(value) => form.setFieldValue("forValue", value)}
                    disabled={forLocked}
                  />
                )}
              </div>
            </div>

            <div
              ref={setSearchOverlayTarget}
              data-testid="place-search-overlay-target"
              className="pointer-events-none absolute inset-0 z-10"
            />
          </div>

          <div className="relative z-20 shrink-0">
            <TransactionNoteField
              value={note}
              onManualChange={(value) => setManualTransactionNote(form, value)}
              onClear={() => clearTransactionNote(form)}
              onPlaceSelect={(selection) => selectGooglePlace(form, selection)}
              onSubmit={onSubmit}
              canSubmit={Boolean(
                (amount || optionalAmount) && !isSubmitting && !isDeleting,
              )}
              inputRef={noteInputRef}
              places={places}
              searchOverlayTarget={searchOverlayTarget}
            />

            {formNotice}
          </div>
        </div>
      </div>

      {isTransfer && !hasTransferAccounts ? (
        <p className="shrink-0 text-xs text-muted-foreground">
          Add another account in onboarding to log transfers.
        </p>
      ) : null}

      <div className="flex shrink-0 flex-col gap-5 pb-6">
        <Keypad
          value={amount}
          onChange={(value) => form.setFieldValue("amount", value)}
          disabled={amountLocked}
        />

        <div className="flex items-center gap-2">
          {onDelete && (
            <button
              type="button"
              aria-label="Delete transaction"
              className={cn(
                "flex items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive",
                (isSubmitting || isDeleting) && "opacity-60"
              )}
              onClick={onDelete}
              disabled={isSubmitting || isDeleting}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          {middleAction}
          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onSubmit}
            disabled={isSubmitting || isDeleting}
          >
            <Check className="h-4 w-4" />
            {isSubmitting
              ? submitLabel
                ? "Saving..."
                : "Submitting"
              : submitLabel ?? "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
