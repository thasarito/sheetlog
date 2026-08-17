import { format } from 'date-fns';
import { RefreshCw } from 'lucide-react';
import type { AnalyticsSyncStatus } from './TransactionFlow/useAnalyticsSync';

type AnalyticsSyncSettingProps = {
  status: AnalyticsSyncStatus;
  lastSyncedAt?: string;
  isResyncing: boolean;
  onResync: () => void;
};

function statusLabel(status: AnalyticsSyncStatus, lastSyncedAt?: string): string {
  if (status === 'syncing') return 'Syncing…';
  if (status === 'offline') return 'Offline · waiting';
  if (status === 'incomplete') return 'Incomplete';
  const timestamp = lastSyncedAt ? new Date(lastSyncedAt) : null;
  return timestamp && Number.isFinite(timestamp.getTime())
    ? `Synced · ${format(timestamp, 'h:mm a')}`
    : 'Synced';
}

export function AnalyticsSyncSetting({
  status,
  lastSyncedAt,
  isResyncing,
  onResync,
}: AnalyticsSyncSettingProps) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#5856D6] text-white">
        <RefreshCw
          className={`h-4 w-4 ${isResyncing ? 'animate-spin motion-reduce:animate-none' : ''}`}
          aria-hidden="true"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] text-foreground">Analytics sync</p>
        <p
          className="truncate text-[13px] text-muted-foreground"
          aria-live="polite"
        >
          {statusLabel(status, lastSyncedAt)}
        </p>
      </div>
      <button
        type="button"
        onClick={onResync}
        disabled={isResyncing || status === 'syncing' || status === 'offline'}
        aria-label="Resync analytics"
        aria-busy={isResyncing}
        className="min-h-11 rounded-[10px] border border-border bg-surface px-3 text-[13px] font-semibold text-primary active:bg-surface-2 disabled:opacity-50"
      >
        Resync
      </button>
    </div>
  );
}
