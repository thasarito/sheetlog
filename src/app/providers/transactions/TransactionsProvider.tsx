import type React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { transactionQueryKeys } from "../../../components/TransactionFlow/transactionQueryKeys";
import { db } from "../../../lib/db";
import {
  deleteRow as realDeleteRow,
  DuplicateTransactionIdError,
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
import {
  SheetMutationLockLostError,
  withSheetMutationLock,
} from "../../../lib/sheetMutationLock";
import { syncPendingTransactions } from "../../../lib/sync";
import {
  LEGACY_TRANSACTION_SCOPE_ERROR,
  getTransactionTargetSheetId,
  getTransactionTargetUserId,
  isTransactionInSheetScope,
} from "../../../lib/transactionScope";
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

class TransactionScopeError extends Error {}

const LINKED_CURRENCY_MISMATCH =
  "Linked reimbursement currency mismatch";

function requireTransactionScope(
  transaction: TransactionRecord,
  sheetId: string | null,
  userId: string | null,
): void {
  if (!sheetId) {
    throw new TransactionScopeError("No active Sheet workspace");
  }
  if (!userId) {
    throw new TransactionScopeError("Google account identity is unavailable");
  }

  const targetSheetId = getTransactionTargetSheetId(transaction);
  const targetUserId = getTransactionTargetUserId(transaction);
  if (!targetSheetId || !targetUserId) {
    throw new TransactionScopeError(LEGACY_TRANSACTION_SCOPE_ERROR);
  }
  if (targetSheetId !== sheetId) {
    throw new TransactionScopeError(
      "Transaction belongs to a different Sheet workspace",
    );
  }
  if (targetUserId !== userId) {
    throw new TransactionScopeError(
      "Transaction belongs to a different Google account",
    );
  }
}

function canDeleteAsLegacyRecovery(
  transaction: TransactionRecord,
  sheetId: string | null,
): boolean {
  const targetSheetId = getTransactionTargetSheetId(transaction);
  return (
    !getTransactionTargetUserId(transaction) &&
    (!targetSheetId || targetSheetId === sheetId)
  );
}

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
  lastSyncErrorScope: ActiveTransactionScope | null;
  lastSyncAt: string | null;
};

type ActiveTransactionScope = {
  accessToken: string | null;
  sheetId: string | null;
  userId: string | null;
};

function isSameActiveScope(
  left: ActiveTransactionScope,
  right: ActiveTransactionScope,
): boolean {
  return (
    left.accessToken === right.accessToken &&
    left.sheetId === right.sheetId &&
    left.userId === right.userId
  );
}

type TransactionsAction =
  | {
      type: "set_stats";
      queueCount: number;
    }
  | { type: "set_recent"; recentCategories: RecentCategories }
  | { type: "sync_start" }
  | { type: "sync_end" }
  | {
      type: "sync_error";
      message: string;
      at: string;
      scope: ActiveTransactionScope;
    }
  | { type: "clear_stale_sync_error"; activeScope: ActiveTransactionScope }
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
        lastSyncErrorScope: action.scope,
      };
    case "clear_stale_sync_error":
      if (
        !state.lastSyncErrorScope ||
        isSameActiveScope(state.lastSyncErrorScope, action.activeScope)
      ) {
        return state;
      }
      return {
        ...state,
        lastSyncError: null,
        lastSyncErrorAt: null,
        lastSyncErrorScope: null,
      };
    case "sync_success":
      return {
        ...state,
        lastSyncError: null,
        lastSyncErrorAt: null,
        lastSyncErrorScope: null,
        lastSyncAt: action.at,
      };
    default:
      return state;
  }
}

