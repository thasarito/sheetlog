"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { db } from "../lib/db";
import type {
  CategoryConfig,
  OnboardingState,
  RecentCategories,
  TransactionInput,
  TransactionRecord,
  TransactionType,
} from "../lib/types";
import {
  getDefaultOnboardingState,
  getOnboardingState,
  getRecentCategories,
  setOnboardingState,
  updateRecentCategory,
} from "../lib/settings";
import {
  deleteRow,
  ensureSheet,
  getSheetTabId,
  readOnboardingConfig,
  requestAccessToken,
  writeOnboardingConfig,
} from "../lib/google";
import { syncPendingTransactions } from "../lib/sync";

const ACCESS_TOKEN_KEY = "sheetlog.accessToken";
const SHEET_ID_KEY = "sheetlog.sheetId";
const SHEET_TAB_ID_KEY = "sheetlog.sheetTabId";

const DEFAULT_RECENTS: RecentCategories = {
  expense: [],
  income: [],
  transfer: [],
};

type OnboardingSheetConfig = {
  accounts?: string[];
  categories?: CategoryConfig;
};

function hasAllCategories(categories: CategoryConfig): boolean {
  return (
    categories.expense.length > 0 &&
    categories.income.length > 0 &&
    categories.transfer.length > 0
  );
}

function hasAnyCategories(categories: CategoryConfig): boolean {
  return (
    categories.expense.length > 0 ||
    categories.income.length > 0 ||
    categories.transfer.length > 0
  );
}

function normalizeStringList(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(trimmed);
  }
  return next;
}

function normalizeCategories(categories: CategoryConfig): CategoryConfig {
  return {
    expense: normalizeStringList(categories.expense),
    income: normalizeStringList(categories.income),
    transfer: normalizeStringList(categories.transfer),
  };
}

