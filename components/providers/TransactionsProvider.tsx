"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { db } from "../../lib/db";
import { deleteRow, getSheetTabId } from "../../lib/google";
import { getRecentCategories, updateRecentCategory } from "../../lib/settings";
import { syncPendingTransactions } from "../../lib/sync";
import type {
  RecentCategories,
  TransactionInput,
  TransactionRecord,
  TransactionType,
} from "../../lib/types";
import { useAuthStorage } from "./AuthStorageProvider";
import { useConnectivity } from "./ConnectivityProvider";

const DEFAULT_RECENTS: RecentCategories = {
  expense: [],
  income: [],
  transfer: [],
};

interface UndoResult {
  ok: boolean;
  message: string;
}

type TransactionsState = {
  queueCount: number;
  recentCategories: RecentCategories;
  isSyncing: boolean;
};

type TransactionsAction =
  | {
      type: "set_stats";
      queueCount: number;
    }
  | { type: "set_recent"; recentCategories: RecentCategories }
  | { type: "sync_start" }
  | { type: "sync_end" };

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
    default:
      return state;
  }
}

interface TransactionsContextValue {
  queueCount: number;
  recentCategories: RecentCategories;
  addTransaction: (input: TransactionInput) => Promise<void>;
  undoLast: () => Promise<UndoResult>;
  syncNow: () => Promise<void>;
  markRecentCategory: (
    type: TransactionType,
    category: string
  ) => Promise<void>;
}

const TransactionsContext = createContext<TransactionsContextValue | null>(null);

export function TransactionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { accessToken, sheetId, sheetTabId, clearAuth } = useAuthStorage();
  const { isOnline } = useConnectivity();
  const [state, dispatch] = useReducer(transactionsReducer, {
    queueCount: 0,
    recentCategories: DEFAULT_RECENTS,
    isSyncing: false,
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
    dispatch({ type: "sync_start" });
    try {
      await syncPendingTransactions(accessToken, sheetId);
      await refreshStats();
    } catch (error) {
      if (error instanceof Error && error.message.includes("401")) {
        clearAuth();
      }
    } finally {
      dispatch({ type: "sync_end" });
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
    [
      accessToken,
      isOnline,
      sheetId,
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
        } catch {
          // Fall through to compensating entry
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
  }, [accessToken, sheetId, sheetTabId, isOnline, refreshStats, syncNow]);

  const value = useMemo<TransactionsContextValue>(
    () => ({
      queueCount: state.queueCount,
      recentCategories: state.recentCategories,
      addTransaction,
      undoLast,
      syncNow,
      markRecentCategory,
    }),
    [
      state.queueCount,
      state.recentCategories,
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

export function useTransactions() {
  const context = useContext(TransactionsContext);
  if (!context) {
    throw new Error(
      "useTransactions must be used within TransactionsProvider"
    );
  }
  return context;
}
