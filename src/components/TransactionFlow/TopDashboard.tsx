import { useQueryClient } from "@tanstack/react-query";
import { format, isSameDay, subDays } from "date-fns";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  AnimatePresence,
} from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db } from "../../lib/db";
import type { TransactionRecord } from "../../lib/types";
import { cn } from "../../lib/utils";
import { useTransactions } from "../providers";
import { AnimatedNumber } from "../ui/AnimatedNumber";
import { Skeleton } from "../ui/skeleton";
import { useRecentTransactionsQuery } from "./useRecentTransactionsQuery";

export function TopDashboard() {
  const { queueCount, lastSyncAt } = useTransactions();
  const queryClient = useQueryClient();
  const [pendingTransactions, setPendingTransactions] = useState<
    TransactionRecord[]
  >([]);
  const [visibleDate, setVisibleDate] = useState<string>(() =>
    format(new Date(), "yyyy-MM-dd")
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const visibleItemsRef = useRef<Set<string>>(new Set());

  // Scroll-linked physics for header
  const scrollY = useMotionValue(0);
  const smoothScrollY = useSpring(scrollY, { stiffness: 300, damping: 30 });
  const headerY = useTransform(smoothScrollY, [-50, 0, 50], [4, 0, -4]);
  const headerOpacity = useTransform(
    smoothScrollY,
    [-30, 0, 30],
    [0.7, 1, 0.7]
  );

  // Fetch recent transactions from Google Sheet
  const { data: sheetTransactions, isLoading } = useRecentTransactionsQuery();

  // Invalidate query when sync completes
  useEffect(() => {
    if (lastSyncAt) {
      void queryClient.invalidateQueries({ queryKey: ["recentTransactions"] });
    }
  }, [lastSyncAt, queryClient]);

  // Fetch pending transactions from local DB
  // biome-ignore lint/correctness/useExhaustiveDependencies: queueCount is a trigger for re-fetching
  useEffect(() => {
    async function loadPending() {
      const pending = await db.transactions
        .where("status")
        .equals("pending")
        .reverse()
        .sortBy("createdAt");
      setPendingTransactions(pending);
    }
    void loadPending();
  }, [queueCount]);

  const transactions = useMemo(() => {
    const remote = sheetTransactions ?? [];
    // Combine pending + remote.
    // De-duplicate by ID just in case (though status separation should handle it)
    const combined = [...pendingTransactions, ...remote];
    const seen = new Set<string>();
    const unique: TransactionRecord[] = [];

    for (const t of combined) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      unique.push(t);
    }

    // Sort by createdAt descending (newest first)
    return unique.sort((a, b) => {
      const caA = new Date(a.createdAt).getTime();
      const caB = new Date(b.createdAt).getTime();
      return caB - caA;
    });
  }, [pendingTransactions, sheetTransactions]);

  const today = useMemo(() => new Date(), []);

  // Group transactions by date
  const transactionsByDate = useMemo(() => {
    const grouped: Record<string, TransactionRecord[]> = {};
    for (const t of transactions) {
      const dateKey = format(new Date(t.date), "yyyy-MM-dd");
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(t);
    }
    return grouped;
  }, [transactions]);

  // Calculate totals by date and currency
  const totalsByDate = useMemo(() => {
    const totals: Record<string, Record<string, number>> = {};
    for (const [dateKey, txns] of Object.entries(transactionsByDate)) {
      totals[dateKey] = {};
      for (const t of txns) {
        if (t.type === "expense") {
          totals[dateKey][t.currency] =
            (totals[dateKey][t.currency] || 0) + Number(t.amount);
        }
      }
    }
    return totals;
  }, [transactionsByDate]);

  // Dynamic header based on visible date
  const headerLabel = useMemo(() => {
    const visibleDateObj = new Date(visibleDate + "T00:00:00");
    if (isSameDay(visibleDateObj, today)) return "Today so far";
    if (isSameDay(visibleDateObj, subDays(today, 1))) return "Yesterday";
    return format(visibleDateObj, "MMM d");
  }, [visibleDate, today]);

  const visibleTotals = totalsByDate[visibleDate] || {};
  const currencyEntries = Object.entries(visibleTotals)
    .filter(([, amount]) => amount > 0)
    .sort(([a], [b]) => {
      // THB first, USD second, then alphabetically
      const order = ["THB", "USD"];
      const aIdx = order.indexOf(a);
      const bIdx = order.indexOf(b);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.localeCompare(b);
    });

  const displayList = transactions;

  // Format date label for separators
  const formatDateLabel = useCallback(
    (dateKey: string) => {
      const dateObj = new Date(dateKey + "T00:00:00");
      if (isSameDay(dateObj, today)) return "Today";
      if (isSameDay(dateObj, subDays(today, 1))) return "Yesterday";
      return format(dateObj, "EEEE, MMM d");
    },
    [today]
  );

  // Update visible date based on majority of visible items
  const updateVisibleDate = useCallback(() => {
    const counts: Record<string, number> = {};
    for (const itemId of visibleItemsRef.current) {
      const [dateKey] = itemId.split(":");
      counts[dateKey] = (counts[dateKey] || 0) + 1;
    }

    let maxCount = 0;
    let majorityDate = format(today, "yyyy-MM-dd");
    for (const [dateKey, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        majorityDate = dateKey;
      }
    }

    setVisibleDate(majorityDate);
  }, [today]);

  // IntersectionObserver for tracking visible items
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const itemId = (entry.target as HTMLElement).dataset.itemId;
          if (!itemId) continue;

          if (entry.isIntersecting) {
            visibleItemsRef.current.add(itemId);
          } else {
            visibleItemsRef.current.delete(itemId);
          }
        }
        updateVisibleDate();
      },
      {
        root: container,
        threshold: 0.5,
      }
    );

    const items = container.querySelectorAll("[data-item-id]");
    for (const item of items) {
      observer.observe(item);
    }

    return () => observer.disconnect();
  }, [updateVisibleDate, displayList]);

  // Scroll event for physics-based header animation
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let lastScrollTop = container.scrollTop;

    const handleScroll = () => {
      const delta = container.scrollTop - lastScrollTop;
      scrollY.set(delta);

      // Reset to 0 after scroll settles (spring will animate back)
      requestAnimationFrame(() => {
        scrollY.set(0);
      });

      lastScrollTop = container.scrollTop;
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [scrollY]);

  return (
    <div className="h-full w-full p-1 animate-in fade-in slide-in-from-top-8 duration-500">
      <div className="flex h-full w-full flex-col">
        {/* Header Section */}
        <motion.div
          style={{ y: headerY, opacity: headerOpacity }}
          className="flex items-center justify-between px-4 py-2 border-b border-border/10"
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={headerLabel}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className="text-sm font-medium text-muted-foreground"
            >
              {headerLabel}
            </motion.span>
          </AnimatePresence>
          {isLoading ? (
            <Skeleton className="h-7 w-32" />
          ) : currencyEntries.length === 0 ? (
            <span className="text-lg font-semibold tabular-nums tracking-tight text-muted-foreground">
              —
            </span>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={visibleDate}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className="flex items-center gap-1"
              >
                {currencyEntries.map(([currency, amount], idx) => {
                  const symbol =
                    currency === "THB"
                      ? "฿"
                      : currency === "USD"
                      ? "$"
                      : currency;
                  return (
                    <span
                      key={currency}
                      className="text-lg font-semibold tabular-nums tracking-tight"
                    >
                      {idx > 0 && (
                        <span className="text-muted-foreground mx-1">·</span>
                      )}
                      <AnimatedNumber value={amount} prefix={symbol} />
                    </span>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          )}
        </motion.div>

        {/* Timeline List */}
        <div
          ref={scrollContainerRef}
          className={cn(
            "flex-1 flex flex-col px-2 py-2 overflow-y-auto",
            displayList.length === 0 && !isLoading && "justify-center"
          )}
        >
          {isLoading ? (
            <div className="space-y-3 px-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
                  key={i}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-2 py-1"
                >
                  <Skeleton className="h-3 w-[50px]" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16 place-self-end" />
                </div>
              ))}
            </div>
          ) : displayList.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-muted-foreground/40 gap-1">
              <span className="text-xs">No transactions yet</span>
            </div>
          ) : (
            <div className="space-y-0.5">
              {displayList.map((t, idx) => {
                const currentDate = format(new Date(t.date), "yyyy-MM-dd");
                const prevDate =
                  idx > 0
                    ? format(new Date(displayList[idx - 1].date), "yyyy-MM-dd")
                    : null;
                const showDateSeparator = currentDate !== prevDate;

                return (
                  <div key={t.id}>
                    {showDateSeparator && (
                      <div className="text-xs text-muted-foreground font-medium px-3 py-2">
                        {formatDateLabel(currentDate)}
                      </div>
                    )}
                    <div
                      data-item-id={`${currentDate}:${t.id}`}
                      className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2 text-sm"
                    >
                      <span className="text-xs text-muted-foreground font-medium tabular-nums w-[60px]">
                        {format(new Date(t.date), "HH:mm")}
                      </span>

                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <span className="text-foreground truncate font-medium">
                          {t.category}
                          {t.note && (
                            <span className="font-normal text-muted-foreground ml-1">
                              - {t.note}
                            </span>
                          )}
                        </span>
                      </div>

                      <span
                        className={cn(
                          "font-medium tabular-nums whitespace-nowrap",
                          t.type === "income"
                            ? "text-emerald-500"
                            : t.type === "expense"
                            ? "text-foreground"
                            : "text-blue-500" // transfer
                        )}
                      >
                        {t.type === "expense" ? "" : "+"}
                        {Number(t.amount).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
