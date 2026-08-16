import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionInput, TransactionRecord } from "../../lib/types";
import type { TransactionFormValues } from "./transactionSchema";
import { transactionQueryKeys } from "./transactionQueryKeys";
import { useAddTransactionMutation } from "./useAddTransactionMutation";

const mocks = vi.hoisted(() => ({
  addTransaction: vi.fn(),
}));

vi.mock("../../app/providers", () => ({
  useTransactions: () => ({ addTransaction: mocks.addTransaction }),
}));

function created(input: TransactionInput): TransactionRecord {
  return {
    ...input,
    id: "transaction-1",
    status: "synced",
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
  return { invalidate, queryClient, wrapper: Wrapper };
}

function validValues(
  overrides: Partial<TransactionFormValues> = {},
): TransactionFormValues {
  return {
    type: "expense",
    category: "Food",
    amount: "42",
    currency: "THB",
    account: "Wallet",
    forValue: "Me",
    dateObject: new Date("2026-08-15T08:00:00.000Z"),
    note: "Central Cafe",
    ...overrides,
  };
}

describe("useAddTransactionMutation", () => {
  beforeEach(() => {
    mocks.addTransaction.mockReset();
    mocks.addTransaction.mockImplementation(async (input: TransactionInput) =>
      created(input),
    );
  });

  it("passes selected place metadata to the transaction provider", async () => {
    const { queryClient, wrapper } = createHarness();
    const { result } = renderHook(() => useAddTransactionMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync(
        validValues({
          place: { provider: "google", placeId: "central-cafe" },
        }),
      );
    });

    expect(mocks.addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        note: "Central Cafe",
        place: { provider: "google", placeId: "central-cafe" },
      }),
    );
    queryClient.clear();
  });

  it("omits the place property for ordinary free-text transactions", async () => {
    const { invalidate, queryClient, wrapper } = createHarness();
    const { result } = renderHook(() => useAddTransactionMutation(), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync(validValues());
    });

    const input = mocks.addTransaction.mock.calls[0]?.[0] as TransactionInput;
    expect(Object.hasOwn(input, "place")).toBe(false);
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: transactionQueryKeys.history,
      });
    });
    queryClient.clear();
  });
});
