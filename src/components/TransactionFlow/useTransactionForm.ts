import { useForm } from '@tanstack/react-form';
import { type ZodValidator, zodValidator } from '@tanstack/zod-form-adapter';
import { useMemo } from 'react';
import { STORAGE_KEYS } from '../../lib/constants';
import { CURRENCIES, DEFAULT_CURRENCY } from '../../lib/currencies';
import { type TransactionFormValues, transactionSchema } from './transactionSchema';

function resolveStoredCurrency() {
  if (typeof window === 'undefined') {
    return DEFAULT_CURRENCY;
  }
  const storedCurrency = window.localStorage.getItem(STORAGE_KEYS.LAST_CURRENCY);
  if (storedCurrency && CURRENCIES.includes(storedCurrency as (typeof CURRENCIES)[number])) {
    return storedCurrency;
  }
  return DEFAULT_CURRENCY;
}

export function useTransactionForm(options?: {
  onSubmit?: (values: TransactionFormValues) => Promise<void>;
}) {
  // Memoize defaultValues to prevent infinite re-renders.
  // Creating new Date() inline causes tanstack-form to detect a "change"
  // on every render, triggering an update loop.
  const defaultValues = useMemo<TransactionFormValues>(
    () => ({
      type: 'expense',
      category: '',
      amount: '',
      currency: resolveStoredCurrency(),
      account: '',
      forValue: 'Me',
      dateObject: new Date(),
      note: '',
    }),
    [],
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
