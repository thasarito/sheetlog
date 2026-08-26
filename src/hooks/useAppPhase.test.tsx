import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppPhase } from "./useAppPhase";

const appState = vi.hoisted(() => ({
  session: {
    accessToken: "access-token" as string | null,
    error: new Error("Could not verify this Google account") as Error | null,
    isInitialized: true,
    status: "error" as
      | "initializing"
      | "unauthenticated"
      | "authenticating"
      | "local"
      | "authenticated"
      | "error",
  },
  workspace: {
    isInitialized: false,
    sheetId: null as string | null,
  },
  onboarding: {
    accounts: [] as Array<{ name: string }>,
    accountsConfirmed: false,
    categories: {
      expense: [] as Array<{ name: string }>,
      income: [] as Array<{ name: string }>,
      transfer: [] as Array<{ name: string }>,
    },
    categoriesConfirmed: false,
  },
  onboardingLoading: true,
}));

vi.mock("../app/providers", () => ({
  useSession: () => appState.session,
  useWorkspace: () => appState.workspace,
}));

vi.mock("./useOnboarding", () => ({
  useOnboarding: () => ({
    onboarding: appState.onboarding,
    isLoading: appState.onboardingLoading,
  }),
}));

describe("useAppPhase", () => {
  beforeEach(() => {
    appState.session.accessToken = "access-token";
    appState.session.error = new Error("Could not verify this Google account");
    appState.session.isInitialized = true;
    appState.session.status = "error";
    appState.workspace.isInitialized = false;
    appState.workspace.sheetId = null;
    appState.onboarding.accounts = [];
    appState.onboarding.accountsConfirmed = false;
    appState.onboarding.categories = {
      expense: [],
      income: [],
      transfer: [],
    };
    appState.onboarding.categoriesConfirmed = false;
    appState.onboardingLoading = true;
  });

  it("surfaces a session error before waiting for an unverified workspace", () => {
    const { result } = renderHook(() => useAppPhase());

    expect(result.current).toMatchObject({
      phase: "error",
      error: appState.session.error,
    });
  });

  it("treats a configured local workspace as ready without an access token", () => {
    appState.session.accessToken = null;
    appState.session.error = null;
    appState.session.status = "local";
    appState.workspace.isInitialized = true;
    appState.workspace.sheetId = "local-workspace:bootstrap-1";
    appState.onboarding.accounts = [{ name: "KBank" }];
    appState.onboarding.accountsConfirmed = true;
    appState.onboarding.categories = {
      expense: [{ name: "Food" }],
      income: [{ name: "Salary" }],
      transfer: [{ name: "Savings" }],
    };
    appState.onboarding.categoriesConfirmed = true;
    appState.onboardingLoading = false;

    const { result } = renderHook(() => useAppPhase());

    expect(result.current.phase).toBe("ready");
  });
});
