import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDeleteTransactionMutation } from "./useDeleteTransactionMutation";

const providerMocks = vi.hoisted(() => ({
  deleteTransaction: vi.fn(),
}));

vi.mock("../../app/providers", () => ({
  useTransactions: () => ({
    deleteTransaction: providerMocks.deleteTransaction,
  }),
}));

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

describe("useDeleteTransactionMutation", () => {
  beforeEach(() => {
    onlineManager.setOnline(true);
    providerMocks.deleteTransaction.mockReset();
    providerMocks.deleteTransaction.mockResolvedValue({
      ok: true,
      outcome: "pending",
      message: "Reimbursement removal queued",
    });
  });

  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it("settles immediately offline so exact Undo can delete a local child", async () => {
    onlineManager.setOnline(false);
    const { result } = renderHook(() => useDeleteTransactionMutation(), {
      wrapper: createWrapper(),
    });

    let record: unknown;
    await act(async () => {
      record = await result.current.mutateAsync("child-exact");
    });

    expect(providerMocks.deleteTransaction).toHaveBeenCalledWith(
      "child-exact",
    );
    expect(record).toEqual({
      ok: true,
      outcome: "pending",
      message: "Reimbursement removal queued",
    });
  });
});
