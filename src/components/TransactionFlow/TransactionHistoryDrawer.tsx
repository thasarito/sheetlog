import { useVirtualizer } from "@tanstack/react-virtual";
import { format } from "date-fns";
import { RefreshCw, Search, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { parseDate } from "../../lib/date-utils";
import { filterTransactionHistory } from "../../lib/transactionHistory";
import type { TransactionRecord } from "../../lib/types";
import { cn } from "../../lib/utils";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "../ui/drawer";
import { Skeleton } from "../ui/skeleton";
import type { TransactionBaseAmountState } from "./transactionBaseAmounts";
import {
  flattenTransactionHistory,
  TransactionHistoryDateHeader,
  type TransactionHistoryListItem,
  TransactionHistoryRow,
} from "./TransactionHistoryItems";
import { useTransactionBaseAmounts } from "./useTransactionBaseAmounts";
import { useTransactionHistoryQuery } from "./useTransactionHistoryQuery";

type TransactionHistoryDrawerProps = {
  open: boolean;
  baseCurrency: string;
  onOpenChange: (open: boolean) => void;
  onEditTransaction: (transaction: TransactionRecord) => void;
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
}: {
  items: TransactionHistoryListItem[];
  onEdit: (transaction: TransactionRecord) => void;
  baseAmountStates: Readonly<Record<string, TransactionBaseAmountState>>;
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
    }
  }, [items, virtualizer]);

  return (
    <section
      ref={scrollRef}
      aria-label="Transaction history"
      data-virtual-scroll="true"
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-safe"
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

export function TransactionHistoryDrawer({
  open,
  baseCurrency,
  onOpenChange,
  onEditTransaction,
}: TransactionHistoryDrawerProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const history = useTransactionHistoryQuery(open);
  const baseAmounts = useTransactionBaseAmounts(
    history.records,
    baseCurrency,
    open,
  );
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setDebouncedSearch("");
    }
  }, [open]);

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
    onOpenChange(false);
    onEditTransaction(transaction);
  };
  const refresh = () => {
    void history.refresh();
    void baseAmounts.refetch();
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent
        className="h-[94dvh] max-h-[94dvh] overflow-hidden"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
          titleRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
          returnFocusRef.current = null;
        }}
      >
        <DrawerHeader className="grid grid-cols-[40px_1fr_40px] items-center gap-2 border-b border-border/70 px-3 pb-3 pt-4 text-center">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close transaction history"
            className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground transition-colors active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <DrawerTitle ref={titleRef} tabIndex={-1}>
              Transactions
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              Search and browse the complete transaction history.
            </DrawerDescription>
          </div>
          <button
            type="button"
            aria-label="Refresh transaction history"
            disabled={!history.isOnline || isRefreshing}
            onClick={refresh}
            className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground transition-colors active:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <RefreshCw
              className={cn("h-4 w-4", isRefreshing && "animate-spin")}
            />
          </button>
        </DrawerHeader>

        <div className="flex min-h-0 flex-1 flex-col bg-card">
          <div className="space-y-2 px-4 pb-2 pt-3">
            <label className="relative block">
              <span className="sr-only">Search transaction history</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search category, note, or account"
                aria-label="Search transaction history"
                className="h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
              />
            </label>
            <div className="flex min-h-5 items-center justify-between gap-3 px-1 text-[11px] text-muted-foreground">
              <span>{countLabel}</span>
              <span className="truncate text-right">
                {isRefreshing
                  ? "Updating…"
                  : history.meta
                    ? `Saved ${format(parseDate(history.meta.capturedAt), "MMM d, HH:mm")}`
                    : history.isDownloading
                      ? "Downloading…"
                      : "Not downloaded"}
              </span>
            </div>
          </div>

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
      </DrawerContent>
    </Drawer>
  );
}
