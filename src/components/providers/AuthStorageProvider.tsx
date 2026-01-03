"use client";

/**
 * Core authentication storage provider.
 * Manages Google OAuth tokens and sheet connection state.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { STORAGE_KEYS } from "../../lib/constants";
import { GoogleTokenClient, isUnauthorizedError } from "../../lib/google";
import { ensureSheetReady } from "../../lib/sheets";
import {
  GOOGLE_TOKEN_QUERY_KEY,
  MIN_REFETCH_INTERVAL_MS,
  REFRESH_BUFFER_MS,
} from "./auth.constants";
import type {
  AuthStatus,
  AuthStorageContextValue,
  TokenData,
} from "./auth.types";

// Export context for use by hooks
export const AuthStorageContext = createContext<AuthStorageContextValue | null>(
  null
);

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

      queryClient.setQueryData(GOOGLE_TOKEN_QUERY_KEY, {
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
      return null;
    }
    return new GoogleTokenClient(clientId);
  }, []);

  // QUERY: Silent Refresh Loop
  const {
    data: tokenData,
    error: refreshError,
    isFetching,
  } = useQuery<TokenData>({
    queryKey: GOOGLE_TOKEN_QUERY_KEY,
    queryFn: async () => {
      if (!tokenClient) throw new Error("Client ID missing");
      const response = await tokenClient.requestToken({ prompt: "none" });
      const now = Date.now();
      const expiresAt = now + response.expires_in * 1000;

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
      const timeUntilExpiry = expiresAt - now;
      const refetchTime = timeUntilExpiry - REFRESH_BUFFER_MS;
      if (refetchTime <= 0) {
        if (timeUntilExpiry <= 0) {
          return MIN_REFETCH_INTERVAL_MS;
        }
        return Math.min(timeUntilExpiry, MIN_REFETCH_INTERVAL_MS);
      }
      return refetchTime;
    },
    retry: (failureCount, error) => {
      if (
        error instanceof Error &&
        error.message.includes("interaction_required")
      ) {
        return false;
      }
      return failureCount < 3;
    },
    staleTime: Infinity,
  });

  // MUTATION: Interactive Login
  const connectMutation = useMutation({
    mutationFn: async () => {
      if (!tokenClient) throw new Error("Missing Client ID");
      const response = await tokenClient.requestToken({ prompt: "" });
      const now = Date.now();
      const expiresAt = now + response.expires_in * 1000;
      return { ...response, expires_at: expiresAt };
    },
    onSuccess: (data) => {
      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.access_token);
      localStorage.setItem(STORAGE_KEYS.EXPIRES_AT, data.expires_at.toString());
      queryClient.setQueryData(GOOGLE_TOKEN_QUERY_KEY, data);
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
    queryClient.setQueryData(GOOGLE_TOKEN_QUERY_KEY, null);
    queryClient.removeQueries({ queryKey: GOOGLE_TOKEN_QUERY_KEY });
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
          queryClient.invalidateQueries({ queryKey: GOOGLE_TOKEN_QUERY_KEY });
        }
        throw error;
      }
    },
    [tokenData?.access_token, storeSheet, queryClient]
  );

  // Handle terminal refresh failures
  useEffect(() => {
    if (refreshError) {
      if (
        refreshError.message.includes("interaction_required") ||
        refreshError.message.includes("invalid_grant")
      ) {
        clearAuth();
      }
    }
  }, [refreshError, clearAuth]);

  // Compute authStatus
  const authStatus: AuthStatus = useMemo(() => {
    if (!isInitialized) return "initializing";
    if (refreshError || connectMutation.error) return "error";
    if (connectMutation.isPending || (isFetching && !tokenData))
      return "authenticating";
    if (!tokenData?.access_token) return "unauthenticated";
    return "authenticated";
  }, [
    isInitialized,
    refreshError,
    connectMutation.error,
    connectMutation.isPending,
    isFetching,
    tokenData,
  ]);

  const authError: Error | null = useMemo(() => {
    if (refreshError) return refreshError;
    if (connectMutation.error) return connectMutation.error;
    return null;
  }, [refreshError, connectMutation.error]);

  const value = useMemo<AuthStorageContextValue>(
    () => ({
      accessToken: tokenData?.access_token ?? null,
      sheetId,
      sheetTabId,
      isConnecting: connectMutation.isPending || (isFetching && !tokenData),
      isInitialized:
        isInitialized &&
        (!localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN) ||
          !!tokenData ||
          !!refreshError),
      authStatus,
      authError,
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
      authStatus,
      authError,
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
