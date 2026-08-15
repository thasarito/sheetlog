import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionRecord } from "../../lib/types";
import {
  UpdateTransactionRecordError,
  useUpdateTransactionMutation,
} from "./useUpdateTransactionMutation";

const mocks = vi.hoisted(() => ({
  updateTransaction: vi.fn(),
}));

vi.mock("../../app/providers", () => ({
  useTransactions: () => ({
    updateTransaction: mocks.updateTransaction,
  }),
}));

function transaction(
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  return {
    id: "linked-child",
    type: "income",
    amount: 30,
    currency: "THB",
    account: "Bank",
    for: "Family",
    category: "Reimbursement",
    date: "2026-08-15T09:00:00.000Z",
    note: "Lunch repayment",
    reimbursesTransactionId: "expense-1",
    status: "error",
    error: "Amount exceeds remaining reimbursement balance",
    createdAt: "2026-08-15T09:00:00.000Z",
    updatedAt: "2026-08-15T10:00:00.000Z",
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe("useUpdateTransactionMutation", () => {
  beforeEach(() => {
    mocks.updateTransaction.mockReset();
  });

  it("rejects an error status with the latest record attached", async () => {
    const latestRecord = transaction();
    mocks.updateTransaction.mockResolvedValue(latestRecord);
    const { result } = renderHook(() => useUpdateTransactionMutation(), {
      wrapper: createWrapper(),
    });

    let rejection: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({
          id: latestRecord.id,
          input: { note: "Retry note" },
        });
      } catch (error) {
        rejection = error;
      }
    });

    expect(rejection).toBeInstanceOf(UpdateTransactionRecordError);
    expect(rejection).toMatchObject({
      name: "UpdateTransactionRecordError",
      message: "Amount exceeds remaining reimbursement balance",
    });
    expect((rejection as UpdateTransactionRecordError).record).toBe(
      latestRecord,
    );
  });
});
