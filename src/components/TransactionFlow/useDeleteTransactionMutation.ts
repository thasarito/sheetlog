import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTransactions } from "../providers";

export function useDeleteTransactionMutation() {
  const { deleteTransaction } = useTransactions();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return deleteTransaction(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recentTransactions"] });
    },
  });
}
