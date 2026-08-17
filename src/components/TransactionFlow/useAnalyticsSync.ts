import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { useConnectivity, useWorkspace } from '../../app/providers';
import type { ExchangeRateRecord, TransactionRecord } from '../../lib/types';
import {
  buildAnalyticsRateChunks,
  buildAnalyticsRateReadRequest,
  buildAnalyticsRateRequirements,
  buildAnalyticsRateRequirementsFingerprint,
  buildHistoricalRateResolver,
  unresolvedAnalyticsRateRequirements,
} from './analyticsSync';
import {
  clearAnalyticsSyncMetadata,
  readAnalyticsSyncMetadata,
  writeAnalyticsSyncMetadata,
} from './analyticsSyncMetadata';
import { exchangeRateKeys } from './exchangeRateQueries';
import {
  backfillHistoricalRateChunks,
  readHistoricalRates,
  type HistoricalRateRequest,
} from './exchangeRates';
import { useTransactionHistoryQuery } from './useTransactionHistoryQuery';

export type AnalyticsSyncStatus =
  | 'syncing'
  | 'synced'
  | 'incomplete'
  | 'offline';

export type AnalyticsSyncController = {
  records: TransactionRecord[];
  rates: ExchangeRateRecord[];
  hasLocalHistory: boolean;
  status: AnalyticsSyncStatus;
  lastSyncedAt?: string;
  isResyncing: boolean;
  resync: () => void;
};

const analyticsSyncMetadataKeys = {
  detail: (sheetId: string | null, baseCurrency: string) =>
    ['analyticsSyncMetadata', sheetId, baseCurrency] as const,
};

function combinedRecords(
  current: TransactionRecord[],
  refreshed: TransactionRecord[],
): TransactionRecord[] {
  const records = new Map(current.map((record) => [record.id, record]));
  for (const record of refreshed) records.set(record.id, record);
  return [...records.values()];
}

