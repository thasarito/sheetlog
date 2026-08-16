import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleApiError, writeOnboardingConfig } from "../lib/google";
import { hydrateOnboardingFromSheet } from "../lib/onboarding";
import type { OnboardingState } from "../lib/types";
import {
  onboardingKeys,
  useOnboardingSync,
  useUpdateOnboarding,
} from "./useOnboardingQuery";

const providerState = vi.hoisted(() => ({
  accessToken: "token-a" as string | null,
  userId: "account-a" as string | null,
  sheetId: "sheet-a" as string | null,
  isOnline: true,
  signOut: vi.fn(),
}));

const googleMocks = vi.hoisted(() => {
  class GoogleApiError extends Error {
    status: number;

    constructor({ status, message }: { status: number; message: string }) {
      super(message);
      this.status = status;
    }
  }

  return {
    GoogleApiError,
    writeOnboardingConfig: vi.fn(),
  };
});

const onboardingMocks = vi.hoisted(() => ({
  hydrateOnboardingFromSheet: vi.fn(),
}));

const settingsMocks = vi.hoisted(() => ({
  getOnboardingState: vi.fn(),
  setOnboardingState: vi.fn(),
}));

vi.mock("../app/providers", () => ({
  useSession: () => ({
    accessToken: providerState.accessToken,
    userProfile: providerState.userId
      ? { id: providerState.userId, name: providerState.userId, picture: null }
      : null,
    signOut: providerState.signOut,
  }),
  useWorkspace: () => ({ sheetId: providerState.sheetId }),
  useConnectivity: () => ({ isOnline: providerState.isOnline }),
}));

vi.mock("../lib/google", () => googleMocks);
vi.mock("../lib/mock", () => ({
  IS_DEV_MODE: false,
  writeOnboardingConfig: vi.fn(),
}));
vi.mock("../lib/onboarding", () => onboardingMocks);
vi.mock("../lib/settings", () => ({
  getDefaultOnboardingState: () => defaultOnboarding(),
  getOnboardingState: settingsMocks.getOnboardingState,
  setOnboardingState: settingsMocks.setOnboardingState,
}));

function defaultOnboarding(): OnboardingState {
  return {
    sheetFolderId: null,
    accounts: [],
    accountsConfirmed: false,
    categories: {
      expense: [{ name: "Food" }],
      income: [{ name: "Salary" }],
      transfer: [{ name: "Transfer" }],
    },
    categoriesConfirmed: false,
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

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 60_000 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }
  return { queryClient, wrapper: Wrapper };
}

describe("onboarding auth handoff", () => {
  beforeEach(() => {
    providerState.accessToken = "token-a";
    providerState.userId = "account-a";
    providerState.sheetId = "sheet-a";
    providerState.isOnline = true;
    providerState.signOut.mockReset();
    onlineManager.setOnline(true);
    vi.mocked(writeOnboardingConfig).mockReset().mockResolvedValue(undefined);
    vi.mocked(hydrateOnboardingFromSheet).mockReset();
    settingsMocks.getOnboardingState.mockReset().mockResolvedValue(defaultOnboarding());
    settingsMocks.setOnboardingState.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    onlineManager.setOnline(true);
    vi.restoreAllMocks();
  });

  it("binds a late onboarding sync auth failure to the token that started it", async () => {
    const accountARequest = deferred<{
      next: OnboardingState;
      changed: boolean;
    }>();
    vi.mocked(hydrateOnboardingFromSheet).mockImplementation(
      async (accessToken) => {
        if (accessToken === "token-a") {
          return accountARequest.promise;
        }
        return { next: defaultOnboarding(), changed: false };
      },
    );
    const { queryClient, wrapper } = createHarness();
    const { rerender } = renderHook(() => useOnboardingSync(), { wrapper });
    await waitFor(() => {
      expect(hydrateOnboardingFromSheet).toHaveBeenCalledWith(
        "token-a",
        "sheet-a",
        expect.any(Object),
      );
    });

    providerState.accessToken = "token-b";
    providerState.userId = "account-b";
    rerender();
    await waitFor(() => {
      expect(hydrateOnboardingFromSheet).toHaveBeenCalledWith(
        "token-b",
        "sheet-a",
        expect.any(Object),
      );
    });

    accountARequest.reject(
      new GoogleApiError({ status: 401, message: "Account A expired" }),
    );
    await waitFor(() => {
      expect(providerState.signOut).toHaveBeenCalledWith("token-a");
    });
    expect(
      queryClient.getQueryState(
        onboardingKeys.sync("sheet-a", "account-b"),
      )?.status,
    ).toBe("success");
  });

  it("binds a late onboarding mutation auth failure to its initiating token", async () => {
    const accountAWrite = deferred<void>();
    vi.mocked(writeOnboardingConfig).mockReturnValue(accountAWrite.promise);
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(
      onboardingKeys.state("sheet-a"),
      defaultOnboarding(),
    );
    const { result, rerender } = renderHook(() => useUpdateOnboarding(), {
      wrapper,
    });

    let mutation!: Promise<OnboardingState>;
    act(() => {
      mutation = result.current.mutateAsync({
        accounts: [{ name: "Wallet" }],
        accountsConfirmed: true,
      });
    });
    await waitFor(() => {
      expect(writeOnboardingConfig).toHaveBeenCalledWith(
        "token-a",
        "sheet-a",
        expect.objectContaining({ accounts: [{ name: "Wallet" }] }),
      );
    });

    providerState.accessToken = "token-b";
    providerState.userId = "account-b";
    rerender();
    accountAWrite.reject(
      new GoogleApiError({ status: 401, message: "Account A expired" }),
    );

    await expect(mutation).rejects.toThrow("Account A expired");
    expect(providerState.signOut).toHaveBeenCalledWith("token-a");
  });

  it("refuses even a manual Sheets hydration before identity verification", async () => {
    providerState.userId = null;
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useOnboardingSync(), { wrapper });

    await act(async () => {
      await result.current.refetch();
    });

    expect(hydrateOnboardingFromSheet).not.toHaveBeenCalled();
  });
});
