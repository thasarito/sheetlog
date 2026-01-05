import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { db } from "../../lib/db";
import { deleteRow, getSheetTabId } from "../../lib/google";
import { mapGoogleSyncError } from "../../lib/googleErrors";
import { getRecentCategories, updateRecentCategory } from "../../lib/settings";
import { syncPendingTransactions } from "../../lib/sync";
import type {
  RecentCategories,
  TransactionInput,
  TransactionRecord,
  TransactionType,
} from "../../lib/types";
import { useAuth } from "./auth";
import { useConnectivity } from "./ConnectivityContext";
import {
  TransactionsContext,
  type TransactionsContextValue,
  type UndoResult,
} from "./TransactionsContext";

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

export function TransactionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { accessToken, sheetId, sheetTabId, clearAuth } = useAuth();
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
        clearAuth();
      }
      dispatch({
        type: "sync_error",
        message: info.message,
        at: new Date().toISOString(),
      });
    } finally {
      await refreshStats();
      dispatch({ type: "sync_end" });
      syncingRef.current = false;
    }
  }, [accessToken, sheetId, refreshStats, clearAuth]);

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
      await refreshStats();
      await markRecentCategory(input.type, input.category);
      if (isOnline && accessToken && sheetId) {
        await syncNow();
      }
    },
    [accessToken, isOnline, sheetId, refreshStats, markRecentCategory, syncNow]
  );

  const undoLast = useCallback(async (): Promise<UndoResult> => {
    const last = await db.transactions.orderBy("createdAt").last();
    if (!last) {
      return { ok: false, message: "Nothing to undo" };
    }

    if (last.status === "pending") {
      await db.transactions.delete(last.id);
      await refreshStats();
      return { ok: true, message: "Removed pending entry" };
    }

    if (last.status === "synced" && accessToken && sheetId) {
      const effectiveTabId =
        sheetTabId ?? (await getSheetTabId(accessToken, sheetId));
      if (effectiveTabId && last.sheetRow) {
        try {
          await deleteRow(accessToken, sheetId, effectiveTabId, last.sheetRow);
          await db.transactions.delete(last.id);
          await refreshStats();
          return { ok: true, message: "Removed last synced entry" };
        } catch (error) {
          const info = mapGoogleSyncError(error);
          if (info.shouldClearAuth) {
            clearAuth();
          }
          dispatch({
            type: "sync_error",
            message: info.message,
            at: new Date().toISOString(),
          });
        }
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
    refreshStats,
    syncNow,
    clearAuth,
  ]);

  const value = useMemo<TransactionsContextValue>(
    () => ({
      queueCount: state.queueCount,
      recentCategories: state.recentCategories,
      lastSyncError: state.lastSyncError,
      lastSyncErrorAt: state.lastSyncErrorAt,
      lastSyncAt: state.lastSyncAt,
      addTransaction,
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
