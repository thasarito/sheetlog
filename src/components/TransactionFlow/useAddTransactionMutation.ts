import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useTransactions } from "../../app/providers";
import type { TransactionFormValues } from "./transactionSchema";
import { refreshTransactionHistoryInBackground } from "./refreshTransactionHistory";
import { transactionQueryKeys } from "./transactionQueryKeys";

export function useAddTransactionMutation() {
  const { addTransaction } = useTransactions();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: TransactionFormValues) => {
      const record = await addTransaction({
        type: values.type,
        amount: Number.parseFloat(values.amount),
        currency: values.currency,
        account: values.account,
        for: values.forValue.trim() || values.forValue,
        category: values.category,
        date: format(values.dateObject, "yyyy-MM-dd'T'HH:mm:ss"),
        note: values.note.trim() || undefined,
        ...(values.place ? { place: values.place } : {}),
      });
      if (record.status === "error") {
        throw new Error(
          record.error ?? "Transaction could not be synced. Retry or delete it.",
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
