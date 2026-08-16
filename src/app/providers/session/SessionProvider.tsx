import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { STORAGE_KEYS } from "../../../lib/constants";
import {
  clearOAuthStorage,
  hasRefreshToken,
  initiateLogin,
  refreshAccessToken,
} from "../../../lib/oauth";
import { clearTransactionHistoryCache } from "../../../lib/transactionHistory";
import {
  GOOGLE_TOKEN_QUERY_KEY,
  MIN_REFETCH_INTERVAL_MS,
  REFRESH_BUFFER_MS,
  USER_PROFILE_QUERY_KEY,
} from "./session.constants";
import {
  advanceSessionTokenGeneration,
  getSessionTokenGeneration,
} from "./session.generation";
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
  readonly generation: number;

  constructor(
    error: unknown,
    expectedAccessToken: string | null,
    generation: number,
  ) {
    super(
      error instanceof Error ? error.message : "Failed to refresh access token",
    );
    this.name = "TokenBoundRefreshError";
    this.expectedAccessToken = expectedAccessToken;
    this.generation = generation;
  }
}

class SupersededRefreshError extends Error {
  readonly expectedAccessToken: string | null;
  readonly generation: number;

  constructor(expectedAccessToken: string | null, generation: number) {
    super("Superseded Google token refresh ignored");
    this.name = "SupersededRefreshError";
    this.expectedAccessToken = expectedAccessToken;
    this.generation = generation;
  }
}

type RefreshRequestIdentity = {
  expectedAccessToken: string | null;
  generation: number;
};

function getStoredProfile(accessToken: string | null): UserProfile | undefined {
  if (typeof window === "undefined" || !accessToken) {
    return undefined;
  }
  if (
    localStorage.getItem(STORAGE_KEYS.USER_PROFILE_TOKEN) !== accessToken
  ) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.USER_PROFILE) ?? "null",
    ) as Partial<UserProfile> | null;
    if (
      !parsed ||
      typeof parsed.id !== "string" ||
      !parsed.id.trim() ||
      typeof parsed.name !== "string" ||
      (parsed.picture !== null && typeof parsed.picture !== "string")
    ) {
      return undefined;
    }
    return {
      id: parsed.id,
      name: parsed.name,
      picture: parsed.picture,
    };
  } catch {
    return undefined;
  }
}

function persistProfile(
  profile: UserProfile | null,
  accessToken: string | null,
) {
  if (typeof window === "undefined") {
    return;
  }
  if (!profile || !accessToken) {
    const persistedProfileToken = localStorage.getItem(
      STORAGE_KEYS.USER_PROFILE_TOKEN,
    );
    if (
      accessToken &&
      persistedProfileToken &&
      persistedProfileToken !== accessToken
    ) {
      return;
    }
    localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
    localStorage.removeItem(STORAGE_KEYS.USER_PROFILE_TOKEN);
    return;
  }
  localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));
  localStorage.setItem(STORAGE_KEYS.USER_PROFILE_TOKEN, accessToken);
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

function getQueryToken(queryClient: QueryClient) {
  return queryClient.getQueryData<TokenData | null>(GOOGLE_TOKEN_QUERY_KEY);
}

function refreshRequestIsCurrent(
  queryClient: QueryClient,
  request: RefreshRequestIdentity,
): boolean {
  if (request.generation !== getSessionTokenGeneration()) {
    return false;
  }
  const queryAccessToken = getQueryToken(queryClient)?.access_token ?? null;
  const storedAccessToken = getStoredToken()?.access_token ?? null;
  if (
    queryAccessToken !== null &&
    queryAccessToken !== request.expectedAccessToken
  ) {
    return false;
  }
  if (
    storedAccessToken !== null &&
    storedAccessToken !== request.expectedAccessToken
  ) {
    return false;
  }
  return !(
    request.expectedAccessToken !== null &&
    queryAccessToken === null &&
    storedAccessToken === null
  );
}

