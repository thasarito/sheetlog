import { format, isSameDay, subDays } from 'date-fns';
import { parseDate } from '../../lib/date-utils';
import { canEditTransaction } from '../../lib/transactionHistory';
import type { TransactionRecord } from '../../lib/types';
import { cn } from '../../lib/utils';
import { Skeleton } from '../ui/skeleton';
import {
  formatTransactionBaseAmount,
  getTransactionBaseAmountAccessibleText,
  type TransactionBaseAmountState,
} from './transactionBaseAmounts';
import {
  buildDailyNetAmountState,
  formatDailyNetAmount,
  getDailyNetAccessibleText,
} from './transactionDailyNet';

export type TransactionHistoryListItem =
  | {
      key: string;
      kind: 'date';
      dateKey: string;
      transactions: TransactionRecord[];
    }
  | { key: string; kind: 'transaction'; transaction: TransactionRecord };

export function flattenTransactionHistory(
  transactions: readonly TransactionRecord[],
): TransactionHistoryListItem[] {
  const items: TransactionHistoryListItem[] = [];
  let previousDate = '';
  let currentDateItem: Extract<
    TransactionHistoryListItem,
    { kind: 'date' }
  > | null = null;

  for (const transaction of transactions) {
    const dateKey = format(parseDate(transaction.date), 'yyyy-MM-dd');
    if (dateKey !== previousDate) {
      currentDateItem = {
        key: `date:${dateKey}`,
        kind: 'date',
        dateKey,
        transactions: [],
      };
      items.push(currentDateItem);
      previousDate = dateKey;
    }
    currentDateItem?.transactions.push(transaction);
    items.push({
      key: `transaction:${transaction.id}`,
      kind: 'transaction',
      transaction,
    });
  }
  return items;
}

function dateLabel(dateKey: string, today: Date): string {
  const date = new Date(`${dateKey}T00:00:00`);
  if (isSameDay(date, today)) return 'Today';
  if (isSameDay(date, subDays(today, 1))) return 'Yesterday';
  return format(date, 'EEEE, MMM d');
}

export function TransactionHistoryDateHeader({
  dateKey,
  today,
  transactions,
  baseCurrency,
  baseAmountStates,
}: {
  dateKey: string;
  today: Date;
  transactions: readonly TransactionRecord[];
  baseCurrency: string;
  baseAmountStates: Readonly<Record<string, TransactionBaseAmountState>>;
}) {
  const dailyNet = buildDailyNetAmountState(
    transactions,
    baseCurrency,
    baseAmountStates,
  );
  const accessibleText = getDailyNetAccessibleText(dailyNet);

  return (
    <div
      data-testid="transaction-history-date-header"
      className="flex items-center justify-between gap-3 px-3 pb-1 pt-3 text-xs font-semibold text-muted-foreground"
    >
      <span className="min-w-0 truncate">{dateLabel(dateKey, today)}</span>
      {dailyNet.status === 'loading' ? (
        <span className="flex min-w-16 shrink-0 justify-end">
          <Skeleton
            aria-hidden="true"
            data-testid="daily-net-amount-loading"
            className="h-3 w-14"
          />
          <span className="sr-only">{accessibleText}</span>
        </span>
      ) : (
        <span
          aria-label={accessibleText}
          data-testid="daily-net-amount"
          className={cn(
            'shrink-0 whitespace-nowrap tabular-nums',
            dailyNet.status === 'ready' &&
              dailyNet.amount > 0 &&
              'text-emerald-500',
            dailyNet.status === 'ready' &&
              dailyNet.amount < 0 &&
              'text-foreground',
          )}
        >
          {formatDailyNetAmount(dailyNet)}
        </span>
      )}
    </div>
  );
}

function amountLabel(transaction: TransactionRecord): string {
  const symbol =
    transaction.currency === 'THB'
      ? '฿'
      : transaction.currency === 'USD'
        ? '$'
        : `${transaction.currency} `;
  const prefix = transaction.type === 'expense' ? '−' : '+';
  return `${prefix}${symbol}${Number(transaction.amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
  })}`;
}

export function TransactionBaseAmountLine({
  transaction,
  state,
}: {
  transaction: TransactionRecord;
  state?: TransactionBaseAmountState;
}) {
  if (!state) return null;
  if (state.status === 'loading') {
    return (
      <Skeleton
        aria-hidden="true"
        data-testid="base-currency-amount-loading"
        className="mt-0.5 h-3 w-14 self-end"
      />
    );
  }

  const accessibleText = getTransactionBaseAmountAccessibleText(
    transaction,
    state,
  );
  return (
    <>
      <span
        aria-hidden="true"
        data-testid="base-currency-amount"
        className="text-[11px] font-normal leading-tight text-muted-foreground"
      >
        {formatTransactionBaseAmount(transaction, state)}
      </span>
      {accessibleText ? <span className="sr-only">{accessibleText}</span> : null}
    </>
  );
}

export function TransactionHistoryRow({
  transaction,
  onSelect,
  baseAmount,
}: {
  transaction: TransactionRecord;
  onSelect: (transaction: TransactionRecord) => void;
  baseAmount?: TransactionBaseAmountState;
}) {
  const canEdit = canEditTransaction(transaction);
  const statusLabel = !canEdit
    ? 'Read only'
    : transaction.status === 'pending'
      ? 'Pending'
      : transaction.status === 'error'
        ? transaction.error?.trim() || 'Sync failed'
        : null;
  const time = format(parseDate(transaction.date), 'HH:mm');
  const amount = amountLabel(transaction);
  const baseAmountAccessibleText = baseAmount
    ? getTransactionBaseAmountAccessibleText(transaction, baseAmount)
    : null;
  const accessibleLabel = [
    time,
    transaction.type,
    transaction.category,
    transaction.note?.trim(),
    transaction.account?.trim(),
    statusLabel,
    amount,
    baseAmountAccessibleText,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      disabled={!canEdit}
      onClick={() => onSelect(transaction)}
      aria-label={accessibleLabel}
      className="grid w-full grid-cols-[42px_1fr_auto] items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors active:bg-muted/60 disabled:cursor-default disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <span className="text-xs font-medium tabular-nums text-muted-foreground">{time}</span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-foreground">
          {transaction.category}
          {transaction.note ? (
            <span className="ml-1 font-normal text-muted-foreground">
              · {transaction.note}
            </span>
          ) : null}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          {transaction.account ? <span className="truncate">{transaction.account}</span> : null}
          {statusLabel ? (
            <>
              {transaction.account ? <span aria-hidden="true">·</span> : null}
              <span
                className={cn(
                  'whitespace-nowrap',
                  canEdit && transaction.status === 'error' && 'text-danger',
                  canEdit && transaction.status === 'pending' && 'text-warning',
                )}
              >
                {statusLabel}
              </span>
            </>
          ) : null}
        </span>
      </span>
      <span className="flex flex-col items-end whitespace-nowrap tabular-nums">
        <span
          className={cn(
            'font-semibold',
            transaction.type === 'income'
              ? 'text-emerald-500'
              : transaction.type === 'transfer'
                ? 'text-blue-500'
                : 'text-foreground',
          )}
        >
          {amount}
        </span>
        <TransactionBaseAmountLine
          transaction={transaction}
          state={baseAmount}
        />
      </span>
    </button>
  );
}
