import type { QueryClient } from "@tanstack/react-query";
import { transactionQueryKeys } from "./transactionQueryKeys";

export function refreshTransactionHistoryInBackground(
  queryClient: QueryClient,
): void {
  void queryClient
    .cancelQueries({ queryKey: transactionQueryKeys.historyRemoteAll })
    .then(() =>
      queryClient.refetchQueries({
        queryKey: transactionQueryKeys.historyRemoteAll,
        type: "active",
      }),
    );
}
