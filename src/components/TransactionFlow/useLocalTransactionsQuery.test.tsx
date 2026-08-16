import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import Dexie from "dexie";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../lib/db";
import type { TransactionRecord, TransactionStatus } from "../../lib/types";
import { useLocalTransactionsQuery } from "./useLocalTransactionsQuery";

const providerState = vi.hoisted(() => ({
  sheetId: "sheet-a" as string | null,
  userId: "user-a" as string | null,
}));

vi.mock("../../app/providers", () => ({
  useWorkspace: () => ({ sheetId: providerState.sheetId }),
  useSession: () => ({
    userProfile: providerState.userId
      ? { id: providerState.userId, name: "Test user", picture: null }
      : null,
  }),
}));

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
    targetSheetId: "sheet-a",
    targetUserId: "user-a",
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
    providerState.sheetId = "sheet-a";
    providerState.userId = "user-a";
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
      queryClient.getQueryData(["localTransactions", "sheet-a", "user-a"]),
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

  it("isolates rows and cache entries by the active sheet while surfacing legacy rows safely", async () => {
    await db.transactions.bulkPut([
      transaction("sheet-a-row", "pending", "2026-08-15T10:00:00.000Z"),
      {
        ...transaction("sheet-b-row", "pending", "2026-08-15T11:00:00.000Z"),
        targetSheetId: "sheet-b",
      },
      {
        ...transaction("legacy-row", "pending", "2026-08-15T12:00:00.000Z"),
        targetSheetId: undefined,
        targetUserId: undefined,
      },
    ]);
    const { queryClient, wrapper } = createHarness();
    const { result, rerender } = renderHook(
      () => useLocalTransactionsQuery(),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.data?.map(({ id }) => id)).toEqual([
        "legacy-row",
        "sheet-a-row",
      ]);
    });
    expect(result.current.data?.[0]).toMatchObject({
      id: "legacy-row",
      status: "error",
      error: expect.stringMatching(/cannot sync safely/i),
    });
    expect(
      queryClient.getQueryData(["localTransactions", "sheet-a", "user-a"]),
    ).toEqual(result.current.data);

    providerState.sheetId = "sheet-b";
    rerender();

    await waitFor(() => {
      expect(result.current.data?.map(({ id }) => id)).toEqual([
        "legacy-row",
        "sheet-b-row",
      ]);
    });
    expect(
      queryClient.getQueryData(["localTransactions", "sheet-b", "user-a"]),
    ).toEqual(result.current.data);
  });

  it("reacts to external Dexie adds, updates, and deletes without focus or invalidation", async () => {
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useLocalTransactionsQuery(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.data).toEqual([]));

    const externalDb = new Dexie("SheetLogDB");
    await externalDb.open();
    const externalTransactions = externalDb.table<TransactionRecord, string>(
      "transactions",
    );

    await externalTransactions.put(
      transaction("external-row", "pending", "2026-08-15T13:00:00.000Z"),
    );
    await waitFor(() => {
      expect(result.current.data?.[0]?.id).toBe("external-row");
      expect(result.current.data?.[0]?.note).toBeUndefined();
    });

    await externalTransactions.update("external-row", { note: "Changed elsewhere" });
    await waitFor(() => {
      expect(result.current.data?.[0]).toMatchObject({
        id: "external-row",
        note: "Changed elsewhere",
      });
    });

    await externalTransactions.delete("external-row");
    await waitFor(() => expect(result.current.data).toEqual([]));
    externalDb.close();
  });
});
