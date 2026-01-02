"use client";

import React from "react";
import { RefreshCw } from "lucide-react";
import { StatusDot } from "../StatusDot";

type FlowHeaderProps = {
  isOnline: boolean;
  queueCount: number;
  sheetId: string | null;
  onSync: () => void;
  onRefreshSheet: () => void;
};

export function FlowHeader({
  isOnline,
  queueCount,
  sheetId,
  onSync,
  onRefreshSheet,
}: FlowHeaderProps) {
  return (
    <header className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            SheetLog
          </p>
          <h1 className="text-2xl font-semibold">Fast log to your sheet</h1>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <StatusDot online={isOnline} />
          <span className="text-muted-foreground">
            {isOnline ? "Online" : "Offline"}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-surface-2 px-4 py-3 text-xs text-muted-foreground">
        <span>Queue: {queueCount} pending</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground transition hover:bg-surface"
            onClick={onSync}
          >
            <RefreshCw className="h-3 w-3" />
            Sync
          </button>
          {sheetId ? (
            <span className="text-success">Sheet ready</span>
          ) : (
            <button
              type="button"
              className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground transition hover:bg-surface"
              onClick={onRefreshSheet}
            >
              Setup Sheet
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
