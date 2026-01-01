'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { db } from '../lib/db';
import type { RecentCategories, TransactionInput, TransactionRecord, TransactionType } from '../lib/types';
import { getRecentCategories, updateRecentCategory } from '../lib/settings';
import { deleteRow, ensureSheet, getSheetTabId, requestAccessToken } from '../lib/google';
import { syncPendingTransactions } from '../lib/sync';

const ACCESS_TOKEN_KEY = 'sheetlog.accessToken';
const SHEET_ID_KEY = 'sheetlog.sheetId';
const SHEET_TAB_ID_KEY = 'sheetlog.sheetTabId';

const DEFAULT_RECENTS: RecentCategories = {
  expense: [],
  income: [],
  transfer: []
};

interface UndoResult {
  ok: boolean;
  message: string;
}

interface AppContextValue {
  isOnline: boolean;
  accessToken: string | null;
  sheetId: string | null;
  sheetTabId: number | null;
  isConnecting: boolean;
  queueCount: number;
  lastTransaction: TransactionRecord | null;
  recentCategories: RecentCategories;
  connect: () => Promise<void>;
  refreshSheet: () => Promise<void>;
  addTransaction: (input: TransactionInput) => Promise<void>;
  undoLast: () => Promise<UndoResult>;
  syncNow: () => Promise<void>;
  markRecentCategory: (type: TransactionType, category: string) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetTabId, setSheetTabId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [lastTransaction, setLastTransaction] = useState<TransactionRecord | null>(null);
  const [recentCategories, setRecentCategoriesState] = useState<RecentCategories>(DEFAULT_RECENTS);
  const [isSyncing, setIsSyncing] = useState(false);

  const refreshStats = useCallback(async () => {
    const [pendingCount, last] = await Promise.all([
      db.transactions.where('status').equals('pending').count(),
      db.transactions.orderBy('createdAt').last()
    ]);
    setQueueCount(pendingCount);
    setLastTransaction(last ?? null);
  }, []);

  const loadStored = useCallback(async () => {
    if (typeof window === 'undefined') {
      return;
    }
    setIsOnline(window.navigator.onLine);
    setAccessToken(localStorage.getItem(ACCESS_TOKEN_KEY));
    setSheetId(localStorage.getItem(SHEET_ID_KEY));
    const storedTabId = localStorage.getItem(SHEET_TAB_ID_KEY);
    setSheetTabId(storedTabId ? Number.parseInt(storedTabId, 10) : null);
    const storedRecents = await getRecentCategories();
    setRecentCategoriesState(storedRecents);
    await refreshStats();
  }, [refreshStats]);

  useEffect(() => {
    loadStored();
  }, [loadStored]);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const storeToken = useCallback((token: string) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
    setAccessToken(token);
  }, []);

  const storeSheet = useCallback((id: string, tabId: number | null) => {
    localStorage.setItem(SHEET_ID_KEY, id);
    setSheetId(id);
    if (tabId !== null) {
      localStorage.setItem(SHEET_TAB_ID_KEY, tabId.toString());
      setSheetTabId(tabId);
    }
  }, []);

  const clearAuth = useCallback(() => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(SHEET_ID_KEY);
    localStorage.removeItem(SHEET_TAB_ID_KEY);
    setAccessToken(null);
    setSheetId(null);
    setSheetTabId(null);
  }, []);

  const refreshSheet = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    const id = await ensureSheet(accessToken);
    const tabId = await getSheetTabId(accessToken, id);
    storeSheet(id, tabId);
  }, [accessToken, storeSheet]);

  useEffect(() => {
    if (accessToken && !sheetId) {
      refreshSheet().catch(() => undefined);
    }
  }, [accessToken, sheetId, refreshSheet]);

  const connect = useCallback(async () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new Error('Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID');
    }
    setIsConnecting(true);
    try {
      const token = await requestAccessToken(clientId);
      storeToken(token);
      const id = await ensureSheet(token);
      const tabId = await getSheetTabId(token, id);
      storeSheet(id, tabId);
    } catch (error) {
      clearAuth();
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [clearAuth, storeSheet, storeToken]);

  const syncNow = useCallback(async () => {
    if (!accessToken || !sheetId || isSyncing) {
      return;
    }
    setIsSyncing(true);
    try {
      await syncPendingTransactions(accessToken, sheetId);
      await refreshStats();
    } catch (error) {
      if (error instanceof Error && error.message.includes('401')) {
        clearAuth();
      }
    } finally {
      setIsSyncing(false);
    }
  }, [accessToken, sheetId, isSyncing, refreshStats, clearAuth]);

  useEffect(() => {
    if (isOnline && accessToken && sheetId) {
      syncNow();
    }
  }, [isOnline, accessToken, sheetId, syncNow]);

  const markRecentCategory = useCallback(async (type: TransactionType, category: string) => {
    const updated = await updateRecentCategory(type, category);
    setRecentCategoriesState(updated);
  }, []);

  const addTransaction = useCallback(
    async (input: TransactionInput) => {
      const now = new Date().toISOString();
      const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`;
      const record: TransactionRecord = {
        ...input,
        id,
        status: 'pending',
        createdAt: now,
        updatedAt: now
      };
      await db.transactions.add(record);
      setLastTransaction(record);
      await refreshStats();
      await markRecentCategory(input.type, input.category);
      if (isOnline && accessToken && sheetId) {
        await syncNow();
      }
    },
    [accessToken, isOnline, sheetId, refreshStats, syncNow, markRecentCategory]
  );

  const undoLast = useCallback(async (): Promise<UndoResult> => {
    const last = await db.transactions.orderBy('createdAt').last();
    if (!last) {
      return { ok: false, message: 'Nothing to undo' };
    }

    if (last.status === 'pending') {
      await db.transactions.delete(last.id);
      await refreshStats();
      return { ok: true, message: 'Removed pending entry' };
    }

    if (last.status === 'synced' && accessToken && sheetId) {
      const effectiveTabId = sheetTabId ?? (await getSheetTabId(accessToken, sheetId));
      if (effectiveTabId && last.sheetRow) {
        try {
          await deleteRow(accessToken, sheetId, effectiveTabId, last.sheetRow);
          await db.transactions.delete(last.id);
          await refreshStats();
          return { ok: true, message: 'Removed last synced entry' };
        } catch {
          // Fall through to compensating entry
        }
      }
    }

    const now = new Date().toISOString();
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-undo`;
    const compensating: TransactionRecord = {
      ...last,
      id,
      amount: -last.amount,
      note: last.note ? `UNDO: ${last.note}` : 'UNDO',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      sheetRow: undefined,
      sheetId: undefined,
      error: undefined
    };
    await db.transactions.add(compensating);
    await refreshStats();
    if (isOnline && accessToken && sheetId) {
      await syncNow();
    }
    return { ok: true, message: 'Undo queued as compensating entry' };
  }, [accessToken, sheetId, sheetTabId, isOnline, refreshStats, syncNow]);

  const value = useMemo<AppContextValue>(
    () => ({
      isOnline,
      accessToken,
      sheetId,
      sheetTabId,
      isConnecting,
      queueCount,
      lastTransaction,
      recentCategories,
      connect,
      refreshSheet,
      addTransaction,
      undoLast,
      syncNow,
      markRecentCategory
    }),
    [
      isOnline,
      accessToken,
      sheetId,
      sheetTabId,
      isConnecting,
      queueCount,
      lastTransaction,
      recentCategories,
      connect,
      refreshSheet,
      addTransaction,
      undoLast,
      syncNow,
      markRecentCategory
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
