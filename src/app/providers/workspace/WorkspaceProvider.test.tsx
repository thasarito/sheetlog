import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../../../lib/constants";
import { ensureSheetReady } from "../../../lib/sheets";
import { useWorkspace } from "./workspace.hooks";
import { WorkspaceProvider } from "./WorkspaceProvider";

const providerState = vi.hoisted(() => ({
  accessToken: "token-a" as string | null,
  userId: "account-a" as string | null,
  isInitialized: true,
  status: "authenticated" as
    | "initializing"
    | "unauthenticated"
    | "authenticating"
    | "authenticated"
    | "error",
}));

vi.mock("../session/session.hooks", () => ({
  useSession: () => ({
    accessToken: providerState.accessToken,
    userProfile: providerState.userId
      ? { id: providerState.userId, name: providerState.userId, picture: null }
      : null,
    isInitialized: providerState.isInitialized,
    status: providerState.status,
  }),
}));

vi.mock("../../../lib/sheets", () => ({
  ensureSheetReady: vi.fn(),
}));

function accountStorageKey(baseKey: string, userId: string) {
  return `${baseKey}:${encodeURIComponent(userId)}`;
}

function WorkspaceProbe() {
  const workspace = useWorkspace();
  return (
    <>
      <output data-testid="sheet-id">{workspace.sheetId ?? "none"}</output>
      <output data-testid="sheet-tab-id">
        {workspace.sheetTabId ?? "none"}
      </output>
      <output data-testid="workspace-initialized">
        {String(workspace.isInitialized)}
      </output>
      <button
        type="button"
        onClick={() => void workspace.ensureSheet(null)}
      >
        Ensure sheet
      </button>
      <button type="button" onClick={workspace.clearWorkspace}>
        Clear sheet
      </button>
    </>
  );
}

function renderWorkspace() {
  return render(
    <WorkspaceProvider>
      <WorkspaceProbe />
    </WorkspaceProvider>,
  );
}

describe("WorkspaceProvider verified account scope", () => {
  beforeEach(() => {
    window.localStorage.clear();
    providerState.accessToken = "token-a";
    providerState.userId = "account-a";
    providerState.isInitialized = true;
    providerState.status = "authenticated";
    vi.mocked(ensureSheetReady).mockReset();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("quarantines legacy global workspace values and exposes nothing before identity verification", async () => {
    window.localStorage.setItem(STORAGE_KEYS.SHEET_ID, "legacy-sheet");
    window.localStorage.setItem(STORAGE_KEYS.SHEET_TAB_ID, "7");
    providerState.userId = null;

    renderWorkspace();

    expect(screen.getByTestId("sheet-id")).toHaveTextContent("none");
    expect(screen.getByTestId("sheet-tab-id")).toHaveTextContent("none");
    expect(screen.getByTestId("workspace-initialized")).toHaveTextContent(
      "false",
    );
    await waitFor(() => {
      expect(window.localStorage.getItem(STORAGE_KEYS.SHEET_ID)).toBeNull();
      expect(window.localStorage.getItem(STORAGE_KEYS.SHEET_TAB_ID)).toBeNull();
    });
  });

  it("restores separate account workspaces across A to B to A handoffs", async () => {
    window.localStorage.setItem(
      accountStorageKey(STORAGE_KEYS.SHEET_ID, "account-a"),
      "sheet-a",
    );
    window.localStorage.setItem(
      accountStorageKey(STORAGE_KEYS.SHEET_TAB_ID, "account-a"),
      "3",
    );
    window.localStorage.setItem(
      accountStorageKey(STORAGE_KEYS.SHEET_ID, "account-b"),
      "sheet-b",
    );
    window.localStorage.setItem(
      accountStorageKey(STORAGE_KEYS.SHEET_TAB_ID, "account-b"),
      "9",
    );
    const view = renderWorkspace();

    await waitFor(() => {
      expect(screen.getByTestId("sheet-id")).toHaveTextContent("sheet-a");
      expect(screen.getByTestId("sheet-tab-id")).toHaveTextContent("3");
    });

    providerState.userId = null;
    providerState.accessToken = null;
    providerState.status = "unauthenticated";
    view.rerender(
      <WorkspaceProvider>
        <WorkspaceProbe />
      </WorkspaceProvider>,
    );
    expect(screen.getByTestId("sheet-id")).toHaveTextContent("none");
    await waitFor(() => {
      expect(
        window.localStorage.getItem(
          accountStorageKey(STORAGE_KEYS.SHEET_ID, "account-a"),
        ),
      ).toBe("sheet-a");
    });

    providerState.userId = "account-b";
    providerState.accessToken = "token-b";
    providerState.status = "authenticated";
    view.rerender(
      <WorkspaceProvider>
        <WorkspaceProbe />
      </WorkspaceProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("sheet-id")).toHaveTextContent("sheet-b");
      expect(screen.getByTestId("sheet-tab-id")).toHaveTextContent("9");
    });

    providerState.userId = "account-a";
    providerState.accessToken = "token-a-2";
    view.rerender(
      <WorkspaceProvider>
        <WorkspaceProbe />
      </WorkspaceProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("sheet-id")).toHaveTextContent("sheet-a");
      expect(screen.getByTestId("sheet-tab-id")).toHaveTextContent("3");
    });
  });

  it("stores and clears a selected sheet only in the verified subject scope", async () => {
    vi.mocked(ensureSheetReady).mockResolvedValue({
      sheetId: "new-sheet-a",
      sheetTabId: 5,
    });
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: "Ensure sheet" }));
    await waitFor(() => {
      expect(screen.getByTestId("sheet-id")).toHaveTextContent("new-sheet-a");
    });
    expect(
      window.localStorage.getItem(
        accountStorageKey(STORAGE_KEYS.SHEET_ID, "account-a"),
      ),
    ).toBe("new-sheet-a");
    expect(window.localStorage.getItem(STORAGE_KEYS.SHEET_ID)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clear sheet" }));
    expect(screen.getByTestId("sheet-id")).toHaveTextContent("none");
    expect(
      window.localStorage.getItem(
        accountStorageKey(STORAGE_KEYS.SHEET_ID, "account-a"),
      ),
    ).toBeNull();
  });
});
