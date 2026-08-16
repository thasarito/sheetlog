import { useQuery, useQueryClient } from "@tanstack/react-query";
import { liveQuery } from "dexie";
import { useEffect, useMemo } from "react";
import {
  useConnectivity,
  useSession,
  useWorkspace,
} from "../../app/providers";
import { db } from "../../lib/db";
import { getTransactionHistorySnapshot as realGetTransactionHistorySnapshot } from "../../lib/google";
import {
  IS_DEV_MODE,
  getTransactionHistorySnapshot as mockGetTransactionHistorySnapshot,
} from "../../lib/mock";
import {
  readTransactionHistorySnapshot,
  reconcileTransactionHistory,
  replaceTransactionHistorySnapshot,
} from "../../lib/transactionHistory";
import { visibleLocalTransactionsForSheet } from "../../lib/transactionScope";
import type {
  TransactionHistorySnapshot,
  TransactionRecord,
} from "../../lib/types";
import { transactionQueryKeys } from "./transactionQueryKeys";

const HISTORY_STALE_TIME = 5 * 60 * 1000;
const getTransactionHistorySnapshot = IS_DEV_MODE
  ? mockGetTransactionHistorySnapshot
  : realGetTransactionHistorySnapshot;

async function readLocalHistoryTransactions(
  sheetId: string | null,
  userId: string | null,
): Promise<TransactionRecord[]> {
  const rows = await db.transactions.toArray();
  return visibleLocalTransactionsForSheet(rows, sheetId, userId);
}

function newestSnapshot(
  remote: TransactionHistorySnapshot | undefined,
  cached: TransactionHistorySnapshot | null | undefined,
): TransactionHistorySnapshot | null {
  if (!remote) {
    return cached ?? null;
  }
  if (!cached) {
    return remote;
  }
  const remoteCapturedAt = new Date(remote.meta.capturedAt).getTime();
  const cachedCapturedAt = new Date(cached.meta.capturedAt).getTime();
  return cachedCapturedAt > remoteCapturedAt ? cached : remote;
}

export function useTransactionHistoryQuery(enabled: boolean) {
  const queryClient = useQueryClient();
  const { isOnline } = useConnectivity();
  const { accessToken, userProfile } = useSession();
  const { sheetId } = useWorkspace();
  const userId = userProfile?.id ?? null;
  const hasScope = Boolean(sheetId && userId);
  const cacheKey = transactionQueryKeys.historyCache(sheetId, userId);
  const localKey = transactionQueryKeys.historyLocal(sheetId, userId);

  useEffect(() => {
    if (!enabled) {
      void queryClient.cancelQueries({
        queryKey: transactionQueryKeys.historyRemote(sheetId, userId),
        exact: true,
      });
    }
  }, [enabled, queryClient, sheetId, userId]);

  const cacheQuery = useQuery<TransactionHistorySnapshot | null>({
    queryKey: cacheKey,
    queryFn: () =>
      sheetId ? readTransactionHistorySnapshot(sheetId) : Promise.resolve(null),
    enabled: enabled && hasScope,
    networkMode: "always",
    staleTime: Number.POSITIVE_INFINITY,
  });

  const localQuery = useQuery<TransactionRecord[]>({
    queryKey: localKey,
    queryFn: () => readLocalHistoryTransactions(sheetId, userId),
    enabled: enabled && hasScope,
    networkMode: "always",
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    if (!enabled || !hasScope || !cacheQuery.isSuccess) {
      return;
    }
    const subscription = liveQuery(() =>
      sheetId ? readTransactionHistorySnapshot(sheetId) : Promise.resolve(null),
    ).subscribe({
      next: (snapshot) => queryClient.setQueryData(cacheKey, snapshot),
      error: () => {
        void queryClient.invalidateQueries({ queryKey: cacheKey, exact: true });
      },
    });
    return () => subscription.unsubscribe();
  }, [cacheKey, cacheQuery.isSuccess, enabled, hasScope, queryClient, sheetId]);

  useEffect(() => {
    if (!enabled || !hasScope || !localQuery.isSuccess) {
      return;
    }
    const subscription = liveQuery(() =>
      readLocalHistoryTransactions(sheetId, userId),
    ).subscribe({
      next: (records) => queryClient.setQueryData(localKey, records),
      error: () => {
        void queryClient.invalidateQueries({ queryKey: localKey, exact: true });
      },
    });
    return () => subscription.unsubscribe();
  }, [enabled, hasScope, localKey, localQuery.isSuccess, queryClient, sheetId, userId]);

  const remoteQuery = useQuery<TransactionHistorySnapshot>({
    queryKey: transactionQueryKeys.historyRemote(sheetId, userId),
    queryFn: async ({ signal }) => {
      if (!accessToken || !sheetId) {
        throw new Error("Transaction history requires an active Sheet");
      }
      const snapshot = await getTransactionHistorySnapshot(
        accessToken,
        sheetId,
        { signal },
      );
      if (signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      return replaceTransactionHistorySnapshot(snapshot);
    },
    enabled: enabled && isOnline && Boolean(accessToken && sheetId && userId),
    staleTime: HISTORY_STALE_TIME,
  });

  const snapshot = newestSnapshot(remoteQuery.data, cacheQuery.data);
  const records = useMemo(
    () =>
      reconcileTransactionHistory({
        cachedRecords: snapshot?.records ?? [],
        localTransactions: localQuery.data ?? [],
        capturedAt: snapshot?.meta.capturedAt,
      }),
    [localQuery.data, snapshot],
  );
  const error =
    remoteQuery.error instanceof Error
      ? remoteQuery.error
      : cacheQuery.error instanceof Error
        ? cacheQuery.error
        : localQuery.error instanceof Error
          ? localQuery.error
          : null;
  const hasCompleteCache = snapshot !== null;

  return {
    records,
    meta: snapshot?.meta ?? null,
    error,
    hasCompleteCache,
    isLoading:
      enabled &&
      !hasCompleteCache &&
      (cacheQuery.isLoading || localQuery.isLoading || remoteQuery.isLoading),
    isRefreshing: hasCompleteCache && remoteQuery.isFetching,
    isDownloading: !hasCompleteCache && remoteQuery.isFetching,
    isOnline,
    refresh: remoteQuery.refetch,
  };
}
