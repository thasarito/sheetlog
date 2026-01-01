"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { requestAccessToken } from "../../lib/google";
import { ensureSheetReady } from "../../lib/sheets";

const ACCESS_TOKEN_KEY = "sheetlog.accessToken";
const SHEET_ID_KEY = "sheetlog.sheetId";
const SHEET_TAB_ID_KEY = "sheetlog.sheetTabId";

interface AuthStorageContextValue {
  accessToken: string | null;
  sheetId: string | null;
  sheetTabId: number | null;
  isConnecting: boolean;
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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const storedToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    const storedSheetId = localStorage.getItem(SHEET_ID_KEY);
    const storedTabId = localStorage.getItem(SHEET_TAB_ID_KEY);
    setAccessToken(storedToken);
    setSheetId(storedSheetId);
    setSheetTabId(storedTabId ? Number.parseInt(storedTabId, 10) : null);
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

  const refreshSheet = useCallback(
    async (folderId?: string | null) => {
      if (!accessToken) {
        return;
      }
      const { sheetId: nextSheetId, sheetTabId: nextTabId } =
        await ensureSheetReady(accessToken, folderId);
      storeSheet(nextSheetId, nextTabId);
    },
    [accessToken, storeSheet]
  );

  const value = useMemo<AuthStorageContextValue>(
    () => ({
      accessToken,
      sheetId,
      sheetTabId,
      isConnecting,
      connect,
      refreshSheet,
      clearAuth,
    }),
    [
      accessToken,
      sheetId,
      sheetTabId,
      isConnecting,
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
