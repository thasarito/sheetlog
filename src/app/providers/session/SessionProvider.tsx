import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { STORAGE_KEYS } from "../../../lib/constants";
import {
  clearOAuthStorage,
  hasRefreshToken,
  initiateLogin,
  refreshAccessToken,
} from "../../../lib/oauth";
import {
  GOOGLE_TOKEN_QUERY_KEY,
  MIN_REFETCH_INTERVAL_MS,
  REFRESH_BUFFER_MS,
  USER_PROFILE_QUERY_KEY,
} from "./session.constants";
import type {
  SessionContextValue,
  SessionStatus,
  TokenData,
  UserProfile,
} from "./session.types";
import { SessionContext } from "./SessionContext";

const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
let nextProfileSessionId = 0;

type UserInfoResponse = {
  sub?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
};

class TokenBoundRefreshError extends Error {
  readonly expectedAccessToken: string | null;

  constructor(error: unknown, expectedAccessToken: string | null) {
    super(
      error instanceof Error ? error.message : "Failed to refresh access token",
    );
    this.name = "TokenBoundRefreshError";
    this.expectedAccessToken = expectedAccessToken;
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
  let response: Response;
  try {
    response = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    });
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
    throw new Error(
      "Could not verify this Google account. Check your connection, then try again.",
    );
  }
  if (!response.ok) {
    throw new Error(
      `Could not verify this Google account (Google returned ${response.status}). Sign in again.`,
    );
  }
  const data = (await response.json()) as UserInfoResponse;
  const subject = data.sub?.trim();
  if (!subject) {
    throw new Error(
      "Google did not return a stable Google account identity. Sign in again.",
    );
  }
  return {
    id: subject,
    name: resolveProfileName(data),
    picture: data.picture ?? null,
  };
}

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

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [isInitialized, setIsInitialized] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const profileSessionIdRef = useRef<number | null>(null);
  const profileTokenRef = useRef<string | null>(null);
  const profileTokenVersionRef = useRef(0);
  const activeTokenRef = useRef<string | null>(null);

  if (profileSessionIdRef.current === null) {
    nextProfileSessionId += 1;
    profileSessionIdRef.current = nextProfileSessionId;
  }

  useEffect(() => {
    setIsInitialized(true);
  }, []);

  const refreshTokenAvailable = typeof window !== "undefined" && hasRefreshToken();
  const storedToken = getStoredToken();

  const {
    data: tokenData,
    error: refreshError,
    isFetching,
  } = useQuery<TokenData | null>({
    queryKey: GOOGLE_TOKEN_QUERY_KEY,
    ...(storedToken ? { initialData: storedToken } : {}),
    queryFn: async () => {
      if (!refreshTokenAvailable) {
        return null;
      }
      const expectedAccessToken =
        queryClient.getQueryData<TokenData | null>(GOOGLE_TOKEN_QUERY_KEY)
          ?.access_token ??
        getStoredToken()?.access_token ??
        null;
      try {
        return await refreshAccessToken();
      } catch (error) {
        throw new TokenBoundRefreshError(error, expectedAccessToken);
      }
    },
    refetchInterval: (query) => getRefreshDelay(query.state.data),
    refetchIntervalInBackground: true,
    retry: (failureCount, error) => {
      if (isTerminalRefreshError(error)) {
        return false;
      }
      return failureCount < 3;
    },
    staleTime: Number.POSITIVE_INFINITY,
    enabled: refreshTokenAvailable,
  });

  useEffect(() => {
    if (tokenData) {
      persistToken(tokenData);
    }
  }, [tokenData]);

  const activeToken = tokenData?.access_token ?? null;
  activeTokenRef.current = activeToken;
  if (profileTokenRef.current !== activeToken) {
    profileTokenRef.current = activeToken;
    profileTokenVersionRef.current += 1;
  }
  const profileQueryKey = activeToken
    ? [
        ...USER_PROFILE_QUERY_KEY,
        profileSessionIdRef.current,
        profileTokenVersionRef.current,
      ] as const
    : ["inactiveUserProfile", profileSessionIdRef.current] as const;

  const {
    data: userProfile,
    error: profileError,
    isFetching: isProfileFetching,
  } = useQuery({
    queryKey: profileQueryKey,
    queryFn: ({ signal }) =>
      fetchUserProfile(activeToken ?? "", signal),
    enabled: Boolean(activeToken) && isInitialized,
    staleTime: 1000 * 60 * 10,
    retry: (failureCount) => failureCount < 2,
    retryDelay: (attemptIndex) => Math.min(100 * 2 ** attemptIndex, 500),
    refetchOnReconnect: "always",
  });

  useEffect(() => {
    if (!isInitialized) {
      return;
    }
    persistProfile(activeToken && userProfile ? userProfile : null);
  }, [userProfile, activeToken, isInitialized]);

  const signOut = useCallback(
    (expectedAccessToken?: string | null) => {
      const currentAccessToken =
        queryClient.getQueryData<TokenData | null>(GOOGLE_TOKEN_QUERY_KEY)
          ?.access_token ?? activeTokenRef.current;
      if (
        expectedAccessToken !== undefined &&
        currentAccessToken !== expectedAccessToken
      ) {
        return;
      }

      localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
      localStorage.removeItem(STORAGE_KEYS.EXPIRES_AT);
      clearOAuthStorage();

      activeTokenRef.current = null;
      queryClient.setQueryData(GOOGLE_TOKEN_QUERY_KEY, null);
      queryClient.removeQueries({ queryKey: GOOGLE_TOKEN_QUERY_KEY });
      queryClient.removeQueries({ queryKey: USER_PROFILE_QUERY_KEY });
    },
    [queryClient],
  );

  const connect = useCallback(async () => {
    setIsConnecting(true);
    try {
      await initiateLogin();
    } catch (error) {
      console.error("Failed to initiate login:", error);
      throw error instanceof Error ? error : new Error("Failed to initiate login");
    } finally {
      setIsConnecting(false);
    }
  }, []);

  useEffect(() => {
    if (refreshError && isTerminalRefreshError(refreshError)) {
      signOut(
        refreshError instanceof TokenBoundRefreshError
          ? refreshError.expectedAccessToken
          : activeToken,
      );
    }
  }, [activeToken, refreshError, signOut]);

  const status: SessionStatus = useMemo(() => {
    if (!isInitialized) return "initializing";
    if (refreshError) return "error";
    if (activeToken && profileError) return "error";
    if (isConnecting || (isFetching && !tokenData)) return "authenticating";
    if (!tokenData?.access_token) return "unauthenticated";
    if (isProfileFetching || !userProfile?.id) return "authenticating";
    return "authenticated";
  }, [
    isInitialized,
    refreshError,
    activeToken,
    profileError,
    isConnecting,
    isFetching,
    tokenData,
    isProfileFetching,
    userProfile,
  ]);

  const error = useMemo(() => {
    if (refreshError instanceof Error) return refreshError;
    if (profileError instanceof Error) return profileError;
    return null;
  }, [profileError, refreshError]);

  const value = useMemo<SessionContextValue>(() => {
    const isExpired = tokenData?.expires_at
      ? tokenData.expires_at <= Date.now()
      : true;

    return {
      accessToken: !isExpired ? tokenData?.access_token ?? null : null,
      userProfile: activeToken ? userProfile ?? null : null,
      isConnecting:
        isConnecting ||
        (isFetching && !tokenData) ||
        Boolean(activeToken && isProfileFetching),
      isInitialized,
      status,
      error,
      connect,
      signOut,
    };
  }, [
    tokenData,
    activeToken,
    userProfile,
    isConnecting,
    isFetching,
    isProfileFetching,
    isInitialized,
    status,
    error,
    connect,
    signOut,
  ]);

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
