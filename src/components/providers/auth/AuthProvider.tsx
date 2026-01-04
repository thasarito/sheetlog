import type React from "react";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { STORAGE_KEYS } from "../../../lib/constants";
import { GoogleTokenClient, isUnauthorizedError } from "../../../lib/google";
import { ensureSheetReady } from "../../../lib/sheets";
import { GOOGLE_TOKEN_QUERY_KEY, REFRESH_BUFFER_MS } from "./auth.constants";
import type {
  AuthStatus,
  AuthContextValue,
  TokenData,
  UserProfile,
} from "./auth.types";

const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
const USER_PROFILE_QUERY_KEY = ["userProfile"];

type UserInfoResponse = {
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
};

function readStoredProfile(): UserProfile | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = localStorage.getItem(STORAGE_KEYS.USER_PROFILE);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

function persistProfile(profile: UserProfile | null) {
  if (typeof window === "undefined") {
    return;
  }
  if (!profile) {
    localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
    return;
  }
  localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));
}

function resolveProfileName(info: UserInfoResponse) {
  const direct = info.name?.trim();
  if (direct) {
    return direct;
  }
  const combined = [info.given_name, info.family_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return combined || "Google account";
}

async function fetchUserProfile(
  accessToken: string,
  signal: AbortSignal
): Promise<UserProfile | null> {
  const response = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to load user profile: ${response.status}`);
  }
  const data = (await response.json()) as UserInfoResponse;
  if (!data.name && !data.given_name && !data.family_name && !data.picture) {
    return null;
  }
  return {
    name: resolveProfileName(data),
    picture: data.picture ?? null,
  };
}

// Export context for use by hooks
export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetTabId, setSheetTabId] = useState<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasStoredToken, setHasStoredToken] = useState(false);

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
      const now = Date.now();

      if (expiresAt > now) {
        const expiresIn = Math.max(0, Math.floor((expiresAt - now) / 1000));

        queryClient.setQueryData(GOOGLE_TOKEN_QUERY_KEY, {
          access_token: storedToken,
          expires_in: expiresIn,
          expires_at: expiresAt,
        });
        setHasStoredToken(true);
      } else {
        // Token is expired.
        // We do NOT hydrate the cache, so the app sees no token initially.
        // But we DO set hasStoredToken=true to trigger the silent refresh query.
        setHasStoredToken(true);
      }
    } else if (storedToken && !storedExpiresAt) {
      // Invalid state: token exists but no expiry. Clear it to prevent
      // auto-refresh loop (which causes popup blocks).
      localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      setHasStoredToken(false);
    } else {
      setHasStoredToken(false);
    }

    // Hydrate user profile cache
    const cachedProfile = readStoredProfile();
    if (cachedProfile) {
      queryClient.setQueryData(USER_PROFILE_QUERY_KEY, cachedProfile);
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
    enabled: isInitialized && hasStoredToken,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const now = Date.now();
      const expiresAt = data.expires_at;
      const timeUntilExpiry = expiresAt - now;
      const refetchTime = timeUntilExpiry - REFRESH_BUFFER_MS;
      if (refetchTime <= 0) {
        // If the token is expired or about to expire, we cannot safely auto-refresh
        // because prompt="none" may still trigger a popup (which gets blocked).
        // relying on the 401 error handler or manual user action is safer.
        return false;
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

  // QUERY: User Profile
  const { data: userProfile } = useQuery({
    queryKey: USER_PROFILE_QUERY_KEY,
    queryFn: ({ signal }) =>
      fetchUserProfile(tokenData?.access_token ?? "", signal),
    enabled: Boolean(tokenData?.access_token) && isInitialized,
    placeholderData: readStoredProfile(),
    staleTime: 1000 * 60 * 10, // 10 minutes
    retry: false,
  });

  // Persist user profile when it changes
  useEffect(() => {
    if (!isInitialized) {
      return;
    }
    if (!tokenData?.access_token) {
      persistProfile(null);
      return;
    }
    if (userProfile) {
      persistProfile(userProfile);
    }
  }, [userProfile, tokenData?.access_token, isInitialized]);

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
      setHasStoredToken(true);
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
    setHasStoredToken(false);
    queryClient.setQueryData(USER_PROFILE_QUERY_KEY, null);
    queryClient.removeQueries({ queryKey: USER_PROFILE_QUERY_KEY });
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

  const value = useMemo<AuthContextValue>(() => {
    // additional check to ensure we don't return an expired token
    // this handles the case where the token expires while the app is running
    // and for some reason the refresh didn't happen or failed.
    const isExpired = tokenData?.expires_at
      ? tokenData.expires_at <= Date.now()
      : true;

    return {
      accessToken: !isExpired ? tokenData?.access_token ?? null : null,
      sheetId,
      sheetTabId,
      userProfile: userProfile ?? null,
      isConnecting: connectMutation.isPending || (isFetching && !tokenData),
      isInitialized:
        isInitialized && (!hasStoredToken || !!tokenData || !!refreshError),
      authStatus,
      authError,
      connect,
      refreshSheet,
      clearAuth,
    };
  }, [
    tokenData,
    sheetId,
    sheetTabId,
    userProfile,
    connectMutation.isPending,
    isFetching,
    isInitialized,
    refreshError,
    authStatus,
    authError,
    connect,
    refreshSheet,
    clearAuth,
    hasStoredToken,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
