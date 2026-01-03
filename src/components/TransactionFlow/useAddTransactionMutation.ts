"use client";

import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { useTransactions } from "../providers";
import type { TransactionFormValues } from "./transactionSchema";

export function useAddTransactionMutation() {
  const { addTransaction } = useTransactions();

  return useMutation({
    mutationFn: async (values: TransactionFormValues) => {
      await addTransaction({
        type: values.type,
        amount: Number.parseFloat(values.amount),
        currency: values.currency,
        account: values.account,
        for: values.forValue.trim() || values.forValue,
        category: values.category,
        date: format(values.dateObject, "yyyy-MM-dd'T'HH:mm:ss"),
        note: values.note.trim() || undefined,
      });
    },
  });
}