export function TransactionsProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { accessToken, userProfile, signOut } = useSession();
  const { sheetId, sheetTabId } = useWorkspace();
  const userId = userProfile?.id ?? null;
  const { isOnline } = useConnectivity();
  const [state, dispatch] = useReducer(transactionsReducer, {
    queueCount: 0,
    recentCategories: DEFAULT_RECENTS,
    isSyncing: false,
    lastSyncError: null,
    lastSyncErrorAt: null,
    lastSyncErrorScope: null,
    lastSyncAt: null,
  });
  const syncingRef = useRef(state.isSyncing);
  const operationTailRef = useRef<Promise<void>>(Promise.resolve());
  const activeScopeRef = useRef<ActiveTransactionScope>({
    accessToken,
    sheetId,
    userId,
  });
  activeScopeRef.current = { accessToken, sheetId, userId };

  useEffect(() => {
    syncingRef.current = state.isSyncing;
  }, [state.isSyncing]);

  useEffect(() => {
    dispatch({
      type: "clear_stale_sync_error",
      activeScope: { accessToken, sheetId, userId },
    });
  }, [accessToken, sheetId, userId]);

  const refreshStats = useCallback(async () => {
    const requestedScope = { accessToken, sheetId, userId };
    if (!sheetId || !userId) {
      if (isSameActiveScope(activeScopeRef.current, requestedScope)) {
        dispatch({ type: "set_stats", queueCount: 0 });
      }
      return;
    }
    const pendingRows = await db.transactions
      .where("status")
      .equals("pending")
      .toArray();
    if (isSameActiveScope(activeScopeRef.current, requestedScope)) {
      dispatch({
        type: "set_stats",
        queueCount: pendingRows.filter((row) =>
          isTransactionInSheetScope(row, sheetId, userId),
        ).length,
      });
    }
  }, [accessToken, sheetId, userId]);

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

  const refreshMutationState = useCallback(async () => {
    await Promise.allSettled([invalidateTransactions(), refreshStats()]);
  }, [invalidateTransactions, refreshStats]);

  const runExclusive = useCallback(
    <Result,>(operation: () => Promise<Result>): Promise<Result> => {
      const result = operationTailRef.current.then(operation, operation);
      operationTailRef.current = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    [],
  );

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

  const performSync = useCallback(async () => {
    if (!accessToken || !sheetId || !userId) {
      return;
    }
    const requestedScope = { accessToken, sheetId, userId };
    const requestIsCurrent = () =>
      isSameActiveScope(activeScopeRef.current, requestedScope);
    syncingRef.current = true;
    dispatch({ type: "sync_start" });
    try {
      await syncPendingTransactions(accessToken, sheetId, userId);
      if (requestIsCurrent()) {
        dispatch({ type: "sync_success", at: new Date().toISOString() });
      }
    } catch (error) {
      const info = mapGoogleSyncError(error);
      if (info.shouldClearAuth) {
        signOut(accessToken);
      }
      if (requestIsCurrent()) {
        dispatch({
          type: "sync_error",
          message: info.message,
          at: new Date().toISOString(),
          scope: requestedScope,
        });
      }
    } finally {
      try {
        await refreshStats();
      } finally {
        try {
          await invalidateTransactions();
        } finally {
          dispatch({ type: "sync_end" });
          syncingRef.current = false;
        }
      }
    }
  }, [accessToken, sheetId, userId, refreshStats, invalidateTransactions, signOut]);

  const syncNow = useCallback(
    () => runExclusive(performSync),
    [performSync, runExclusive],
  );

  useEffect(() => {
    if (isOnline && accessToken && sheetId && userId) {
      void syncNow();
    }
  }, [isOnline, accessToken, sheetId, userId, syncNow]);

  const markRecentCategory = useCallback(
    async (type: TransactionType, category: string) => {
      const updated = await updateRecentCategory(type, category);
      dispatch({ type: "set_recent", recentCategories: updated });
    },
    []
  );

  const addTransactionLocally = useCallback(
    async (input: TransactionInput) => {
      if (!sheetId) {
        throw new TransactionScopeError("No active Sheet workspace");
      }
      if (!userId) {
        throw new TransactionScopeError(
          "Google account identity is unavailable",
        );
      }
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
        targetSheetId: sheetId,
        targetUserId: userId,
      };
      await db.transactions.add(record);
      await Promise.allSettled([
        refreshMutationState(),
        markRecentCategory(input.type, input.category),
      ]);
      return (await db.transactions.get(id)) ?? record;
    },
    [markRecentCategory, refreshMutationState, sheetId, userId]
  );

  const updateTransactionUnlocked = useCallback(
    async (id: string, input: Partial<TransactionInput>) => {
      const transaction = await db.transactions.get(id);
      if (!transaction) return;
      requireTransactionScope(transaction, sheetId, userId);
      if (transaction.deleteIntent) {
        throw new ReimbursementValidationError(
          "Reimbursement removal is pending; retry undo instead",
        );
      }

      const now = new Date().toISOString();
      let safeInput = transaction.reimbursesTransactionId
        ? lockLinkedInput(input, transaction)
        : input;
      let prospectiveRecord: TransactionRecord = {
        ...transaction,
        ...safeInput,
        updatedAt: now,
      };

      if (
        transaction.status === "synced" &&
        accessToken &&
        sheetId &&
        userId
      ) {
        try {
          const directResult = await withSheetMutationLock(
            { sheetId, userId },
            async (mutationGuard) => {
              const latestTransaction = await db.transactions.get(id);
              if (!latestTransaction) {
                return null;
              }
              requireTransactionScope(latestTransaction, sheetId, userId);
              if (latestTransaction.status !== "synced") {
                safeInput = latestTransaction.reimbursesTransactionId
                  ? lockLinkedInput(input, latestTransaction)
                  : input;
                prospectiveRecord = {
                  ...latestTransaction,
                  ...safeInput,
                  updatedAt: now,
                };
                return undefined;
              }
              const idMap = await readTransactionIdMap(accessToken, sheetId);
              const currentRow = idMap.get(latestTransaction.id);

              if (currentRow === undefined) {
                return undefined;
              }
              const remoteChild = await readTransactionById(
                accessToken,
                sheetId,
                latestTransaction.id,
              );

              if (!remoteChild) {
                throw new TypeError(
                  "Current transaction row could not be read",
                );
              }

              safeInput = remoteChild.reimbursesTransactionId
                ? lockLinkedInput(input, remoteChild)
                : { ...input, reimbursesTransactionId: undefined };
              const rowToUpdate = remoteChild.sheetRow ?? currentRow;
              const updatedRecord: TransactionRecord = {
                ...latestTransaction,
                ...remoteChild,
                ...safeInput,
                id: latestTransaction.id,
                status: "synced",
                sheetId,
                sheetRow: rowToUpdate,
                updatedAt: now,
                error: undefined,
              };
              prospectiveRecord = updatedRecord;

              if (
                remoteChild.reimbursesTransactionId &&
                updatedRecord.amount !== remoteChild.amount
              ) {
                const sourceId = remoteChild.reimbursesTransactionId;
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
                if (source.currency !== remoteChild.currency) {
                  throw new ReimbursementValidationError(
                    "Reimbursement currency no longer matches original expense",
                  );
                }

                const [remoteRows, localRows] = await Promise.all([
                  readLinkedReimbursements(accessToken, sheetId, source.id),
                  db.transactions.toArray().then((rows) =>
                    rows.filter((row) =>
                      isTransactionInSheetScope(row, sheetId, userId),
                    ),
                  ),
                ]);
                const summary = calculateReimbursementSummary(
                  source,
                  remoteRows,
                  localRows,
                  remoteChild.id,
                );
                if (summary.currencyMismatchIds.length > 0) {
                  throw new ReimbursementValidationError(
                    LINKED_CURRENCY_MISMATCH,
                  );
                }
                const amountError = validateReimbursementAmount(
                  updatedRecord.amount,
                  summary,
                );
                if (amountError) {
                  throw new ReimbursementValidationError(amountError);
                }
              }

              await mutationGuard.assertOwnership();
              await updateRow(
                accessToken,
                sheetId,
                rowToUpdate,
                updatedRecord,
              );
              await mutationGuard.assertOwnership();
              await db.transactions.put({
                ...updatedRecord,
                status: "synced",
                updatedAt: now,
                sheetId,
                targetSheetId: sheetId,
                targetUserId: userId,
                sheetRow: rowToUpdate,
                error: undefined,
              });
              return await db.transactions.get(id);
            },
          );
          if (directResult === null) {
            return undefined;
          }
          if (directResult) {
            await refreshMutationState();
            if (input.type || input.category) {
              await Promise.allSettled([
                markRecentCategory(
                  directResult.type,
                  directResult.category,
                ),
              ]);
            }
            return directResult;
          }
        } catch (error) {
          if (
            error instanceof ReimbursementValidationError ||
            error instanceof DuplicateTransactionIdError ||
            error instanceof SheetMutationLockLostError
          ) {
            throw error;
          }
          console.warn(
            "In-place update failed, falling back to pending:",
            error
          );
        }
      }

      await db.transactions.put({
        ...prospectiveRecord,
        id: transaction.id,
        status: "pending",
        updatedAt: now,
        sheetRow: undefined,
        error: undefined,
      });
      await refreshMutationState();
      if (input.type || input.category) {
        const pendingRecord = await db.transactions.get(id);
        if (pendingRecord) {
          await Promise.allSettled([
            markRecentCategory(
              pendingRecord.type,
              pendingRecord.category,
            ),
          ]);
        }
      }
      if (isOnline && accessToken && sheetId) {
        await performSync().catch(() => undefined);
      }
      return await db.transactions.get(id);
    },
    [
      accessToken,
      isOnline,
      sheetId,
      userId,
      markRecentCategory,
      performSync,
      refreshMutationState,
    ]
  );

  const undoLastUnlocked = useCallback(async (): Promise<UndoResult> => {
    const requestedScope = { accessToken, sheetId, userId };
    const last = await db.transactions
      .orderBy("createdAt")
      .reverse()
      .filter((transaction) =>
        isTransactionInSheetScope(transaction, sheetId, userId),
      )
      .first();
    if (!last) {
      return { ok: false, outcome: "error", message: "Nothing to undo" };
    }

    if (last.status === "pending" || last.status === "error") {
      await db.transactions.delete(last.id);
      await refreshMutationState();
      return {
        ok: true,
        outcome: "deleted",
        message:
          last.status === "error"
            ? "Removed failed entry"
            : "Removed pending entry",
      };
    }

    let directDeleteMessage: string | null = null;
    let directDeleteCommitted = false;
    if (last.status === "synced" && accessToken && sheetId && userId) {
      try {
        directDeleteMessage = await withSheetMutationLock(
          { sheetId, userId },
          async (mutationGuard) => {
            const effectiveTabId =
              sheetTabId ?? (await getSheetTabId(accessToken, sheetId));
            if (effectiveTabId === null) {
              return null;
            }
            const idMap = await readTransactionIdMap(accessToken, sheetId);
            const currentRow = idMap.get(last.id);
            const message =
              currentRow === undefined
                ? "Removed entry already absent from Sheets"
                : "Removed last synced entry";
            if (currentRow !== undefined) {
              await mutationGuard.assertOwnership();
              await deleteRow(
                accessToken,
                sheetId,
                effectiveTabId,
                currentRow,
              );
            }
            directDeleteCommitted = true;
            await mutationGuard.assertOwnership();
            await db.transactions.delete(last.id);
            return message;
          },
        );
      } catch (error) {
        if (directDeleteCommitted) {
          throw error;
        }
        if (
          error instanceof DuplicateTransactionIdError ||
          error instanceof SheetMutationLockLostError
        ) {
          throw error;
        }
        const info = mapGoogleSyncError(error);
        if (info.shouldClearAuth) {
          signOut(accessToken);
        }
        if (isSameActiveScope(activeScopeRef.current, requestedScope)) {
          dispatch({
            type: "sync_error",
            message: info.message,
            at: new Date().toISOString(),
            scope: requestedScope,
          });
        }
      }
    }

    if (directDeleteMessage) {
      await refreshMutationState();
      return {
        ok: true,
        outcome: "deleted",
        message: directDeleteMessage,
      };
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
      targetSheetId: sheetId ?? undefined,
      targetUserId: userId ?? undefined,
      error: undefined,
    };
    await db.transactions.add(compensating);
    await refreshMutationState();
    if (isOnline && accessToken && sheetId) {
      await performSync().catch(() => undefined);
    }
    return {
      ok: true,
      outcome: "pending",
      message: "Undo queued as compensating entry",
    };
  }, [
    accessToken,
    sheetId,
    sheetTabId,
    userId,
    isOnline,
    performSync,
    refreshMutationState,
    signOut,
  ]);

  const deleteTransactionUnlocked = useCallback(
    async (id: string): Promise<UndoResult> => {
      const requestedScope = { accessToken, sheetId, userId };
      const transaction = await db.transactions.get(id);
      if (!transaction) {
        return {
          ok: false,
          outcome: "error",
          message: "Transaction not found",
        };
      }

      const isLegacyRecovery = canDeleteAsLegacyRecovery(
        transaction,
        sheetId,
      );
      if (!isLegacyRecovery) {
        requireTransactionScope(transaction, sheetId, userId);
      }

      const isLinkedDelete = Boolean(
        transaction.reimbursesTransactionId || transaction.deleteIntent,
      );
      if (
        !isLinkedDelete &&
        (transaction.status === "pending" || transaction.status === "error")
      ) {
        await db.transactions.delete(id);
        await refreshMutationState();
        return {
          ok: true,
          outcome: "deleted",
          message:
            transaction.status === "error"
              ? "Removed failed entry"
              : "Removed pending entry",
        };
      }

      let directDeleteMessage: string | null = null;
      let directDeleteCommitted = false;
      if (
        transaction.status === "synced" &&
        accessToken &&
        sheetId &&
        userId
      ) {
        try {
          directDeleteMessage = await withSheetMutationLock(
            { sheetId, userId },
            async (mutationGuard) => {
              const effectiveTabId =
                sheetTabId ?? (await getSheetTabId(accessToken, sheetId));
              if (effectiveTabId === null) {
                return null;
              }
              const idMap = await readTransactionIdMap(accessToken, sheetId);
              const currentRow = idMap.get(id);
              const message =
                currentRow === undefined
                  ? "Removed entry already absent from Sheets"
                  : "Removed synced entry";
              if (currentRow !== undefined) {
                await mutationGuard.assertOwnership();
                await deleteRow(
                  accessToken,
                  sheetId,
                  effectiveTabId,
                  currentRow,
                );
              }
              directDeleteCommitted = true;
              await mutationGuard.assertOwnership();
              await db.transactions.delete(id);
              return message;
            },
          );
        } catch (error) {
          if (directDeleteCommitted) {
            throw error;
          }
          if (
            error instanceof DuplicateTransactionIdError ||
            error instanceof SheetMutationLockLostError
          ) {
            throw error;
          }
          const info = mapGoogleSyncError(error);
          if (info.shouldClearAuth) {
            signOut(accessToken);
          }
          if (isSameActiveScope(activeScopeRef.current, requestedScope)) {
            dispatch({
              type: "sync_error",
              message: info.message,
              at: new Date().toISOString(),
              scope: requestedScope,
            });
          }
        }
      }

      if (directDeleteMessage) {
        await refreshMutationState();
        return {
          ok: true,
          outcome: "deleted",
          message: directDeleteMessage,
        };
      }

      if (isLinkedDelete) {
        const latest = await db.transactions.get(id);
        if (!latest) {
          return {
            ok: true,
            outcome: "deleted",
            message: "Reimbursement removed",
          };
        }
        if (!canDeleteAsLegacyRecovery(latest, sheetId)) {
          requireTransactionScope(latest, sheetId, userId);
        }
        await db.transactions.put({
          ...latest,
          reimbursesTransactionId:
            latest.reimbursesTransactionId ??
            transaction.reimbursesTransactionId,
          deleteIntent: true,
          status: "pending",
          updatedAt: new Date().toISOString(),
          sheetRow: undefined,
          targetSheetId: latest.targetSheetId ?? sheetId ?? undefined,
          targetUserId: latest.targetUserId ?? userId ?? undefined,
          error: undefined,
        });
        await refreshMutationState();
        if (isOnline && accessToken && sheetId) {
          await performSync().catch(() => undefined);
        }

        const remaining = await db.transactions.get(id);
        if (!remaining) {
          return {
            ok: true,
            outcome: "deleted",
            message: "Reimbursement removed",
          };
        }
        if (remaining.deleteIntent && remaining.status === "error") {
          return {
            ok: false,
            outcome: "error",
            message:
              remaining.error ||
              "Failed to remove reimbursement from Google Sheets",
          };
        }
        return {
          ok: true,
          outcome: "pending",
          message: "Reimbursement removal queued",
        };
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
        targetSheetId: sheetId ?? undefined,
        targetUserId: userId ?? undefined,
        error: undefined,
      };
      await db.transactions.add(compensating);
      await refreshMutationState();
      await db.transactions.delete(id);
      await refreshMutationState();
      if (isOnline && accessToken && sheetId) {
        await performSync().catch(() => undefined);
      }
      return {
        ok: true,
        outcome: "pending",
        message: "Delete queued as compensating entry",
      };
    },
    [
      accessToken,
      sheetId,
      sheetTabId,
      userId,
      isOnline,
      performSync,
      refreshMutationState,
      signOut,
    ]
  );

  const addTransaction = useCallback(
    async (input: TransactionInput) => {
      const record = await addTransactionLocally(input);
      if (isOnline && accessToken && sheetId) {
        await syncNow().catch(() => undefined);
      }
      return (await db.transactions.get(record.id)) ?? record;
    },
    [accessToken, addTransactionLocally, isOnline, sheetId, syncNow],
  );

  const updateTransaction = useCallback(
    (id: string, input: Partial<TransactionInput>) =>
      runExclusive(() => updateTransactionUnlocked(id, input)),
    [runExclusive, updateTransactionUnlocked],
  );

  const undoLast = useCallback(
    () => runExclusive(undoLastUnlocked),
    [runExclusive, undoLastUnlocked],
  );

  const deleteTransaction = useCallback(
    (id: string) => runExclusive(() => deleteTransactionUnlocked(id)),
    [deleteTransactionUnlocked, runExclusive],
  );

  const hasCurrentSyncError =
    state.lastSyncErrorScope !== null &&
    isSameActiveScope(state.lastSyncErrorScope, {
      accessToken,
      sheetId,
      userId,
    });

  const value = useMemo<TransactionsContextValue>(
    () => ({
      queueCount: state.queueCount,
      recentCategories: state.recentCategories,
      lastSyncError: hasCurrentSyncError ? state.lastSyncError : null,
      lastSyncErrorAt: hasCurrentSyncError ? state.lastSyncErrorAt : null,
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
      hasCurrentSyncError,
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
