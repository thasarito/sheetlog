"use client";

import { useForm } from "@tanstack/react-form";
import { zodValidator, type ZodValidator } from "@tanstack/zod-form-adapter";
import { CURRENCIES, DEFAULT_CURRENCY } from "../../lib/currencies";
import { transactionSchema, type TransactionFormValues } from "./transactionSchema";

export const CURRENCY_STORAGE_KEY = "sheetlog:last-currency";

function resolveStoredCurrency() {
  if (typeof window === "undefined") {
    return DEFAULT_CURRENCY;
  }
  const storedCurrency = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
  if (
    storedCurrency &&
    CURRENCIES.includes(storedCurrency as (typeof CURRENCIES)[number])
  ) {
    return storedCurrency;
  }
  return DEFAULT_CURRENCY;
}

export function useTransactionForm(options?: {
  onSubmit?: (values: TransactionFormValues) => Promise<void>;
}) {
  return useForm<TransactionFormValues, ZodValidator>({
    defaultValues: {
      type: "expense",
      category: "",
      amount: "",
      currency: resolveStoredCurrency(),
      account: "",
      forValue: "Me",
      dateObject: new Date(),
      note: "",
    },
    validatorAdapter: zodValidator(),
    validators: { onChange: transactionSchema },
    onSubmit: async ({ value }) => {
      await options?.onSubmit?.(value);
    },
  });
}

export type TransactionFormApi = ReturnType<typeof useTransactionForm>;
