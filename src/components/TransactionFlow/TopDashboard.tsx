import { useQueryClient } from "@tanstack/react-query";
import { format, isSameDay } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { db } from "../../lib/db";
import type { TransactionRecord } from "../../lib/types";
import { cn } from "../../lib/utils";
import { Skeleton } from "../ui/skeleton";
import { useTransactions } from "../providers";
import { useRecentTransactionsQuery } from "./useRecentTransactionsQuery";

export function TopDashboard() {
  const { queueCount, lastSyncAt } = useTransactions();
  const queryClient = useQueryClient();
  const [pendingTransactions, setPendingTransactions] = useState<
    TransactionRecord[]
  >([]);

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

  const todaysTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const date = new Date(t.date);
      return isSameDay(date, today);
    });
  }, [transactions, today]);

  // Calculate total by currency
  const todayTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const t of todaysTransactions) {
      if (t.type === "expense") {
        totals[t.currency] = (totals[t.currency] || 0) + Number(t.amount);
      }
    }
    return totals;
  }, [todaysTransactions]);

  // Pick the primary currency to show (most recent or first)
  const primaryCurrency =
    todaysTransactions.length > 0
      ? todaysTransactions[0].currency
      : Object.keys(todayTotals)[0] || "THB";

  const totalAmount = todayTotals[primaryCurrency] || 0;

  const displayList = todaysTransactions.slice(0, 3);

  return (
    <div className="h-full w-full p-1 animate-in fade-in slide-in-from-top-8 duration-500">
      <div className="flex h-full w-full flex-col overflow-hidden rounded-[24px] bg-surface-variant/30 border border-border/20 backdrop-blur-sm">
        {/* Header Section */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border/10 bg-surface-variant/20">
          <span className="text-sm font-medium text-muted-foreground">
            Today so far
          </span>
          {isLoading ? (
            <Skeleton className="h-7 w-32" />
          ) : (
            <span className="text-lg font-semibold tabular-nums tracking-tight">
              {primaryCurrency}{" "}
              {totalAmount.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          )}
        </div>

        {/* Timeline List */}
        <div className="flex-1 flex flex-col justify-center px-2 py-2">
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
              {displayList.map((t) => (
                <div
                  key={t.id}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2 text-sm"
                >
                  <span className="text-xs text-muted-foreground font-medium tabular-nums w-[60px]">
                    {format(new Date(t.date), "h:mm a")}
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
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
