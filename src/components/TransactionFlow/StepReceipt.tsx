import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { Loader2, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { TransactionType } from '../../lib/types';
import { CircleCheckIcon, type CircleCheckIconHandle } from '../icons/CircleCheckIcon';

export type ReceiptData = {
  type: TransactionType;
  category: string;
  amount: string;
  currency: string;
  account: string;
  forValue: string;
  dateObject: Date;
  note: string;
};

type StepReceiptProps = ReceiptData & {
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  errorMessage?: string;
  onDone?: () => void;
  onUndo?: () => void;
};

const TYPE_LABELS: Record<TransactionType, string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
};

export function StepReceipt({
  type,
  category,
  amount,
  currency,
  account,
  forValue,
  dateObject,
  note,
  isPending,
  isSuccess,
  isError,
  errorMessage,
  onDone,
  onUndo,
}: StepReceiptProps) {
  const amountLabel = amount ? amount : '0';
  const amountDisplay = `${currency} ${amountLabel}`;
  const normalizedStatus = isPending
    ? 'loading'
    : isSuccess
      ? 'success'
      : isError
        ? 'error'
        : 'loading';
  const statusTitle =
    normalizedStatus === 'loading'
      ? 'Saving transaction'
      : normalizedStatus === 'success'
        ? 'Payment Successful'
        : 'Save failed';
  const statusDescription =
    normalizedStatus === 'loading'
      ? 'Hang tight while we log this entry.'
      : normalizedStatus === 'success'
        ? 'Transaction added to your ledger.'
        : errorMessage || 'Check your connection and try again.';
  const accountLabel = type === 'transfer' ? 'From' : 'Account';
  const forLabel = type === 'transfer' ? 'To' : 'For';
  const checkIconRef = useRef<CircleCheckIconHandle | null>(null);

  useEffect(() => {
    if (isSuccess) {
      checkIconRef.current?.startAnimation();
    }
  }, [isSuccess]);

  const summaryRows = useMemo(
    () => [
      {
        label: 'Date & Time',
        value: format(dateObject, 'dd MMM yyyy · hh:mm a'),
        muted: false,
      },
      { label: 'Category', value: category || '—', muted: !category },
      { label: accountLabel, value: account || '—', muted: !account },
      { label: forLabel, value: forValue || '—', muted: !forValue },
      { label: 'Type', value: TYPE_LABELS[type], muted: false },
      { label: 'Note', value: note || '—', muted: !note },
    ],
    [account, accountLabel, category, dateObject, forLabel, forValue, note, type],
  );

  return (
    <div className="flex h-full flex-col justify-between gap-6 pb-6 px-4">
      <div className="space-y-6">
        <div
          className={
            isSuccess
              ? 'rounded-[28px] border border-success/20 bg-gradient-to-b from-success/15 via-background to-background p-5'
              : isError
                ? 'rounded-[28px] border border-danger/20 bg-card p-5'
                : 'rounded-[28px] border border-border/70 bg-surface-2/80 p-5'
          }
        >
          <div className="flex items-start gap-4">
            <span
              className={
                isSuccess
                  ? 'mt-0.5 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-success/15 text-success'
                  : isError
                    ? 'mt-0.5 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-danger/10 text-danger'
                    : 'mt-0.5 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-card text-muted-foreground'
              }
            >
              {isSuccess ? (
                <CircleCheckIcon ref={checkIconRef} size={22} className="text-success" />
              ) : isError ? (
                <XCircle className="h-5 w-5 text-danger" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              )}
            </span>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{statusTitle}</p>
              <p
                className={
                  isSuccess
                    ? 'text-2xl font-semibold text-success'
                    : 'text-xl font-semibold text-foreground'
                }
              >
                {amountDisplay}
              </p>
              {isSuccess ? null : (
                <p className="text-xs text-muted-foreground">{statusDescription}</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-muted-foreground">Transaction Summary</p>
          <dl className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-card px-4 py-1 text-sm">
            {summaryRows.map((row) => (
              <div key={row.label} className="flex items-start justify-between gap-4 py-3">
                <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {row.label}
                </dt>
                <dd
                  className={[
                    'max-w-[60%] text-right text-sm font-medium break-words',
                    row.muted ? 'text-muted-foreground' : 'text-foreground',
                  ].join(' ')}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {isSuccess ? (
        <div className="space-y-3">
          <button
            type="button"
            className="relative flex w-full items-center justify-center overflow-hidden rounded-2xl bg-success py-3 text-sm font-semibold text-success-foreground"
            onClick={onDone}
          >
            <span className="relative z-10">Done</span>
            <motion.span
              aria-hidden="true"
              className="absolute bottom-0 left-0 h-1 w-full origin-left bg-success-foreground/35"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 2, ease: 'linear' }}
            />
          </button>
          <button
            type="button"
            className="w-full rounded-2xl border border-border bg-card py-2.5 text-sm font-semibold text-foreground"
            onClick={onUndo}
          >
            Undo
          </button>
        </div>
      ) : null}
    </div>
  );
}
