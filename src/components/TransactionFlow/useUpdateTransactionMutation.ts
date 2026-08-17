import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  TransactionRecord,
  TransactionUpdateInput,
} from "../../lib/types";
import { useTransactions } from "../../app/providers";
import { refreshTransactionHistoryInBackground } from "./refreshTransactionHistory";
import { transactionQueryKeys } from "./transactionQueryKeys";

export class UpdateTransactionRecordError extends Error {
  readonly record: TransactionRecord;

  constructor(message: string, record: TransactionRecord) {
    super(message);
    this.name = "UpdateTransactionRecordError";
    this.record = record;
  }
}

export function useUpdateTransactionMutation() {
  const { updateTransaction } = useTransactions();
  const queryClient = useQueryClient();

  return useMutation({
    networkMode: "always",
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: TransactionUpdateInput;
    }) => {
      const record = await updateTransaction(id, input);
      if (!record) {
        throw new Error("Transaction no longer exists. Refresh and try again.");
      }
      if (record.status === "error") {
        throw new UpdateTransactionRecordError(
          record.error ?? "Transaction could not be synced. Retry or delete it.",
          record,
        );
      }
      return record;
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
