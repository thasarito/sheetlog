import { format } from 'date-fns';
import { RefreshCw } from 'lucide-react';
import type { AnalyticsSyncStatus } from './TransactionFlow/useAnalyticsSync';
import { SettingsIconBadge } from './SettingsIconBadge';
import {
  getTransactionHistorySyncDetail,
  isTransactionHistorySyncBusy,
} from './transactionHistorySyncPresentation';

type AnalyticsSyncSettingProps = {
  transactionCount: number;
  historyCapturedAt?: string;
  isHistoryLoading: boolean;
  isHistoryDownloading: boolean;
  isHistoryRefreshing: boolean;
  status: AnalyticsSyncStatus;
  isResyncing: boolean;
  onResync: () => void;
};

export function AnalyticsSyncSetting({
  transactionCount,
  historyCapturedAt,
  isHistoryLoading,
  isHistoryDownloading,
  isHistoryRefreshing,
  status,
  isResyncing,
  onResync,
}: AnalyticsSyncSettingProps) {
  const presentation = {
    transactionCount,
    capturedAt: historyCapturedAt,
    status,
    isLoading: isHistoryLoading,
    isDownloading: isHistoryDownloading,
    isRefreshing: isHistoryRefreshing,
    isResyncing,
  };
  const busy = isTransactionHistorySyncBusy(presentation);
  const detail = getTransactionHistorySyncDetail(presentation, (date) =>
    format(date, 'MMM d, HH:mm'),
  );

  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-3">
      <SettingsIconBadge>
        <RefreshCw
          className={`h-4 w-4 ${busy ? 'animate-spin motion-reduce:animate-none' : ''}`}
          aria-hidden="true"
        />
      </SettingsIconBadge>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] text-foreground">Transaction history</p>
        <p
          className="min-w-0 break-words text-[13px] leading-5 text-muted-foreground"
          aria-live="polite"
        >
          {detail}
        </p>
      </div>
      <button
        type="button"
        onClick={onResync}
        disabled={busy || status === 'offline'}
        aria-label="Resync transaction history"
        aria-busy={busy}
        className="min-h-11 rounded-[10px] border border-border bg-surface px-3 text-[13px] font-semibold text-primary active:bg-surface-2 disabled:opacity-50"
      >
        Resync
      </button>
    </div>
  );
}