export function useAnalyticsSync(baseCurrencyValue: string): AnalyticsSyncController {
  const queryClient = useQueryClient();
  const { isOnline } = useConnectivity();
  const { sheetId } = useWorkspace();
  const baseCurrency = (baseCurrencyValue || 'THB').trim().toUpperCase();
  const history = useTransactionHistoryQuery(true);

  const requirements = useMemo(
    () => buildAnalyticsRateRequirements(history.records, baseCurrency),
    [baseCurrency, history.records],
  );
  const requirementsFingerprint = useMemo(
    () => buildAnalyticsRateRequirementsFingerprint(requirements),
    [requirements],
  );
  const readRequest = useMemo(
    () => buildAnalyticsRateReadRequest(requirements),
    [requirements],
  );
  const cachedRatesQuery = useQuery({
    queryKey: exchangeRateKeys.cached(readRequest),
    queryFn: () =>
      readRequest
        ? readHistoricalRates(readRequest)
        : Promise.resolve({ rates: [], refreshFailed: false }),
    enabled: history.hasLocalSnapshot && readRequest !== null,
    networkMode: 'always',
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const rates = readRequest ? (cachedRatesQuery.data?.rates ?? []) : [];
  const resolveRate = useMemo(
    () => buildHistoricalRateResolver(rates, baseCurrency),
    [baseCurrency, rates],
  );
  const unresolved = useMemo(
    () => unresolvedAnalyticsRateRequirements(requirements, resolveRate),
    [requirements, resolveRate],
  );
  const chunks = useMemo(() => buildAnalyticsRateChunks(unresolved), [unresolved]);

  const invalidateRateCache = async () => {
    await queryClient.invalidateQueries({
      queryKey: exchangeRateKeys.all,
    });
  };

  const autoBackfill = useMutation({
    mutationFn: (requests: HistoricalRateRequest[]) =>
      backfillHistoricalRateChunks(requests, {
        concurrency: 3,
        isOnline,
        onChunkStored: invalidateRateCache,
      }),
    retry: false,
  });
  const attemptScope = `${sheetId ?? ''}:${baseCurrency}:${history.meta?.capturedAt ?? ''}:${requirementsFingerprint}:${isOnline}`;
  const attemptedRef = useRef<{ scope: string; keys: Set<string> }>({
    scope: attemptScope,
    keys: new Set(),
  });
  if (attemptedRef.current.scope !== attemptScope) {
    attemptedRef.current = { scope: attemptScope, keys: new Set() };
  }
  const pendingChunks = chunks.filter(
    (chunk) => !attemptedRef.current.keys.has(chunk.key),
  );

  useEffect(() => {
    if (
      !sheetId ||
      !baseCurrency ||
      !isOnline ||
      !history.hasLocalSnapshot ||
      (readRequest !== null && !cachedRatesQuery.isSuccess) ||
      autoBackfill.isPending ||
      pendingChunks.length === 0
    ) {
      return;
    }
    for (const chunk of pendingChunks) attemptedRef.current.keys.add(chunk.key);
    autoBackfill.mutate(pendingChunks.map(({ request }) => request));
  }, [
    autoBackfill.isPending,
    autoBackfill.mutate,
    baseCurrency,
    cachedRatesQuery.isSuccess,
    history.hasLocalSnapshot,
    isOnline,
    pendingChunks,
    readRequest,
    sheetId,
  ]);

  const metadataQuery = useQuery({
    queryKey: analyticsSyncMetadataKeys.detail(sheetId, baseCurrency),
    queryFn: () =>
      sheetId
        ? readAnalyticsSyncMetadata(sheetId, baseCurrency)
        : Promise.resolve(null),
    enabled: Boolean(sheetId && baseCurrency),
    networkMode: 'always',
    staleTime: Number.POSITIVE_INFINITY,
  });
  const resyncMutation = useMutation({
    onMutate: async () => {
      if (!sheetId) return;
      await clearAnalyticsSyncMetadata(sheetId, baseCurrency);
      queryClient.setQueryData(
        analyticsSyncMetadataKeys.detail(sheetId, baseCurrency),
        null,
      );
    },
    mutationFn: async () => {
      const refreshed = await history.refresh();
      const records = combinedRecords(
        history.records,
        refreshed.data?.records ?? [],
      );
      const forcedRequirements = buildAnalyticsRateRequirements(records, baseCurrency);
      const forcedChunks = buildAnalyticsRateChunks(forcedRequirements);
      attemptedRef.current.keys.clear();
      const result = await backfillHistoricalRateChunks(
        forcedChunks.map(({ request }) => request),
        {
          concurrency: 3,
          isOnline,
          onChunkStored: invalidateRateCache,
        },
      );
      await invalidateRateCache();
      return result;
    },
    retry: false,
  });
  const resyncFailed =
    resyncMutation.isError || (resyncMutation.data?.failed.length ?? 0) > 0;
  const completionMutation = useMutation({
    mutationFn: (metadata: Parameters<typeof writeAnalyticsSyncMetadata>[0]) =>
      writeAnalyticsSyncMetadata(metadata),
    onSuccess: (metadata) => {
      queryClient.setQueryData(
        analyticsSyncMetadataKeys.detail(metadata.sheetId, metadata.baseCurrency),
        metadata,
      );
    },
  });

  const hasCurrentCompletion =
    metadataQuery.data?.sheetId === sheetId &&
    metadataQuery.data?.baseCurrency === baseCurrency &&
    metadataQuery.data?.historyCapturedAt === history.meta?.capturedAt &&
    metadataQuery.data?.requirementsFingerprint === requirementsFingerprint;

  useEffect(() => {
    if (
      !sheetId ||
      !baseCurrency ||
      !history.meta ||
      history.remoteStatus !== 'success' ||
      history.remoteError ||
      !history.hasLocalSnapshot ||
      !metadataQuery.isSuccess ||
      (readRequest !== null && !cachedRatesQuery.isSuccess) ||
      unresolved.length > 0 ||
      autoBackfill.isPending ||
      resyncMutation.isPending ||
      resyncFailed ||
      completionMutation.isPending ||
      hasCurrentCompletion
    ) {
      return;
    }
    completionMutation.mutate({
      sheetId,
      baseCurrency,
      historyCapturedAt: history.meta.capturedAt,
      requirementsFingerprint,
      completedAt: new Date().toISOString(),
    });
  }, [
    autoBackfill.isPending,
    baseCurrency,
    cachedRatesQuery.isSuccess,
    completionMutation.isPending,
    completionMutation.mutate,
    hasCurrentCompletion,
    history.hasLocalSnapshot,
    history.meta,
    history.remoteError,
    history.remoteStatus,
    metadataQuery.isSuccess,
    readRequest,
    requirementsFingerprint,
    resyncFailed,
    resyncMutation.isPending,
    sheetId,
    unresolved.length,
  ]);

  let status: AnalyticsSyncStatus = 'incomplete';
  if (!isOnline) {
    status = 'offline';
  } else if (
    history.isRefreshing ||
    history.isDownloading ||
    metadataQuery.isFetching ||
    cachedRatesQuery.isFetching ||
    autoBackfill.isPending ||
    resyncMutation.isPending ||
    completionMutation.isPending
  ) {
    status = 'syncing';
  } else if (!resyncFailed && hasCurrentCompletion && unresolved.length === 0) {
    status = 'synced';
  }

  return {
    records: history.records,
    rates,
    hasLocalHistory: history.hasLocalSnapshot,
    status,
    lastSyncedAt: metadataQuery.data?.completedAt,
    isResyncing: resyncMutation.isPending,
    resync: () => {
      if (
        isOnline &&
        !autoBackfill.isPending &&
        !history.isRefreshing &&
        !history.isDownloading &&
        !resyncMutation.isPending
      ) {
        resyncMutation.mutate();
      }
    },
  };
}