function getReplacementToken(
  queryClient: QueryClient,
  expectedAccessToken: string | null,
): TokenData | null {
  const storedToken = getStoredToken();
  if (storedToken && storedToken.access_token !== expectedAccessToken) {
    return storedToken;
  }
  const queryToken = getQueryToken(queryClient);
  if (queryToken && queryToken.access_token !== expectedAccessToken) {
    return queryToken;
  }
  return null;
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
    queryFn: async ({ signal }) => {
      if (!refreshTokenAvailable) {
        return null;
      }
      const request: RefreshRequestIdentity = {
        expectedAccessToken:
          getQueryToken(queryClient)?.access_token ??
          getStoredToken()?.access_token ??
          null,
        generation: getSessionTokenGeneration(),
      };
      try {
        const refreshedToken = await refreshAccessToken(signal);
        if (refreshRequestIsCurrent(queryClient, request)) {
          return refreshedToken;
        }
        const replacementToken = getReplacementToken(
          queryClient,
          request.expectedAccessToken,
        );
        if (replacementToken) {
          return replacementToken;
        }
        throw new SupersededRefreshError(
          request.expectedAccessToken,
          request.generation,
        );
      } catch (error) {
        if (error instanceof SupersededRefreshError) {
          throw error;
        }
        if (!refreshRequestIsCurrent(queryClient, request)) {
          const replacementToken = getReplacementToken(
            queryClient,
            request.expectedAccessToken,
          );
          if (replacementToken) {
            return replacementToken;
          }
          throw new SupersededRefreshError(
            request.expectedAccessToken,
            request.generation,
          );
        }
        throw new TokenBoundRefreshError(
          error,
          request.expectedAccessToken,
          request.generation,
        );
      }
    },
    refetchInterval: (query) => getRefreshDelay(query.state.data),
    refetchIntervalInBackground: true,
    retry: (failureCount, error) => {
      if (error instanceof SupersededRefreshError) {
        return false;
      }
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
  const effectiveRefreshError = useMemo(() => {
    if (!refreshError || refreshError instanceof SupersededRefreshError) {
      return null;
    }
    if (refreshError instanceof TokenBoundRefreshError) {
      if (activeToken !== refreshError.expectedAccessToken) {
        return null;
      }
      return refreshRequestIsCurrent(queryClient, {
        expectedAccessToken: refreshError.expectedAccessToken,
        generation: refreshError.generation,
      })
        ? refreshError
        : null;
    }
    return refreshError;
  }, [activeToken, queryClient, refreshError]);
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
  const storedProfile = getStoredProfile(activeToken);

  const {
    data: userProfile,
    error: profileError,
    isFetching: isProfileFetching,
  } = useQuery<UserProfile | null>({
    queryKey: profileQueryKey,
    ...(storedProfile
      ? { initialData: storedProfile, initialDataUpdatedAt: 0 }
      : {}),
    queryFn: ({ signal }) =>
      fetchUserProfile(activeToken ?? "", signal),
    enabled: Boolean(activeToken) && isInitialized,
    networkMode: "online",
    staleTime: 1000 * 60 * 10,
    retry: (failureCount) => failureCount < 2,
    retryDelay: (attemptIndex) => Math.min(100 * 2 ** attemptIndex, 500),
    refetchOnReconnect: "always",
  });

  useEffect(() => {
    if (!isInitialized) {
      return;
    }
    persistProfile(
      activeToken && userProfile ? userProfile : null,
      activeToken,
    );
  }, [userProfile, activeToken, isInitialized]);

  const signOut = useCallback(
    (expectedAccessToken?: string | null) => {
      const currentAccessToken =
        getQueryToken(queryClient)?.access_token ?? activeTokenRef.current;
      const persistedAccessToken =
        typeof window === "undefined"
          ? null
          : localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
      if (
        expectedAccessToken !== undefined &&
        (currentAccessToken !== expectedAccessToken ||
          (persistedAccessToken !== null &&
            persistedAccessToken !== expectedAccessToken))
      ) {
        return;
      }

      advanceSessionTokenGeneration();
      localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
      localStorage.removeItem(STORAGE_KEYS.USER_PROFILE_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.EXPIRES_AT);
      clearOAuthStorage();

      activeTokenRef.current = null;
      queryClient.setQueryData(GOOGLE_TOKEN_QUERY_KEY, null);
      queryClient.removeQueries({ queryKey: GOOGLE_TOKEN_QUERY_KEY });
      queryClient.removeQueries({ queryKey: USER_PROFILE_QUERY_KEY });
      queryClient.removeQueries({ queryKey: ["transactionHistory"] });
      void clearTransactionHistoryCache().catch((error) => {
        console.warn("Failed to clear cached transaction history:", error);
      });
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
    if (effectiveRefreshError && isTerminalRefreshError(effectiveRefreshError)) {
      signOut(
        effectiveRefreshError instanceof TokenBoundRefreshError
          ? effectiveRefreshError.expectedAccessToken
          : activeToken,
      );
    }
  }, [activeToken, effectiveRefreshError, signOut]);

  const status: SessionStatus = useMemo(() => {
    if (!isInitialized) return "initializing";
    if (effectiveRefreshError) return "error";
    if (activeToken && profileError) return "error";
    if (isConnecting || (isFetching && !tokenData)) return "authenticating";
    if (!tokenData?.access_token) return "unauthenticated";
    if (isProfileFetching || !userProfile?.id) return "authenticating";
    return "authenticated";
  }, [
    isInitialized,
    effectiveRefreshError,
    activeToken,
    profileError,
    isConnecting,
    isFetching,
    tokenData,
    isProfileFetching,
    userProfile,
  ]);

  const sessionError = useMemo(() => {
    if (effectiveRefreshError instanceof Error) return effectiveRefreshError;
    if (profileError instanceof Error) return profileError;
    return null;
  }, [effectiveRefreshError, profileError]);

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
      error: sessionError,
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
    sessionError,
    connect,
    signOut,
  ]);

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
