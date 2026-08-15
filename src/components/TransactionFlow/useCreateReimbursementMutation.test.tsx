import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REIMBURSEMENT_CATEGORY } from "../../lib/reimbursements";
import type { TransactionInput, TransactionRecord } from "../../lib/types";
import { transactionQueryKeys } from "./transactionQueryKeys";
import { useCreateReimbursementMutation } from "./useCreateReimbursementMutation";

const providerMocks = vi.hoisted(() => ({
  addTransaction: vi.fn(),
  sheetId: "sheet-a" as string | null,
}));

vi.mock("../../app/providers", () => ({
  useTransactions: () => ({ addTransaction: providerMocks.addTransaction }),
  useWorkspace: () => ({ sheetId: providerMocks.sheetId }),
}));

function source(
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  return {
    id: "expense-1",
    type: "expense",
    amount: 100,
    currency: "THB",
    account: "Wallet",
    for: "Household",
    category: "Food",
    date: "2026-08-15T08:00:00.000Z",
    note: "Lunch",
    status: "synced",
    createdAt: "2026-08-15T08:00:00.000Z",
    updatedAt: "2026-08-15T08:00:00.000Z",
    sheetRowValid: true,
    ...overrides,
  };
}

function created(
  input: TransactionInput,
  status: TransactionRecord["status"] = "synced",
): TransactionRecord {
  return {
    ...input,
    id: "child-1",
    status,
    createdAt: "2026-08-15T09:00:00.000Z",
    updatedAt: "2026-08-15T09:00:00.000Z",
  };
}

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }
  return { queryClient, invalidate, wrapper: Wrapper };
}

function validVariables() {
  return {
    source: source(),
    amount: "40",
    remaining: 60,
    account: "Bank",
    date: new Date("2026-08-15T10:30:00.000Z"),
    note: "  Paid me back  ",
  };
}

describe("useCreateReimbursementMutation", () => {
  beforeEach(() => {
    onlineManager.setOnline(true);
    providerMocks.addTransaction.mockReset();
    providerMocks.sheetId = "sheet-a";
  });

  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it("derives every locked field from the source and returns the exact child", async () => {
    providerMocks.addTransaction.mockImplementation(
      async (input: TransactionInput) => created(input),
    );
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useCreateReimbursementMutation(), {
      wrapper,
    });
    const variables = {
      ...validVariables(),
      type: "expense",
      category: "Tampered",
      currency: "USD",
      for: "Someone else",
      reimbursesTransactionId: "other-source",
    } as ReturnType<typeof validVariables>;

    const record = await result.current.mutateAsync(variables);

    expect(providerMocks.addTransaction).toHaveBeenCalledWith({
      type: "income",
      category: REIMBURSEMENT_CATEGORY,
      amount: 40,
      currency: "THB",
      account: "Bank",
      for: "Household",
      date: "2026-08-15T10:30:00",
      note: "Paid me back",
      reimbursesTransactionId: "expense-1",
    });
    expect(record).toMatchObject({ id: "child-1", status: "synced" });
  });

  it.each(["", "   ", "0", "-1", "12abc", "Infinity", "NaN"])(
    "rejects invalid amount %j before creating a row",
    async (amount) => {
      const { wrapper } = createHarness();
      const { result } = renderHook(() => useCreateReimbursementMutation(), {
        wrapper,
      });

      await expect(
        result.current.mutateAsync({ ...validVariables(), amount }),
      ).rejects.toThrow("Enter a valid reimbursement amount");
      expect(providerMocks.addTransaction).not.toHaveBeenCalled();
    },
  );

  it("rejects an amount above the current remaining balance", async () => {
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useCreateReimbursementMutation(), {
      wrapper,
    });

    await expect(
      result.current.mutateAsync({ ...validVariables(), amount: "60.01" }),
    ).rejects.toThrow("Amount exceeds remaining reimbursement balance");
    expect(providerMocks.addTransaction).not.toHaveBeenCalled();
  });

  it("treats a valid offline pending child as success", async () => {
    providerMocks.addTransaction.mockImplementation(
      async (input: TransactionInput) => created(input, "pending"),
    );
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useCreateReimbursementMutation(), {
      wrapper,
    });

    await expect(
      result.current.mutateAsync(validVariables()),
    ).resolves.toMatchObject({ id: "child-1", status: "pending" });
  });

  it("executes immediately while offline so the provider can queue locally", async () => {
    providerMocks.addTransaction.mockImplementation(
      async (input: TransactionInput) => created(input, "pending"),
    );
    onlineManager.setOnline(false);
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useCreateReimbursementMutation(), {
      wrapper,
    });

    const record = await result.current.mutateAsync(validVariables());

    expect(providerMocks.addTransaction).toHaveBeenCalledTimes(1);
    expect(record.status).toBe("pending");
  });

  it("throws an actionable provider error while leaving the created error row intact", async () => {
    providerMocks.addTransaction.mockImplementation(
      async (input: TransactionInput) => ({
        ...created(input, "error"),
        error: "Amount exceeds remaining reimbursement balance",
      }),
    );
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useCreateReimbursementMutation(), {
      wrapper,
    });

    await expect(result.current.mutateAsync(validVariables())).rejects.toThrow(
      "Amount exceeds remaining reimbursement balance",
    );
    expect(providerMocks.addTransaction).toHaveBeenCalledTimes(1);
  });

  it("invalidates local, recent, and the exact source summary after settlement", async () => {
    providerMocks.addTransaction.mockImplementation(
      async (input: TransactionInput) => created(input, "pending"),
    );
    const { invalidate, wrapper } = createHarness();
    const { result } = renderHook(() => useCreateReimbursementMutation(), {
      wrapper,
    });

    await result.current.mutateAsync(validVariables());
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: transactionQueryKeys.local,
      });
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["recentTransactions"],
      });
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: transactionQueryKeys.reimbursement("sheet-a", "expense-1"),
      });
    });
  });
});
