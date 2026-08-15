import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppPhase } from "./useAppPhase";

const appState = vi.hoisted(() => ({
  session: {
    accessToken: "access-token" as string | null,
    error: new Error("Could not verify this Google account") as Error | null,
    isInitialized: true,
    status: "error",
  },
  workspace: {
    isInitialized: false,
    sheetId: null as string | null,
  },
  onboardingLoading: true,
}));

vi.mock("../app/providers", () => ({
  useSession: () => appState.session,
  useWorkspace: () => appState.workspace,
}));

vi.mock("./useOnboarding", () => ({
  useOnboarding: () => ({
    onboarding: {
      accounts: [],
      accountsConfirmed: false,
      categories: null,
      categoriesConfirmed: false,
    },
    isLoading: appState.onboardingLoading,
  }),
}));

describe("useAppPhase profile verification", () => {
  beforeEach(() => {
    appState.session.accessToken = "access-token";
    appState.session.error = new Error("Could not verify this Google account");
    appState.session.isInitialized = true;
    appState.session.status = "error";
    appState.workspace.isInitialized = false;
    appState.workspace.sheetId = null;
    appState.onboardingLoading = true;
  });

  it("surfaces a session error before waiting for an unverified workspace", () => {
    const { result } = renderHook(() => useAppPhase());

    expect(result.current).toMatchObject({
      phase: "error",
      error: appState.session.error,
    });
  });
});
