import { format, isSameDay, subDays } from 'date-fns';
import { useLayoutEffect, useRef, useState } from 'react';
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

export type TransactionHistoryDateHeaderMode = 'auto' | 'static' | 'pinned';

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

function useAutoStickyDateHeader(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [isSticky, setIsSticky] = useState(false);

  useLayoutEffect(() => {
    if (!enabled) {
      setIsSticky(false);
      return;
    }

    const header = ref.current;
    const scrollRoot = header?.closest<HTMLElement>(
      '[data-dashboard-scroll="true"]',
    );
    if (!header || !scrollRoot) {
      setIsSticky(false);
      return;
    }

    let frame: number | null = null;
    const update = () => {
      frame = null;
      const headerRect = header.getBoundingClientRect();
      const rootRect = scrollRoot.getBoundingClientRect();
      const computedTop = Number.parseFloat(
        window.getComputedStyle(header).top,
      );
      const topOffset = Number.isFinite(computedTop) ? computedTop : 0;
      const pinned =
        scrollRoot.scrollTop > 0.5 &&
        headerRect.top <= rootRect.top + topOffset + 1;

      let isTopmostPinnedHeader = pinned;
      if (pinned && typeof document.elementFromPoint === 'function') {
        const x = Math.min(
          rootRect.right - 1,
          Math.max(rootRect.left + 1, headerRect.right - 16),
        );
        const y = Math.min(
          rootRect.bottom - 1,
          rootRect.top + topOffset + Math.min(headerRect.height / 2, 16),
        );
        const topElement = document.elementFromPoint(x, y);
        if (topElement) {
          isTopmostPinnedHeader =
            topElement.closest('[data-transaction-history-date-header]') ===
            header;
        }
      }

      setIsSticky((current) =>
        current === isTopmostPinnedHeader ? current : isTopmostPinnedHeader,
      );
    };
    const scheduleUpdate = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    scrollRoot.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    return () => {
      scrollRoot.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [enabled]);

  return { ref, isSticky };
}

export function TransactionHistoryDateHeader({
  dateKey,
  today,
  transactions,
  baseCurrency,
  baseAmountStates,
  mode = 'auto',
  stickyTop = 'var(--dashboard-header-height, 68px)',
}: {
  dateKey: string;
  today: Date;
  transactions: readonly TransactionRecord[];
  baseCurrency: string;
  baseAmountStates: Readonly<Record<string, TransactionBaseAmountState>>;
  mode?: TransactionHistoryDateHeaderMode;
  stickyTop?: number | string;
}) {
  const autoSticky = useAutoStickyDateHeader(mode === 'auto');
  const isPinned = mode === 'pinned' || (mode === 'auto' && autoSticky.isSticky);
  const dailyNet = buildDailyNetAmountState(
    transactions,
    baseCurrency,
    baseAmountStates,
  );
  const accessibleText = getDailyNetAccessibleText(dailyNet);

  return (
    <div
      ref={autoSticky.ref}
      data-testid="transaction-history-date-header"
      data-transaction-history-date-header="true"
      data-transaction-history-date-key={dateKey}
      data-sticky-state={isPinned ? 'pinned' : 'resting'}
      className={cn(
        'flex h-9 items-center justify-between gap-3 border-b px-3 text-xs font-semibold transition-[background-color,border-color,box-shadow,color] duration-150',
        mode === 'auto' && 'sticky z-20',
        isPinned
          ? 'border-border/70 bg-background/95 text-foreground shadow-sm backdrop-blur-md'
          : 'border-transparent bg-transparent text-muted-foreground',
      )}
      style={mode === 'auto' ? { top: stickyTop } : undefined}
    >
      <span className="min-w-0 truncate">{dateLabel(dateKey, today)}</span>
      <span
        aria-hidden={isPinned ? undefined : true}
        className={cn(
          'flex min-w-16 shrink-0 justify-end transition-opacity duration-150',
          isPinned ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        {dailyNet.status === 'loading' ? (
          <>
            <Skeleton
              aria-hidden="true"
              data-testid="daily-net-amount-loading"
              className="h-3 w-14"
            />
            <span className="sr-only">{accessibleText}</span>
          </>
        ) : (
          <>
            <span
              aria-hidden="true"
              data-testid="daily-net-amount"
              className={cn(
                'whitespace-nowrap tabular-nums',
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
            <span className="sr-only">{accessibleText}</span>
          </>
        )}
      </span>
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
