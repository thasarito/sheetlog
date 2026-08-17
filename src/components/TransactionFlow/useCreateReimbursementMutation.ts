import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useSession, useTransactions, useWorkspace } from "../../app/providers";
import {
  isReimbursableExpense,
  REIMBURSEMENT_CATEGORY,
  validateReimbursementAmount,
} from "../../lib/reimbursements";
import type { TransactionInput, TransactionRecord } from "../../lib/types";
import { transactionQueryKeys } from "./transactionQueryKeys";

export type CreateReimbursementVariables = {
  source: TransactionRecord;
  amount: string;
  remaining: number;
  account: string;
  date: Date;
  note: string;
};

export class ReimbursementRecordError extends Error {
  readonly record: TransactionRecord;

  constructor(message: string, record: TransactionRecord) {
    super(message);
    this.name = "ReimbursementRecordError";
    this.record = record;
  }
}

export function buildReimbursementInput({
  source,
  amount: amountValue,
  remaining,
  account,
  date,
  note,
}: CreateReimbursementVariables): TransactionInput {
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

  return {
    type: "income",
    category: REIMBURSEMENT_CATEGORY,
    amount,
    currency: source.currency,
    account,
    for: source.for,
    date: format(date, "yyyy-MM-dd'T'HH:mm:ss"),
    note: note.trim() || undefined,
    reimbursesTransactionId: source.id,
  };
}

export function useCreateReimbursementMutation() {
  const { addTransaction } = useTransactions();
  const { userProfile } = useSession();
  const { sheetId } = useWorkspace();
  const queryClient = useQueryClient();

  return useMutation({
    networkMode: "always",
    mutationFn: async (variables: CreateReimbursementVariables) => {
      const record = await addTransaction(buildReimbursementInput(variables));

      if (record.status === "error") {
        throw new ReimbursementRecordError(
          record.error ??
            "Reimbursement could not be synced. Retry or delete it.",
          record,
        );
      }

      return record;
    },
    onSettled: async (_record, _error, variables) => {
      const invalidations = [
        queryClient.invalidateQueries({
          queryKey: transactionQueryKeys.local,
        }),
        queryClient.invalidateQueries({ queryKey: ["recentTransactions"] }),
        queryClient.invalidateQueries({
          queryKey: transactionQueryKeys.history,
          refetchType: "none",
        }),
        queryClient.invalidateQueries({
          queryKey: transactionQueryKeys.reimbursement(
            sheetId,
            userProfile?.id ?? null,
            variables.source.id,
          ),
        }),
      ];
      void queryClient.refetchQueries({
        queryKey: transactionQueryKeys.historyRemoteAll,
        type: "active",
      });
      await Promise.all(invalidations);
    },
  });
}
