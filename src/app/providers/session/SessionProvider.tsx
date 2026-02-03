import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
} from "./session.constants";
import type {
  SessionContextValue,
  SessionStatus,
  TokenData,
  UserProfile,
} from "./session.types";
import { SessionContext } from "./SessionContext";

const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
const USER_PROFILE_QUERY_KEY = ["userProfile"] as const;

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
      return refreshAccessToken();
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

  const { data: userProfile } = useQuery({
    queryKey: USER_PROFILE_QUERY_KEY,
    queryFn: ({ signal }) =>
      fetchUserProfile(tokenData?.access_token ?? "", signal),
    enabled: Boolean(tokenData?.access_token) && isInitialized,
    placeholderData: readStoredProfile(),
    staleTime: 1000 * 60 * 10,
    retry: false,
  });

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

  const signOut = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
    localStorage.removeItem(STORAGE_KEYS.EXPIRES_AT);
    clearOAuthStorage();

    queryClient.setQueryData(GOOGLE_TOKEN_QUERY_KEY, null);
    queryClient.removeQueries({ queryKey: GOOGLE_TOKEN_QUERY_KEY });
    queryClient.setQueryData(USER_PROFILE_QUERY_KEY, null);
    queryClient.removeQueries({ queryKey: USER_PROFILE_QUERY_KEY });
  }, [queryClient]);

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
      signOut();
    }
  }, [refreshError, signOut]);

  const status: SessionStatus = useMemo(() => {
    if (!isInitialized) return "initializing";
    if (refreshError) return "error";
    if (isConnecting || (isFetching && !tokenData)) return "authenticating";
    if (!tokenData?.access_token) return "unauthenticated";
    return "authenticated";
  }, [isInitialized, refreshError, isConnecting, isFetching, tokenData]);

  const error = useMemo(() => {
    if (refreshError instanceof Error) return refreshError;
    return null;
  }, [refreshError]);

  const value = useMemo<SessionContextValue>(() => {
    const isExpired = tokenData?.expires_at
      ? tokenData.expires_at <= Date.now()
      : true;

    return {
      accessToken: !isExpired ? tokenData?.access_token ?? null : null,
      userProfile: userProfile ?? null,
      isConnecting: isConnecting || (isFetching && !tokenData),
      isInitialized,
      status,
      error,
      connect,
      signOut,
    };
  }, [
    tokenData,
    userProfile,
    isConnecting,
    isFetching,
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
