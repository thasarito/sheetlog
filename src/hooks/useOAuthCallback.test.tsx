import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider } from "../app/providers/session/SessionProvider";
import {
  GOOGLE_TOKEN_QUERY_KEY,
  USER_PROFILE_QUERY_KEY,
} from "../app/providers/session/session.constants";
import { useSession } from "../app/providers/session/session.hooks";
import type { TokenData } from "../app/providers/session/session.types";
import { STORAGE_KEYS } from "../lib/constants";
import {
  exchangeCodeForTokens,
  OAUTH_STORAGE_KEYS,
} from "../lib/oauth";
import { useOAuthCallback } from "./useOAuthCallback";

const routerState = vi.hoisted(() => ({
  navigate: vi.fn(),
  search: {
    code: "authorization-code",
    state: "oauth-state",
  } as Record<string, string>,
}));
const suspendWorkspace = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => routerState.navigate,
  useSearch: () => routerState.search,
}));

vi.mock("../lib/oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/oauth")>();
  return {
    ...actual,
    exchangeCodeForTokens: vi.fn(),
  };
});

vi.mock("../app/providers/workspace/workspace.hooks", () => ({
  useWorkspace: () => ({ suspendWorkspace }),
}));

function createHarness(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

function createSessionHarness(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SessionProvider>{children}</SessionProvider>
      </QueryClientProvider>
    );
  };
}

function token(accessToken: string): TokenData {
  return {
    access_token: accessToken,
    expires_in: 60,
    expires_at: Date.now() + 60_000,
  };
}

