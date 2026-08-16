import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { onlineManager } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../../../lib/constants";
import { GOOGLE_TOKEN_QUERY_KEY } from "./session.constants";
import { useSession } from "./session.hooks";
import { SessionProvider } from "./SessionProvider";
import type { TokenData } from "./session.types";

function ProfileSubject() {
  const { accessToken, error, signOut, status, userProfile } = useSession();
  return (
    <>
      <output data-testid="profile-subject">
        {userProfile?.id ?? "waiting"}
      </output>
      <output data-testid="access-token">{accessToken ?? "none"}</output>
      <output data-testid="session-status">{status}</output>
      <output data-testid="session-error">{error?.message ?? "none"}</output>
      <button type="button" onClick={() => signOut()}>
        Sign out
      </button>
      <button type="button" onClick={() => signOut("access-token")}>
        Retire access-token
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
    onlineManager.setOnline(true);
    window.localStorage.clear();
    window.localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, "access-token");
    window.localStorage.setItem(
      STORAGE_KEYS.EXPIRES_AT,
      String(Date.now() + 60_000),
    );
  });

  afterEach(() => {
    onlineManager.setOnline(true);
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

  it("stops after bounded userinfo retries and exposes an actionable verification error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("temporary userinfo outage")),
    );
    renderSession();

    await waitFor(
      () => {
        expect(screen.getByTestId("session-status")).toHaveTextContent("error");
      },
      { timeout: 5_000 },
    );
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("session-error")).toHaveTextContent(
      /verify.*google account|load.*profile/i,
    );
    expect(screen.getByTestId("profile-subject")).toHaveTextContent("waiting");
  });

  it("rejects a 200 userinfo response that has no stable Google subject", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ name: "Name without a subject" }),
      }),
    );
    renderSession();

    await waitFor(
      () => {
        expect(screen.getByTestId("session-status")).toHaveTextContent("error");
      },
      { timeout: 5_000 },
    );
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("session-error")).toHaveTextContent(
      /stable google account identity/i,
    );
  });

  it("re-verifies the profile after connectivity returns", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError("userinfo offline"))
        .mockRejectedValueOnce(new TypeError("userinfo offline"))
        .mockRejectedValueOnce(new TypeError("userinfo offline"))
        .mockResolvedValueOnce(userInfo("account-a", "Account A")),
    );
    renderSession();

    await waitFor(
      () => {
        expect(screen.getByTestId("session-status")).toHaveTextContent("error");
      },
      { timeout: 5_000 },
    );
    act(() => onlineManager.setOnline(false));
    act(() => onlineManager.setOnline(true));

    expect(await screen.findByText("account-a")).toBeInTheDocument();
    expect(screen.getByTestId("session-status")).toHaveTextContent(
      "authenticated",
    );
    expect(fetch).toHaveBeenCalledTimes(4);
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

  it("ignores a token-bound signout from account A after account B is active", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        const authorization = new Headers(init?.headers).get("Authorization");
        return Promise.resolve(
          authorization === "Bearer access-token-b"
            ? userInfo("account-b", "Account B")
            : userInfo("account-a", "Account A"),
        );
      }),
    );
    const queryClient = renderSession();
    expect(await screen.findByText("account-a")).toBeInTheDocument();

    act(() => {
      queryClient.setQueryData(GOOGLE_TOKEN_QUERY_KEY, token("access-token-b"));
    });
    expect(await screen.findByText("account-b")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Retire access-token" }),
    );

    expect(window.localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)).toBe(
      "access-token-b",
    );
    expect(
      queryClient.getQueryData<TokenData>(GOOGLE_TOKEN_QUERY_KEY)?.access_token,
    ).toBe("access-token-b");
    expect(screen.getByTestId("access-token")).toHaveTextContent(
      "access-token-b",
    );
    expect(screen.getByTestId("profile-subject")).toHaveTextContent(
      "account-b",
    );
  });

  it("honors a token-bound signout for the currently active account", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(userInfo("account-a")));
    renderSession();
    expect(await screen.findByText("account-a")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Retire access-token" }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("access-token")).toHaveTextContent("none");
    });
    expect(screen.getByTestId("profile-subject")).toHaveTextContent("waiting");
  });

  it("does not erase a newer token persisted by another tab", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(userInfo("account-a")));
    const queryClient = renderSession();
    expect(await screen.findByText("account-a")).toBeInTheDocument();
    window.localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, "token-b");
    window.localStorage.setItem(
      STORAGE_KEYS.EXPIRES_AT,
      String(Date.now() + 60_000),
    );
    window.localStorage.setItem(
      STORAGE_KEYS.USER_PROFILE,
      JSON.stringify({ id: "account-b", name: "Account B", picture: null }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Retire access-token" }),
    );

    expect(window.localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)).toBe(
      "token-b",
    );
    expect(
      JSON.parse(
        window.localStorage.getItem(STORAGE_KEYS.USER_PROFILE) ?? "null",
      ),
    ).toMatchObject({ id: "account-b" });
    expect(
      queryClient.getQueryData<TokenData>(GOOGLE_TOKEN_QUERY_KEY)?.access_token,
    ).toBe("access-token");
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
