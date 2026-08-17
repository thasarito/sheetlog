import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionRecord } from "../../lib/types";
import type { TransactionBaseAmountState } from "./transactionBaseAmounts";
import { TopDashboard } from "./TopDashboard";

const mocks = vi.hoisted(() => ({
  local: [] as TransactionRecord[],
  recent: [] as TransactionRecord[],
  lastSyncAt: null as string | null,
  baseAmountStates: {} as Record<string, TransactionBaseAmountState>,
}));

vi.mock("../../app/providers", () => ({
  useTransactions: () => ({
    queueCount: mocks.local.length,
    lastSyncAt: mocks.lastSyncAt,
  }),
}));

vi.mock("./useRecentTransactionsQuery", () => ({
  useRecentTransactionsQuery: () => ({
    data: mocks.recent,
    isLoading: false,
  }),
}));

vi.mock("./useLocalTransactionsQuery", () => ({
  useLocalTransactionsQuery: () => ({
    data: mocks.local,
    isLoading: false,
  }),
}));

vi.mock("./useTransactionBaseAmounts", () => ({
  useTransactionBaseAmounts: () => ({
    states: mocks.baseAmountStates,
    refetch: vi.fn(),
    isRefreshing: false,
  }),
}));

vi.mock("../ui/AnimatedNumber", () => ({
  AnimatedNumber: ({ value, prefix }: { value: number; prefix: string }) => (
    <span>{`${prefix}${value}`}</span>
  ),
}));

function transaction(
  id: string,
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  return {
    id,
    type: "expense",
    amount: 10,
    currency: "THB",
    account: "Wallet",
    for: "Me",
    category: id,
    date: "2026-08-15T08:00:00.000Z",
    status: "synced",
    createdAt: "2026-08-15T08:00:00.000Z",
    updatedAt: "2026-08-15T08:00:00.000Z",
    sheetId: "sheet-a",
    sheetRow: 2,
    sheetRowValid: true,
    ...overrides,
  };
}

function renderDashboard(
  onEditTransaction?: (transaction: TransactionRecord) => void,
  onViewAll?: () => void,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TopDashboard
        baseCurrency="THB"
        onEditTransaction={onEditTransaction}
        onViewAll={onViewAll}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-15T08:00:00.000Z"));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  mocks.local = [];
  mocks.recent = [];
  mocks.lastSyncAt = null;
  mocks.baseAmountStates = {};
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TopDashboard local reconciliation", () => {
  it("shows pending and error rows ahead of older remote rows with local duplicates winning", () => {
    mocks.local = [
      transaction("pending-local", {
        category: "Pending local",
        status: "pending",
        createdAt: "2026-08-15T11:00:00.000Z",
      }),
      transaction("duplicate", {
        category: "Local duplicate",
        status: "error",
        error: "Could not sync this reimbursement",
        createdAt: "2026-08-15T10:00:00.000Z",
      }),
    ];
    mocks.recent = [
      transaction("duplicate", {
        category: "Remote duplicate",
        amount: 999,
        createdAt: "2026-08-15T09:00:00.000Z",
      }),
      transaction("remote", {
        category: "Remote row",
        createdAt: "2026-08-15T08:00:00.000Z",
      }),
    ];

    renderDashboard();

    const labels = screen
      .getAllByRole("button")
      .filter((button) => button.textContent !== "View all")
      .map((button) => button.textContent ?? "");
    expect(labels[0]).toContain("Pending local");
    expect(labels[1]).toContain("Local duplicate");
    expect(labels[2]).toContain("Remote row");
    expect(screen.queryByText("Remote duplicate")).not.toBeInTheDocument();
  });

  it("opens the complete transaction history from the Recent header", async () => {
    const onViewAll = vi.fn();
    const user = userEvent.setup();
    renderDashboard(undefined, onViewAll);

    await user.click(screen.getByRole("button", { name: "View all transactions" }));

    expect(onViewAll).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Recent")).toBeInTheDocument();
  });

  it("orders backdated transactions by transaction date before creation time", () => {
    mocks.recent = [
      transaction("created-later", {
        category: "Backdated",
        date: "2026-08-01T08:00:00.000Z",
        createdAt: "2026-08-15T12:00:00.000Z",
      }),
      transaction("created-earlier", {
        category: "Current date",
        date: "2026-08-14T08:00:00.000Z",
        createdAt: "2026-08-14T09:00:00.000Z",
      }),
    ];

    renderDashboard();

    const labels = screen
      .getAllByRole("button")
      .filter((button) => button.textContent !== "View all")
      .map((button) => button.textContent ?? "");
    expect(labels[0]).toContain("Current date");
    expect(labels[1]).toContain("Backdated");
  });

  it("announces an actionable sync failure and passes the exact local record", async () => {
    const errorRow = transaction("failed-child", {
      type: "income",
      category: "Reimbursement",
      note: "Lunch repayment",
      status: "error",
      error: "Original expense changed currency",
      reimbursesTransactionId: "expense-1",
    });
    mocks.local = [errorRow];
    const onEditTransaction = vi.fn();
    const user = userEvent.setup();

    renderDashboard(onEditTransaction);

    expect(screen.getByText("Sync failed")).toBeInTheDocument();
    expect(
      screen.getByText("Original expense changed currency"),
    ).toBeInTheDocument();
    const failedStatus = screen.getByRole("status", { name: "Sync failed" });
    expect(failedStatus).toHaveAccessibleName("Sync failed");

    await user.click(
      screen.getByRole("button", { name: /Reimbursement.*Sync failed/i }),
    );
    expect(onEditTransaction).toHaveBeenCalledWith(errorRow);
  });

  it("labels a legacy synced row read-only and never opens it for editing", async () => {
    const legacyRow = transaction("row-8", {
      category: "Legacy row",
      sheetRow: 8,
      sheetRowValid: false,
    });
    mocks.recent = [legacyRow];
    const onEditTransaction = vi.fn();
    const user = userEvent.setup();

    renderDashboard(onEditTransaction);

    const row = screen.getByRole("button", {
      name: /Legacy row.*Read only/i,
    });
    expect(row).toBeDisabled();
    await user.click(row);
    expect(onEditTransaction).not.toHaveBeenCalled();
  });

  it("keeps gross expense totals deduplicated with the local row authoritative", () => {
    mocks.local = [
      transaction("duplicate", {
        amount: 40,
        status: "pending",
        createdAt: "2026-08-15T10:00:00.000Z",
      }),
      transaction("local-error", {
        amount: 20,
        status: "error",
        error: "Network unavailable",
        createdAt: "2026-08-15T09:00:00.000Z",
      }),
    ];
    mocks.recent = [
      transaction("duplicate", { amount: 999 }),
      transaction("remote", { amount: 10 }),
    ];

    renderDashboard();

    expect(screen.getByText("฿70")).toBeInTheDocument();
    expect(screen.queryByText("฿1029")).not.toBeInTheDocument();
  });

  it("shows a quiet base-currency approximation only for a foreign row", () => {
    mocks.recent = [
      transaction("foreign", {
        amount: 3,
        currency: "USD",
        category: "Foreign coffee",
      }),
      transaction("base", {
        amount: 40,
        currency: "THB",
        category: "Local lunch",
      }),
    ];
    mocks.baseAmountStates = {
      foreign: { status: "ready", currency: "THB", amount: 100 },
    };

    renderDashboard();

    expect(screen.getByText("≈ −฿100.00")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Foreign coffee.*approximately minus 100\.00 THB/i,
      }),
    ).toBeEnabled();
    expect(
      screen.getByText("Local lunch").closest("button"),
    ).not.toHaveTextContent("≈");
  });
});
