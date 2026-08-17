import type { QueryClient } from "@tanstack/react-query";
import { transactionQueryKeys } from "./transactionQueryKeys";

export function refreshTransactionHistoryInBackground(
  queryClient: QueryClient,
  sheetId: string | null,
  userId: string | null,
): void {
  const queryKey = transactionQueryKeys.historyRemote(sheetId, userId);
  void queryClient
    .cancelQueries({ queryKey, exact: true })
    .then(() =>
      queryClient.refetchQueries({
        queryKey,
        exact: true,
        type: "active",
      }),
    );
}
