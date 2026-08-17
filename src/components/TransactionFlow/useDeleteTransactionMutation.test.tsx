import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transactionQueryKeys } from "./transactionQueryKeys";
import { useDeleteTransactionMutation } from "./useDeleteTransactionMutation";

const providerMocks = vi.hoisted(() => ({
  deleteTransaction: vi.fn(),
}));

vi.mock("../../app/providers", () => ({
  useTransactions: () => ({
    deleteTransaction: providerMocks.deleteTransaction,
  }),
}));

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const realRefetch = queryClient.refetchQueries.bind(queryClient);
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const refetch = vi.spyOn(queryClient, "refetchQueries");

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }
  return { invalidate, queryClient, realRefetch, refetch, wrapper: Wrapper };
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
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useDeleteTransactionMutation(), {
      wrapper,
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

  it("starts remote history refresh without blocking deletion", async () => {
    const { invalidate, realRefetch, refetch, wrapper } = createHarness();
    refetch.mockImplementation((filters, options) =>
      filters?.queryKey?.[1] === "remote"
        ? new Promise(() => {})
        : realRefetch(filters, options),
    );
    const { result } = renderHook(() => useDeleteTransactionMutation(), {
      wrapper,
    });

    await act(async () => {
      await expect(result.current.mutateAsync("transaction-1")).resolves.toMatchObject({
        ok: true,
      });
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: transactionQueryKeys.history,
      refetchType: "none",
    });
    expect(refetch).toHaveBeenCalledWith({
      queryKey: ["transactionHistory", "remote"],
      type: "active",
    });
  });
});
