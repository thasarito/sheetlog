import type React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { transactionQueryKeys } from "../../../components/TransactionFlow/transactionQueryKeys";
import { db } from "../../../lib/db";
import {
  deleteRow as realDeleteRow,
  getSheetTabId as realGetSheetTabId,
  readLinkedReimbursements as realReadLinkedReimbursements,
  readTransactionById as realReadTransactionById,
  readTransactionIdMap as realReadTransactionIdMap,
  updateRow as realUpdateRow,
} from "../../../lib/google";
import { mapGoogleSyncError } from "../../../lib/googleErrors";
import {
  IS_DEV_MODE,
  deleteRow as mockDeleteRow,
  getSheetTabId as mockGetSheetTabId,
  readLinkedReimbursements as mockReadLinkedReimbursements,
  readTransactionById as mockReadTransactionById,
  readTransactionIdMap as mockReadTransactionIdMap,
  updateRow as mockUpdateRow,
} from "../../../lib/mock";
import {
  calculateReimbursementSummary,
  isReimbursableExpense,
  validateReimbursementAmount,
} from "../../../lib/reimbursements";
import { getRecentCategories, updateRecentCategory } from "../../../lib/settings";
import { syncPendingTransactions } from "../../../lib/sync";
import type {
  RecentCategories,
  TransactionInput,
  TransactionRecord,
  TransactionType,
} from "../../../lib/types";
import { useConnectivity } from "../connectivity/ConnectivityContext";
import { useSession } from "../session/session.hooks";
import { useWorkspace } from "../workspace/workspace.hooks";
import {
  TransactionsContext,
  type TransactionsContextValue,
  type UndoResult,
} from "./TransactionsContext";

const deleteRow = IS_DEV_MODE ? mockDeleteRow : realDeleteRow;
const getSheetTabId = IS_DEV_MODE ? mockGetSheetTabId : realGetSheetTabId;
const readLinkedReimbursements = IS_DEV_MODE
  ? mockReadLinkedReimbursements
  : realReadLinkedReimbursements;
const readTransactionById = IS_DEV_MODE
  ? mockReadTransactionById
  : realReadTransactionById;
const readTransactionIdMap = IS_DEV_MODE ? mockReadTransactionIdMap : realReadTransactionIdMap;
const updateRow = IS_DEV_MODE ? mockUpdateRow : realUpdateRow;

class ReimbursementValidationError extends Error {}

function lockLinkedInput(
  input: Partial<TransactionInput>,
  original: TransactionRecord,
): Partial<TransactionInput> {
  return {
    ...input,
    type: original.type,
    category: original.category,
    currency: original.currency,
    for: original.for,
    reimbursesTransactionId: original.reimbursesTransactionId,
  };
}

const DEFAULT_RECENTS: RecentCategories = {
  expense: [],
  income: [],
  transfer: [],
};

type TransactionsState = {
  queueCount: number;
  recentCategories: RecentCategories;
  isSyncing: boolean;
  lastSyncError: string | null;
  lastSyncErrorAt: string | null;
  lastSyncAt: string | null;
};

type TransactionsAction =
  | {
      type: "set_stats";
      queueCount: number;
    }
  | { type: "set_recent"; recentCategories: RecentCategories }
  | { type: "sync_start" }
  | { type: "sync_end" }
  | { type: "sync_error"; message: string; at: string }
  | { type: "sync_success"; at: string };

function transactionsReducer(
  state: TransactionsState,
  action: TransactionsAction
): TransactionsState {
  switch (action.type) {
    case "set_stats":
      return {
        ...state,
        queueCount: action.queueCount,
      };
    case "set_recent":
      return { ...state, recentCategories: action.recentCategories };
    case "sync_start":
      return { ...state, isSyncing: true };
    case "sync_end":
      return { ...state, isSyncing: false };
    case "sync_error":
      return {
        ...state,
        lastSyncError: action.message,
        lastSyncErrorAt: action.at,
      };
    case "sync_success":
      return {
        ...state,
        lastSyncError: null,
        lastSyncErrorAt: null,
        lastSyncAt: action.at,
      };
    default:
      return state;
  }
}

