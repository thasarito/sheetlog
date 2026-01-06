import { createContext, useContext } from 'react';
import type { RecentCategories, TransactionInput, TransactionType } from '../../lib/types';

export interface UndoResult {
  ok: boolean;
  message: string;
}

export interface TransactionsContextValue {
  queueCount: number;
  recentCategories: RecentCategories;
  lastSyncError: string | null;
  lastSyncErrorAt: string | null;
  lastSyncAt: string | null;
  addTransaction: (input: TransactionInput) => Promise<void>;
  undoLast: () => Promise<UndoResult>;
  syncNow: () => Promise<void>;
  markRecentCategory: (type: TransactionType, category: string) => Promise<void>;
}

export const TransactionsContext = createContext<TransactionsContextValue | null>(null);

export function useTransactions() {
  const context = useContext(TransactionsContext);
  if (!context) {
    throw new Error('useTransactions must be used within TransactionsProvider');
  }
  return context;
}
