import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTransactions } from "../../app/providers";
import { transactionQueryKeys } from "./transactionQueryKeys";

export function useDeleteTransactionMutation() {
  const { deleteTransaction } = useTransactions();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteTransaction(id);
      if (!result.ok) {
        throw new Error(result.message);
      }
      return result;
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: transactionQueryKeys.local }),
        queryClient.invalidateQueries({ queryKey: ["recentTransactions"] }),
        queryClient.invalidateQueries({
          queryKey: transactionQueryKeys.reimbursements,
        }),
        queryClient.invalidateQueries({ queryKey: ["transactionById"] }),
      ]);
    },
  });
}
