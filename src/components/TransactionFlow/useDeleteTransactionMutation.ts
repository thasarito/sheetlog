import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTransactions } from "../../app/providers";
import { refreshTransactionHistoryInBackground } from "./refreshTransactionHistory";
import { transactionQueryKeys } from "./transactionQueryKeys";

export function useDeleteTransactionMutation() {
  const { deleteTransaction } = useTransactions();
  const queryClient = useQueryClient();

  return useMutation({
    networkMode: "always",
    mutationFn: async (id: string) => {
      const result = await deleteTransaction(id);
      if (!result.ok) {
        throw new Error(result.message);
      }
      return result;
    },
    onSettled: async () => {
      const invalidations = [
        queryClient.invalidateQueries({ queryKey: transactionQueryKeys.local }),
        queryClient.invalidateQueries({ queryKey: ["recentTransactions"] }),
        queryClient.invalidateQueries({
          queryKey: transactionQueryKeys.history,
          refetchType: "none",
        }),
        queryClient.invalidateQueries({
          queryKey: transactionQueryKeys.reimbursements,
        }),
        queryClient.invalidateQueries({ queryKey: ["transactionById"] }),
      ];
      refreshTransactionHistoryInBackground(queryClient);
      await Promise.all(invalidations);
    },
  });
}
