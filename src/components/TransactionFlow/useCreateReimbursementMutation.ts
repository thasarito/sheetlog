import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useTransactions, useWorkspace } from "../../app/providers";
import {
  isReimbursableExpense,
  REIMBURSEMENT_CATEGORY,
  validateReimbursementAmount,
} from "../../lib/reimbursements";
import type { TransactionRecord } from "../../lib/types";
import { transactionQueryKeys } from "./transactionQueryKeys";

export type CreateReimbursementVariables = {
  source: TransactionRecord;
  amount: string;
  remaining: number;
  account: string;
  date: Date;
  note: string;
};

export function useCreateReimbursementMutation() {
  const { addTransaction } = useTransactions();
  const { sheetId } = useWorkspace();
  const queryClient = useQueryClient();

  return useMutation({
    networkMode: "always",
    mutationFn: async ({
      source,
      amount: amountValue,
      remaining,
      account,
      date,
      note,
    }: CreateReimbursementVariables) => {
      if (!isReimbursableExpense(source)) {
        throw new Error("Original expense is no longer reimbursable");
      }

      const amount = Number(amountValue);
      const validationError = validateReimbursementAmount(amount, {
        confirmed: 0,
        queued: 0,
        remaining,
        overReimbursed: 0,
        currencyMismatchIds: [],
      });
      if (validationError) {
        throw new Error(validationError);
      }

      const record = await addTransaction({
        type: "income",
        category: REIMBURSEMENT_CATEGORY,
        amount,
        currency: source.currency,
        account,
        for: source.for,
        date: format(date, "yyyy-MM-dd'T'HH:mm:ss"),
        note: note.trim() || undefined,
        reimbursesTransactionId: source.id,
      });

      if (record.status === "error") {
        throw new Error(
          record.error ??
            "Reimbursement could not be synced. Retry or delete it.",
        );
      }

      return record;
    },
    onSettled: async (_record, _error, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: transactionQueryKeys.local,
        }),
        queryClient.invalidateQueries({ queryKey: ["recentTransactions"] }),
        queryClient.invalidateQueries({
          queryKey: transactionQueryKeys.reimbursement(
            sheetId,
            variables.source.id,
          ),
        }),
      ]);
    },
  });
}
