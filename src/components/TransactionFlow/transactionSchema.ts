import { z } from 'zod';

export const transactionSchema = z.object({
  type: z.enum(['expense', 'income', 'transfer']),
  category: z.string().min(1, 'Select a category'),
  amount: z.string().refine((value) => {
    const parsed = Number.parseFloat(value);
    return !Number.isNaN(parsed) && parsed > 0;
  }, 'Enter valid amount'),
  currency: z.string(),
  account: z.string().min(1, 'Select an account'),
  forValue: z.string(),
  dateObject: z.date(),
  note: z.string(),
});

export type TransactionFormValues = z.infer<typeof transactionSchema>;
