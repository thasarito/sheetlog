import type React from "react";
import { useCallback, useMemo, useRef } from "react";
import {
  TransactionsContext,
  useTransactions,
  type TransactionsContextValue,
  type UndoResult,
} from "../../app/providers/transactions/TransactionsContext";
import {
  cancelBootstrap,
  stageBootstrap,
} from "../../lib/bootstrapClient";
import type { BootstrapSetup } from "../../lib/bootstrapPayload";
import type {
  TransactionInput,
  TransactionRecord,
  TransactionUpdateInput,
} from "../../lib/types";

const EMPTY_RECENTS = { expense: [], income: [], transfer: [] };

export function BootstrapTransactionsProvider({
  setup,
  onCaptured,
  children,
}: {
  setup: BootstrapSetup;
  onCaptured: (record: TransactionRecord) => void;
  children: React.ReactNode;
}) {
  const upstream = useTransactions();
  const capturedRef = useRef<TransactionRecord | null>(null);

  const addTransaction = useCallback(
    async (input: TransactionInput): Promise<TransactionRecord> => {
      const staged = await stageBootstrap({ setup, transaction: input });
      const now = new Date().toISOString();
      const record: TransactionRecord = {
        id: staged.transactionId,
        ...input,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      };
      capturedRef.current = record;
      onCaptured(record);
      return record;
    },
    [onCaptured, setup],
  );

  const clearCapture = useCallback(async (): Promise<UndoResult> => {
    if (!capturedRef.current) {
      return {
        ok: false,
        outcome: "error",
        message: "No staged transaction to remove.",
      };
    }
    await cancelBootstrap();
    capturedRef.current = null;
    return {
      ok: true,
      outcome: "deleted",
      message: "Staged transaction removed.",
    };
  }, []);

  const updateTransaction = useCallback(
    async (
      id: string,
      input: TransactionUpdateInput,
    ): Promise<TransactionRecord | undefined> => {
      const current = capturedRef.current;
      if (!current || current.id !== id) return undefined;
      const next: TransactionRecord = {
        ...current,
        ...input,
        ...(input.place === null ? { place: undefined } : {}),
        updatedAt: new Date().toISOString(),
      };
      capturedRef.current = next;
      return next;
    },
    [],
  );

  const value = useMemo<TransactionsContextValue>(
    () => ({
      ...upstream,
      queueCount: 0,
      recentCategories: EMPTY_RECENTS,
      lastSyncError: null,
      lastSyncErrorAt: null,
      lastSyncAt: null,
      addTransaction,
      updateTransaction,
      deleteTransaction: clearCapture,
      undoLast: clearCapture,
      syncNow: async () => undefined,
      markRecentCategory: async () => undefined,
    }),
    [addTransaction, clearCapture, updateTransaction, upstream],
  );

  return (
    <TransactionsContext.Provider value={value}>
      {children}
    </TransactionsContext.Provider>
  );
}
