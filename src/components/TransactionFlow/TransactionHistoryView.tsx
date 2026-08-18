import { useVirtualizer } from "@tanstack/react-virtual";
import { format } from "date-fns";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { parseDate } from "../../lib/date-utils";
import { filterTransactionHistory } from "../../lib/transactionHistory";
import type { TransactionRecord } from "../../lib/types";
import { cn } from "../../lib/utils";
import { Skeleton } from "../ui/skeleton";
import type { TransactionBaseAmountState } from "./transactionBaseAmounts";
import {
  DEFAULT_TRANSACTION_HISTORY_DOCK_HEIGHT,
  TRANSACTION_HISTORY_DOCK_GAP,
  useCategoryStepSheetAccessory,
} from "./CategoryStepSheetAccessory";
import {
  TransactionHistoryDock,
  type TransactionHistoryDockMotionHandle,
} from "./TransactionHistoryDock";
import {
  flattenTransactionHistory,
  TransactionHistoryDateHeader,
  type TransactionHistoryListItem,
  TransactionHistoryRow,
} from "./TransactionHistoryItems";
import { useTransactionBaseAmounts } from "./useTransactionBaseAmounts";
import type { TransactionHistoryQueryResult } from "./useTransactionHistoryQuery";

export type TransactionHistoryViewProps = {
  history: TransactionHistoryQueryResult;
  baseCurrency: string;
  onEditTransaction: (transaction: TransactionRecord) => void;
  dockMotionRef?: RefObject<TransactionHistoryDockMotionHandle | null>;
};

const HISTORY_SKELETON_KEYS = [
  "history-skeleton-a",
  "history-skeleton-b",
  "history-skeleton-c",
  "history-skeleton-d",
  "history-skeleton-e",
  "history-skeleton-f",
];
const HISTORY_INITIAL_RECT = { width: 390, height: 560 };

