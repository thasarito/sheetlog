import { renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  TransactionsContext,
  useTransactions,
} from "../../app/providers/transactions/TransactionsContext";
import { stageBootstrap } from "../../lib/bootstrapClient";
import { BootstrapTransactionsProvider } from "./BootstrapTransactionsProvider";

vi.mock("../../lib/bootstrapClient", () => ({
  stageBootstrap: vi.fn(),
  cancelBootstrap: vi.fn().mockResolvedValue(undefined),
}));

const setup = {
  countryCode: "TH",
  currency: "THB" as const,
  account: {
    institutionId: "kbank",
    name: "KBank",
    mark: "K",
    color: "#138a56",
  },
};

const upstream = {
  queueCount: 0,
  recentCategories: { expense: [], income: [], transfer: [] },
  lastSyncError: null,
  lastSyncErrorAt: null,
  lastSyncAt: null,
  addTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  undoLast: vi.fn(),
  syncNow: vi.fn(),
  markRecentCategory: vi.fn(),
};

describe("BootstrapTransactionsProvider", () => {
  it("returns a staged record without calling the persistent provider", async () => {
    vi.mocked(stageBootstrap).mockResolvedValue({
      bootstrapId: "bootstrap-1",
      transactionId: "transaction-1",
      expiresAt: "2026-08-26T10:30:00.000Z",
    });
    const captured = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TransactionsContext.Provider value={upstream}>
        <BootstrapTransactionsProvider setup={setup} onCaptured={captured}>
          {children}
        </BootstrapTransactionsProvider>
      </TransactionsContext.Provider>
    );
    const { result } = renderHook(() => useTransactions(), { wrapper });
    const record = await result.current.addTransaction({
      type: "expense",
      amount: 120,
      currency: "THB",
      account: "KBank",
      for: "Me",
      category: "Coffee & Snacks",
      date: "2026-08-26T10:00:00.000Z",
    });
    expect(record).toMatchObject({ id: "transaction-1", status: "pending" });
    expect(upstream.addTransaction).not.toHaveBeenCalled();
    await waitFor(() => expect(captured).toHaveBeenCalledWith(record));
  });
});
