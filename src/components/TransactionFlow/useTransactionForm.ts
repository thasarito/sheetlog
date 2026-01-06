import { useMemo } from "react";
import { useForm } from "@tanstack/react-form";
import { zodValidator, type ZodValidator } from "@tanstack/zod-form-adapter";
import { CURRENCIES, DEFAULT_CURRENCY } from "../../lib/currencies";
import { STORAGE_KEYS } from "../../lib/constants";
import {
  transactionSchema,
  type TransactionFormValues,
} from "./transactionSchema";

function resolveStoredCurrency() {
  if (typeof window === "undefined") {
    return DEFAULT_CURRENCY;
  }
  const storedCurrency = window.localStorage.getItem(
    STORAGE_KEYS.LAST_CURRENCY
  );
  if (
    storedCurrency &&
    CURRENCIES.includes(storedCurrency as (typeof CURRENCIES)[number])
  ) {
    return storedCurrency;
  }
  return DEFAULT_CURRENCY;
}

export function useTransactionForm(options?: {
  initialValues?: Partial<TransactionFormValues>;
  onSubmit?: (values: TransactionFormValues) => Promise<void>;
}) {
  // Memoize defaultValues to prevent infinite re-renders.
  // Creating new Date() inline causes tanstack-form to detect a "change"
  // on every render, triggering an update loop.
  const defaultValues = useMemo<TransactionFormValues>(
    () => ({
      type: options?.initialValues?.type ?? "expense",
      category: options?.initialValues?.category ?? "",
      amount: options?.initialValues?.amount ?? "",
      currency: options?.initialValues?.currency ?? resolveStoredCurrency(),
      account: options?.initialValues?.account ?? "",
      forValue: options?.initialValues?.forValue ?? "Me",
      dateObject: options?.initialValues?.dateObject ?? new Date(),
      note: options?.initialValues?.note ?? "",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return useForm<TransactionFormValues, ZodValidator>({
    defaultValues,
    validatorAdapter: zodValidator(),
    validators: { onChange: transactionSchema },
    onSubmit: async ({ value }) => {
      await options?.onSubmit?.(value);
    },
  });
}

export type TransactionFormApi = ReturnType<typeof useTransactionForm>;