function mergeOnboardingState(
  current: OnboardingState,
  config: OnboardingSheetConfig
): { next: OnboardingState; changed: boolean } {
  let next = current;
  let changed = false;
  if (
    config.accounts &&
    config.accounts.length > 0 &&
    !current.accountsConfirmed
  ) {
    next = {
      ...next,
      accounts: config.accounts,
      accountsConfirmed: true,
    };
    changed = true;
  }
  if (
    config.categories &&
    hasAnyCategories(config.categories) &&
    !current.categoriesConfirmed
  ) {
    next = {
      ...next,
      categories: config.categories,
      categoriesConfirmed: hasAllCategories(config.categories),
    };
    changed = true;
  }
  return { next, changed };
}

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
  onboarding: OnboardingState;
  connect: () => Promise<void>;
  refreshSheet: (folderId?: string | null) => Promise<void>;
  addTransaction: (input: TransactionInput) => Promise<void>;
  undoLast: () => Promise<UndoResult>;
  syncNow: () => Promise<void>;
  markRecentCategory: (
    type: TransactionType,
    category: string
  ) => Promise<void>;
  updateOnboarding: (
    updates: Partial<OnboardingState>
  ) => Promise<OnboardingState>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetTabId, setSheetTabId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [lastTransaction, setLastTransaction] =
    useState<TransactionRecord | null>(null);
  const [recentCategories, setRecentCategoriesState] =
    useState<RecentCategories>(DEFAULT_RECENTS);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingState>(() =>
    getDefaultOnboardingState()
  );

  const refreshStats = useCallback(async () => {
    const [pendingCount, last] = await Promise.all([
      db.transactions.where("status").equals("pending").count(),
      db.transactions.orderBy("createdAt").last(),
    ]);
    setQueueCount(pendingCount);
    setLastTransaction(last ?? null);
  }, []);

  const loadStored = useCallback(async () => {
    if (typeof window === "undefined") {
      return;
    }
    const online = window.navigator.onLine;
    const storedToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    const storedSheetId = localStorage.getItem(SHEET_ID_KEY);
    setIsOnline(online);
    setAccessToken(storedToken);
    setSheetId(storedSheetId);
    const storedTabId = localStorage.getItem(SHEET_TAB_ID_KEY);
    setSheetTabId(storedTabId ? Number.parseInt(storedTabId, 10) : null);
    const [storedRecents, storedOnboarding] = await Promise.all([
      getRecentCategories(),
      getOnboardingState(),
    ]);
    setRecentCategoriesState(storedRecents);
    setOnboarding(storedOnboarding);
    setHasLoaded(true);
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
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
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

  const refreshSheet = useCallback(
    async (folderId?: string | null) => {
      if (!accessToken) {
        return;
      }
      const id = await ensureSheet(
        accessToken,
        folderId ?? onboarding.sheetFolderId
      );
      const tabId = await getSheetTabId(accessToken, id);
      storeSheet(id, tabId);
    },
    [accessToken, onboarding.sheetFolderId, storeSheet]
  );

  const hydrateOnboardingFromSheet = useCallback(async () => {
    if (!accessToken || !sheetId || !isOnline) {
      return;
    }
    try {
      const sheetConfig = await readOnboardingConfig(accessToken, sheetId);
      if (!sheetConfig) {
        return;
      }
      let nextState: OnboardingState | null = null;
      setOnboarding((prev) => {
        const merged = mergeOnboardingState(prev, sheetConfig);
        if (!merged.changed) {
          return prev;
        }
        nextState = merged.next;
        return merged.next;
      });
      if (nextState) {
        await setOnboardingState(nextState);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("401")) {
        clearAuth();
      }
    }
  }, [accessToken, sheetId, isOnline, clearAuth]);

  const connect = useCallback(async () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new Error("Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID");
    }
    setIsConnecting(true);
    try {
      const token = await requestAccessToken(clientId);
      storeToken(token);
    } catch (error) {
      clearAuth();
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [clearAuth, storeToken]);

  const syncNow = useCallback(async () => {
    if (!accessToken || !sheetId || isSyncing) {
      return;
    }
    setIsSyncing(true);
    try {
      await syncPendingTransactions(accessToken, sheetId);
      await refreshStats();
    } catch (error) {
      if (error instanceof Error && error.message.includes("401")) {
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

  useEffect(() => {
    if (!hasLoaded) {
      return;
    }
    void hydrateOnboardingFromSheet();
  }, [hasLoaded, hydrateOnboardingFromSheet]);

  const markRecentCategory = useCallback(
    async (type: TransactionType, category: string) => {
      const updated = await updateRecentCategory(type, category);
      setRecentCategoriesState(updated);
    },
    []
  );

  const updateOnboarding = useCallback(
    async (updates: Partial<OnboardingState>) => {
      const nextState = { ...onboarding, ...updates };

      if (accessToken && sheetId && isOnline) {
        const shouldPersistAccounts =
          ("accounts" in updates || "accountsConfirmed" in updates) &&
          nextState.accountsConfirmed;
        const shouldPersistCategories =
          ("categories" in updates || "categoriesConfirmed" in updates) &&
          nextState.categoriesConfirmed;

        const updatesToSheet: {
          accounts?: string[];
          categories?: CategoryConfig;
        } = {};

        if (shouldPersistAccounts) {
          const normalizedAccounts = normalizeStringList(nextState.accounts);
          if (normalizedAccounts.length > 0) {
            updatesToSheet.accounts = normalizedAccounts;
          }
        }

        if (shouldPersistCategories) {
          const normalizedCategories = normalizeCategories(
            nextState.categories
          );
          if (hasAllCategories(normalizedCategories)) {
            updatesToSheet.categories = normalizedCategories;
          }
        }

        if (updatesToSheet.accounts || updatesToSheet.categories) {
          try {
            await writeOnboardingConfig(accessToken, sheetId, updatesToSheet);
          } catch (error) {
            if (error instanceof Error && error.message.includes("401")) {
              clearAuth();
            }
            throw error;
          }
        }
      }

      setOnboarding(nextState);
      await setOnboardingState(nextState);
      return nextState;
    },
    [onboarding, accessToken, sheetId, isOnline, clearAuth]
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
      onboarding,
      connect,
      refreshSheet,
      addTransaction,
      undoLast,
      syncNow,
      markRecentCategory,
      updateOnboarding,
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
      onboarding,
      connect,
      refreshSheet,
      addTransaction,
      undoLast,
      syncNow,
      markRecentCategory,
      updateOnboarding,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }
  return context;
}
