import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomePage } from "./HomePage";

const appState = vi.hoisted(() => ({
  phase: "needs_auth" as
    | "booting"
    | "needs_auth"
    | "needs_sheet"
    | "needs_accounts"
    | "needs_categories"
    | "ready"
    | "error",
  session: {
    status: "unauthenticated" as
      | "initializing"
      | "unauthenticated"
      | "authenticating"
      | "authenticated"
      | "local"
      | "error",
    accessToken: null as string | null,
    isInitialized: true,
    error: null as Error | null,
  },
}));

vi.mock("../app/providers", () => ({
  useSession: () => appState.session,
}));

vi.mock("../hooks/useAppPhase", () => ({
  useAppPhase: () => ({
    phase: appState.phase,
    accountsReady: false,
    categoriesReady: false,
  }),
}));

vi.mock("../components/OnboardingFlow", () => ({
  OnboardingFlow: () => <div data-testid="legacy-google-onboarding" />,
}));

vi.mock("../components/TinyWinOnboarding", () => ({
  TinyWinActivation: () => <div data-testid="tiny-win-activation" />,
  ImportedReceipt: () => <div data-testid="imported-receipt" />,
}));

vi.mock("../components/TransactionFlow", () => ({
  TransactionFlow: () => <div data-testid="transaction-flow" />,
}));

vi.mock("../components/SheetlogAppPicker", () => ({
  SheetlogAppPicker: () => <div data-testid="app-picker" />,
}));

vi.mock("../hooks/useDocumentMeta", () => ({ useDocumentMeta: vi.fn() }));
vi.mock("../hooks/useSelectedAppQuery", () => ({
  useSelectedAppQuery: () => ({ data: "money", isLoading: false }),
  useSetSelectedApp: () => ({ mutate: vi.fn() }),
}));
vi.mock("../lib/sheetlogApps", () => ({
  getSheetlogApp: () => ({ name: "Money", description: "Money tracker" }),
}));
vi.mock("../lib/pwa", () => ({ isStandaloneMode: () => false }));
vi.mock("../lib/bootstrapClient", () => ({
  consumeBootstrap: vi.fn().mockResolvedValue(null),
}));
vi.mock("../lib/bootstrapImport", () => ({
  importBootstrapPayload: vi.fn(),
  readImportedBootstrapReceipt: vi.fn().mockResolvedValue(null),
  clearImportedBootstrapReceipt: vi.fn().mockResolvedValue(undefined),
}));

describe("HomePage Tiny Win entry", () => {
  beforeEach(() => {
    appState.phase = "needs_auth";
    appState.session.status = "unauthenticated";
    appState.session.accessToken = null;
    appState.session.error = null;
  });

  it("routes a new unauthenticated browser visitor into Tiny Win", () => {
    render(<HomePage />);

    expect(screen.getByTestId("tiny-win-activation")).toBeVisible();
    expect(screen.queryByTestId("legacy-google-onboarding")).not.toBeInTheDocument();
  });

  it("keeps the legacy setup flow for an authenticated account that still needs a Sheet", () => {
    appState.phase = "needs_sheet";
    appState.session.status = "authenticated";
    appState.session.accessToken = "access-token";

    render(<HomePage />);

    expect(screen.getByTestId("legacy-google-onboarding")).toBeVisible();
    expect(screen.queryByTestId("tiny-win-activation")).not.toBeInTheDocument();
  });
});
