"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { STORAGE_KEYS } from "../../lib/constants";
import { requestAccessToken, isUnauthorizedError } from "../../lib/google";
import { ensureSheetReady } from "../../lib/sheets";

interface AuthStorageContextValue {
  accessToken: string | null;
  sheetId: string | null;
  sheetTabId: number | null;
  isConnecting: boolean;
  isInitialized: boolean;
  connect: () => Promise<void>;
  refreshSheet: (folderId?: string | null) => Promise<void>;
  clearAuth: () => void;
}

const AuthStorageContext = createContext<AuthStorageContextValue | null>(null);

export function AuthStorageProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetTabId, setSheetTabId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const storedToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    const storedSheetId = localStorage.getItem(STORAGE_KEYS.SHEET_ID);
    const storedTabId = localStorage.getItem(STORAGE_KEYS.SHEET_TAB_ID);
    setAccessToken(storedToken);
    setSheetId(storedSheetId);
    setSheetTabId(storedTabId ? Number.parseInt(storedTabId, 10) : null);
    setIsInitialized(true);
  }, []);

  const storeToken = useCallback((token: string) => {
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
    setAccessToken(token);
  }, []);

  const storeSheet = useCallback((id: string, tabId: number | null) => {
    localStorage.setItem(STORAGE_KEYS.SHEET_ID, id);
    setSheetId(id);
    if (tabId !== null) {
      localStorage.setItem(STORAGE_KEYS.SHEET_TAB_ID, tabId.toString());
      setSheetTabId(tabId);
    }
  }, []);

  const clearAuth = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.SHEET_ID);
    localStorage.removeItem(STORAGE_KEYS.SHEET_TAB_ID);
    localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
    setAccessToken(null);
    setSheetId(null);
    setSheetTabId(null);
  }, []);

  const connect = useCallback(async () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new Error("Missing VITE_GOOGLE_CLIENT_ID");
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

  const refreshSheet = useCallback(
    async (folderId?: string | null) => {
      if (!accessToken) {
        return;
      }
      try {
        const { sheetId: nextSheetId, sheetTabId: nextTabId } =
          await ensureSheetReady(accessToken, folderId);
        storeSheet(nextSheetId, nextTabId);
      } catch (error) {
        if (isUnauthorizedError(error)) {
          clearAuth();
        }
        throw error;
      }
    },
    [accessToken, storeSheet, clearAuth]
  );

  const value = useMemo<AuthStorageContextValue>(
    () => ({
      accessToken,
      sheetId,
      sheetTabId,
      isConnecting,
      isInitialized,
      connect,
      refreshSheet,
      clearAuth,
    }),
    [
      accessToken,
      sheetId,
      sheetTabId,
      isConnecting,
      isInitialized,
      connect,
      refreshSheet,
      clearAuth,
    ]
  );

  return (
    <AuthStorageContext.Provider value={value}>
      {children}
    </AuthStorageContext.Provider>
  );
}

export function useAuthStorage() {
  const context = useContext(AuthStorageContext);
  if (!context) {
    throw new Error("useAuthStorage must be used within AuthStorageProvider");
  }
  return context;
}
