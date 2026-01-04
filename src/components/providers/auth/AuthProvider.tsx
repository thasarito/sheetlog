import type React from "react";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGoogleLogin } from "@react-oauth/google";

import { STORAGE_KEYS } from "../../../lib/constants";
import { isUnauthorizedError } from "../../../lib/google";
import { ensureSheetReady } from "../../../lib/sheets";
import {
  GOOGLE_TOKEN_QUERY_KEY,
  REFRESH_BUFFER_MS,
  SCOPES,
} from "./auth.constants";
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

// Helper to read token synchronously for initial state
function getStoredToken(): TokenData | null {
  if (typeof window === "undefined") return null;
  const storedToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  const storedExpiresAt = localStorage.getItem(STORAGE_KEYS.EXPIRES_AT);

  if (!storedToken || !storedExpiresAt) return null;

  const expiresAt = Number.parseInt(storedExpiresAt, 10);
  const now = Date.now();
  if (expiresAt <= now) return null;

  const expiresIn = Math.max(0, Math.floor((expiresAt - now) / 1000));
  return {
    access_token: storedToken,
    expires_in: expiresIn,
    expires_at: expiresAt,
  };
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

  // Derived state to track initialization (now synonymous with "mounted" basically,
  // or we can remove it if we don't need to block rendering)
  const [isInitialized, setIsInitialized] = useState(true);
  // keeping isInitialized as true effectively, or we could remove it.
  // The original code waited for hydration. Now hydration is synchronous (mostly).
  // But we might want to ensure we're on client.
  useEffect(() => {
    setIsInitialized(true);
  }, []);

  // Google Login Hook
  const resolveRef = useRef<((value: TokenData) => void) | null>(null);
  const rejectRef = useRef<((reason: any) => void) | null>(null);

  const login = useGoogleLogin({
    scope: SCOPES.join(" "),
    onSuccess: (tokenResponse) => {
      if (resolveRef.current) {
        const now = Date.now();
        const expiresAt = now + tokenResponse.expires_in * 1000;
        resolveRef.current({
          access_token: tokenResponse.access_token,
          expires_in: tokenResponse.expires_in,
          expires_at: expiresAt,
        });
        resolveRef.current = null;
        rejectRef.current = null;
      }
    },
    onError: (errorResponse) => {
      if (rejectRef.current) {
        rejectRef.current(
          new Error(errorResponse.error_description || "Google login failed")
        );
        resolveRef.current = null;
        rejectRef.current = null;
      }
    },
    flow: "implicit",
  });

  const requestToken = useCallback(
    (prompt?: string): Promise<TokenData> => {
      return new Promise((resolve, reject) => {
        resolveRef.current = resolve;
        rejectRef.current = reject;
        // Force prompt if specified, otherwise rely on default behavior
        // Note: useGoogleLogin doesn't directly support 'prompt' in the same way as GIS client sometimes,
        // but overrideConfig usually accepts it.
        // However, @react-oauth/google types might be strict.
        // Attempting to pass prompt in overrideConfig (second arg to login function, not yet fully typed in some versions? or it is?)
        // We will cast to any if needed or check types.
        // Based on docs, login(overrideConfig) exists.
        login({ prompt } as any);
      });
    },
    [login]
  );

  // QUERY: Silent Refresh Loop
  const {
    data: tokenData,
    error: refreshError,
    isFetching,
  } = useQuery<TokenData | null>({
    queryKey: GOOGLE_TOKEN_QUERY_KEY,
    initialData: getStoredToken(),
    queryFn: async ({ queryKey }) => {
      // If we have an initial token that is valid, returning it here or relying on initialData
      // might be tricky if we want to *refresh*.
      // Actually, queryFn is called when cache is stale or missing.
      // If we provide initialData, it populates the cache.
      // We want to run the refresh logic if the token is expired or close to expiry?
      // No, the queryFn IS the refresh logic (asking for a new token).
      // But we only want to run it if we think we SHOULD have a session.

      // If we don't have a token in local storage, we shouldn't attempt silent refresh
      // unless we know we are 'logged in' via some other means.
      // BUT, checking localStorage inside queryFn is fine.

      const stored = getStoredToken();

      // If we have a valid stored token, just return it (although initialData should handle this).
      // If we are here, it means we need a FRESH token (staleTime elapsed) or we have no token.

      if (stored) {
        // Check if it's actually expired or we just want to verify?
        // If we are here, we probably want to try refreshing if it's close to expiry.
        // But `requestToken('none')` is the way to refresh.
      }

      // Only attempt refresh if we have a trace of a previous session (token exists but maybe expired?)
      // or if we just rely on the error.
      // But we can't just spam check.
      // We can check if localStorage has ANY token string, even if expired.
      const rawToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
      if (!rawToken) {
        return null; // No session, don't try to refresh
      }

      try {
        const response = await requestToken("none");
        localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, response.access_token);
        localStorage.setItem(
          STORAGE_KEYS.EXPIRES_AT,
          response.expires_at.toString()
        );
        return response;
      } catch (e) {
        // If silent refresh fails, we should clear.
        throw e;
      }
    },
    // We want to verify/refresh if the token is close to expiry.
    // initialData provides the "current" valid token.
    // refetchInterval will check if it needs refreshing.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const now = Date.now();
      const expiresAt = data.expires_at;
      const timeUntilExpiry = expiresAt - now;
      const refetchTime = timeUntilExpiry - REFRESH_BUFFER_MS;

      // If we are within buffer, we want to refetch (which calls queryFn -> silent refresh)
      if (refetchTime <= 0) {
        return 1000; // Try immediately (or soon)
      }
      return refetchTime;
    },
    retry: (failureCount, error) => {
      if (
        error instanceof Error &&
        (error.message.includes("interaction_required") ||
          error.message.includes("popup_closed_by_user"))
      ) {
        return false;
      }
      return failureCount < 3;
    },
    staleTime: Infinity, // The token remains "fresh" until we decide to refresh it based on time
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
      // Interactive login
      const response = await requestToken(); // default prompt
      return response;
    },
    onSuccess: (data) => {
      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.access_token);
      localStorage.setItem(STORAGE_KEYS.EXPIRES_AT, data.expires_at.toString());
      queryClient.setQueryData(GOOGLE_TOKEN_QUERY_KEY, data);
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
    queryClient.removeQueries({ queryKey: GOOGLE_TOKEN_QUERY_KEY });
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
        refreshError.message.includes("invalid_grant") ||
        refreshError.message.includes("popup_closed_by_user")
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
    const isExpired = tokenData?.expires_at
      ? tokenData.expires_at <= Date.now()
      : true;

    return {
      accessToken: !isExpired ? tokenData?.access_token ?? null : null,
      sheetId,
      sheetTabId,
      userProfile: userProfile ?? null,
      isConnecting: connectMutation.isPending || (isFetching && !tokenData),
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
    connectMutation.isPending,
    isFetching,
    isInitialized,
    refreshError,
    authStatus,
    authError,
    connect,
    refreshSheet,
    clearAuth,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