export function TransactionsProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { accessToken, signOut } = useSession();
  const { sheetId, sheetTabId } = useWorkspace();
  const { isOnline } = useConnectivity();
  const [state, dispatch] = useReducer(transactionsReducer, {
    queueCount: 0,
    recentCategories: DEFAULT_RECENTS,
    isSyncing: false,
    lastSyncError: null,
    lastSyncErrorAt: null,
    lastSyncAt: null,
  });
  const syncingRef = useRef(state.isSyncing);

  useEffect(() => {
    syncingRef.current = state.isSyncing;
  }, [state.isSyncing]);

  const refreshStats = useCallback(async () => {
    const pendingCount = await db.transactions
      .where("status")
      .equals("pending")
      .count();
    dispatch({
      type: "set_stats",
      queueCount: pendingCount,
    });
  }, []);

  const invalidateTransactions = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: transactionQueryKeys.local }),
      queryClient.invalidateQueries({ queryKey: ["recentTransactions"] }),
      queryClient.invalidateQueries({
        queryKey: transactionQueryKeys.reimbursements,
      }),
      queryClient.invalidateQueries({ queryKey: ["transactionById"] }),
    ]);
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;
    async function loadRecents() {
      const stored = await getRecentCategories();
      if (!cancelled) {
        dispatch({ type: "set_recent", recentCategories: stored });
      }
    }
    void loadRecents();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  const syncNow = useCallback(async () => {
    if (!accessToken || !sheetId || syncingRef.current) {
      return;
    }
    syncingRef.current = true;
    dispatch({ type: "sync_start" });
    try {
      await syncPendingTransactions(accessToken, sheetId);
      dispatch({ type: "sync_success", at: new Date().toISOString() });
    } catch (error) {
      const info = mapGoogleSyncError(error);
      if (info.shouldClearAuth) {
        signOut();
      }
      dispatch({
        type: "sync_error",
        message: info.message,
        at: new Date().toISOString(),
      });
    } finally {
      await refreshStats();
      await invalidateTransactions();
      dispatch({ type: "sync_end" });
      syncingRef.current = false;
    }
  }, [accessToken, sheetId, refreshStats, invalidateTransactions, signOut]);

  useEffect(() => {
    if (isOnline && accessToken && sheetId) {
      void syncNow();
    }
  }, [isOnline, accessToken, sheetId, syncNow]);

  const markRecentCategory = useCallback(
    async (type: TransactionType, category: string) => {
      const updated = await updateRecentCategory(type, category);
      dispatch({ type: "set_recent", recentCategories: updated });
    },
    []
  );

  const addTransaction = useCallback(
    async (input: TransactionInput) => {
      const now = new Date().toISOString();
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}`;
      const record: TransactionRecord = {
        ...input,
        id,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      };
      await db.transactions.add(record);
      await invalidateTransactions();
      await refreshStats();
      await markRecentCategory(input.type, input.category);
      if (isOnline && accessToken && sheetId) {
        await syncNow();
      }
      return (await db.transactions.get(id)) ?? record;
    },
    [
      accessToken,
      isOnline,
      sheetId,
      invalidateTransactions,
      refreshStats,
      markRecentCategory,
      syncNow,
    ]
  );

  const updateTransaction = useCallback(
    async (id: string, input: Partial<TransactionInput>) => {
      const transaction = await db.transactions.get(id);
      if (!transaction) return;

      const now = new Date().toISOString();
      let safeInput = transaction.reimbursesTransactionId
        ? lockLinkedInput(input, transaction)
        : input;

      if (transaction.status === "synced" && accessToken && sheetId) {
        try {
          const idMap = await readTransactionIdMap(accessToken, sheetId);
          const currentRow = idMap.get(transaction.id);

          if (currentRow !== undefined) {
            let rowToUpdate = currentRow;
            let updatedRecord: TransactionRecord = {
              ...transaction,
              ...safeInput,
              updatedAt: now,
              sheetRow: currentRow,
            };

            if (transaction.reimbursesTransactionId) {
              const remoteChild = await readTransactionById(
                accessToken,
                sheetId,
                transaction.id,
              );

              if (!remoteChild) {
                throw new TypeError("Current transaction row could not be read");
              }

              const authoritativeChild: TransactionRecord = {
                ...remoteChild,
                reimbursesTransactionId:
                  remoteChild.reimbursesTransactionId ??
                  transaction.reimbursesTransactionId,
              };
              safeInput = lockLinkedInput(input, authoritativeChild);
              rowToUpdate = remoteChild.sheetRow ?? currentRow;
              updatedRecord = {
                ...transaction,
                ...authoritativeChild,
                ...safeInput,
                id: transaction.id,
                status: "synced",
                sheetId,
                sheetRow: rowToUpdate,
                updatedAt: now,
              };

              if (updatedRecord.amount !== authoritativeChild.amount) {
                const sourceId = authoritativeChild.reimbursesTransactionId;
                const source = sourceId
                  ? await readTransactionById(accessToken, sheetId, sourceId)
                  : null;

                if (!source) {
                  throw new ReimbursementValidationError(
                    "Original expense unavailable",
                  );
                }
                if (!isReimbursableExpense(source)) {
                  throw new ReimbursementValidationError(
                    "Original expense is no longer reimbursable",
                  );
                }
                if (source.currency !== authoritativeChild.currency) {
                  throw new ReimbursementValidationError(
                    "Reimbursement currency no longer matches original expense",
                  );
                }

                const [remoteRows, localRows] = await Promise.all([
                  readLinkedReimbursements(accessToken, sheetId, source.id),
                  db.transactions.toArray(),
                ]);
                const summary = calculateReimbursementSummary(
                  source,
                  remoteRows,
                  localRows,
                  authoritativeChild.id,
                );
                const amountError = validateReimbursementAmount(
                  updatedRecord.amount,
                  summary,
                );
                if (amountError) {
                  throw new ReimbursementValidationError(amountError);
                }
              }
            }

            await updateRow(accessToken, sheetId, rowToUpdate, updatedRecord);
            await db.transactions.put({
              ...updatedRecord,
              status: "synced",
              updatedAt: now,
              sheetId,
              sheetRow: rowToUpdate,
              error: undefined,
            });
            await invalidateTransactions();
            await refreshStats();
            if (input.type || input.category) {
              await markRecentCategory(
                updatedRecord.type,
                updatedRecord.category,
              );
            }
            return await db.transactions.get(id);
          }
        } catch (error) {
          if (error instanceof ReimbursementValidationError) {
            throw error;
          }
          console.warn(
            "In-place update failed, falling back to pending:",
            error
          );
        }
      }

      await db.transactions.update(id, {
        ...safeInput,
        status: "pending",
        updatedAt: now,
        sheetRow: undefined,
        error: undefined,
      });
      await invalidateTransactions();
      await refreshStats();
      if (input.type || input.category) {
        const pendingRecord = await db.transactions.get(id);
        if (pendingRecord) {
          await markRecentCategory(
            pendingRecord.type,
            pendingRecord.category,
          );
        }
      }
      if (isOnline && accessToken && sheetId) {
        await syncNow();
      }
      return await db.transactions.get(id);
    },
    [
      accessToken,
      isOnline,
      sheetId,
      invalidateTransactions,
      refreshStats,
      markRecentCategory,
      syncNow,
    ]
  );

  const undoLast = useCallback(async (): Promise<UndoResult> => {
    const last = await db.transactions.orderBy("createdAt").last();
    if (!last) {
      return { ok: false, message: "Nothing to undo" };
    }

    if (last.status === "pending" || last.status === "error") {
      await db.transactions.delete(last.id);
      await invalidateTransactions();
      await refreshStats();
      return {
        ok: true,
        message:
          last.status === "error"
            ? "Removed failed entry"
            : "Removed pending entry",
      };
    }

    if (last.status === "synced" && accessToken && sheetId) {
      try {
        const effectiveTabId =
          sheetTabId ?? (await getSheetTabId(accessToken, sheetId));
        if (effectiveTabId !== null) {
          const idMap = await readTransactionIdMap(accessToken, sheetId);
          const currentRow = idMap.get(last.id);
          if (currentRow === undefined) {
            await db.transactions.delete(last.id);
            await invalidateTransactions();
            await refreshStats();
            return {
              ok: true,
              message: "Removed entry already absent from Sheets",
            };
          }
          await deleteRow(accessToken, sheetId, effectiveTabId, currentRow);
          await db.transactions.delete(last.id);
          await invalidateTransactions();
          await refreshStats();
          return { ok: true, message: "Removed last synced entry" };
        }
      } catch (error) {
        const info = mapGoogleSyncError(error);
        if (info.shouldClearAuth) {
          signOut();
        }
        dispatch({
          type: "sync_error",
          message: info.message,
          at: new Date().toISOString(),
        });
      }
    }

    const now = new Date().toISOString();
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-undo`;
    const compensating: TransactionRecord = {
      ...last,
      id,
      amount: -last.amount,
      note: last.note ? `UNDO: ${last.note}` : "UNDO",
      status: "pending",
      createdAt: now,
      updatedAt: now,
      sheetRow: undefined,
      sheetId: undefined,
      error: undefined,
    };
    await db.transactions.add(compensating);
    await invalidateTransactions();
    await refreshStats();
    if (isOnline && accessToken && sheetId) {
      await syncNow();
    }
    return { ok: true, message: "Undo queued as compensating entry" };
  }, [
    accessToken,
    sheetId,
    sheetTabId,
    isOnline,
    invalidateTransactions,
    refreshStats,
    syncNow,
    signOut,
  ]);

  const deleteTransaction = useCallback(
    async (id: string): Promise<UndoResult> => {
      const transaction = await db.transactions.get(id);
      if (!transaction) {
        return { ok: false, message: "Transaction not found" };
      }

      if (transaction.status === "pending" || transaction.status === "error") {
        await db.transactions.delete(id);
        await invalidateTransactions();
        await refreshStats();
        return {
          ok: true,
          message:
            transaction.status === "error"
              ? "Removed failed entry"
              : "Removed pending entry",
        };
      }

      if (transaction.status === "synced" && accessToken && sheetId) {
        try {
          const effectiveTabId =
            sheetTabId ?? (await getSheetTabId(accessToken, sheetId));
          if (effectiveTabId !== null) {
            const idMap = await readTransactionIdMap(accessToken, sheetId);
            const currentRow = idMap.get(id);
            if (currentRow === undefined) {
              await db.transactions.delete(id);
              await invalidateTransactions();
              await refreshStats();
              return {
                ok: true,
                message: "Removed entry already absent from Sheets",
              };
            }
            await deleteRow(
              accessToken,
              sheetId,
              effectiveTabId,
              currentRow
            );
            await db.transactions.delete(id);
            await invalidateTransactions();
            await refreshStats();
            return { ok: true, message: "Removed synced entry" };
          }
        } catch (error) {
          const info = mapGoogleSyncError(error);
          if (info.shouldClearAuth) {
            signOut();
          }
          dispatch({
            type: "sync_error",
            message: info.message,
            at: new Date().toISOString(),
          });
        }
      }

      const now = new Date().toISOString();
      const compensatingId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-delete`;
      const compensating: TransactionRecord = {
        ...transaction,
        id: compensatingId,
        amount: -transaction.amount,
        note: transaction.note ? `DELETE: ${transaction.note}` : "DELETE",
        status: "pending",
        createdAt: now,
        updatedAt: now,
        sheetRow: undefined,
        sheetId: undefined,
        error: undefined,
      };
      await db.transactions.add(compensating);
      await invalidateTransactions();
      await db.transactions.delete(id);
      await invalidateTransactions();
      await refreshStats();
      if (isOnline && accessToken && sheetId) {
        await syncNow();
      }
      return { ok: true, message: "Delete queued as compensating entry" };
    },
    [
      accessToken,
      sheetId,
      sheetTabId,
      isOnline,
      invalidateTransactions,
      refreshStats,
      syncNow,
      signOut,
    ]
  );

  const value = useMemo<TransactionsContextValue>(
    () => ({
      queueCount: state.queueCount,
      recentCategories: state.recentCategories,
      lastSyncError: state.lastSyncError,
      lastSyncErrorAt: state.lastSyncErrorAt,
      lastSyncAt: state.lastSyncAt,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      undoLast,
      syncNow,
      markRecentCategory,
    }),
    [
      state.queueCount,
      state.recentCategories,
      state.lastSyncError,
      state.lastSyncErrorAt,
      state.lastSyncAt,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      undoLast,
      syncNow,
      markRecentCategory,
    ]
  );

  return (
    <TransactionsContext.Provider value={value}>
      {children}
    </TransactionsContext.Provider>
  );
}
