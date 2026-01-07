import { format } from 'date-fns';
import { Check, ChevronLeft, FileText, Pencil, Trash2 } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { STORAGE_KEYS } from '../../lib/constants';
import { cn } from '../../lib/utils';
import { CurrencyPicker } from '../CurrencyPicker';
import { Keypad } from '../Keypad';
import { InlinePicker } from '../ui/inline-picker';
import { FOR_OPTIONS } from './constants';
import type { TransactionFormApi } from './useTransactionForm';

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
}: StepAmountProps) {
  const { type, category, amount, currency, account, forValue, note, dateObject } = form.useStore(
    (state) => state.values,
  );
  const isTransfer = type === 'transfer';
  const accountLabel = isTransfer ? 'From' : 'Account';
  const hasTransferAccounts = accounts.length > 1;
  const selectedFor = forValue || null;
  const handleAccountChange = useCallback(
    (value: string) => {
      form.setFieldValue('account', value);
      if (typeof window === 'undefined') {
        return;
      }
      const accountCurrency = window.localStorage.getItem(`${STORAGE_KEYS.LAST_CURRENCY}_${value}`);
      if (accountCurrency) {
        form.setFieldValue('currency', accountCurrency);
        return;
      }
      const fallbackCurrency = window.localStorage.getItem(STORAGE_KEYS.LAST_CURRENCY);
      if (fallbackCurrency) {
        form.setFieldValue('currency', fallbackCurrency);
      }
    },
    [form],
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
    <div className="flex h-full flex-col gap-5 px-4">
      <div className="flex-1 flex flex-col">
        {category ? (
          <div className="flex items-center gap-3 border-b border-border/20 pt-4 pb-3">
            <button
              type="button"
              aria-label="Go back"
              className="rounded-full p-2 hover:bg-muted transition-colors -ml-2"
              onClick={onBack}
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
                {format(dateObject, 'dd MMM · HH:mm')}
                <Pencil className="h-3.5 w-3.5" />
              </button>
            ) : (
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {format(dateObject, 'dd MMM · HH:mm')}
              </span>
            )}
          </div>
        ) : null}

        <div className="flex flex-1 items-center justify-between px-4 py-3 text-4xl font-semibold text-foreground">
          <span>{amount ? amount : '0'}</span>
          <CurrencyPicker
            value={currency}
            onChange={(value) => form.setFieldValue('currency', value)}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
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
              onChange={(value) => form.setFieldValue('forValue', value)}
              disabled={!hasTransferAccounts}
            />
          ) : (
            <InlinePicker
              label="For"
              value={selectedFor}
              options={FOR_OPTIONS}
              onChange={(value) => form.setFieldValue('forValue', value)}
            />
          )}
        </div>

        <div className="mt-4 flex items-center gap-3 border-b border-border/10 pb-2 transition-colors focus-within:border-primary/50">
          <FileText className="h-4 w-4 text-muted-foreground/50" />
          <input
            type="text"
            aria-label="Transaction note"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            placeholder="Add a note..."
            value={note}
            onChange={(event) => form.setFieldValue('note', event.target.value)}
            autoComplete="off"
          />
        </div>
      </div>

      {isTransfer && !hasTransferAccounts ? (
        <p className="text-xs text-muted-foreground">
          Add another account in onboarding to log transfers.
        </p>
      ) : null}

      <div className="flex flex-col gap-5 pb-6">
        <Keypad value={amount} onChange={(value) => form.setFieldValue('amount', value)} />

        <div className="flex items-center gap-2">
          {onDelete && (
            <button
              type="button"
              aria-label="Delete transaction"
              className={cn(
                'flex items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2',
                (isSubmitting || isDeleting) && 'opacity-60',
              )}
              onClick={onDelete}
              disabled={isSubmitting || isDeleting}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onSubmit}
            disabled={isSubmitting || isDeleting}
          >
            <Check className="h-4 w-4" />
            {isSubmitting ? (submitLabel ? 'Saving...' : 'Submitting') : (submitLabel ?? 'Submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
