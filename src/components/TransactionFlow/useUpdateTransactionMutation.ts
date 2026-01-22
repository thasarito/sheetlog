import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TransactionInput } from "../../lib/types";
import { useTransactions } from "../../app/providers";

export function useUpdateTransactionMutation() {
  const { updateTransaction } = useTransactions();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: Partial<TransactionInput>;
    }) => {
      await updateTransaction(id, input);
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["recentTransactions"] });
    },
  });
}
