import type { AnalyticsSyncStatus } from './TransactionFlow/useAnalyticsSync';

export type TransactionHistorySyncState = {
  transactionCount: number;
  capturedAt?: string;
  status: AnalyticsSyncStatus;
  isLoading: boolean;
  isDownloading: boolean;
  isRefreshing: boolean;
  isResyncing: boolean;
};

function transactionCountLabel(count: number): string {
  const safeCount = Number.isFinite(count)
    ? Math.max(0, Math.trunc(count))
    : 0;
  return `${safeCount} ${safeCount === 1 ? 'transaction' : 'transactions'}`;
}

function transactionHistoryStatusLabel(
  state: TransactionHistorySyncState,
  formatSavedAt: (date: Date) => string,
): string {
  if (state.status === 'offline') return 'Offline';
  if (state.isResyncing || state.isRefreshing) return 'Updating…';
  if (state.isLoading || state.isDownloading) return 'Downloading…';
  if (state.status === 'syncing') return 'Updating…';

  const capturedAt = state.capturedAt ? new Date(state.capturedAt) : null;
  if (capturedAt && Number.isFinite(capturedAt.getTime())) {
    return `Last saved ${formatSavedAt(capturedAt)}`;
  }
  return 'Not downloaded';
}

export function getTransactionHistorySyncDetail(
  state: TransactionHistorySyncState,
  formatSavedAt: (date: Date) => string,
): string {
  return `${transactionCountLabel(state.transactionCount)} · ${transactionHistoryStatusLabel(
    state,
    formatSavedAt,
  )}`;
}

export function isTransactionHistorySyncBusy(
  state: TransactionHistorySyncState,
): boolean {
  if (state.status === 'offline') return false;
  return (
    state.isResyncing ||
    state.isRefreshing ||
    state.isLoading ||
    state.isDownloading ||
    state.status === 'syncing'
  );
}
