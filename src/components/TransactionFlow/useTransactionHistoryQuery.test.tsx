import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../lib/db";
import {
  readTransactionHistorySnapshot,
  replaceTransactionHistorySnapshot,
} from "../../lib/transactionHistory";
import type {
  CachedTransactionRecord,
  TransactionHistorySnapshot,
  TransactionRecord,
} from "../../lib/types";
import { useTransactionHistoryQuery } from "./useTransactionHistoryQuery";

const mocks = vi.hoisted(() => ({
  accessToken: "access-token" as string | null,
  sheetId: "sheet-a" as string | null,
  userId: "user-a" as string | null,
  isOnline: true,
  fetchSnapshot: vi.fn(),
}));

vi.mock("../../app/providers", () => ({
  useConnectivity: () => ({ isOnline: mocks.isOnline }),
  useSession: () => ({
    accessToken: mocks.accessToken,
    userProfile: mocks.userId
      ? { id: mocks.userId, name: "Test user", picture: null }
      : null,
  }),
  useWorkspace: () => ({ sheetId: mocks.sheetId }),
}));

vi.mock("../../lib/google", () => ({
  getTransactionHistorySnapshot: mocks.fetchSnapshot,
}));

vi.mock("../../lib/mock", () => ({
  IS_DEV_MODE: false,
  getTransactionHistorySnapshot: mocks.fetchSnapshot,
}));

function cached(
  id: string,
  overrides: Partial<CachedTransactionRecord> = {},
): CachedTransactionRecord {
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
    cachedAt: "2026-08-15T10:00:00.000Z",
    canEdit: true,
    searchText: `${id} wallet`,
    ...overrides,
  };
}

function snapshot(...records: CachedTransactionRecord[]): TransactionHistorySnapshot {
  return {
    records,
    meta: {
      sheetId: "sheet-a",
      capturedAt: "2026-08-15T10:00:00.000Z",
      sourceLastRow: records.length + 1,
      rowCount: records.length,
    },
  };
}

function pending(id: string): TransactionRecord {
  return {
    ...cached(id),
    status: "pending",
    targetSheetId: "sheet-a",
    targetUserId: "user-a",
    updatedAt: "2026-08-15T11:00:00.000Z",
  };
}

function legacySynced(
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
    category: `Local ${id}`,
    date: "2026-08-15T08:00:00.000Z",
    status: "synced",
    createdAt: "2026-08-15T08:00:00.000Z",
    updatedAt: "2026-08-15T08:00:00.000Z",
    ...overrides,
  };
}

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
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

