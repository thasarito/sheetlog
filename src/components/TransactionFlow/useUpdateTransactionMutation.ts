import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TransactionInput } from "../../lib/types";
import { useTransactions } from "../../app/providers";
import { transactionQueryKeys } from "./transactionQueryKeys";

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
      const record = await updateTransaction(id, input);
      if (record?.status === "error") {
        throw new Error(
          record.error ?? "Transaction could not be synced. Retry or delete it.",
        );
      }
      return record;
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
