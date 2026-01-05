import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { STORAGE_KEYS } from "../../../lib/constants";
import { isUnauthorizedError } from "../../../lib/google";
import {
  clearOAuthStorage,
  hasRefreshToken,
  initiateLogin,
  refreshAccessToken,
} from "../../../lib/oauth";
import { ensureSheetReady } from "../../../lib/sheets";
import {
  GOOGLE_TOKEN_QUERY_KEY,
  MIN_REFETCH_INTERVAL_MS,
  REFRESH_BUFFER_MS,
} from "./auth.constants";
import type {
  AuthStatus,
  AuthContextValue,
  TokenData,
  UserProfile,
} from "./auth.types";
import { AuthContext } from "./AuthContext";

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

// Helper to read token synchronously for initial state
function getStoredToken(): TokenData | undefined {
  if (typeof window === "undefined") return undefined;
  const storedToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  const storedExpiresAt = localStorage.getItem(STORAGE_KEYS.EXPIRES_AT);

  if (!storedToken || !storedExpiresAt) return undefined;

  const expiresAt = Number.parseInt(storedExpiresAt, 10);
  const now = Date.now();
  if (expiresAt <= now) return undefined;

  const expiresIn = Math.max(0, Math.floor((expiresAt - now) / 1000));
  return {
    access_token: storedToken,
    expires_in: expiresIn,
    expires_at: expiresAt,
  };
}

function persistToken(token: TokenData) {
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token.access_token);
  localStorage.setItem(STORAGE_KEYS.EXPIRES_AT, token.expires_at.toString());
}

function isTerminalRefreshError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /revoked|expired|re-authenticate|no refresh token/i.test(
    error.message
  );
}

function getRefreshDelay(token?: TokenData | null): number | false {
  if (!token) return false;
  const timeUntilExpiry = token.expires_at - Date.now();
  const refreshIn = timeUntilExpiry - REFRESH_BUFFER_MS;
  if (refreshIn <= 0) {
    return MIN_REFETCH_INTERVAL_MS;
  }
  return refreshIn;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  // Lazy init from local storage
  const [sheetId, setSheetId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEYS.SHEET_ID);
  });

  const [sheetTabId, setSheetTabId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const val = localStorage.getItem(STORAGE_KEYS.SHEET_TAB_ID);
    return val ? Number.parseInt(val, 10) : null;
  });

  const [isInitialized, setIsInitialized] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    setIsInitialized(true);
  }, []);

  // QUERY: Silent Refresh Loop using refresh tokens
  const {
    data: tokenData,
    error: refreshError,
    isFetching,
  } = useQuery<TokenData | null>({
    queryKey: GOOGLE_TOKEN_QUERY_KEY,
    initialData: getStoredToken(),
    queryFn: async () => {
      if (!hasRefreshToken()) {
        return null;
      }
      return refreshAccessToken();
    },
    // Dynamically calculate when to refresh based on token expiry
    refetchInterval: (query) => getRefreshDelay(query.state.data),
    refetchIntervalInBackground: true,
    retry: (failureCount, error) => {
      // Don't retry if the refresh token is revoked
      if (isTerminalRefreshError(error)) {
        return false;
      }
      return failureCount < 3;
    },
    staleTime: Number.POSITIVE_INFINITY, // Token remains fresh until we decide to refresh
    enabled: hasRefreshToken(),
  });

  useEffect(() => {
    if (tokenData) {
      persistToken(tokenData);
    }
  }, [tokenData]);

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

  const clearAuth = useCallback(() => {
    // Clear all auth-related storage
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.SHEET_ID);
    localStorage.removeItem(STORAGE_KEYS.SHEET_TAB_ID);
    localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
    localStorage.removeItem(STORAGE_KEYS.EXPIRES_AT);
    clearOAuthStorage();

    setSheetId(null);
    setSheetTabId(null);
    queryClient.setQueryData(GOOGLE_TOKEN_QUERY_KEY, null);
    queryClient.removeQueries({ queryKey: GOOGLE_TOKEN_QUERY_KEY });
    queryClient.setQueryData(USER_PROFILE_QUERY_KEY, null);
    queryClient.removeQueries({ queryKey: USER_PROFILE_QUERY_KEY });
  }, [queryClient]);

  // Interactive login - redirects to Google OAuth
  const connect = useCallback(async () => {
    setIsConnecting(true);
    try {
      // This will redirect the user to Google's consent page
      await initiateLogin();
      // Note: This code won't execute because the page redirects
    } catch (error) {
      console.error("Failed to initiate login:", error);
      setIsConnecting(false);
    }
  }, []);

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
    if (refreshError && isTerminalRefreshError(refreshError)) {
      clearAuth();
    }
  }, [refreshError, clearAuth]);

  // Compute authStatus
  const authStatus: AuthStatus = useMemo(() => {
    if (!isInitialized) return "initializing";
    if (refreshError) return "error";
    if (isConnecting || (isFetching && !tokenData)) return "authenticating";
    if (!tokenData?.access_token) return "unauthenticated";
    return "authenticated";
  }, [isInitialized, refreshError, isConnecting, isFetching, tokenData]);

  const authError: Error | null = useMemo(() => {
    if (refreshError) return refreshError;
    return null;
  }, [refreshError]);

  const value = useMemo<AuthContextValue>(() => {
    const isExpired = tokenData?.expires_at
      ? tokenData.expires_at <= Date.now()
      : true;

    return {
      accessToken: !isExpired ? tokenData?.access_token ?? null : null,
      sheetId,
      sheetTabId,
      userProfile: userProfile ?? null,
      isConnecting: isConnecting || (isFetching && !tokenData),
      isInitialized,
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
    isConnecting,
    isFetching,
    isInitialized,
    authStatus,
    authError,
    connect,
    refreshSheet,
    clearAuth,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
