import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../lib/db";
import { readLinkedReimbursements } from "../../lib/google";
import type { ReimbursementLedgerRow } from "../../lib/reimbursements";
import type { TransactionRecord, TransactionStatus } from "../../lib/types";
import { transactionQueryKeys } from "./transactionQueryKeys";
import { useReimbursementSummary } from "./useReimbursementSummary";

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
  readLinkedReimbursements: vi.fn(),
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

function linkedRow(
  id: string,
  amount: number,
  status: TransactionStatus = "synced",
  sourceId = "expense-1",
): ReimbursementLedgerRow {
  return {
    id,
    type: "income",
    amount,
    currency: "THB",
    reimbursesTransactionId: sourceId,
    status,
  };
}

function localLinkedRow(
  id: string,
  amount: number,
  status: TransactionStatus,
  createdAt: string,
  sourceId = "expense-1",
): TransactionRecord {
  return {
    ...source(),
    id,
    type: "income",
    amount,
    category: "Reimbursement",
    reimbursesTransactionId: sourceId,
    status,
    createdAt,
    updatedAt: createdAt,
    targetSheetId: "sheet-a",
    targetUserId: "user-a",
    sheetId: status === "synced" ? "sheet-a" : undefined,
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function mockLocalRows(...requests: Array<Promise<TransactionRecord[]>>) {
  let requestIndex = 0;
  const toArray = vi.fn(() => {
    const request = requests[Math.min(requestIndex, requests.length - 1)];
    requestIndex += 1;
    return request;
  });
  vi.spyOn(db.transactions, "where").mockReturnValue({
    anyOf: () => ({ toArray }),
  } as never);
  return toArray;
}

describe("useReimbursementSummary", () => {
  beforeEach(async () => {
    providerState.accessToken = "access-token";
    providerState.sheetId = "sheet-a";
    providerState.userId = "user-a";
    providerState.isOnline = true;
    onlineManager.setOnline(true);
    vi.mocked(readLinkedReimbursements).mockReset();
    vi.mocked(readLinkedReimbursements).mockResolvedValue([]);
    await db.transactions.clear();
  });

  afterEach(async () => {
    onlineManager.setOnline(true);
    vi.restoreAllMocks();
    await db.transactions.clear();
  });

  it("withholds an offline balance until the initial local ledger read settles", async () => {
    providerState.isOnline = false;
    const localRequest = deferred<TransactionRecord[]>();
    mockLocalRows(localRequest.promise);
    const { wrapper } = createHarness();

    const { result } = renderHook(
      () => useReimbursementSummary({ source: source() }),
      { wrapper },
    );

    expect(result.current.isChecking).toBe(true);
    expect(result.current.summary.remaining).toBe(0);
    expect(result.current.needsOnlineVerification).toBe(true);

    localRequest.resolve([
      localLinkedRow(
        "offline-pending",
        30,
        "pending",
        "2026-08-15T10:00:00.000Z",
      ),
    ]);
    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
      expect(result.current.summary).toMatchObject({
        queued: 30,
        remaining: 70,
      });
    });
  });

  it("withholds a local-only source balance until its local ledger is known", async () => {
    const localSource = source({
      status: "pending",
      sheetId: undefined,
      sheetRow: undefined,
    });
    const localRequest = deferred<TransactionRecord[]>();
    mockLocalRows(localRequest.promise);
    const { wrapper } = createHarness();

    const { result } = renderHook(
      () => useReimbursementSummary({ source: localSource }),
      { wrapper },
    );

    expect(result.current.isChecking).toBe(true);
    expect(result.current.summary.remaining).toBe(0);
    expect(readLinkedReimbursements).not.toHaveBeenCalled();

    localRequest.resolve([]);
    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
      expect(result.current.summary.remaining).toBe(100);
    });
    expect(readLinkedReimbursements).not.toHaveBeenCalled();
  });

  it("gates the balance while an invalidated local ledger refetch is unresolved", async () => {
    const refreshedLocalRows = deferred<TransactionRecord[]>();
    mockLocalRows(
      Promise.resolve([
        localLinkedRow(
          "initial-child",
          10,
          "pending",
          "2026-08-15T10:00:00.000Z",
        ),
      ]),
      refreshedLocalRows.promise,
    );
    vi.mocked(readLinkedReimbursements).mockResolvedValue([
      linkedRow("remote-child", 20),
    ]);
    const { queryClient, wrapper } = createHarness();

    const { result } = renderHook(
      () => useReimbursementSummary({ source: source() }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
      expect(result.current.summary.remaining).toBe(70);
    });

    let invalidation!: Promise<void>;
    act(() => {
      invalidation = queryClient.invalidateQueries({
        queryKey: transactionQueryKeys.local,
      });
    });
    await waitFor(() => {
      expect(result.current.isChecking).toBe(true);
      expect(result.current.summary.remaining).toBe(0);
    });

    refreshedLocalRows.resolve([
      localLinkedRow(
        "refreshed-child",
        35,
        "pending",
        "2026-08-15T11:00:00.000Z",
      ),
    ]);
    await act(async () => {
      await invalidation;
    });
    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
      expect(result.current.summary.remaining).toBe(45);
    });
  });

  it("surfaces local ledger failures and retries them without a remote source", async () => {
    const localSource = source({
      status: "error",
      sheetId: undefined,
      sheetRow: undefined,
    });
    const toArray = mockLocalRows(
      Promise.reject(new Error("IndexedDB unavailable")),
      Promise.resolve([
        localLinkedRow(
          "recovered-child",
          25,
          "error",
          "2026-08-15T10:00:00.000Z",
        ),
      ]),
    );
    const { wrapper } = createHarness();

    const { result } = renderHook(
      () => useReimbursementSummary({ source: localSource }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
      expect(result.current.isChecking).toBe(false);
      expect(result.current.summary.remaining).toBe(0);
    });

    await act(async () => {
      await result.current.retry();
    });
    await waitFor(() => {
      expect(result.current.isError).toBe(false);
      expect(result.current.summary).toMatchObject({
        queued: 25,
        remaining: 75,
      });
    });
    expect(toArray.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(readLinkedReimbursements).not.toHaveBeenCalled();
  });

  it("checks online for a fresh remote total even when cached rows are visible", async () => {
    const remoteRequest = deferred<ReimbursementLedgerRow[]>();
    vi.mocked(readLinkedReimbursements).mockReturnValue(remoteRequest.promise);
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(
      transactionQueryKeys.reimbursement("sheet-a", "expense-1"),
      [linkedRow("cached-child", 40)],
    );

    const { result } = renderHook(
      () => useReimbursementSummary({ source: source() }),
      { wrapper },
    );

    expect(result.current.summary.remaining).toBe(0);
    expect(result.current.isChecking).toBe(true);
    await waitFor(() => {
      expect(
        queryClient.getQueryState(
          transactionQueryKeys.localForSheet("sheet-a", "user-a"),
        )?.fetchStatus,
      ).toBe("idle");
      expect(result.current.summary.confirmed).toBe(40);
      expect(result.current.isChecking).toBe(true);
    });

    remoteRequest.resolve([linkedRow("fresh-child", 55)]);
    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
      expect(result.current.summary.confirmed).toBe(55);
    });
  });

  it("surfaces a quiet remote error and retries explicitly", async () => {
    vi.mocked(readLinkedReimbursements)
      .mockRejectedValueOnce(new Error("temporary outage"))
      .mockResolvedValueOnce([linkedRow("child-1", 30)]);
    const { wrapper } = createHarness();

    const { result } = renderHook(
      () => useReimbursementSummary({ source: source() }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
      expect(result.current.isChecking).toBe(false);
    });

    await act(async () => {
      await result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(false);
      expect(result.current.summary.confirmed).toBe(30);
    });
    expect(readLinkedReimbursements).toHaveBeenCalledTimes(2);
  });

  it("combines remote rows with pending and error rows using local values by ID", async () => {
    vi.mocked(readLinkedReimbursements).mockResolvedValue([
      linkedRow("edited-child", 40),
      linkedRow("remote-child", 10),
    ]);
    await db.transactions.bulkPut([
      localLinkedRow(
        "edited-child",
        20,
        "pending",
        "2026-08-15T10:00:00.000Z",
      ),
      localLinkedRow(
        "error-child",
        5,
        "error",
        "2026-08-15T11:00:00.000Z",
      ),
      localLinkedRow(
        "ignored-synced-copy",
        15,
        "synced",
        "2026-08-15T12:00:00.000Z",
      ),
    ]);
    const { wrapper } = createHarness();

    const { result } = renderHook(
      () => useReimbursementSummary({ source: source() }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.summary).toMatchObject({
        confirmed: 10,
        queued: 25,
        remaining: 65,
      });
    });
  });

  it("does not reserve reimbursement balance for another sheet or a legacy unscoped row", async () => {
    await db.transactions.bulkPut([
      localLinkedRow(
        "current-sheet-child",
        10,
        "pending",
        "2026-08-15T10:00:00.000Z",
      ),
      {
        ...localLinkedRow(
          "other-sheet-child",
          60,
          "pending",
          "2026-08-15T11:00:00.000Z",
        ),
        targetSheetId: "sheet-b",
      },
      {
        ...localLinkedRow(
          "legacy-child",
          30,
          "error",
          "2026-08-15T12:00:00.000Z",
        ),
        targetSheetId: undefined,
        targetUserId: undefined,
      },
    ]);
    vi.mocked(readLinkedReimbursements).mockResolvedValue([]);
    const { wrapper } = createHarness();

    const { result } = renderHook(
      () => useReimbursementSummary({ source: source() }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false);
      expect(result.current.summary).toMatchObject({
        confirmed: 0,
        queued: 10,
        remaining: 90,
      });
    });
  });

  it("excludes the current linked child while editing", async () => {
    vi.mocked(readLinkedReimbursements).mockResolvedValue([
      linkedRow("current-child", 40),
      linkedRow("other-child", 15),
    ]);
    await db.transactions.put(
      localLinkedRow(
        "current-child",
        50,
        "pending",
        "2026-08-15T10:00:00.000Z",
      ),
    );
    const { wrapper } = createHarness();

    const { result } = renderHook(
      () =>
        useReimbursementSummary({
          source: source(),
          excludeChildId: "current-child",
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.summary).toMatchObject({
        confirmed: 15,
        queued: 0,
        remaining: 85,
      });
    });
  });

  it("reuses an in-memory remote total while connectivity reports offline", async () => {
    providerState.isOnline = false;
    await db.transactions.put(
      localLinkedRow(
        "queued-child",
        10,
        "pending",
        "2026-08-15T10:00:00.000Z",
      ),
    );
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(
      transactionQueryKeys.reimbursement("sheet-a", "expense-1"),
      [linkedRow("cached-child", 35)],
    );

    const { result } = renderHook(
      () => useReimbursementSummary({ source: source() }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.summary).toMatchObject({
        confirmed: 35,
        queued: 10,
        remaining: 55,
      });
    });
    expect(result.current.needsOnlineVerification).toBe(false);
    expect(readLinkedReimbursements).not.toHaveBeenCalled();
  });

  it("uses zero remote total offline without cache and lets error rows reserve balance", async () => {
    providerState.isOnline = false;
    await db.transactions.put(
      localLinkedRow(
        "error-child",
        20,
        "error",
        "2026-08-15T10:00:00.000Z",
      ),
    );
    const { wrapper } = createHarness();

    const { result } = renderHook(
      () => useReimbursementSummary({ source: source() }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.summary).toMatchObject({
        confirmed: 0,
        queued: 20,
        remaining: 80,
      });
    });
    expect(result.current.needsOnlineVerification).toBe(true);
    expect(readLinkedReimbursements).not.toHaveBeenCalled();
  });

  it("treats a local-only pending source as having an authoritative remote zero", async () => {
    const localSource = source({
      status: "pending",
      sheetId: undefined,
      sheetRow: undefined,
    });
    await db.transactions.put(
      localLinkedRow(
        "queued-child",
        25,
        "pending",
        "2026-08-15T10:00:00.000Z",
      ),
    );
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(
      transactionQueryKeys.reimbursement("sheet-a", "expense-1"),
      [linkedRow("stale-impossible-child", 70)],
    );

    const { result } = renderHook(
      () => useReimbursementSummary({ source: localSource }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.summary).toMatchObject({
        confirmed: 0,
        queued: 25,
        remaining: 75,
      });
    });
    expect(result.current.needsOnlineVerification).toBe(false);
    expect(result.current.isChecking).toBe(false);
    expect(readLinkedReimbursements).not.toHaveBeenCalled();
  });

  it("isolates cached remote totals by both sheet and source ID", async () => {
    providerState.isOnline = false;
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(
      transactionQueryKeys.reimbursement("sheet-b", "expense-1"),
      [linkedRow("wrong-sheet", 70)],
    );
    queryClient.setQueryData(
      transactionQueryKeys.reimbursement("sheet-a", "expense-2"),
      [linkedRow("wrong-source", 60, "synced", "expense-2")],
    );

    const { result } = renderHook(
      () => useReimbursementSummary({ source: source() }),
      { wrapper },
    );

    await waitFor(() => {
      expect(
        queryClient.getQueryState(
          transactionQueryKeys.localForSheet("sheet-a", "user-a"),
        )?.fetchStatus,
      ).toBe("idle");
    });
    expect(result.current.summary).toMatchObject({
      confirmed: 0,
      queued: 0,
      remaining: 100,
    });
    expect(result.current.needsOnlineVerification).toBe(true);
  });

  it("does not start the remote request without both credentials", async () => {
    providerState.accessToken = null;
    const { queryClient, wrapper } = createHarness();

    const { result } = renderHook(
      () => useReimbursementSummary({ source: source() }),
      { wrapper },
    );

    await waitFor(() => {
      expect(
        queryClient.getQueryState(
          transactionQueryKeys.localForSheet("sheet-a", "user-a"),
        )?.fetchStatus,
      ).toBe("idle");
    });
    expect(result.current.isChecking).toBe(false);
    expect(readLinkedReimbursements).not.toHaveBeenCalled();
  });
});
