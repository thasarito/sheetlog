import { RefreshCw, Search } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";
import { useCategoryStepSheetAccessory } from "./CategoryStepSheetAccessory";

export type TransactionHistoryDockProps = {
  search: string;
  onSearchChange: (value: string) => void;
  countLabel: string;
  statusLabel: string;
  canRefresh: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
};

export function TransactionHistoryDock({
  search,
  onSearchChange,
  countLabel,
  statusLabel,
  canRefresh,
  isRefreshing,
  onRefresh,
}: TransactionHistoryDockProps) {
  const accessory = useCategoryStepSheetAccessory();
  const dockRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!accessory.provided || !accessory.host || !dockRef.current) return;

    const measure = () => {
      const height = dockRef.current?.getBoundingClientRect().height ?? 0;
      accessory.reportHeight(height);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(dockRef.current);
    return () => observer.disconnect();
  }, [accessory]);

  if (accessory.provided && !accessory.host) return null;

  const dock = (
    <div
      ref={dockRef}
      data-testid="transaction-history-dock"
      data-vaul-no-drag
      className="pointer-events-auto relative mx-3 rounded-2xl border border-border/70 bg-background/95 p-2 backdrop-blur-md"
    >
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-full h-2 w-px -translate-x-1/2 bg-border/80"
      />
      <label className="relative block">
        <span className="sr-only">Search transaction history</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search category, note, or account"
          aria-label="Search transaction history"
          className="h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
        />
      </label>
      <div
        data-testid="transaction-history-metadata"
        className="flex min-h-11 items-center justify-between gap-3 px-1 text-[11px] text-muted-foreground"
      >
        <span>{countLabel}</span>
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate text-right">{statusLabel}</span>
          <button
            type="button"
            aria-label="Refresh transaction history"
            disabled={!canRefresh}
            onClick={onRefresh}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors active:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <RefreshCw
              className={cn("h-4 w-4", isRefreshing && "animate-spin")}
            />
          </button>
        </div>
      </div>
    </div>
  );

  return accessory.host ? createPortal(dock, accessory.host) : dock;
}
