import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../../../lib/constants";
import { GOOGLE_TOKEN_QUERY_KEY } from "./session.constants";
import { useSession } from "./session.hooks";
import { SessionProvider } from "./SessionProvider";
import type { TokenData } from "./session.types";

function ProfileSubject() {
  const { accessToken, signOut, userProfile } = useSession();
  return (
    <>
      <output data-testid="profile-subject">
        {userProfile?.id ?? "waiting"}
      </output>
      <output data-testid="access-token">{accessToken ?? "none"}</output>
      <button type="button" onClick={signOut}>
        Sign out
      </button>
    </>
  );
}

function token(accessToken: string): TokenData {
  return {
    access_token: accessToken,
    expires_in: 60,
    expires_at: Date.now() + 60_000,
  };
}

function userInfo(subject: string, name = subject) {
  return {
    ok: true,
    json: async () => ({ sub: subject, name }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function renderSession(queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 60_000 } },
})) {
  render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <ProfileSubject />
      </SessionProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

describe("SessionProvider account identity", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, "access-token");
    window.localStorage.setItem(
      STORAGE_KEYS.EXPIRES_AT,
      String(Date.now() + 60_000),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("stores the stable Google subject from userinfo in the session profile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          sub: "google-subject-123",
          name: "Test User",
          picture: "https://example.test/avatar.png",
        }),
      }),
    );
    renderSession();

    expect(await screen.findByText("google-subject-123")).toBeInTheDocument();
    expect(
      JSON.parse(
        window.localStorage.getItem(STORAGE_KEYS.USER_PROFILE) ?? "null",
      ),
    ).toMatchObject({ id: "google-subject-123", name: "Test User" });
  });

  it("does not expose a persisted account A identity while account B userinfo is pending", async () => {
    window.localStorage.setItem(
      STORAGE_KEYS.USER_PROFILE,
      JSON.stringify({ id: "account-a", name: "Account A", picture: null }),
    );
    const accountB = deferred<ReturnType<typeof userInfo>>();
    vi.stubGlobal("fetch", vi.fn(() => accountB.promise));

    renderSession();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId("access-token")).toHaveTextContent("access-token");
    expect(screen.getByTestId("profile-subject")).toHaveTextContent("waiting");

    accountB.resolve(userInfo("account-b", "Account B"));
    expect(await screen.findByText("account-b")).toBeInTheDocument();
  });

  it("removes account A immediately when the mounted token changes and fetches account B once", async () => {
    const accountB = deferred<ReturnType<typeof userInfo>>();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        const authorization = new Headers(init?.headers).get("Authorization");
        return authorization === "Bearer access-token-b"
          ? accountB.promise
          : Promise.resolve(userInfo("account-a", "Account A"));
      }),
    );
    const queryClient = renderSession();
    expect(await screen.findByText("account-a")).toBeInTheDocument();

    act(() => {
      queryClient.setQueryData(GOOGLE_TOKEN_QUERY_KEY, token("access-token-b"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("access-token")).toHaveTextContent(
        "access-token-b",
      );
    });
    expect(screen.getByTestId("profile-subject")).toHaveTextContent("waiting");
    await waitFor(() => {
      expect(
        vi.mocked(fetch).mock.calls.filter(([, init]) =>
          new Headers(init?.headers).get("Authorization") ===
          "Bearer access-token-b",
        ),
      ).toHaveLength(1);
    });
    const profileKeys = queryClient
      .getQueryCache()
      .findAll({ queryKey: ["userProfile"] })
      .map((query) => query.queryKey);
    expect(JSON.stringify(profileKeys)).not.toContain("access-token");

    accountB.resolve(userInfo("account-b", "Account B"));
    expect(await screen.findByText("account-b")).toBeInTheDocument();
  });

  it("does not let a stale account A response win after account B resolves", async () => {
    const accountA = deferred<ReturnType<typeof userInfo>>();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        const authorization = new Headers(init?.headers).get("Authorization");
        return authorization === "Bearer access-token-b"
          ? Promise.resolve(userInfo("account-b", "Account B"))
          : accountA.promise;
      }),
    );
    const queryClient = renderSession();
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    act(() => {
      queryClient.setQueryData(GOOGLE_TOKEN_QUERY_KEY, token("access-token-b"));
    });
    expect(await screen.findByText("account-b")).toBeInTheDocument();

    accountA.resolve(userInfo("account-a", "Account A"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("profile-subject")).toHaveTextContent("account-b");
  });

  it("re-verifies a refreshed token for the same account without retaining the old token profile", async () => {
    const refreshed = deferred<ReturnType<typeof userInfo>>();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        const authorization = new Headers(init?.headers).get("Authorization");
        return authorization === "Bearer refreshed-access-token"
          ? refreshed.promise
          : Promise.resolve(userInfo("account-a", "Account A"));
      }),
    );
    const queryClient = renderSession();
    expect(await screen.findByText("account-a")).toBeInTheDocument();

    act(() => {
      queryClient.setQueryData(
        GOOGLE_TOKEN_QUERY_KEY,
        token("refreshed-access-token"),
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId("access-token")).toHaveTextContent(
        "refreshed-access-token",
      );
    });
    expect(screen.getByTestId("profile-subject")).toHaveTextContent("waiting");

    refreshed.resolve(userInfo("account-a", "Account A"));
    expect(await screen.findByText("account-a")).toBeInTheDocument();
    expect(screen.getByTestId("access-token")).toHaveTextContent(
      "refreshed-access-token",
    );
  });

  it("clears every cached profile variant and persisted profile on signout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(userInfo("account-a")));
    const queryClient = renderSession();
    expect(await screen.findByText("account-a")).toBeInTheDocument();
    queryClient.setQueryData(["userProfile", "old-token"], {
      id: "other-account",
      name: "Other account",
      picture: null,
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => {
      expect(screen.getByTestId("profile-subject")).toHaveTextContent("waiting");
    });
    expect(
      queryClient.getQueryCache().findAll({ queryKey: ["userProfile"] }),
    ).toHaveLength(0);
    expect(window.localStorage.getItem(STORAGE_KEYS.USER_PROFILE)).toBeNull();
  });
});