describe("useTransactionHistoryQuery", () => {
  beforeEach(async () => {
    mocks.accessToken = "access-token";
    mocks.sheetId = "sheet-a";
    mocks.userId = "user-a";
    mocks.isOnline = true;
    mocks.fetchSnapshot.mockReset();
    onlineManager.setOnline(true);
    await Promise.all([
      db.transactions.clear(),
      db.transactionHistory.clear(),
      db.transactionHistoryMeta.clear(),
    ]);
  });

  afterEach(async () => {
    onlineManager.setOnline(true);
    await Promise.all([
      db.transactions.clear(),
      db.transactionHistory.clear(),
      db.transactionHistoryMeta.clear(),
    ]);
  });

  it("serves a complete persisted snapshot offline and reconciles local pending rows", async () => {
    mocks.isOnline = false;
    onlineManager.setOnline(false);
    await replaceTransactionHistorySnapshot(
      snapshot(cached("duplicate"), cached("remote-only")),
    );
    await db.transactions.put(pending("duplicate"));
    const { wrapper } = createHarness();

    const { result } = renderHook(() => useTransactionHistoryQuery(true), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.records.map(({ id }) => id)).toEqual([
        "duplicate",
        "remote-only",
      ]);
    });
    expect(result.current.records[0].status).toBe("pending");
    expect(result.current.hasCompleteCache).toBe(true);
    expect(mocks.fetchSnapshot).not.toHaveBeenCalled();
  });

  it("uses authoritative cached rows and hides absent legacy synced overlays without deleting them", async () => {
    mocks.isOnline = false;
    onlineManager.setOnline(false);
    await replaceTransactionHistorySnapshot(
      snapshot(cached("matching", { category: "Authoritative category" })),
    );
    const matchingLegacy = legacySynced("matching", {
      category: "Stale local category",
      targetSheetId: "sheet-a",
      error: "Stale local error",
    });
    const absentLegacy = legacySynced("absent", {
      note: "Keep this exact local payload",
    });
    await db.transactions.bulkPut([matchingLegacy, absentLegacy]);
    const { wrapper } = createHarness();

    const { result } = renderHook(() => useTransactionHistoryQuery(true), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.records.map(({ id }) => id)).toEqual(["matching"]);
    });
    expect(result.current.records[0]).toMatchObject({
      category: "Authoritative category",
      status: "synced",
    });
    expect(result.current.records[0].error).toBeUndefined();
    expect(await db.transactions.get("matching")).toEqual(matchingLegacy);
    expect(await db.transactions.get("absent")).toEqual(absentLegacy);
  });

  it("keeps legacy synced rows in Dexie but hidden before the first offline snapshot", async () => {
    mocks.isOnline = false;
    onlineManager.setOnline(false);
    const knownSheet = legacySynced("known-sheet", {
      targetSheetId: "sheet-a",
    });
    const fullyUnscoped = legacySynced("fully-unscoped");
    await db.transactions.bulkPut([knownSheet, fullyUnscoped]);
    const { queryClient, wrapper } = createHarness();

    const { result } = renderHook(() => useTransactionHistoryQuery(true), {
      wrapper,
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryData([
          "transactionHistory",
          "local",
          "sheet-a",
          "user-a",
        ]),
      ).toEqual([]);
    });
    expect(result.current.records).toEqual([]);
    expect(result.current.hasCompleteCache).toBe(false);
    expect(await db.transactions.get("known-sheet")).toEqual(knownSheet);
    expect(await db.transactions.get("fully-unscoped")).toEqual(
      fullyUnscoped,
    );
  });

  it("persists a successful online refresh before exposing it", async () => {
    const fresh = snapshot(cached("fresh"));
    mocks.fetchSnapshot.mockResolvedValue(fresh);
    const { wrapper } = createHarness();

    const { result } = renderHook(() => useTransactionHistoryQuery(true), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.records.map(({ id }) => id)).toEqual(["fresh"]);
    });
    expect(
      (await readTransactionHistorySnapshot("sheet-a"))?.records.map(
        ({ id }) => id,
      ),
    ).toEqual(["fresh"]);
  });

  it("keeps the previous complete cache when an online refresh fails", async () => {
    await replaceTransactionHistorySnapshot(snapshot(cached("still-here")));
    mocks.fetchSnapshot.mockRejectedValue(new Error("Google unavailable"));
    const { wrapper } = createHarness();

    const { result } = renderHook(() => useTransactionHistoryQuery(true), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.error?.message).toBe("Google unavailable");
    });
    expect(result.current.records.map(({ id }) => id)).toEqual(["still-here"]);
    expect(
      (await readTransactionHistorySnapshot("sheet-a"))?.records.map(
        ({ id }) => id,
      ),
    ).toEqual(["still-here"]);
  });

  it("uses a newer persisted snapshot written by another tab", async () => {
    const remote = snapshot(cached("remote-old"));
    mocks.fetchSnapshot.mockResolvedValue(remote);
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useTransactionHistoryQuery(true), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.records.map(({ id }) => id)).toEqual([
        "remote-old",
      ]);
    });

    const crossTab = snapshot(
      cached("cross-tab-new", {
        cachedAt: "2026-08-15T11:00:00.000Z",
      }),
    );
    crossTab.meta.capturedAt = "2026-08-15T11:00:00.000Z";
    await act(async () => {
      await replaceTransactionHistorySnapshot(crossTab);
    });

    await waitFor(() => {
      expect(result.current.records.map(({ id }) => id)).toEqual([
        "cross-tab-new",
      ]);
    });
  });

  it("does not let an older in-flight refresh overwrite a newer tab snapshot", async () => {
    const pendingSnapshot = deferred<TransactionHistorySnapshot>();
    mocks.fetchSnapshot.mockReturnValue(pendingSnapshot.promise);
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useTransactionHistoryQuery(true), {
      wrapper,
    });
    await waitFor(() => expect(mocks.fetchSnapshot).toHaveBeenCalledTimes(1));

    const crossTab = snapshot(
      cached("cross-tab-winner", {
        cachedAt: "2026-08-15T11:00:00.000Z",
      }),
    );
    crossTab.meta.capturedAt = "2026-08-15T11:00:00.000Z";
    await act(async () => {
      await replaceTransactionHistorySnapshot(crossTab);
    });
    await waitFor(() => {
      expect(result.current.records.map(({ id }) => id)).toEqual([
        "cross-tab-winner",
      ]);
    });

    await act(async () => {
      pendingSnapshot.resolve(snapshot(cached("slow-refresh")));
    });
    await waitFor(() => expect(result.current.isRefreshing).toBe(false));

    expect(result.current.records.map(({ id }) => id)).toEqual([
      "cross-tab-winner",
    ]);
    expect(
      (await readTransactionHistorySnapshot("sheet-a"))?.records.map(
        ({ id }) => id,
      ),
    ).toEqual(["cross-tab-winner"]);
  });

  it("does not persist a snapshot that finishes after the drawer closes", async () => {
    const pendingSnapshot = deferred<TransactionHistorySnapshot>();
    let requestSignal: AbortSignal | undefined;
    mocks.fetchSnapshot.mockImplementation(
      async (
        _accessToken: string,
        _sheetId: string,
        options: { signal?: AbortSignal },
      ) => {
        requestSignal = options.signal;
        return pendingSnapshot.promise;
      },
    );
    const { wrapper } = createHarness();
    const { rerender } = renderHook(
      ({ enabled }) => useTransactionHistoryQuery(enabled),
      { initialProps: { enabled: true }, wrapper },
    );
    await waitFor(() => expect(mocks.fetchSnapshot).toHaveBeenCalledTimes(1));

    act(() => {
      rerender({ enabled: false });
    });
    await waitFor(() => expect(requestSignal?.aborted).toBe(true));

    await act(async () => {
      pendingSnapshot.resolve(snapshot(cached("too-late")));
    });

    expect(await readTransactionHistorySnapshot("sheet-a")).toBeNull();
  });
});
