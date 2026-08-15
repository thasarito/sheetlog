import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../lib/db";
import { readTransactionById } from "../../lib/google";
import type { TransactionRecord, TransactionStatus } from "../../lib/types";
import { transactionQueryKeys } from "./transactionQueryKeys";
import { useTransactionByIdQuery } from "./useTransactionByIdQuery";

const providerState = vi.hoisted(() => ({
  accessToken: "access-token" as string | null,
  sheetId: "sheet-a" as string | null,
  userId: "user-a" as string | null,
  isOnline: true,
}));

vi.mock("../../app/providers", () => ({
  useSession: () => ({
    accessToken: providerState.accessToken,
    userProfile: providerState.userId
      ? { id: providerState.userId, name: "Test user", picture: null }
      : null,
  }),
  useWorkspace: () => ({ sheetId: providerState.sheetId }),
  useConnectivity: () => ({ isOnline: providerState.isOnline }),
}));

vi.mock("../../lib/google", () => ({
  readTransactionById: vi.fn(),
}));

function transaction(
  id: string,
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  return {
    id,
    type: "expense",
    amount: 100,
    currency: "THB",
    account: "Wallet",
    for: "Me",
    category: "Food",
    date: "2026-08-15T08:00:00.000Z",
    status: "synced",
    createdAt: "2026-08-15T08:00:00.000Z",
    updatedAt: "2026-08-15T08:00:00.000Z",
    targetSheetId: "sheet-a",
    targetUserId: "user-a",
    sheetId: "sheet-a",
    sheetRow: 2,
    sheetRowValid: true,
    ...overrides,
  };
}

function localOnly(id: string, status: TransactionStatus) {
  return transaction(id, {
    status,
    sheetId: undefined,
    sheetRow: undefined,
  });
}

