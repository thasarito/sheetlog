import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GOOGLE_TOKEN_QUERY_KEY,
  USER_PROFILE_QUERY_KEY,
} from "../app/providers/session/session.constants";
import { STORAGE_KEYS } from "../lib/constants";
import { exchangeCodeForTokens } from "../lib/oauth";
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

vi.mock("../lib/oauth", () => ({
  exchangeCodeForTokens: vi.fn(),
}));

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

describe("useOAuthCallback account handoff", () => {
  beforeEach(() => {
    window.localStorage.clear();
    routerState.navigate.mockReset();
    suspendWorkspace.mockReset();
    routerState.search = {
      code: "authorization-code",
      state: "oauth-state",
    };
    vi.mocked(exchangeCodeForTokens).mockReset();
  });

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
    expect(window.localStorage.getItem(STORAGE_KEYS.USER_PROFILE)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.SHEET_ID)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.SHEET_TAB_ID)).toBeNull();
    expect(routerState.navigate).toHaveBeenCalledWith({
      to: "/app",
      replace: true,
      search: {},
    });
  });
});
