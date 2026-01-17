import { useForm } from '@tanstack/react-form';
import { type ZodValidator, zodValidator } from '@tanstack/zod-form-adapter';
import { useMemo } from 'react';
import { DEFAULT_CURRENCY } from '../../lib/currencies';
import type { QuickNote, TransactionType } from '../../lib/types';
import type { TransactionFormValues } from '../TransactionFlow/transactionSchema';

// Extend TransactionFormValues to add label
export interface QuickNoteFormValues extends TransactionFormValues {
  label: string;
}

export function useQuickNoteForm(options?: {
  note?: QuickNote | null;
  transactionType?: TransactionType;
}) {
  const note = options?.note;
  const transactionType = options?.transactionType ?? 'expense';

  const defaultValues = useMemo<QuickNoteFormValues>(
    () => ({
      type: transactionType,
      category: '',
      amount: note?.amount ?? '',
      currency: note?.currency ?? DEFAULT_CURRENCY,
      account: note?.account ?? '',
      forValue: note?.forValue ?? '',
      dateObject: new Date(),
      note: note?.note ?? '',
      label: note?.label ?? '',
    }),
    [note, transactionType],
  );

  return useForm<QuickNoteFormValues, ZodValidator>({
    defaultValues,
    validatorAdapter: zodValidator(),
  });
}

export type QuickNoteFormApi = ReturnType<typeof useQuickNoteForm>;
