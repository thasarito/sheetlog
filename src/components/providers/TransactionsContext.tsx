import { createContext, useContext } from 'react';
import type { RecentCategories, TransactionInput, TransactionType } from '../../lib/types';

export interface OperationResult {
  ok: boolean;
  message: string;
}

export interface TransactionsContextValue {
  recentCategories: RecentCategories;
  lastError: string | null;
  addTransaction: (input: TransactionInput) => Promise<void>;
  updateTransaction: (
    id: string,
    input: Partial<TransactionInput>,
    sheetRow?: number,
  ) => Promise<void>;
  deleteTransaction: (id: string, sheetRow?: number) => Promise<OperationResult>;
  markRecentCategory: (type: TransactionType, category: string) => void;
}

export const TransactionsContext = createContext<TransactionsContextValue | null>(null);

export function useTransactions() {
  const context = useContext(TransactionsContext);
  if (!context) {
    throw new Error('useTransactions must be used within TransactionsProvider');
  }
  return context;
}