function userInfo(subject: string) {
  return {
    ok: true,
    json: async () => ({ sub: subject, name: subject }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe("useOAuthCallback", () => {
  beforeEach(() => {
    window.localStorage.clear();
    routerState.navigate.mockReset();
    suspendWorkspace.mockReset();
    routerState.search = {
      code: "authorization-code",
      state: "oauth-state",
    };
    vi.mocked(exchangeCodeForTokens).mockReset();
    vi.unstubAllGlobals();
    vi.stubEnv(
      "VITE_GOOGLE_CLIENT_ID",
      "browser-client-id.apps.googleusercontent.com",
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("does nothing when no OAuth parameters are present", () => {
    routerState.search = {};
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useOAuthCallback(), {
      wrapper: createHarness(queryClient),
    });

    expect(result.current).toEqual({ isProcessing: false, error: null });
    expect(exchangeCodeForTokens).not.toHaveBeenCalled();
    expect(routerState.navigate).not.toHaveBeenCalled();
  });

  it.each([
    {
      errorCode: "access_denied",
      expected: "Google sign-in was canceled.",
      label: "canceled sign-in",
    },
    {
      errorCode: "temporarily_unavailable",
      expected: "OAuth authorization failed (temporarily_unavailable).",
      label: "other valid error code",
    },
    {
      errorCode: "Access_Denied",
      expected: "OAuth authorization failed",
      label: "mixed-case error code",
    },
    {
      errorCode: "invalid-grant",
      expected: "OAuth authorization failed",
      label: "invalid error code",
    },
    {
      errorCode: `a${"b".repeat(64)}`,
      expected: "OAuth authorization failed",
      label: "overlong error code",
    },
  ])(
    "uses a bounded local message for $label without exposing provider details",
    async ({ errorCode, expected }) => {
      const providerDescription =
        "Sensitive authorization-code-private-marker pkce-verifier-private-marker";
      routerState.search = {
        error: errorCode,
        error_description: providerDescription,
      };
      const logSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => undefined);
      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      const { result } = renderHook(() => useOAuthCallback(), {
        wrapper: createHarness(queryClient),
      });

      await waitFor(() => {
        expect(result.current.error).toBe(expected);
      });
      expect(result.current.error).not.toContain(providerDescription);
      expect(result.current.error).not.toContain(
        "authorization-code-private-marker",
      );
      expect(result.current.error).not.toContain("pkce-verifier-private-marker");
      expect(exchangeCodeForTokens).not.toHaveBeenCalled();
      expect(routerState.navigate).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    },
  );

  it("clears the old profile and workspace before publishing a replacement token", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const oldToken = {
      access_token: "token-a",
      expires_in: 60,
      expires_at: Date.now() + 60_000,
    };
    const newToken = {
      access_token: "token-b",
      expires_in: 60,
      expires_at: Date.now() + 60_000,
    };
    queryClient.setQueryData(GOOGLE_TOKEN_QUERY_KEY, oldToken);
    queryClient.setQueryData([...USER_PROFILE_QUERY_KEY, 1, 1], {
      id: "account-a",
      name: "Account A",
      picture: null,
    });
    queryClient.setQueryData([...USER_PROFILE_QUERY_KEY, 2, 4], {
      id: "older-account",
      name: "Older account",
      picture: null,
    });
    window.localStorage.setItem(
      STORAGE_KEYS.USER_PROFILE,
      JSON.stringify({ id: "account-a", name: "Account A", picture: null }),
    );
    window.localStorage.setItem(STORAGE_KEYS.SHEET_ID, "legacy-sheet-a");
    window.localStorage.setItem(STORAGE_KEYS.SHEET_TAB_ID, "7");
    vi.mocked(exchangeCodeForTokens).mockResolvedValue(newToken);
    const cancelQueries = vi.spyOn(queryClient, "cancelQueries");
    suspendWorkspace.mockImplementation(() => {
      expect(queryClient.getQueryData(GOOGLE_TOKEN_QUERY_KEY)).toEqual(oldToken);
      expect(
        queryClient.getQueryCache().findAll({
          queryKey: USER_PROFILE_QUERY_KEY,
        }),
      ).toHaveLength(0);
    });

    renderHook(() => useOAuthCallback(), {
      wrapper: createHarness(queryClient),
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(GOOGLE_TOKEN_QUERY_KEY)).toEqual(
        newToken,
      );
    });
    expect(suspendWorkspace).toHaveBeenCalledTimes(1);
    const tokenCancel = cancelQueries.mock.calls.findIndex(
      ([filters]) => filters?.queryKey === GOOGLE_TOKEN_QUERY_KEY,
    );
    const profileCancel = cancelQueries.mock.calls.findIndex(
      ([filters]) => filters?.queryKey === USER_PROFILE_QUERY_KEY,
    );
    expect(tokenCancel).toBeGreaterThanOrEqual(0);
    expect(profileCancel).toBeGreaterThan(tokenCancel);
    expect(window.localStorage.getItem(STORAGE_KEYS.USER_PROFILE)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.SHEET_ID)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.SHEET_TAB_ID)).toBeNull();
    expect(routerState.navigate).toHaveBeenCalledWith({
      to: "/app",
      replace: true,
      search: {},
    });
  });

  it("does not silently refresh account B with account A's retired credential", async () => {
    routerState.search = {};
    const actualOAuth = await vi.importActual<typeof import("../lib/oauth")>(
      "../lib/oauth",
    );
    vi.mocked(exchangeCodeForTokens).mockImplementation(
      actualOAuth.exchangeCodeForTokens,
    );
    const tokenRequests: URLSearchParams[] = [];
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/oauth/token") {
        const requestBody = new URLSearchParams(init?.body as URLSearchParams);
        tokenRequests.push(requestBody);
        if (requestBody.get("grant_type") === "authorization_code") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                access_token: "token-b",
                expires_in: 60,
                scope: "openid",
                token_type: "Bearer",
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              access_token: "token-a-refreshed",
              expires_in: 60,
              scope: "openid",
              token_type: "Bearer",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }
      const authorization = new Headers(init?.headers).get("Authorization");
      return Promise.resolve(
        authorization === "Bearer token-b"
          ? userInfo("account-b")
          : userInfo("account-a"),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 60_000 } },
    });
    window.localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, "token-a");
    window.localStorage.setItem(
      STORAGE_KEYS.EXPIRES_AT,
      String(Date.now() + 60_000),
    );
    window.localStorage.setItem(
      OAUTH_STORAGE_KEYS.REFRESH_TOKEN,
      "refresh-a",
    );
    const { result, rerender } = renderHook(
      () => ({ callback: useOAuthCallback(), session: useSession() }),
      { wrapper: createSessionHarness(queryClient) },
    );
    await waitFor(() => {
      expect(result.current.session.userProfile?.id).toBe("account-a");
    });

    window.localStorage.setItem(OAUTH_STORAGE_KEYS.STATE, "oauth-state");
    window.localStorage.setItem(
      OAUTH_STORAGE_KEYS.CODE_VERIFIER,
      "pkce-verifier",
    );
    routerState.search = {
      code: "authorization-code",
      state: "oauth-state",
    };
    rerender();
    await waitFor(() => {
      expect(result.current.session.accessToken).toBe("token-b");
      expect(result.current.session.userProfile?.id).toBe("account-b");
      expect(result.current.session.status).toBe("authenticated");
    });

    await act(async () => {
      await queryClient.refetchQueries({
        queryKey: GOOGLE_TOKEN_QUERY_KEY,
        exact: true,
      });
    });

    expect(tokenRequests).toHaveLength(1);
    expect(tokenRequests[0]?.get("grant_type")).toBe("authorization_code");
    expect(window.localStorage.getItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN)).toBeNull();
    expect(queryClient.getQueryData(GOOGLE_TOKEN_QUERY_KEY)).toMatchObject({
      access_token: "token-b",
    });
    expect(result.current.session.accessToken).toBe("token-b");
    expect(result.current.session.userProfile?.id).toBe("account-b");
    expect(result.current.session.status).toBe("authenticated");
  });

  it("keeps account B when a cancellation-ignoring account A refresh resolves late", async () => {
    routerState.search = {};
    const oldRefresh = deferred<Response>();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/oauth/token") {
        return oldRefresh.promise;
      }
      const authorization = new Headers(init?.headers).get("Authorization");
      return Promise.resolve(
        authorization === "Bearer token-b"
          ? userInfo("account-b")
          : userInfo("account-a"),
      );
    });
    vi.stubGlobal(
      "fetch",
      fetchMock,
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 60_000 } },
    });
    vi.spyOn(queryClient, "cancelQueries").mockResolvedValue(undefined);
    window.localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, "token-a");
    window.localStorage.setItem(
      STORAGE_KEYS.EXPIRES_AT,
      String(Date.now() + 60_000),
    );
    window.localStorage.setItem(
      OAUTH_STORAGE_KEYS.REFRESH_TOKEN,
      "refresh-a",
    );
    const newToken = token("token-b");
    vi.mocked(exchangeCodeForTokens).mockImplementation(async () => {
      window.localStorage.setItem(
        OAUTH_STORAGE_KEYS.REFRESH_TOKEN,
        "refresh-b",
      );
      return newToken;
    });
    const { result, rerender } = renderHook(
      () => ({ callback: useOAuthCallback(), session: useSession() }),
      { wrapper: createSessionHarness(queryClient) },
    );
    await waitFor(() => {
      expect(result.current.session.userProfile?.id).toBe("account-a");
    });

    const refreshRequest = queryClient.refetchQueries({
      queryKey: GOOGLE_TOKEN_QUERY_KEY,
      exact: true,
    });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(
          ([url]) => url === "/api/oauth/token",
        ),
      ).toHaveLength(1);
    });
    routerState.search = {
      code: "authorization-code",
      state: "oauth-state",
    };
    rerender();
    await waitFor(() => {
      expect(result.current.session.accessToken).toBe("token-b");
      expect(result.current.session.userProfile?.id).toBe("account-b");
      expect(result.current.session.status).toBe("authenticated");
    });

    oldRefresh.resolve(
      new Response(
        JSON.stringify({
          access_token: "token-a-refreshed",
          expires_in: 60,
          refresh_token: "rotated-refresh-a",
          scope: "openid",
          token_type: "Bearer",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    await act(async () => {
      await refreshRequest;
      await oldRefresh.promise;
    });
    await waitFor(() => {
      expect(
        queryClient.getQueryState(GOOGLE_TOKEN_QUERY_KEY)?.fetchStatus,
      ).toBe("idle");
    });

    expect(queryClient.getQueryData(GOOGLE_TOKEN_QUERY_KEY)).toMatchObject({
      access_token: newToken.access_token,
      expires_at: newToken.expires_at,
    });
    expect(result.current.session.accessToken).toBe("token-b");
    expect(result.current.session.userProfile?.id).toBe("account-b");
    expect(result.current.session.status).toBe("authenticated");
    expect(result.current.session.error).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)).toBe(
      "token-b",
    );
    expect(
      window.localStorage.getItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN),
    ).toBe("refresh-b");
  });

  it("keeps account B authenticated when a cancellation-ignoring account A refresh rejects late", async () => {
    routerState.search = {};
    const oldRefresh = deferred<Response>();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/oauth/token") {
        return oldRefresh.promise;
      }
      const authorization = new Headers(init?.headers).get("Authorization");
      return Promise.resolve(
        authorization === "Bearer token-b"
          ? userInfo("account-b")
          : userInfo("account-a"),
      );
    });
    vi.stubGlobal(
      "fetch",
      fetchMock,
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 60_000 } },
    });
    vi.spyOn(queryClient, "cancelQueries").mockResolvedValue(undefined);
    window.localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, "token-a");
    window.localStorage.setItem(
      STORAGE_KEYS.EXPIRES_AT,
      String(Date.now() + 60_000),
    );
    window.localStorage.setItem(
      OAUTH_STORAGE_KEYS.REFRESH_TOKEN,
      "refresh-a",
    );
    vi.mocked(exchangeCodeForTokens).mockImplementation(async () => {
      window.localStorage.setItem(
        OAUTH_STORAGE_KEYS.REFRESH_TOKEN,
        "refresh-b",
      );
      return token("token-b");
    });
    const { result, rerender } = renderHook(
      () => ({ callback: useOAuthCallback(), session: useSession() }),
      { wrapper: createSessionHarness(queryClient) },
    );
    await waitFor(() => {
      expect(result.current.session.userProfile?.id).toBe("account-a");
    });

    const refreshRequest = queryClient.refetchQueries({
      queryKey: GOOGLE_TOKEN_QUERY_KEY,
      exact: true,
    });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(
          ([url]) => url === "/api/oauth/token",
        ),
      ).toHaveLength(1);
    });
    routerState.search = {
      code: "authorization-code",
      state: "oauth-state",
    };
    rerender();
    await waitFor(() => {
      expect(result.current.session.userProfile?.id).toBe("account-b");
    });

    oldRefresh.resolve(new Response("revoked", { status: 400 }));
    await act(async () => {
      await refreshRequest;
    });
    await waitFor(() => {
      expect(
        queryClient.getQueryState(GOOGLE_TOKEN_QUERY_KEY)?.fetchStatus,
      ).toBe("idle");
    });

    expect(
      queryClient.getQueryState(GOOGLE_TOKEN_QUERY_KEY)?.error,
    ).toBeNull();
    expect(result.current.session.accessToken).toBe("token-b");
    expect(result.current.session.userProfile?.id).toBe("account-b");
    expect(result.current.session.status).toBe("authenticated");
    expect(result.current.session.error).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)).toBe(
      "token-b",
    );
    expect(
      window.localStorage.getItem(OAUTH_STORAGE_KEYS.REFRESH_TOKEN),
    ).toBe("refresh-b");
  });

  it("renders and logs no sensitive provider details from a failed exchange", async () => {
    const actualOAuth = await vi.importActual<typeof import("../lib/oauth")>(
      "../lib/oauth",
    );
    vi.mocked(exchangeCodeForTokens).mockImplementation(
      actualOAuth.exchangeCodeForTokens,
    );
    window.localStorage.setItem(OAUTH_STORAGE_KEYS.STATE, "oauth-state");
    window.localStorage.setItem(
      OAUTH_STORAGE_KEYS.CODE_VERIFIER,
      "pkce-verifier-private-marker",
    );
    const providerDescription =
      "Rejected authorization-code and pkce-verifier-private-marker";
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          error: "invalid_grant",
          error_description: providerDescription,
        },
        { status: 400 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useOAuthCallback(), {
      wrapper: createHarness(queryClient),
    });

    await waitFor(() => {
      expect(result.current.error).toBe(
        "OAuth token request failed (invalid_grant).",
      );
    });
    expect(result.current.error).not.toContain(providerDescription);
    expect(result.current.error).not.toContain("authorization-code");
    expect(result.current.error).not.toContain("pkce-verifier-private-marker");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/oauth/token",
      expect.objectContaining({ method: "POST" }),
    );
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
