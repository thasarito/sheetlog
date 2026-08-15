import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../../lib/db";
import { ensureSheetReady } from "../../../lib/sheets";
import { syncPendingTransactions } from "../../../lib/sync";
import type { TransactionInput } from "../../../lib/types";
import { ConnectivityProvider } from "../connectivity/ConnectivityProvider";
import { TransactionsProvider } from "../transactions/TransactionsProvider";
import { useTransactions } from "../transactions/TransactionsContext";
import { WorkspaceProvider } from "../workspace/WorkspaceProvider";
import { useWorkspace } from "../workspace/workspace.hooks";
import { GOOGLE_TOKEN_QUERY_KEY } from "./session.constants";
import { useSession } from "./session.hooks";
import { SessionProvider } from "./SessionProvider";
import type { TokenData } from "./session.types";

vi.mock("../../../lib/sync", () => ({
  syncPendingTransactions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../lib/sheets", () => ({
  ensureSheetReady: vi.fn(),
}));

function token(accessToken: string): TokenData {
  return {
    access_token: accessToken,
    expires_in: 60,
    expires_at: Date.now() + 60_000,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

const INPUT: TransactionInput = {
  type: "expense",
  amount: 25,
  currency: "THB",
  account: "Wallet",
  for: "Me",
  category: "Food",
  date: "2026-08-15T08:00:00.000Z",
};

function HandoffProbe() {
  const { accessToken, userProfile } = useSession();
  const workspace = useWorkspace();
  const { addTransaction } = useTransactions();
  const [addOutcome, setAddOutcome] = useState("idle");
  const [ensureOutcome, setEnsureOutcome] = useState("idle");

  return (
    <>
      <output data-testid="token">{accessToken ?? "none"}</output>
      <output data-testid="subject">{userProfile?.id ?? "waiting"}</output>
      <output data-testid="sheet">{workspace.sheetId ?? "none"}</output>
      <output data-testid="workspace-ready">
        {String(workspace.isInitialized)}
      </output>
      <output data-testid="add-outcome">{addOutcome}</output>
      <output data-testid="ensure-outcome">{ensureOutcome}</output>
      <button
        type="button"
        onClick={() => {
          void addTransaction(INPUT).then(
            () => setAddOutcome("added"),
            () => setAddOutcome("blocked"),
          );
        }}
      >
        Add expense
      </button>
      <button
        type="button"
        onClick={() => {
          void workspace.ensureSheet(null).then(
            () => setEnsureOutcome("ensured"),
            () => setEnsureOutcome("blocked"),
          );
        }}
      >
        Ensure sheet
      </button>
    </>
  );
}

describe("account handoff transaction boundary", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await db.transactions.clear();
    vi.mocked(syncPendingTransactions).mockClear();
    vi.mocked(ensureSheetReady).mockReset();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    await db.transactions.clear();
  });

  it("allows no transaction add or sync under account B until B userinfo is verified", async () => {
    window.localStorage.setItem("sheetlog.accessToken", "token-a");
    window.localStorage.setItem(
      "sheetlog.tokenExpiresAt",
      String(Date.now() + 60_000),
    );
    window.localStorage.setItem("sheetlog.sheetId:account-a", "sheet-a");
    window.localStorage.setItem("sheetlog.sheetTabId:account-a", "3");
    const accountB = deferred<{
      ok: boolean;
      json: () => Promise<{ sub: string; name: string }>;
    }>();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        const authorization = new Headers(init?.headers).get("Authorization");
        return authorization === "Bearer token-b"
          ? accountB.promise
          : Promise.resolve({
              ok: true,
              json: async () => ({ sub: "account-a", name: "Account A" }),
            });
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ConnectivityProvider>
          <SessionProvider>
            <WorkspaceProvider>
              <TransactionsProvider>
                <HandoffProbe />
              </TransactionsProvider>
            </WorkspaceProvider>
          </SessionProvider>
        </ConnectivityProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("subject")).toHaveTextContent("account-a");
      expect(screen.getByTestId("sheet")).toHaveTextContent("sheet-a");
      expect(syncPendingTransactions).toHaveBeenCalled();
    });
    vi.mocked(syncPendingTransactions).mockClear();

    act(() => {
      queryClient.setQueryData(GOOGLE_TOKEN_QUERY_KEY, token("token-b"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("token")).toHaveTextContent("token-b");
      expect(screen.getByTestId("subject")).toHaveTextContent("waiting");
      expect(screen.getByTestId("sheet")).toHaveTextContent("none");
      expect(screen.getByTestId("workspace-ready")).toHaveTextContent(
        "false",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Add expense" }));
    fireEvent.click(screen.getByRole("button", { name: "Ensure sheet" }));
    await waitFor(() => {
      expect(screen.getByTestId("add-outcome")).toHaveTextContent("blocked");
      expect(screen.getByTestId("ensure-outcome")).toHaveTextContent(
        "blocked",
      );
    });
    expect(await db.transactions.count()).toBe(0);
    expect(ensureSheetReady).not.toHaveBeenCalled();
    expect(syncPendingTransactions).not.toHaveBeenCalled();

    accountB.resolve({
      ok: true,
      json: async () => ({ sub: "account-b", name: "Account B" }),
    });
    expect(await screen.findByText("account-b")).toBeInTheDocument();
  });
});