function TransactionHistoryVirtualList({
  items,
  onEdit,
  baseAmountStates,
  usesSheetAccessory,
}: {
  items: TransactionHistoryListItem[];
  onEdit: (transaction: TransactionRecord) => void;
  baseAmountStates: Readonly<Record<string, TransactionBaseAmountState>>;
  usesSheetAccessory: boolean;
}) {
  const scrollRef = useRef<HTMLElement>(null);
  const anchorRef = useRef<{
    key: string | number | bigint;
    offsetWithinItem: number;
  } | null>(null);
  const previousItemsRef = useRef<TransactionHistoryListItem[] | null>(null);
  const today = useMemo(() => new Date(), []);
  const getScrollElement = useCallback(() => scrollRef.current, []);
  const estimateSize = useCallback(
    (index: number) => (items[index]?.kind === "date" ? 36 : 64),
    [items],
  );
  const getItemKey = useCallback(
    (index: number) => items[index]?.key ?? index,
    [items],
  );
  const measureElement = useCallback(
    (element: Element) => {
      const measuredHeight = element.getBoundingClientRect().height;
      if (measuredHeight > 0) {
        return measuredHeight;
      }
      const index = Number(element.getAttribute("data-index"));
      return items[index]?.kind === "date" ? 36 : 64;
    },
    [items],
  );
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement,
    estimateSize,
    getItemKey,
    overscan: 8,
    initialRect: HISTORY_INITIAL_RECT,
    measureElement,
  });
  const bottomInset = usesSheetAccessory
    ? `calc(var(--category-sheet-occlusion, env(safe-area-inset-bottom)) + var(--transaction-history-dock-height, ${DEFAULT_TRANSACTION_HISTORY_DOCK_HEIGHT}px) + ${TRANSACTION_HISTORY_DOCK_GAP}px)`
    : "var(--category-sheet-occlusion, env(safe-area-inset-bottom))";
  useLayoutEffect(() => {
    if (previousItemsRef.current === items) {
      return;
    }
    previousItemsRef.current = items;
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }
    const anchorIndex = items.findIndex(({ key }) => key === anchor.key);
    if (anchorIndex >= 0) {
      const anchorOffset = virtualizer.getOffsetForIndex(
        anchorIndex,
        "start",
      )?.[0];
      if (anchorOffset !== undefined) {
        virtualizer.scrollToOffset(
          anchorOffset + anchor.offsetWithinItem,
          { align: "start" },
        );
      }
    } else {
      anchorRef.current = null;
      virtualizer.scrollToOffset(0, { align: "start" });
    }
  }, [items, virtualizer]);

  return (
    <section
      ref={scrollRef}
      aria-label="Transaction history"
      data-dashboard-scroll="true"
      data-virtual-scroll="true"
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2"
      style={{
        paddingBottom: bottomInset,
        scrollPaddingBottom: bottomInset,
      }}
      onScroll={() => {
        const scrollTop = scrollRef.current?.scrollTop ?? 0;
        const firstVisible = virtualizer.getVirtualItemForOffset(scrollTop);
        if (firstVisible) {
          anchorRef.current = {
            key: firstVisible.key,
            offsetWithinItem: scrollTop - firstVisible.start,
          };
        }
      }}
    >
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index];
          if (!item) {
            return null;
          }
          return (
            <div
              key={item.key}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              data-testid={
                item.kind === "transaction"
                  ? "history-transaction-row"
                  : undefined
              }
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              {item.kind === "date" ? (
                <TransactionHistoryDateHeader
                  dateKey={item.dateKey}
                  today={today}
                />
              ) : (
                <TransactionHistoryRow
                  transaction={item.transaction}
                  onSelect={onEdit}
                  baseAmount={baseAmountStates[item.transaction.id]}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function TransactionHistoryView({
  history,
  baseCurrency,
  onEditTransaction,
  dockMotionRef,
}: TransactionHistoryViewProps) {
  const sheetAccessory = useCategoryStepSheetAccessory();
  const baseAmounts = useTransactionBaseAmounts(
    history.records,
    baseCurrency,
    true,
  );
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const filteredTransactions = useMemo(
    () => filterTransactionHistory(history.records, debouncedSearch),
    [debouncedSearch, history.records],
  );
  const items = useMemo(
    () => flattenTransactionHistory(filteredTransactions),
    [filteredTransactions],
  );
  const countLabel = `${filteredTransactions.length} ${
    filteredTransactions.length === 1 ? "transaction" : "transactions"
  }`;
  const hasIncompleteLocalRows =
    !history.hasCompleteCache && history.records.length > 0;
  const isRefreshing = history.isRefreshing || baseAmounts.isRefreshing;
  const incompleteHistoryMessage = history.isLoading || history.isDownloading
    ? "Showing local entries while full history downloads."
    : !history.isOnline
      ? "Showing local entries. Connect to download full history."
      : "Showing local entries while full history loads.";

  const handleEdit = (transaction: TransactionRecord) => {
    onEditTransaction(transaction);
  };
  const refresh = () => {
    void history.refresh();
    void baseAmounts.refetch();
  };
  const statusLabel = isRefreshing
    ? "Updating…"
    : history.meta
      ? `Saved ${format(parseDate(history.meta.capturedAt), "MMM d, HH:mm")}`
      : history.isDownloading
        ? "Downloading…"
        : "Not downloaded";

  return (
    <section className="flex h-full min-h-0 flex-col bg-transparent">
      <header className="sr-only">
        <h2 className="sr-only">Transactions</h2>
        <p>Search and browse the complete transaction history.</p>
      </header>

      <div
        data-testid="transaction-history-content"
        className="flex min-h-0 flex-1 flex-col bg-transparent"
        style={{
          paddingTop:
            "var(--dashboard-header-space, var(--dashboard-header-height, 68px))",
        }}
      >
        <TransactionHistoryDock
          search={search}
          onSearchChange={setSearch}
          countLabel={countLabel}
          statusLabel={statusLabel}
          canRefresh={history.isOnline && !isRefreshing}
          isRefreshing={isRefreshing}
          onRefresh={refresh}
          motionRef={dockMotionRef}
        />

        {history.error && history.hasCompleteCache ? (
          <div
            role="alert"
            className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            <span className="truncate">{history.error.message}</span>
            <button
              type="button"
              aria-label="Retry history refresh"
              onClick={refresh}
              className="shrink-0 font-semibold underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        ) : null}

        {hasIncompleteLocalRows ? (
          <div
            role={history.error ? "alert" : "status"}
            className={cn(
              "mx-4 mb-2 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs",
              history.error
                ? "border-danger/20 bg-danger/10 text-danger"
                : "border-border/70 bg-muted/40 text-muted-foreground",
            )}
          >
            <span>
              {history.error
                ? history.error.message
                : incompleteHistoryMessage}
            </span>
            {history.error ? (
              <button
                type="button"
                aria-label="Retry history refresh"
                onClick={refresh}
                className="shrink-0 font-semibold underline underline-offset-2"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        {filteredTransactions.length > 0 ? (
          <TransactionHistoryVirtualList
            items={items}
            onEdit={handleEdit}
            baseAmountStates={baseAmounts.states}
            usesSheetAccessory={sheetAccessory.provided}
          />
        ) : debouncedSearch && history.records.length > 0 ? (
          <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-muted-foreground">
            No transactions match this search.
          </div>
        ) : history.isLoading || history.isDownloading ? (
          <div className="space-y-3 px-5 py-4">
            <span className="sr-only">Downloading history</span>
            {HISTORY_SKELETON_KEYS.map((key) => (
              <div
                key={key}
                className="grid grid-cols-[42px_1fr_72px] items-center gap-3"
              >
                <Skeleton className="h-3 w-9" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-4 w-16 justify-self-end" />
              </div>
            ))}
          </div>
        ) : !history.hasCompleteCache && !history.isOnline ? (
          <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-muted-foreground">
            Connect once to download transaction history.
          </div>
        ) : !history.hasCompleteCache && history.error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
            <p role="alert" className="text-sm text-danger">
              {history.error.message}
            </p>
            <button
              type="button"
              aria-label="Retry history refresh"
              onClick={refresh}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-muted-foreground">
            No transactions yet.
          </div>
        )}
      </div>
    </section>
  );
}
