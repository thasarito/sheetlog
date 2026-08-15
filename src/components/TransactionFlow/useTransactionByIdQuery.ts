import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnectivity, useSession, useWorkspace } from "../../app/providers";
import { db } from "../../lib/db";
import { readTransactionById as realReadTransactionById } from "../../lib/google";
import {
  IS_DEV_MODE,
  readTransactionById as mockReadTransactionById,
} from "../../lib/mock";
import type { TransactionRecord } from "../../lib/types";
import { isTransactionInSheetScope } from "../../lib/transactionScope";
import { transactionQueryKeys } from "./transactionQueryKeys";

const readTransactionById = IS_DEV_MODE
  ? mockReadTransactionById
  : realReadTransactionById;

function isAuthoritativeLocalSource(
  transaction: TransactionRecord | undefined,
): boolean {
  return Boolean(
    transaction &&
      (transaction.status === "pending" || transaction.status === "error") &&
      !transaction.sheetId,
  );
}

function findRecentTransaction(
  queryClient: ReturnType<typeof useQueryClient>,
  sheetId: string | null,
  userId: string | null,
  id: string,
): TransactionRecord | undefined {
  const recentPrefix = transactionQueryKeys
    .recent(sheetId, userId)
    .slice(0, 3);
  const recentQueries = queryClient.getQueriesData<TransactionRecord[]>({
    queryKey: recentPrefix,
  });

  for (const [, transactions] of recentQueries) {
    const match = transactions?.find((transaction) => transaction.id === id);
    if (match) {
      return match;
    }
  }

  return undefined;
}

export function useTransactionByIdQuery(id: string | null | undefined) {
  const { accessToken, userProfile } = useSession();
  const { sheetId } = useWorkspace();
  const { isOnline } = useConnectivity();
  const queryClient = useQueryClient();
  const sourceId = id ?? "";
  const userId = userProfile?.id ?? null;
  const queryKey = transactionQueryKeys.transaction(
    sheetId,
    userId,
    sourceId,
  );
  const fallbackQueryKey = transactionQueryKeys.transactionFallback(
    sheetId,
    userId,
    sourceId,
  );

  const fallbackQuery = useQuery<TransactionRecord | null>({
    queryKey: fallbackQueryKey,
    enabled: Boolean(id),
    networkMode: "always",
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
    queryFn: async () => {
      if (!id) {
        return null;
      }

      const recentTransaction = findRecentTransaction(
        queryClient,
        sheetId,
        userId,
        id,
      );
      const localTransaction = await db.transactions.get(id);
      const scopedLocalTransaction =
        localTransaction &&
        isTransactionInSheetScope(
          localTransaction,
          sheetId,
          userId,
        )
          ? localTransaction
          : undefined;
      return scopedLocalTransaction ?? recentTransaction ?? null;
    },
  });

  const fallbackIsLocalOnly = isAuthoritativeLocalSource(
    fallbackQuery.data ?? undefined,
  );
  const canReadRemote = Boolean(
    id &&
      isOnline &&
      accessToken &&
      sheetId &&
      userId &&
      fallbackQuery.isSuccess &&
      !fallbackIsLocalOnly,
  );
  const remoteQuery = useQuery<TransactionRecord | null>({
    queryKey,
    enabled: canReadRemote,
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
    queryFn: async () => {
      if (!id || !accessToken || !sheetId) {
        return null;
      }
      return readTransactionById(accessToken, sheetId, id);
    },
  });

  const remoteDataIsKnown = remoteQuery.data !== undefined;
  const data = fallbackIsLocalOnly
    ? fallbackQuery.data
    : canReadRemote
      ? remoteQuery.data
      : remoteDataIsKnown
        ? remoteQuery.data
        : fallbackQuery.data;
  const selectedQuery =
    fallbackIsLocalOnly || (!canReadRemote && !remoteDataIsKnown)
      ? fallbackQuery
      : remoteQuery;
  const remoteIsFetching = canReadRemote && remoteQuery.isFetching;
  const isFetching = Boolean(
    id && (fallbackQuery.isFetching || remoteIsFetching),
  );
  const remoteIsError = canReadRemote && remoteQuery.isError;
  const isError = fallbackQuery.isError || remoteIsError;

  async function refetch() {
    const fallbackResult = await fallbackQuery.refetch();
    const refreshedFallbackIsLocalOnly = isAuthoritativeLocalSource(
      fallbackResult.data ?? undefined,
    );
    if (
      id &&
      isOnline &&
      accessToken &&
      sheetId &&
      userId &&
      !refreshedFallbackIsLocalOnly
    ) {
      await remoteQuery.refetch();
    }
  }

  return {
    ...selectedQuery,
    data,
    error: fallbackQuery.error ?? (remoteIsError ? remoteQuery.error : null),
    isError,
    isSuccess: !isError && selectedQuery.isSuccess,
    isPending: Boolean(id && data === undefined && !isError),
    isLoading: Boolean(id && data === undefined && isFetching),
    isFetching,
    fetchStatus: isFetching ? "fetching" : selectedQuery.fetchStatus,
    isChecking: isFetching,
    refetch,
  };
}
