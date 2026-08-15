import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../lib/db";
import type { TransactionRecord, TransactionStatus } from "../../lib/types";
import { transactionQueryKeys } from "./transactionQueryKeys";
import { useLocalTransactionsQuery } from "./useLocalTransactionsQuery";

function transaction(
  id: string,
  status: TransactionStatus,
  createdAt: string,
): TransactionRecord {
  return {
    id,
    type: "expense",
    amount: 10,
    currency: "THB",
    account: "Wallet",
    for: "Me",
    category: "Food",
    date: createdAt,
    status,
    createdAt,
    updatedAt: createdAt,
  };
}

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  return { queryClient, wrapper: Wrapper };
}

describe("useLocalTransactionsQuery", () => {
  beforeEach(async () => {
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
    onlineManager.setOnline(true);
    await db.transactions.clear();
  });

  afterEach(async () => {
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
    onlineManager.setOnline(true);
    await db.transactions.clear();
  });

  it("returns pending and error rows newest first while excluding synced rows", async () => {
    await db.transactions.bulkPut([
      transaction("pending-old", "pending", "2026-08-15T08:00:00.000Z"),
      transaction("synced-new", "synced", "2026-08-15T11:00:00.000Z"),
      transaction("error-new", "error", "2026-08-15T10:00:00.000Z"),
    ]);
    const { queryClient, wrapper } = createHarness();

    const { result } = renderHook(() => useLocalTransactionsQuery(), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.data?.map(({ id }) => id)).toEqual([
        "error-new",
        "pending-old",
      ]);
    });
    expect(
      queryClient.getQueryData(transactionQueryKeys.local),
    ).toEqual(result.current.data);
  });

  it("reads Dexie when TanStack considers the browser offline", async () => {
    await db.transactions.put(
      transaction("offline-error", "error", "2026-08-15T12:00:00.000Z"),
    );
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: false,
    });
    onlineManager.setOnline(false);
    const { wrapper } = createHarness();

    const { result } = renderHook(() => useLocalTransactionsQuery(), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.data?.map(({ id }) => id)).toEqual([
        "offline-error",
      ]);
    });
    expect(result.current.fetchStatus).toBe("idle");
  });
});
