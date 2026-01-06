import { useQueryClient } from '@tanstack/react-query';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { appendTransaction, deleteRow, getSheetTabId } from '../../lib/google';
import { mapGoogleSyncError } from '../../lib/googleErrors';
import { getRecentCategories, updateRecentCategory } from '../../lib/settings';
import type {
  RecentCategories,
  TransactionInput,
  TransactionRecord,
  TransactionType,
} from '../../lib/types';
import { useAuth } from './auth';
import {
  type OperationResult,
  TransactionsContext,
  type TransactionsContextValue,
} from './TransactionsContext';

const DEFAULT_RECENTS: RecentCategories = {
  expense: [],
  income: [],
  transfer: [],
};

export function TransactionsProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, sheetId, sheetTabId, clearAuth } = useAuth();
  const queryClient = useQueryClient();
  const [recentCategories, setRecentCategories] = useState<RecentCategories>(() =>
    getRecentCategories(),
  );
  const [lastError, setLastError] = useState<string | null>(null);

  const invalidateTransactions = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['recentTransactions'] });
  }, [queryClient]);

  const markRecentCategory = useCallback((type: TransactionType, category: string) => {
    const updated = updateRecentCategory(type, category);
    setRecentCategories(updated);
  }, []);

  const addTransaction = useCallback(
    async (input: TransactionInput) => {
      if (!accessToken || !sheetId) {
        throw new Error('Not authenticated');
      }

      const now = new Date().toISOString();
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}`;

      const record: TransactionRecord = {
        ...input,
        id,
        status: 'synced',
        createdAt: now,
        updatedAt: now,
      };

      try {
        await appendTransaction(accessToken, sheetId, record);
        markRecentCategory(input.type, input.category);
        invalidateTransactions();
        setLastError(null);
      } catch (error) {
        const info = mapGoogleSyncError(error);
        if (info.shouldClearAuth) {
          clearAuth();
        }
        setLastError(info.message);
        throw error;
      }
    },
    [accessToken, sheetId, markRecentCategory, invalidateTransactions, clearAuth],
  );

  const updateTransaction = useCallback(
    async (id: string, input: Partial<TransactionInput>, existingSheetRow?: number) => {
      if (!accessToken || !sheetId) {
        throw new Error('Not authenticated');
      }

      try {
        // Delete the old row if we have its position
        if (existingSheetRow) {
          const effectiveTabId = sheetTabId ?? (await getSheetTabId(accessToken, sheetId));
          if (effectiveTabId) {
            try {
              await deleteRow(accessToken, sheetId, effectiveTabId, existingSheetRow);
            } catch (_error) {
              // Continue even if delete fails - row may already be gone
            }
          }
        }

        // Append as a new transaction
        const now = new Date().toISOString();
        const newId =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}`;

        // We need full input for append, so we require a complete TransactionInput
        const fullInput = input as TransactionInput;
        const record: TransactionRecord = {
          ...fullInput,
          id: newId,
          status: 'synced',
          createdAt: now,
          updatedAt: now,
        };

        await appendTransaction(accessToken, sheetId, record);

        if (input.type && input.category) {
          markRecentCategory(input.type, input.category);
        }
        invalidateTransactions();
        setLastError(null);
      } catch (error) {
        const info = mapGoogleSyncError(error);
        if (info.shouldClearAuth) {
          clearAuth();
        }
        setLastError(info.message);
        throw error;
      }
    },
    [accessToken, sheetId, sheetTabId, markRecentCategory, invalidateTransactions, clearAuth],
  );

  const deleteTransaction = useCallback(
    async (_id: string, sheetRow?: number): Promise<OperationResult> => {
      if (!accessToken || !sheetId) {
        return { ok: false, message: 'Not authenticated' };
      }

      if (!sheetRow) {
        return { ok: false, message: 'Cannot delete - row position unknown' };
      }

      try {
        const effectiveTabId = sheetTabId ?? (await getSheetTabId(accessToken, sheetId));
        if (!effectiveTabId) {
          return { ok: false, message: 'Could not find sheet tab' };
        }

        await deleteRow(accessToken, sheetId, effectiveTabId, sheetRow);
        invalidateTransactions();
        setLastError(null);
        return { ok: true, message: 'Transaction deleted' };
      } catch (error) {
        const info = mapGoogleSyncError(error);
        if (info.shouldClearAuth) {
          clearAuth();
        }
        setLastError(info.message);
        return { ok: false, message: info.message };
      }
    },
    [accessToken, sheetId, sheetTabId, invalidateTransactions, clearAuth],
  );

  const value = useMemo<TransactionsContextValue>(
    () => ({
      recentCategories,
      lastError,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      markRecentCategory,
    }),
    [
      recentCategories,
      lastError,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      markRecentCategory,
    ],
  );

  return <TransactionsContext.Provider value={value}>{children}</TransactionsContext.Provider>;
}
