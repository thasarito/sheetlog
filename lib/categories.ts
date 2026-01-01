import type { TransactionType } from './types';

export const DEFAULT_CATEGORIES: Record<TransactionType, string[]> = {
  expense: ['Food', 'Transport', 'Rent', 'Utilities', 'Health', 'Shopping', 'Entertainment', 'Other'],
  income: ['Salary', 'Bonus', 'Gift', 'Interest', 'Other'],
  transfer: ['Savings', 'Invest', 'Credit Card', 'Other']
};