function createHarness({ gcTime = 0 }: { gcTime?: number } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime,
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("useTransactionByIdQuery", () => {
  beforeEach(async () => {
    providerState.accessToken = "access-token";
    providerState.sheetId = "sheet-a";
    providerState.userId = "user-a";
    providerState.isOnline = true;
    onlineManager.setOnline(true);
    vi.mocked(readTransactionById).mockReset();
    await db.transactions.clear();
  });

  afterEach(async () => {
    onlineManager.setOnline(true);
    vi.restoreAllMocks();
    await db.transactions.clear();
  });

  it.each(["pending", "error"] as const)(
    "treats a genuinely local-only %s source as authoritative",
    async (status) => {
      const pendingSource = localOnly("local-expense", status);
      await db.transactions.put(pendingSource);
      const { wrapper } = createHarness();

      const { result } = renderHook(
        () => useTransactionByIdQuery("local-expense"),
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.data).toEqual(pendingSource);
      });
      expect(readTransactionById).not.toHaveBeenCalled();
    },
  );

  it("uses a synced Dexie row only as a placeholder and returns the current remote row", async () => {
    const staleDexieSource = transaction("expense-1", { amount: 100 });
    await db.transactions.put(staleDexieSource);
    const currentRemote = transaction("expense-1", {
      amount: 125,
      sheetRow: 9,
    });
    vi.mocked(readTransactionById).mockResolvedValue(currentRemote);
    const { queryClient, wrapper } = createHarness();

    const { result } = renderHook(
      () => useTransactionByIdQuery("expense-1"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.data).toEqual(currentRemote);
    });
    expect(readTransactionById).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      "expense-1",
    );
    expect(
      queryClient.getQueryData(
        transactionQueryKeys.transaction("sheet-a", "user-a", "expense-1"),
      ),
    ).toEqual(currentRemote);
    expect(
      queryClient.getQueryData(
        transactionQueryKeys.transactionFallback(
          "sheet-a",
          "user-a",
          "expense-1",
        ),
      ),
    ).toEqual(staleDexieSource);
  });

  it("does not expose a recent-cache placeholder as authoritative while online", async () => {
    const cachedSource = transaction("expense-1", { amount: 100 });
    const currentRemote = transaction("expense-1", {
      type: "income",
      currency: "USD",
      amount: 80,
    });
    vi.mocked(readTransactionById).mockResolvedValue(currentRemote);
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(transactionQueryKeys.recent("sheet-a", "user-a"), [
      cachedSource,
    ]);

    const { result } = renderHook(
      () => useTransactionByIdQuery("expense-1"),
      { wrapper },
    );

    expect(result.current.data).toBeUndefined();
    await waitFor(() => {
      expect(result.current.data).toEqual(currentRemote);
    });
    expect(result.current.data).not.toEqual(cachedSource);
  });

  it("observes an authoritative remote deletion instead of a stale local row", async () => {
    await db.transactions.put(transaction("deleted-source"));
    vi.mocked(readTransactionById).mockResolvedValue(null);
    const { wrapper } = createHarness();

    const { result } = renderHook(
      () => useTransactionByIdQuery("deleted-source"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data).toBeNull();
    });
  });

  it("observes remote source type and currency changes", async () => {
    await db.transactions.put(transaction("changed-source"));
    const changedRemote = transaction("changed-source", {
      type: "income",
      currency: "USD",
    });
    vi.mocked(readTransactionById).mockResolvedValue(changedRemote);
    const { wrapper } = createHarness();

    const { result } = renderHook(
      () => useTransactionByIdQuery("changed-source"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.data).toMatchObject({
        type: "income",
        currency: "USD",
      });
    });
  });

  it("uses a synced Dexie placeholder offline without making a remote request", async () => {
    providerState.isOnline = false;
    onlineManager.setOnline(false);
    const cachedSource = transaction("offline-dexie");
    await db.transactions.put(cachedSource);
    const { wrapper } = createHarness();

    const { result } = renderHook(
      () => useTransactionByIdQuery("offline-dexie"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.data).toEqual(cachedSource);
    });
    expect(readTransactionById).not.toHaveBeenCalled();
  });

  it("does not expose a local record owned by another workspace account", async () => {
    providerState.isOnline = false;
    onlineManager.setOnline(false);
    const otherAccount = localOnly("other-account-source", "pending");
    await db.transactions.put({
      ...otherAccount,
      targetUserId: "user-b",
    });
    const { wrapper } = createHarness();

    const { result } = renderHook(
      () => useTransactionByIdQuery(otherAccount.id),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data).toBeNull();
    });
    expect(readTransactionById).not.toHaveBeenCalled();
  });

  it("does not read a transaction before the Google account identity is verified", async () => {
    providerState.userId = null;
    vi.mocked(readTransactionById).mockResolvedValue(
      transaction("unverified-source"),
    );
    const { wrapper } = createHarness();

    const { result } = renderHook(
      () => useTransactionByIdQuery("unverified-source"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data).toBeNull();
    });
    expect(readTransactionById).not.toHaveBeenCalled();
  });

  it("drops account A's mounted local source when account B uses the same sheet", async () => {
    providerState.isOnline = false;
    onlineManager.setOnline(false);
    const accountASource = localOnly("same-sheet-source", "pending");
    await db.transactions.put(accountASource);
    const { wrapper } = createHarness({ gcTime: 60_000 });

    const { result, rerender } = renderHook(
      () => useTransactionByIdQuery(accountASource.id),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.data).toEqual(accountASource);
    });

    providerState.userId = "user-b";
    rerender();

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data).toBeNull();
    });
    expect(readTransactionById).not.toHaveBeenCalled();
  });

  it("uses the recent query cache offline when Dexie has no source", async () => {
    providerState.isOnline = false;
    onlineManager.setOnline(false);
    const cachedSource = transaction("recent-source");
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(transactionQueryKeys.recent("sheet-a", "user-a"), [
      cachedSource,
    ]);

    const { result } = renderHook(
      () => useTransactionByIdQuery("recent-source"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.data).toEqual(cachedSource);
    });
    expect(readTransactionById).not.toHaveBeenCalled();
  });

  it("gates a mounted pending-to-synced refresh and returns current Dexie data", async () => {
    providerState.isOnline = false;
    const pendingSource = localOnly("mounted-sync", "pending");
    await db.transactions.put(pendingSource);
    const { queryClient, wrapper } = createHarness();
    const { result } = renderHook(
      () => useTransactionByIdQuery("mounted-sync"),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.data).toEqual(pendingSource);
      expect(result.current.isChecking).toBe(false);
    });
    expect(
      queryClient.getQueryData(
        transactionQueryKeys.transaction("sheet-a", "user-a", "mounted-sync"),
      ),
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(
        transactionQueryKeys.transactionFallback(
          "sheet-a",
          "user-a",
          "mounted-sync",
        ),
      ),
    ).toEqual(pendingSource);

    const syncedSource = transaction("mounted-sync", {
      amount: 135,
      status: "synced",
      sheetId: "sheet-a",
      sheetRow: 8,
    });
    await db.transactions.put(syncedSource);
    const sourceLookup = deferred<TransactionRecord | undefined>();
    vi.spyOn(db.transactions, "get").mockReturnValueOnce(
      sourceLookup.promise as never,
    );

    let invalidation!: Promise<void>;
    act(() => {
      invalidation = queryClient.invalidateQueries({
        queryKey: transactionQueryKeys.transaction(
          "sheet-a",
          "user-a",
          "mounted-sync",
        ),
      });
    });
    await waitFor(() => {
      expect(result.current.isChecking).toBe(true);
    });

    sourceLookup.resolve(syncedSource);
    await act(async () => {
      await invalidation;
    });
    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
      expect(result.current.data).toEqual(syncedSource);
    });
    expect(readTransactionById).not.toHaveBeenCalled();
  });

  it("drops a mounted pending fallback after Dexie deletion and query invalidation", async () => {
    providerState.isOnline = false;
    const pendingSource = localOnly("mounted-delete", "pending");
    await db.transactions.put(pendingSource);
    const { queryClient, wrapper } = createHarness();
    const { result } = renderHook(
      () => useTransactionByIdQuery("mounted-delete"),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.data).toEqual(pendingSource);
    });

    await db.transactions.delete("mounted-delete");
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: transactionQueryKeys.transaction(
          "sheet-a",
          "user-a",
          "mounted-delete",
        ),
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.isChecking).toBe(false);
      expect(result.current.data).toBeNull();
    });
    expect(readTransactionById).not.toHaveBeenCalled();
  });

  it.each(["synced", "deleted"] as const)(
    "refreshes a cached pending fallback after unmount/remount when Dexie is %s",
    async (transition) => {
      providerState.isOnline = false;
      const pendingSource = localOnly(`remount-${transition}`, "pending");
      await db.transactions.put(pendingSource);
      const { wrapper } = createHarness({ gcTime: 60_000 });
      const firstMount = renderHook(
        () => useTransactionByIdQuery(`remount-${transition}`),
        { wrapper },
      );
      await waitFor(() => {
        expect(firstMount.result.current.data).toEqual(pendingSource);
      });
      firstMount.unmount();

      const syncedSource = transaction(`remount-${transition}`, {
        amount: 145,
        status: "synced",
        sheetId: "sheet-a",
        sheetRow: 9,
      });
      if (transition === "synced") {
        await db.transactions.put(syncedSource);
      } else {
        await db.transactions.delete(`remount-${transition}`);
      }

      const remounted = renderHook(
        () => useTransactionByIdQuery(`remount-${transition}`),
        { wrapper },
      );
      expect(remounted.result.current.isChecking).toBe(true);
      await waitFor(() => {
        expect(remounted.result.current.isChecking).toBe(false);
        expect(remounted.result.current.data).toEqual(
          transition === "synced" ? syncedSource : null,
        );
      });
      expect(readTransactionById).not.toHaveBeenCalled();
    },
  );

  it("prefers current Dexie data over a stale local-fallback cache", async () => {
    providerState.isOnline = false;
    const staleFallback = transaction("fallback-provenance", { amount: 80 });
    const currentDexie = transaction("fallback-provenance", { amount: 150 });
    await db.transactions.put(currentDexie);
    const { queryClient, wrapper } = createHarness({ gcTime: 60_000 });
    queryClient.setQueryData(
      transactionQueryKeys.transactionFallback(
        "sheet-a",
        "user-a",
        "fallback-provenance",
      ),
      staleFallback,
    );

    const { result } = renderHook(
      () => useTransactionByIdQuery("fallback-provenance"),
      { wrapper },
    );

    expect(result.current.isChecking).toBe(true);
    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
      expect(result.current.data).toEqual(currentDexie);
    });
  });

  it("keeps an in-memory authoritative deletion offline instead of reviving stale Dexie", async () => {
    providerState.isOnline = false;
    const staleSource = transaction("deleted-source");
    await db.transactions.put(staleSource);
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(
      transactionQueryKeys.transaction(
        "sheet-a",
        "user-a",
        "deleted-source",
      ),
      null,
    );

    const { result } = renderHook(
      () => useTransactionByIdQuery("deleted-source"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data).toBeNull();
      expect(result.current.fetchStatus).toBe("idle");
    });
    expect(readTransactionById).not.toHaveBeenCalled();
  });

  it("keeps an in-memory current remote source offline over stale synced Dexie", async () => {
    providerState.isOnline = false;
    await db.transactions.put(
      transaction("cached-current-source", { amount: 100 }),
    );
    const currentRemote = transaction("cached-current-source", {
      amount: 145,
      sheetRow: 12,
    });
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(
      transactionQueryKeys.transaction(
        "sheet-a",
        "user-a",
        "cached-current-source",
      ),
      currentRemote,
    );

    const { result } = renderHook(
      () => useTransactionByIdQuery("cached-current-source"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.data).toEqual(currentRemote);
      expect(result.current.fetchStatus).toBe("idle");
    });
    expect(readTransactionById).not.toHaveBeenCalled();
  });

  it("refreshes an offline placeholder when connectivity returns", async () => {
    providerState.isOnline = false;
    const staleSource = transaction("reconnected-source", { amount: 100 });
    const currentRemote = transaction("reconnected-source", { amount: 140 });
    await db.transactions.put(staleSource);
    vi.mocked(readTransactionById).mockResolvedValue(currentRemote);
    const { wrapper } = createHarness();

    const { result, rerender } = renderHook(
      () => useTransactionByIdQuery("reconnected-source"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.data).toEqual(staleSource);
    });
    providerState.isOnline = true;
    rerender();

    await waitFor(() => {
      expect(result.current.data).toEqual(currentRemote);
    });
    expect(readTransactionById).toHaveBeenCalledTimes(1);
  });

  it("performs an authoritative fetch when connectivity returns during the Dexie lookup", async () => {
    providerState.isOnline = false;
    const staleSource = transaction("in-flight-reconnect", { amount: 100 });
    const currentRemote = transaction("in-flight-reconnect", { amount: 155 });
    const sourceLookup = deferred<TransactionRecord | undefined>();
    const getSource = vi
      .spyOn(db.transactions, "get")
      .mockImplementation(() => sourceLookup.promise as never);
    vi.mocked(readTransactionById).mockResolvedValue(currentRemote);
    const { wrapper } = createHarness();

    const { result, rerender } = renderHook(
      () => useTransactionByIdQuery("in-flight-reconnect"),
      { wrapper },
    );
    await waitFor(() => {
      expect(getSource).toHaveBeenCalledTimes(1);
    });

    providerState.isOnline = true;
    rerender();
    expect(readTransactionById).not.toHaveBeenCalled();

    sourceLookup.resolve(staleSource);
    await waitFor(() => {
      expect(readTransactionById).toHaveBeenCalledWith(
        "access-token",
        "sheet-a",
        "in-flight-reconnect",
      );
      expect(result.current.data).toEqual(currentRemote);
    });
    expect(readTransactionById).toHaveBeenCalledTimes(1);
  });

  it("performs an authoritative fetch when credentials arrive during the Dexie lookup", async () => {
    providerState.accessToken = null;
    const staleSource = transaction("in-flight-auth", { amount: 100 });
    const currentRemote = transaction("in-flight-auth", { amount: 165 });
    const sourceLookup = deferred<TransactionRecord | undefined>();
    const getSource = vi
      .spyOn(db.transactions, "get")
      .mockImplementation(() => sourceLookup.promise as never);
    vi.mocked(readTransactionById).mockResolvedValue(currentRemote);
    const { wrapper } = createHarness();

    const { result, rerender } = renderHook(
      () => useTransactionByIdQuery("in-flight-auth"),
      { wrapper },
    );
    await waitFor(() => {
      expect(getSource).toHaveBeenCalledTimes(1);
    });

    providerState.accessToken = "fresh-access-token";
    rerender();
    expect(readTransactionById).not.toHaveBeenCalled();

    sourceLookup.resolve(staleSource);
    await waitFor(() => {
      expect(readTransactionById).toHaveBeenCalledWith(
        "fresh-access-token",
        "sheet-a",
        "in-flight-auth",
      );
      expect(result.current.data).toEqual(currentRemote);
    });
    expect(readTransactionById).toHaveBeenCalledTimes(1);
  });

  it("does not replace a cached query's active Dexie lookup when connectivity returns", async () => {
    providerState.isOnline = false;
    const cachedSource = transaction("cached-in-flight-reconnect", {
      amount: 90,
    });
    const staleDexieSource = transaction("cached-in-flight-reconnect", {
      amount: 100,
    });
    const currentRemote = transaction("cached-in-flight-reconnect", {
      amount: 175,
    });
    const sourceLookup = deferred<TransactionRecord | undefined>();
    const getSource = vi
      .spyOn(db.transactions, "get")
      .mockImplementation(() => sourceLookup.promise as never);
    vi.mocked(readTransactionById).mockResolvedValue(currentRemote);
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(
      transactionQueryKeys.transaction(
        "sheet-a",
        "user-a",
        "cached-in-flight-reconnect",
      ),
      cachedSource,
    );

    const { result, rerender } = renderHook(
      () => useTransactionByIdQuery("cached-in-flight-reconnect"),
      { wrapper },
    );
    expect(result.current.data).toEqual(cachedSource);
    await waitFor(() => {
      expect(getSource).toHaveBeenCalledTimes(1);
      expect(result.current.isFetching).toBe(true);
    });

    providerState.isOnline = true;
    rerender();
    sourceLookup.resolve(staleDexieSource);

    await waitFor(() => {
      expect(result.current.data).toEqual(currentRemote);
      expect(result.current.isFetching).toBe(false);
    });
    expect(getSource).toHaveBeenCalledTimes(1);
    expect(readTransactionById).toHaveBeenCalledTimes(1);
  });

  it("does not replace a cached query's active Dexie lookup when credentials arrive", async () => {
    providerState.accessToken = null;
    const cachedSource = transaction("cached-in-flight-auth", { amount: 90 });
    const staleDexieSource = transaction("cached-in-flight-auth", {
      amount: 100,
    });
    const currentRemote = transaction("cached-in-flight-auth", {
      amount: 185,
    });
    const sourceLookup = deferred<TransactionRecord | undefined>();
    const getSource = vi
      .spyOn(db.transactions, "get")
      .mockImplementation(() => sourceLookup.promise as never);
    vi.mocked(readTransactionById).mockResolvedValue(currentRemote);
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(
      transactionQueryKeys.transaction(
        "sheet-a",
        "user-a",
        "cached-in-flight-auth",
      ),
      cachedSource,
    );

    const { result, rerender } = renderHook(
      () => useTransactionByIdQuery("cached-in-flight-auth"),
      { wrapper },
    );
    expect(result.current.data).toEqual(cachedSource);
    await waitFor(() => {
      expect(getSource).toHaveBeenCalledTimes(1);
      expect(result.current.isFetching).toBe(true);
    });

    providerState.accessToken = "fresh-access-token";
    rerender();
    sourceLookup.resolve(staleDexieSource);

    await waitFor(() => {
      expect(result.current.data).toEqual(currentRemote);
      expect(result.current.isFetching).toBe(false);
    });
    expect(getSource).toHaveBeenCalledTimes(1);
    expect(readTransactionById).toHaveBeenCalledTimes(1);
  });

  it("returns null when a remote ID is authoritatively missing", async () => {
    vi.mocked(readTransactionById).mockResolvedValue(null);
    const { wrapper } = createHarness();

    const { result } = renderHook(
      () => useTransactionByIdQuery("missing-source"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data).toBeNull();
    });
  });

  it("keeps transient remote failures in a quiet non-retrying error state", async () => {
    vi.mocked(readTransactionById).mockRejectedValue(
      new Error("temporary outage"),
    );
    const { wrapper } = createHarness();

    const { result } = renderHook(
      () => useTransactionByIdQuery("expense-1"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toEqual(new Error("temporary outage"));
    expect(readTransactionById).toHaveBeenCalledTimes(1);
  });

  it("isolates cached source records by sheet and ID", async () => {
    providerState.isOnline = false;
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(
      transactionQueryKeys.transaction("sheet-b", "user-a", "expense-1"),
      transaction("expense-1", { amount: 70 }),
    );
    queryClient.setQueryData(
      transactionQueryKeys.transaction("sheet-a", "user-a", "expense-2"),
      transaction("expense-2", { amount: 60 }),
    );

    const { result } = renderHook(
      () => useTransactionByIdQuery("expense-1"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data).toBeNull();
    });
  });
});
