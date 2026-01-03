"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { refreshAccessToken, requestAccessToken } from "../../lib/google";
import { ensureSheetReady } from "../../lib/sheets";
import { useConnectivity } from "./ConnectivityProvider";

const ACCESS_TOKEN_KEY = "sheetlog.accessToken";
const ACCESS_TOKEN_EXPIRES_AT_KEY = "sheetlog.accessTokenExpiresAt";
const SHEET_ID_KEY = "sheetlog.sheetId";
const SHEET_TAB_ID_KEY = "sheetlog.sheetTabId";

interface AuthStorageContextValue {
  accessToken: string | null;
  sheetId: string | null;
  sheetTabId: number | null;
  isConnecting: boolean;
  connect: () => Promise<void>;
  refreshSheet: (folderId?: string | null) => Promise<void>;
  refreshToken: (reason?: string) => Promise<void>;
  clearAuth: () => void;
}

const AuthStorageContext = createContext<AuthStorageContextValue | null>(null);

export function AuthStorageProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [accessTokenExpiresAt, setAccessTokenExpiresAt] = useState<
    number | null
  >(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetTabId, setSheetTabId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const { isOnline } = useConnectivity();

  const refreshTimeoutRef = useRef<number | null>(null);
  const retryTimeoutRef = useRef<number | null>(null);
  const shouldRefreshWhenOnlineRef = useRef(false);
  const pendingRefreshRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const storedToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    const storedExpiresAt = localStorage.getItem(ACCESS_TOKEN_EXPIRES_AT_KEY);
    const storedSheetId = localStorage.getItem(SHEET_ID_KEY);
    const storedTabId = localStorage.getItem(SHEET_TAB_ID_KEY);
    setAccessToken(storedToken);
    setAccessTokenExpiresAt(
      storedExpiresAt ? Number.parseInt(storedExpiresAt, 10) : null
    );
    setSheetId(storedSheetId);
    setSheetTabId(storedTabId ? Number.parseInt(storedTabId, 10) : null);
  }, []);

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current !== null) {
        window.clearTimeout(refreshTimeoutRef.current);
      }
      if (retryTimeoutRef.current !== null) {
        window.clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  const storeToken = useCallback((token: string, expiresIn?: number) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
    setAccessToken(token);
    if (expiresIn && Number.isFinite(expiresIn)) {
      const nextExpiresAt = Date.now() + expiresIn * 1000;
      localStorage.setItem(
        ACCESS_TOKEN_EXPIRES_AT_KEY,
        nextExpiresAt.toString()
      );
      setAccessTokenExpiresAt(nextExpiresAt);
    } else {
      localStorage.removeItem(ACCESS_TOKEN_EXPIRES_AT_KEY);
      setAccessTokenExpiresAt(null);
    }
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
    localStorage.removeItem(ACCESS_TOKEN_EXPIRES_AT_KEY);
    localStorage.removeItem(SHEET_ID_KEY);
    localStorage.removeItem(SHEET_TAB_ID_KEY);
    localStorage.removeItem("sheetlog.userProfile");
    setAccessToken(null);
    setAccessTokenExpiresAt(null);
    setSheetId(null);
    setSheetTabId(null);
    if (refreshTimeoutRef.current !== null) {
      window.clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    shouldRefreshWhenOnlineRef.current = false;
  }, []);

  const scheduleRefresh = useCallback(
    (expiresAt: number | null) => {
      if (refreshTimeoutRef.current !== null) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      if (!expiresAt || !isOnline) {
        return;
      }
      const earlyRefreshMs = 5 * 60 * 1000; // 5 minutes before expiry
      const delay = Math.max(expiresAt - Date.now() - earlyRefreshMs, 0);
      refreshTimeoutRef.current = window.setTimeout(() => {
        void refreshToken("scheduled-refresh");
      }, delay);
    },
    [isOnline, refreshToken]
  );

  const refreshToken = useCallback(
    async (_reason: string = "manual") => {
      if (pendingRefreshRef.current) {
        return pendingRefreshRef.current;
      }
      if (!accessToken) {
        return;
      }
      if (!isOnline) {
        shouldRefreshWhenOnlineRef.current = true;
        return;
      }
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId) {
        throw new Error("Missing VITE_GOOGLE_CLIENT_ID");
      }
      if (retryTimeoutRef.current !== null) {
        window.clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      const attempt = (async () => {
        try {
          const { accessToken: nextToken, expiresIn } =
            await refreshAccessToken(clientId);
          storeToken(nextToken, expiresIn);
          shouldRefreshWhenOnlineRef.current = false;
        } catch (error) {
          const message =
            error instanceof Error ? error.message.toLowerCase() : "";
          const isAuthFailure =
            message.includes("invalid_grant") ||
            message.includes("unauthorized") ||
            message.includes("consent") ||
            message.includes("401") ||
            message.includes("403");

          if (isAuthFailure) {
            clearAuth();
            return;
          }

          // transient failure, retry with modest backoff
          retryTimeoutRef.current = window.setTimeout(() => {
            void refreshToken("retry-after-error");
          }, 30_000);
        } finally {
          pendingRefreshRef.current = null;
        }
      })();

      pendingRefreshRef.current = attempt;
      return attempt;
    },
    [accessToken, clearAuth, isOnline, storeToken]
  );

  const connect = useCallback(async () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new Error("Missing VITE_GOOGLE_CLIENT_ID");
    }
    setIsConnecting(true);
    try {
      const { accessToken: token, expiresIn } = await requestAccessToken(
        clientId
      );
      storeToken(token, expiresIn);
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
      if (
        accessTokenExpiresAt &&
        accessTokenExpiresAt - Date.now() <= 60 * 1000
      ) {
        await refreshToken("pre-sheet-refresh");
      }
      const { sheetId: nextSheetId, sheetTabId: nextTabId } =
        await ensureSheetReady(accessToken, folderId);
      storeSheet(nextSheetId, nextTabId);
    },
    [accessToken, accessTokenExpiresAt, refreshToken, storeSheet]
  );

  useEffect(() => {
    scheduleRefresh(accessTokenExpiresAt);
  }, [accessTokenExpiresAt, scheduleRefresh]);

  useEffect(() => {
    if (!isOnline) {
      return;
    }
    const expired = accessTokenExpiresAt && accessTokenExpiresAt <= Date.now();
    if (expired || shouldRefreshWhenOnlineRef.current) {
      void refreshToken("online-resume");
    }
  }, [accessTokenExpiresAt, isOnline, refreshToken]);

  const value = useMemo<AuthStorageContextValue>(
    () => ({
      accessToken,
      sheetId,
      sheetTabId,
      isConnecting,
      connect,
      refreshSheet,
      refreshToken,
      clearAuth,
    }),
    [
      accessToken,
      sheetId,
      sheetTabId,
      isConnecting,
      connect,
      refreshSheet,
      refreshToken,
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
