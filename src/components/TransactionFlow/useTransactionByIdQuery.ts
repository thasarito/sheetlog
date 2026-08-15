import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useConnectivity, useSession, useWorkspace } from "../../app/providers";
import { db } from "../../lib/db";
import { readTransactionById as realReadTransactionById } from "../../lib/google";
import {
  IS_DEV_MODE,
  readTransactionById as mockReadTransactionById,
} from "../../lib/mock";
import type { TransactionRecord } from "../../lib/types";
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
  id: string,
): TransactionRecord | undefined {
  const recentPrefix = transactionQueryKeys.recent(sheetId).slice(0, 2);
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
  const { accessToken } = useSession();
  const { sheetId } = useWorkspace();
  const { isOnline } = useConnectivity();
  const queryClient = useQueryClient();
  const canReadRemote = Boolean(id && isOnline && accessToken && sheetId);
  const couldReadRemoteRef = useRef(canReadRemote);
  const remoteStateRef = useRef({ accessToken, isOnline, sheetId });
  remoteStateRef.current = { accessToken, isOnline, sheetId };
  const queryKey = transactionQueryKeys.transaction(sheetId, id ?? "");

  const query = useQuery<TransactionRecord | null>({
    queryKey,
    enabled: Boolean(id),
    networkMode: "always",
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
    queryFn: async () => {
      if (!id) {
        return null;
      }

      const cachedTransaction = queryClient.getQueryData<
        TransactionRecord | null
      >(queryKey);
      const cachedTransactionIsKnown = cachedTransaction !== undefined;
      const recentTransaction = findRecentTransaction(
        queryClient,
        sheetId,
        id,
      );
      const localTransaction = await db.transactions.get(id);
      if (
        localTransaction &&
        isAuthoritativeLocalSource(localTransaction)
      ) {
        return localTransaction;
      }

      const remoteState = remoteStateRef.current;
      if (
        remoteState.isOnline &&
        remoteState.accessToken &&
        sheetId &&
        remoteState.sheetId === sheetId
      ) {
        return readTransactionById(
          remoteState.accessToken,
          sheetId,
          id,
        );
      }

      if (
        localTransaction?.status === "pending" ||
        localTransaction?.status === "error"
      ) {
        return localTransaction;
      }
      if (cachedTransactionIsKnown) {
        return cachedTransaction;
      }

      return localTransaction ?? recentTransaction ?? null;
    },
  });

  useEffect(() => {
    const couldReadRemote = couldReadRemoteRef.current;
    couldReadRemoteRef.current = canReadRemote;
    if (!couldReadRemote && canReadRemote) {
      void query.refetch();
    }
  }, [canReadRemote, query.refetch]);

  return {
    ...query,
    isChecking: canReadRemote && query.isFetching,
  };
}
