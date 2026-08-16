import { useQuery, useQueryClient } from "@tanstack/react-query";
import { liveQuery } from "dexie";
import { useEffect } from "react";
import { useSession, useWorkspace } from "../../app/providers";
import { db } from "../../lib/db";
import { visibleLocalTransactionsForSheet } from "../../lib/transactionScope";
import { transactionQueryKeys } from "./transactionQueryKeys";

async function readLocalTransactions(
  sheetId: string | null,
  userId: string | null,
) {
  const rows = await db.transactions
    .where("status")
    .anyOf("pending", "error")
    .toArray();

  return visibleLocalTransactionsForSheet(rows, sheetId, userId).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export function useLocalTransactionsQuery() {
  const queryClient = useQueryClient();
  const { sheetId } = useWorkspace();
  const { userProfile } = useSession();
  const userId = userProfile?.id ?? null;
  const queryKey = transactionQueryKeys.localForSheet(sheetId, userId);
  const query = useQuery({
    queryKey,
    networkMode: "always",
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () => readLocalTransactions(sheetId, userId),
  });

  useEffect(() => {
    if (!query.isSuccess) {
      return;
    }
    const liveQueryKey = transactionQueryKeys.localForSheet(sheetId, userId);
    const subscription = liveQuery(() =>
      readLocalTransactions(sheetId, userId),
    ).subscribe({
      next: (rows) => {
        queryClient.setQueryData(liveQueryKey, rows);
      },
      error: () => {
        void queryClient.invalidateQueries({
          queryKey: liveQueryKey,
          exact: true,
        });
      },
    });

    return () => subscription.unsubscribe();
  }, [query.isSuccess, queryClient, sheetId, userId]);

  return query;
}
