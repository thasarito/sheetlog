"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { STORAGE_KEYS } from "../../lib/constants";
import { GoogleTokenClient, isUnauthorizedError } from "../../lib/google";
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

// 5 minutes buffer
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const MIN_REFETCH_INTERVAL_MS = 1000;

export function AuthStorageProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetTabId, setSheetTabId] = useState<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize from LocalStorage
  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedSheetId = localStorage.getItem(STORAGE_KEYS.SHEET_ID);
    const storedTabId = localStorage.getItem(STORAGE_KEYS.SHEET_TAB_ID);
    const storedToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    const storedExpiresAt = localStorage.getItem(STORAGE_KEYS.EXPIRES_AT);

    setSheetId(storedSheetId);
    setSheetTabId(storedTabId ? Number.parseInt(storedTabId, 10) : null);

    // Hydrate React Query cache if we have a token
    if (storedToken && storedExpiresAt) {
      const expiresAt = Number.parseInt(storedExpiresAt, 10);
      const expiresIn = Math.max(
        0,
        Math.floor((expiresAt - Date.now()) / 1000)
      );

      queryClient.setQueryData(["googleToken"], {
        access_token: storedToken,
        expires_in: expiresIn,
        expires_at: expiresAt,
      });
    }

    setIsInitialized(true);
  }, [queryClient]);

  const tokenClient = useMemo(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      // In development this might throw/log, but we don't want to crash render completely
      // user will fail when trying to connect.
      return null;
    }
    return new GoogleTokenClient(clientId);
  }, []);

  // QUERY: Silent Refresh Loop
  // This query maintains the token validity.
  // It handles automatic background refetching before expiry.
  const {
    data: tokenData,
    error: refreshError,
    isFetching,
  } = useQuery({
    queryKey: ["googleToken"],
    queryFn: async () => {
      if (!tokenClient) throw new Error("Client ID missing");
      const response = await tokenClient.requestToken({ prompt: "none" });
      const now = Date.now();
      const expiresAt = now + response.expires_in * 1000;

      // Update LocalStorage
      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, response.access_token);
      localStorage.setItem(STORAGE_KEYS.EXPIRES_AT, expiresAt.toString());

      return { ...response, expires_at: expiresAt };
    },
    enabled: isInitialized && !!localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const now = Date.now();
      const expiresAt = data.expires_at;
      // Refetch when we are close to expiry
      // If expiresAt is 10 mins away, wait 10 mins - buffer
      // Ensure we don't return negative
      const timeUntilExpiry = expiresAt - now;
      const refetchTime = timeUntilExpiry - REFRESH_BUFFER_MS;
      if (refetchTime <= 0) {
        if (timeUntilExpiry <= 0) {
          return MIN_REFETCH_INTERVAL_MS;
        }
        // Avoid a 0ms interval that would hammer the endpoint.
        return Math.min(timeUntilExpiry, MIN_REFETCH_INTERVAL_MS);
      }
      return refetchTime;
    },
    retry: (failureCount, error) => {
      // Don't retry if the user revoked access or is not logged in (prompt required)
      if (
        error instanceof Error &&
        error.message.includes("interaction_required")
      ) {
        return false;
      }
      return failureCount < 3;
    },
    staleTime: Infinity, // The token is valid until it expires
  });

  // MUTATION: Interactive Login
  const connectMutation = useMutation({
    mutationFn: async () => {
      if (!tokenClient) throw new Error("Missing Client ID");
      // Force prompt if needed, or let Google decide. Usually for "Connect" we want default behavior.
      // If we are strictly connecting, we might want 'select_account' or similar, but default is fine.
      const response = await tokenClient.requestToken({ prompt: "" });
      const now = Date.now();
      const expiresAt = now + response.expires_in * 1000;
      return { ...response, expires_at: expiresAt };
    },
    onSuccess: (data) => {
      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.access_token);
      localStorage.setItem(STORAGE_KEYS.EXPIRES_AT, data.expires_at.toString());
      queryClient.setQueryData(["googleToken"], data);
    },
    onError: (error) => {
      console.error("Connection failed", error);
      clearAuth();
    },
  });

  const clearAuth = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.SHEET_ID);
    localStorage.removeItem(STORAGE_KEYS.SHEET_TAB_ID);
    localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
    localStorage.removeItem(STORAGE_KEYS.EXPIRES_AT);

    setSheetId(null);
    setSheetTabId(null);
    queryClient.setQueryData(["googleToken"], null);
    queryClient.removeQueries({ queryKey: ["googleToken"] });
  }, [queryClient]);

  const connect = useCallback(async () => {
    await connectMutation.mutateAsync();
  }, [connectMutation]);

  const storeSheet = useCallback((id: string, tabId: number | null) => {
    localStorage.setItem(STORAGE_KEYS.SHEET_ID, id);
    setSheetId(id);
    if (tabId !== null) {
      localStorage.setItem(STORAGE_KEYS.SHEET_TAB_ID, tabId.toString());
      setSheetTabId(tabId);
    }
  }, []);

  const refreshSheet = useCallback(
    async (folderId?: string | null) => {
      const accessToken = tokenData?.access_token;
      if (!accessToken) {
        return;
      }
      try {
        const { sheetId: nextSheetId, sheetTabId: nextTabId } =
          await ensureSheetReady(accessToken, folderId);
        storeSheet(nextSheetId, nextTabId);
      } catch (error) {
        if (isUnauthorizedError(error)) {
          // If unauthorized, maybe our token is bad despite our best efforts.
          // We could try to force a refresh?
          // For now, let's just clear auth to be safe, or allow the query to retry?
          // If the query thinks the token is valid, but the API says 401,
          // we should invalidate the query.
          queryClient.invalidateQueries({ queryKey: ["googleToken"] });
        }
        throw error;
      }
    },
    [tokenData?.access_token, storeSheet, queryClient]
  );

  // Effect to handle logout if refresh fails terminally
  useEffect(() => {
    if (refreshError) {
      if (
        refreshError.message.includes("interaction_required") ||
        refreshError.message.includes("invalid_grant")
      ) {
        clearAuth();
      }
      // If it's a network error, React Query will retry, we don't logout.
    }
  }, [refreshError, clearAuth]);

  const value = useMemo<AuthStorageContextValue>(
    () => ({
      accessToken: tokenData?.access_token ?? null,
      sheetId,
      sheetTabId,
      isConnecting: connectMutation.isPending || (isFetching && !tokenData),
      // isFetching && !tokenData covers the initial "silent refresh" loading state
      // if we want to block UI until we know we are logged in.

      isInitialized:
        isInitialized &&
        (!localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN) ||
          !!tokenData ||
          !!refreshError),
      // We are "initialized" when we've checked local storage, AND:
      // 1. We have no token (logged out)
      // 2. OR we have a token (tokenData available)
      // 3. OR the refresh failed (refreshError) -> will likely trigger logout

      connect,
      refreshSheet,
      clearAuth,
    }),
    [
      tokenData,
      sheetId,
      sheetTabId,
      connectMutation.isPending,
      isFetching,
      isInitialized,
      refreshError,
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
