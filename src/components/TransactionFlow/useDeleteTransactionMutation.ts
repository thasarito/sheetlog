import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTransactions } from "../../app/providers";

export function useDeleteTransactionMutation() {
  const { deleteTransaction } = useTransactions();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return deleteTransaction(id);
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["recentTransactions"] });
    },
  });
}
