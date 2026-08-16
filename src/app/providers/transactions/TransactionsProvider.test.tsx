import "fake-indexeddb/auto";
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
  type QueryKey,
} from "@tanstack/react-query";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../../lib/db";
import { GoogleApiError } from "../../../lib/google";
import { syncPendingTransactions } from "../../../lib/sync";
import type {
  TransactionInput,
  TransactionRecord,
} from "../../../lib/types";
import { transactionQueryKeys } from "../../../components/TransactionFlow/transactionQueryKeys";
import { useAddTransactionMutation } from "../../../components/TransactionFlow/useAddTransactionMutation";
import { useDeleteTransactionMutation } from "../../../components/TransactionFlow/useDeleteTransactionMutation";
import { useUpdateTransactionMutation } from "../../../components/TransactionFlow/useUpdateTransactionMutation";
import {
  type TransactionsContextValue,
  useTransactions,
} from "./TransactionsContext";
import { TransactionsProvider } from "./TransactionsProvider";

const providerState = vi.hoisted(() => ({
  accessToken: "access-token" as string | null,
  userId: "user-a" as string | null,
  sheetId: "sheet-a" as string | null,
  sheetTabId: 0 as number | null,
  isOnline: false,
  signOut: vi.fn(),
}));

const googleMocks = vi.hoisted(() => {
  class GoogleApiError extends Error {
    status: number;

    constructor({ status, message }: { status: number; message: string }) {
      super(message);
      this.status = status;
    }
  }

  class DuplicateTransactionIdError extends Error {
    readonly transactionId: string;
    readonly firstRow: number;
    readonly duplicateRow: number;

    constructor(
      transactionId: string,
      firstRow: number,
      duplicateRow: number,
    ) {
      super(
        `Duplicate transaction ID "${transactionId}" found in Transactions!K at rows ${firstRow} and ${duplicateRow}. Remove the duplicate row before syncing.`,
      );
      this.name = "DuplicateTransactionIdError";
      this.transactionId = transactionId;
      this.firstRow = firstRow;
      this.duplicateRow = duplicateRow;
    }
  }

  return {
    deleteRow: vi.fn(),
    DuplicateTransactionIdError,
    GoogleApiError,
    getSheetTabId: vi.fn(),
    readLinkedReimbursements: vi.fn(),
    readTransactionById: vi.fn(),
    readTransactionIdMap: vi.fn(),
    updateRow: vi.fn(),
  };
});

const mutationContextState = vi.hoisted(() => ({
  value: null as TransactionsContextValue | null,
}));

vi.mock("../../../lib/google", () => {
  return googleMocks;
});

vi.mock("../../../lib/mock", () => ({
  IS_DEV_MODE: false,
  deleteRow: vi.fn(),
  getSheetTabId: vi.fn(),
  readLinkedReimbursements: vi.fn(),
  readTransactionById: vi.fn(),
  readTransactionIdMap: vi.fn(),
  updateRow: vi.fn(),
}));

vi.mock("../../../lib/sync", () => ({
  syncPendingTransactions: vi.fn(),
}));

vi.mock("../session/session.hooks", () => ({
  useSession: () => ({
    accessToken: providerState.accessToken,
    userProfile: providerState.userId
      ? { id: providerState.userId, name: "Test user", picture: null }
      : null,
    signOut: providerState.signOut,
  }),
}));

vi.mock("../workspace/workspace.hooks", () => ({
  useWorkspace: () => ({
    sheetId: providerState.sheetId,
    sheetTabId: providerState.sheetTabId,
  }),
}));

vi.mock("../connectivity/ConnectivityContext", () => ({
  useConnectivity: () => ({ isOnline: providerState.isOnline }),
}));

vi.mock("../../../app/providers", () => ({
  useTransactions: () => {
    if (!mutationContextState.value) {
      throw new Error("Missing mutation test context");
    }
    return mutationContextState.value;
  },
}));

const input: TransactionInput = {
  type: "expense",
  amount: 42,
  currency: "THB",
  account: "Wallet",
  for: "Me",
  category: "Food",
  date: "2026-08-15T08:00:00.000Z",
  note: "Lunch",
};

function transaction(
  id: string,
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  return {
    ...input,
    id,
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

function createProviderHarness(
  onSyncError?: (message: string, at: string) => void,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  let context: TransactionsContextValue | null = null;
  let captureKey = 0;

  function CaptureContext() {
    const capturedContext = useTransactions();
    const { lastSyncError, lastSyncErrorAt } = capturedContext;
    context = capturedContext;

    useEffect(() => {
      if (lastSyncError && lastSyncErrorAt) {
        onSyncError?.(lastSyncError, lastSyncErrorAt);
      }
    }, [lastSyncError, lastSyncErrorAt, onSyncError]);

    return null;
  }

  function tree() {
    return (
      <QueryClientProvider client={queryClient}>
        <TransactionsProvider>
          <CaptureContext key={captureKey} />
        </TransactionsProvider>
      </QueryClientProvider>
    );
  }

  const rendered = render(tree());

  return {
    queryClient,
    rendered,
    rerender({ remountConsumer = false } = {}) {
      if (remountConsumer) {
        captureKey += 1;
      }
      rendered.rerender(tree());
    },
    getContext() {
      if (!context) {
        throw new Error("Transactions context has not rendered");
      }
      return context;
    },
  };
}

function invalidatedKeys(
  invalidateQueries: ReturnType<typeof vi.spyOn>,
): QueryKey[] {
  return invalidateQueries.mock.calls.map((call: unknown[]) => {
    const filters = call[0] as { queryKey?: QueryKey };
    return filters.queryKey ?? [];
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function createMutationHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
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

function mutationContext(
  overrides: Partial<TransactionsContextValue> = {},
): TransactionsContextValue {
  return {
    queueCount: 0,
    recentCategories: { expense: [], income: [], transfer: [] },
    lastSyncError: null,
    lastSyncErrorAt: null,
    lastSyncAt: null,
    addTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    undoLast: vi.fn(),
    syncNow: vi.fn(),
    markRecentCategory: vi.fn(),
    ...overrides,
  };
}

describe("TransactionsProvider", () => {
  beforeEach(async () => {
    providerState.accessToken = "access-token";
    providerState.userId = "user-a";
    providerState.sheetId = "sheet-a";
    providerState.sheetTabId = 0;
    providerState.isOnline = false;
    providerState.signOut.mockReset();
    googleMocks.deleteRow.mockReset().mockResolvedValue(undefined);
    googleMocks.getSheetTabId.mockReset().mockResolvedValue(0);
    googleMocks.readLinkedReimbursements.mockReset().mockResolvedValue([]);
    googleMocks.readTransactionById.mockReset().mockResolvedValue(null);
    googleMocks.readTransactionIdMap.mockReset().mockResolvedValue(new Map());
    googleMocks.updateRow.mockReset().mockResolvedValue(undefined);
    vi.mocked(syncPendingTransactions).mockReset().mockResolvedValue(0);
    mutationContextState.value = null;
    await db.transactions.clear();
    await db.settings.clear();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.transactions.clear();
    await db.settings.clear();
  });

  it("returns the exact created record and invalidates every transaction cache prefix", async () => {
    const harness = createProviderHarness();
    const invalidateQueries = vi.spyOn(
      harness.queryClient,
      "invalidateQueries",
    );
    let created!: TransactionRecord;

    await act(async () => {
      created = await harness.getContext().addTransaction(input);
    });

    expect(created.id).toBeTruthy();
    expect(created.status).toBe("pending");
    expect(created.targetSheetId).toBe("sheet-a");
    expect(created.targetUserId).toBe("user-a");
    expect(await db.transactions.get(created.id)).toEqual(created);
    expect(invalidatedKeys(invalidateQueries)).toEqual(
      expect.arrayContaining([
        transactionQueryKeys.local,
        ["recentTransactions"],
        transactionQueryKeys.history,
        transactionQueryKeys.reimbursements,
        ["transactionById"],
      ]),
    );

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("binds a late sync auth failure to the access token that started it", async () => {
    await db.transactions.add(
      transaction("account-a-pending", {
        status: "pending",
        sheetId: undefined,
        sheetRow: undefined,
      }),
    );
    const accountASync = deferred<number>();
    vi.mocked(syncPendingTransactions).mockReturnValue(accountASync.promise);
    const harness = createProviderHarness();
    let syncPromise!: Promise<void>;

    act(() => {
      syncPromise = harness.getContext().syncNow();
    });

    await waitFor(() => {
      expect(syncPendingTransactions).toHaveBeenCalledWith(
        "access-token",
        "sheet-a",
        "user-a",
      );
      expect(harness.getContext().queueCount).toBe(1);
    });
    providerState.accessToken = "access-token-b";
    providerState.userId = "user-b";
    harness.rerender();
    await waitFor(() => {
      expect(harness.getContext().queueCount).toBe(0);
    });
    accountASync.reject(
      new GoogleApiError({ status: 401, message: "Account A expired" }),
    );

    await act(async () => {
      await syncPromise;
    });
    expect(providerState.signOut).toHaveBeenCalledWith("access-token");
    expect(harness.getContext().queueCount).toBe(0);
    expect(harness.getContext().lastSyncError).toBeNull();

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("does not replay account A's recorded sync error when account B remounts the flow", async () => {
    const observedErrors: string[] = [];
    vi.mocked(syncPendingTransactions).mockRejectedValue(
      new TypeError("Account A is offline"),
    );
    const harness = createProviderHarness((message) => {
      observedErrors.push(message);
    });

    await act(async () => {
      await harness.getContext().syncNow();
    });
    expect(harness.getContext().lastSyncError).toBe(
      "Network error while syncing.",
    );
    expect(harness.getContext().lastSyncErrorAt).not.toBeNull();
    expect(observedErrors).toEqual(["Network error while syncing."]);

    await db.transactions.add(
      transaction("account-b-pending", {
        status: "pending",
        sheetId: undefined,
        sheetRow: undefined,
        targetSheetId: "sheet-b",
        targetUserId: "user-b",
      }),
    );
    observedErrors.length = 0;
    providerState.accessToken = "access-token-b";
    providerState.userId = "user-b";
    providerState.sheetId = "sheet-b";
    harness.rerender({ remountConsumer: true });

    await waitFor(() => {
      expect(harness.getContext().queueCount).toBe(1);
    });
    expect(observedErrors).toEqual([]);
    expect(harness.getContext().lastSyncError).toBeNull();
    expect(harness.getContext().lastSyncErrorAt).toBeNull();

    providerState.accessToken = "access-token";
    providerState.userId = "user-a";
    providerState.sheetId = "sheet-a";
    harness.rerender({ remountConsumer: true });
    expect(observedErrors).toEqual([]);
    expect(harness.getContext().lastSyncError).toBeNull();
    expect(harness.getContext().lastSyncErrorAt).toBeNull();

    providerState.accessToken = "access-token-b";
    providerState.userId = "user-b";
    providerState.sheetId = "sheet-b";
    harness.rerender({ remountConsumer: true });
    await waitFor(() => {
      expect(harness.getContext().queueCount).toBe(1);
    });

    await act(async () => {
      await harness.getContext().syncNow();
    });
    expect(observedErrors).toEqual(["Network error while syncing."]);
    expect(harness.getContext().lastSyncError).toBe(
      "Network error while syncing.",
    );

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("does not surface a late account A direct undo failure in account B", async () => {
    const original = transaction("account-a-undo", {
      createdAt: "2026-08-15T12:00:00.000Z",
      sheetRow: 7,
    });
    const deleteStarted = deferred<void>();
    const accountADelete = deferred<void>();
    await db.transactions.add(original);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[original.id, 7]]),
    );
    googleMocks.deleteRow.mockImplementationOnce(async () => {
      deleteStarted.resolve();
      return accountADelete.promise;
    });
    const harness = createProviderHarness();
    let undoPromise!: ReturnType<TransactionsContextValue["undoLast"]>;

    await act(async () => {
      undoPromise = harness.getContext().undoLast();
      await deleteStarted.promise;
    });
    providerState.accessToken = "access-token-b";
    providerState.userId = "user-b";
    providerState.sheetId = "sheet-b";
    harness.rerender();
    accountADelete.reject(new TypeError("Account A is offline"));

    let result!: Awaited<typeof undoPromise>;
    await act(async () => {
      result = await undoPromise;
    });

    expect(result).toEqual({
      ok: true,
      outcome: "pending",
      message: "Undo queued as compensating entry",
    });
    expect(harness.getContext().lastSyncError).toBeNull();
    expect(await db.transactions.get(original.id)).toEqual(original);
    expect(await db.transactions.toArray()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amount: -original.amount,
          targetSheetId: "sheet-a",
          targetUserId: "user-a",
        }),
      ]),
    );

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("does not surface a late account A direct delete failure in account B", async () => {
    const original = transaction("account-a-delete", { sheetRow: 8 });
    const deleteStarted = deferred<void>();
    const accountADelete = deferred<void>();
    await db.transactions.add(original);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[original.id, 8]]),
    );
    googleMocks.deleteRow.mockImplementationOnce(async () => {
      deleteStarted.resolve();
      return accountADelete.promise;
    });
    const harness = createProviderHarness();
    let deletePromise!: ReturnType<
      TransactionsContextValue["deleteTransaction"]
    >;

    await act(async () => {
      deletePromise = harness.getContext().deleteTransaction(original.id);
      await deleteStarted.promise;
    });
    providerState.accessToken = "access-token-b";
    providerState.userId = "user-b";
    providerState.sheetId = "sheet-b";
    harness.rerender();
    accountADelete.reject(new TypeError("Account A is offline"));

    let result!: Awaited<typeof deletePromise>;
    await act(async () => {
      result = await deletePromise;
    });

    expect(result).toEqual({
      ok: true,
      outcome: "pending",
      message: "Delete queued as compensating entry",
    });
    expect(harness.getContext().lastSyncError).toBeNull();
    expect(await db.transactions.get(original.id)).toBeUndefined();
    expect(await db.transactions.toArray()).toEqual([
      expect.objectContaining({
        amount: -original.amount,
        targetSheetId: "sheet-a",
        targetUserId: "user-a",
      }),
    ]);

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("still surfaces a direct undo failure in the active account", async () => {
    const original = transaction("active-account-undo", {
      createdAt: "2026-08-15T12:00:00.000Z",
      sheetRow: 9,
    });
    await db.transactions.add(original);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[original.id, 9]]),
    );
    googleMocks.deleteRow.mockRejectedValueOnce(new TypeError("offline"));
    const harness = createProviderHarness();

    let result!: Awaited<
      ReturnType<TransactionsContextValue["undoLast"]>
    >;
    await act(async () => {
      result = await harness.getContext().undoLast();
    });

    expect(result).toEqual({
      ok: true,
      outcome: "pending",
      message: "Undo queued as compensating entry",
    });
    expect(harness.getContext().lastSyncError).toBe(
      "Network error while syncing.",
    );

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("refuses to enqueue a transaction without an active sheet scope", async () => {
    providerState.sheetId = null;
    const harness = createProviderHarness();

    await act(async () => {
      await expect(harness.getContext().addTransaction(input)).rejects.toThrow(
        /active sheet/i,
      );
    });
    expect(await db.transactions.count()).toBe(0);

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("refuses to enqueue before the stable Google account identity is known", async () => {
    providerState.userId = null;
    const harness = createProviderHarness();

    await act(async () => {
      await expect(harness.getContext().addTransaction(input)).rejects.toThrow(
        /account identity/i,
      );
    });
    expect(await db.transactions.count()).toBe(0);

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("counts pending rows only for the active sheet", async () => {
    await db.transactions.bulkAdd([
      transaction("pending-a", {
        status: "pending",
        sheetId: undefined,
        sheetRow: undefined,
      }),
      transaction("pending-b", {
        status: "pending",
        targetSheetId: "sheet-b",
        sheetId: undefined,
        sheetRow: undefined,
      }),
      transaction("legacy-pending", {
        status: "pending",
        targetSheetId: undefined,
        targetUserId: undefined,
        sheetId: undefined,
        sheetRow: undefined,
      }),
    ]);
    const harness = createProviderHarness();

    await waitFor(() => {
      expect(harness.getContext().queueCount).toBe(1);
    });

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("does not edit or sync a row owned by a different sheet", async () => {
    providerState.sheetId = "sheet-b";
    await db.transactions.add(
      transaction("owned-by-a", {
        status: "error",
        sheetId: undefined,
        sheetRow: undefined,
        error: "Previous failure",
      }),
    );
    const harness = createProviderHarness();

    await act(async () => {
      await expect(
        harness.getContext().updateTransaction("owned-by-a", {
          note: "Must stay in A",
        }),
      ).rejects.toThrow(/different sheet/i);
    });
    expect(await db.transactions.get("owned-by-a")).toMatchObject({
      note: "Lunch",
      status: "error",
      targetSheetId: "sheet-a",
    });
    expect(syncPendingTransactions).not.toHaveBeenCalled();

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("does not edit a row owned by another Google user on the same sheet", async () => {
    providerState.userId = "user-b";
    await db.transactions.add(
      transaction("owned-by-user-a", {
        status: "error",
        sheetId: undefined,
        sheetRow: undefined,
        error: "Previous failure",
      }),
    );
    const harness = createProviderHarness();

    await act(async () => {
      await expect(
        harness.getContext().updateTransaction("owned-by-user-a", {
          note: "Must stay with user A",
        }),
      ).rejects.toThrow(/different.*account/i);
    });
    expect(await db.transactions.get("owned-by-user-a")).toMatchObject({
      note: "Lunch",
      targetSheetId: "sheet-a",
      targetUserId: "user-a",
    });

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("keeps legacy unscoped rows deletable without adopting them", async () => {
    await db.transactions.add(
      transaction("legacy-delete", {
        status: "pending",
        targetSheetId: undefined,
        targetUserId: undefined,
        sheetId: undefined,
        sheetRow: undefined,
      }),
    );
    const harness = createProviderHarness();

    let result!: Awaited<
      ReturnType<TransactionsContextValue["deleteTransaction"]>
    >;
    await act(async () => {
      result = await harness.getContext().deleteTransaction("legacy-delete");
    });

    expect(result).toEqual({
      ok: true,
      outcome: "deleted",
      message: "Removed pending entry",
    });
    expect(await db.transactions.get("legacy-delete")).toBeUndefined();
    expect(syncPendingTransactions).not.toHaveBeenCalled();

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("keeps legacy unscoped rows in an explicit recovery error instead of adopting them on edit", async () => {
    await db.transactions.add(
      transaction("legacy-edit", {
        status: "pending",
        targetSheetId: undefined,
        targetUserId: undefined,
        sheetId: undefined,
        sheetRow: undefined,
      }),
    );
    const harness = createProviderHarness();

    await act(async () => {
      await expect(
        harness.getContext().updateTransaction("legacy-edit", {
          note: "Do not adopt me",
        }),
      ).rejects.toThrow(/cannot sync safely/i);
    });
    expect(await db.transactions.get("legacy-edit")).toMatchObject({
      note: "Lunch",
      status: "pending",
      targetSheetId: undefined,
      targetUserId: undefined,
    });

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("returns the latest synced copy after an immediate add sync", async () => {
    providerState.isOnline = true;
    vi.mocked(syncPendingTransactions).mockImplementation(
      async (_token: string, activeSheetId: string) => {
        const pending = await db.transactions
          .where("status")
          .equals("pending")
          .toArray();
        for (const record of pending) {
          await db.transactions.update(record.id, {
            status: "synced",
            sheetId: activeSheetId,
            sheetRow: 20,
          });
        }
        return pending.length;
      },
    );
    const harness = createProviderHarness();
    await waitFor(() => {
      expect(harness.getContext().lastSyncAt).not.toBeNull();
    });

    let created!: TransactionRecord;
    await act(async () => {
      created = await harness.getContext().addTransaction(input);
    });

    expect(created).toMatchObject({
      id: expect.any(String),
      status: "synced",
      sheetId: "sheet-a",
      sheetRow: 20,
    });
    expect(await db.transactions.get(created.id)).toEqual(created);

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("preserves a synced row when an update finds duplicate stable IDs", async () => {
    const original = transaction("duplicate-update");
    const integrityError = new googleMocks.DuplicateTransactionIdError(
      original.id,
      2,
      4,
    );
    await db.transactions.add(original);
    googleMocks.readTransactionIdMap.mockRejectedValue(integrityError);
    const harness = createProviderHarness();
    let failure: unknown;

    await act(async () => {
      try {
        await harness.getContext().updateTransaction(original.id, {
          note: "Must not queue",
        });
      } catch (error) {
        failure = error;
      }
    });

    expect(failure).toBe(integrityError);
    expect(await db.transactions.get(original.id)).toEqual(original);
    expect(await db.transactions.count()).toBe(1);
    expect(googleMocks.updateRow).not.toHaveBeenCalled();
    expect(syncPendingTransactions).not.toHaveBeenCalled();

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("preserves a synced row when delete finds duplicate stable IDs", async () => {
    const original = transaction("duplicate-delete");
    const integrityError = new googleMocks.DuplicateTransactionIdError(
      original.id,
      2,
      4,
    );
    await db.transactions.add(original);
    googleMocks.readTransactionIdMap.mockRejectedValue(integrityError);
    const harness = createProviderHarness();
    let failure: unknown;

    await act(async () => {
      try {
        await harness.getContext().deleteTransaction(original.id);
      } catch (error) {
        failure = error;
      }
    });

    expect(failure).toBe(integrityError);
    expect(await db.transactions.get(original.id)).toEqual(original);
    expect(await db.transactions.count()).toBe(1);
    expect(googleMocks.deleteRow).not.toHaveBeenCalled();
    expect(syncPendingTransactions).not.toHaveBeenCalled();

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("preserves the latest synced row when undo finds duplicate stable IDs", async () => {
    const original = transaction("duplicate-undo", {
      createdAt: "2026-08-15T12:00:00.000Z",
    });
    const integrityError = new googleMocks.DuplicateTransactionIdError(
      original.id,
      2,
      4,
    );
    await db.transactions.add(original);
    googleMocks.readTransactionIdMap.mockRejectedValue(integrityError);
    const harness = createProviderHarness();
    let failure: unknown;

    await act(async () => {
      try {
        await harness.getContext().undoLast();
      } catch (error) {
        failure = error;
      }
    });

    expect(failure).toBe(integrityError);
    expect(await db.transactions.get(original.id)).toEqual(original);
    expect(await db.transactions.count()).toBe(1);
    expect(googleMocks.deleteRow).not.toHaveBeenCalled();
    expect(syncPendingTransactions).not.toHaveBeenCalled();

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("fails closed before a direct update when the fallback lock loses ownership", async () => {
    const original = transaction("lock-lost-direct-update", {
      note: "Before",
      sheetRow: 6,
    });
    const remoteReadStarted = deferred<void>();
    const releaseRemoteRead = deferred<TransactionRecord | null>();
    await db.transactions.add(original);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[original.id, 6]]),
    );
    googleMocks.readTransactionById.mockImplementationOnce(async () => {
      remoteReadStarted.resolve();
      return releaseRemoteRead.promise;
    });
    const harness = createProviderHarness();
    let updatePromise!: ReturnType<
      TransactionsContextValue["updateTransaction"]
    >;
    let failure: unknown;

    await act(async () => {
      updatePromise = harness
        .getContext()
        .updateTransaction(original.id, { note: "After" });
      await remoteReadStarted.promise;
    });
    await db.settings.put({
      key: "sheetlog.sheet-mutation:sheet-a",
      value: JSON.stringify({
        ownerId: "successor-tab",
        expiresAt: Date.now() + 60_000,
      }),
      updatedAt: new Date().toISOString(),
    });
    releaseRemoteRead.resolve(original);
    await act(async () => {
      try {
        await updatePromise;
      } catch (error) {
        failure = error;
      }
    });

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain(
      "Sheet mutation lock was lost before the operation completed",
    );
    expect(await db.transactions.get(original.id)).toEqual(original);
    expect(googleMocks.updateRow).not.toHaveBeenCalled();
    expect(syncPendingTransactions).not.toHaveBeenCalled();

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("keeps the original local row when ownership is lost after remote delete", async () => {
    const original = transaction("lock-lost-after-delete", {
      sheetRow: 7,
    });
    const deleteStarted = deferred<void>();
    const releaseDelete = deferred<void>();
    await db.transactions.add(original);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[original.id, 7]]),
    );
    googleMocks.deleteRow.mockImplementationOnce(async () => {
      deleteStarted.resolve();
      return releaseDelete.promise;
    });
    const harness = createProviderHarness();
    let deletePromise!: ReturnType<
      TransactionsContextValue["deleteTransaction"]
    >;
    let failure: unknown;

    await act(async () => {
      deletePromise = harness
        .getContext()
        .deleteTransaction(original.id);
      await deleteStarted.promise;
    });
    await db.settings.put({
      key: "sheetlog.sheet-mutation:sheet-a",
      value: JSON.stringify({
        ownerId: "successor-tab",
        expiresAt: Date.now() + 60_000,
      }),
      updatedAt: new Date().toISOString(),
    });
    releaseDelete.resolve();
    await act(async () => {
      try {
        await deletePromise;
      } catch (error) {
        failure = error;
      }
    });

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain(
      "Sheet mutation lock was lost before the operation completed",
    );
    expect(googleMocks.deleteRow).toHaveBeenCalledTimes(1);
    expect(await db.transactions.get(original.id)).toEqual(original);
    expect(await db.transactions.count()).toBe(1);
    expect(syncPendingTransactions).not.toHaveBeenCalled();

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("deletes a synced row using tab zero and the current K-column row", async () => {
    await db.transactions.add(
      transaction("shifted", {
        sheetRow: 99,
      }),
    );
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([["shifted", 7]]),
    );
    const harness = createProviderHarness();

    let result!: Awaited<
      ReturnType<TransactionsContextValue["deleteTransaction"]>
    >;
    await act(async () => {
      result = await harness.getContext().deleteTransaction("shifted");
    });

    expect(result).toEqual({
      ok: true,
      outcome: "deleted",
      message: "Removed synced entry",
    });
    expect(googleMocks.deleteRow).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      0,
      7,
    );
    expect(await db.transactions.get("shifted")).toBeUndefined();

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("deletes an error row locally without creating compensation", async () => {
    await db.transactions.add(
      transaction("failed", {
        status: "error",
        sheetId: undefined,
        sheetRow: undefined,
        error: "Amount exceeds remaining reimbursement balance",
      }),
    );
    const harness = createProviderHarness();

    await act(async () => {
      await harness.getContext().deleteTransaction("failed");
    });

    expect(await db.transactions.count()).toBe(0);
    expect(googleMocks.deleteRow).not.toHaveBeenCalled();

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("removes a stale synced local row when its ID is already absent remotely", async () => {
    await db.transactions.add(transaction("remote-missing", { sheetRow: 44 }));
    googleMocks.readTransactionIdMap.mockResolvedValue(new Map());
    const harness = createProviderHarness();

    let result!: Awaited<
      ReturnType<TransactionsContextValue["deleteTransaction"]>
    >;
    await act(async () => {
      result = await harness
        .getContext()
        .deleteTransaction("remote-missing");
    });

    expect(result).toEqual({
      ok: true,
      outcome: "deleted",
      message: "Removed entry already absent from Sheets",
    });
    expect(await db.transactions.get("remote-missing")).toBeUndefined();
    expect(googleMocks.deleteRow).not.toHaveBeenCalled();

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("rejects a synced update when its stable ID disappeared without queuing an append", async () => {
    const stale = transaction("missing-update", {
      note: "Before",
      sheetRow: 44,
    });
    await db.transactions.add(stale);
    googleMocks.readTransactionIdMap.mockResolvedValue(new Map());
    const harness = createProviderHarness();
    let failure: unknown;

    await act(async () => {
      try {
        await harness
          .getContext()
          .updateTransaction(stale.id, { note: "After" });
      } catch (error) {
        failure = error;
      }
    });

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("no longer exists");
    expect(await db.transactions.get(stale.id)).toBeUndefined();
    expect(googleMocks.updateRow).not.toHaveBeenCalled();
    expect(syncPendingTransactions).not.toHaveBeenCalled();

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("rejects a synced update when its stable ID disappears during the focused read", async () => {
    const stale = transaction("missing-during-read", {
      note: "Before",
      sheetRow: 44,
    });
    await db.transactions.add(stale);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[stale.id, 44]]),
    );
    googleMocks.readTransactionById.mockResolvedValue(null);
    const harness = createProviderHarness();
    let failure: unknown;

    await act(async () => {
      try {
        await harness
          .getContext()
          .updateTransaction(stale.id, { note: "After" });
      } catch (error) {
        failure = error;
      }
    });

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("no longer exists");
    expect(await db.transactions.get(stale.id)).toBeUndefined();
    expect(googleMocks.updateRow).not.toHaveBeenCalled();
    expect(syncPendingTransactions).not.toHaveBeenCalled();

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("deleting a source leaves linked children as dangling audit rows", async () => {
    await db.transactions.bulkAdd([
      transaction("expense-source", { sheetRow: 4 }),
      transaction("linked-child", {
        type: "income",
        amount: 20,
        category: "Reimbursement",
        reimbursesTransactionId: "expense-source",
        sheetRow: 5,
      }),
    ]);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([
        ["expense-source", 11],
        ["linked-child", 12],
      ]),
    );
    const harness = createProviderHarness();

    await act(async () => {
      await harness.getContext().deleteTransaction("expense-source");
    });

    expect(await db.transactions.get("expense-source")).toBeUndefined();
    expect(await db.transactions.get("linked-child")).toMatchObject({
      reimbursesTransactionId: "expense-source",
      status: "synced",
    });
    expect(googleMocks.deleteRow).toHaveBeenCalledTimes(1);

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("undo resolves the latest synced row from K and accepts tab zero", async () => {
    await db.transactions.add(
      transaction("last-synced", {
        createdAt: "2026-08-15T12:00:00.000Z",
        sheetRow: 88,
      }),
    );
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([["last-synced", 13]]),
    );
    const harness = createProviderHarness();

    let result!: Awaited<ReturnType<TransactionsContextValue["undoLast"]>>;
    await act(async () => {
      result = await harness.getContext().undoLast();
    });

    expect(result).toEqual({
      ok: true,
      outcome: "deleted",
      message: "Removed last synced entry",
    });
    expect(googleMocks.deleteRow).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      0,
      13,
    );
    expect(await db.transactions.count()).toBe(0);

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("retries an error row as pending, clears its stale error, and returns it", async () => {
    await db.transactions.add(
      transaction("retry-me", {
        status: "error",
        sheetId: undefined,
        sheetRow: undefined,
        error: "Old failure",
      }),
    );
    const harness = createProviderHarness();

    let updated!: TransactionRecord | undefined;
    await act(async () => {
      updated = await harness.getContext().updateTransaction("retry-me", {
        note: "Try again",
      });
    });

    expect(updated).toMatchObject({
      id: "retry-me",
      status: "pending",
      note: "Try again",
    });
    expect(updated?.error).toBeUndefined();
    expect(await db.transactions.get("retry-me")).toEqual(updated);

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("returns the latest error copy when an immediate retry fails validation", async () => {
    providerState.isOnline = true;
    const harness = createProviderHarness();
    await waitFor(() => {
      expect(harness.getContext().lastSyncAt).not.toBeNull();
    });
    await db.transactions.add(
      transaction("retry-invalid", {
        status: "error",
        sheetId: undefined,
        sheetRow: undefined,
        error: "Old error",
      }),
    );
    vi.mocked(syncPendingTransactions).mockImplementation(async () => {
      await db.transactions.update("retry-invalid", {
        status: "error",
        error: "Amount exceeds remaining reimbursement balance",
      });
      return 0;
    });

    let updated!: TransactionRecord | undefined;
    await act(async () => {
      updated = await harness.getContext().updateTransaction("retry-invalid", {
        note: "Try adjusted metadata",
      });
    });

    expect(updated).toMatchObject({
      id: "retry-invalid",
      status: "error",
      error: "Amount exceeds remaining reimbursement balance",
      note: "Try adjusted metadata",
      targetSheetId: "sheet-a",
      targetUserId: "user-a",
    });

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("rebuilds linked locked fields from the current remote child before updating", async () => {
    const localChild = transaction("child-1", {
      type: "income",
      amount: 40,
      category: "Reimbursement",
      currency: "THB",
      for: "Me",
      reimbursesTransactionId: "source-1",
      sheetRow: 77,
    });
    const remoteChild = { ...localChild, sheetRow: 9 };
    const source = transaction("source-1", {
      amount: 100,
      sheetRow: 4,
    });
    await db.transactions.add(localChild);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([["child-1", 8]]),
    );
    googleMocks.readTransactionById.mockImplementation(
      async (_token: string, _sheetId: string, id: string) => {
        if (id === "child-1") return remoteChild;
        if (id === "source-1") return source;
        return null;
      },
    );
    googleMocks.readLinkedReimbursements.mockResolvedValue([
      {
        id: "child-1",
        type: "income",
        amount: 40,
        currency: "THB",
        reimbursesTransactionId: "source-1",
        status: "synced",
        sheetRow: 9,
      },
      {
        id: "other-child",
        type: "income",
        amount: 50,
        currency: "THB",
        reimbursesTransactionId: "source-1",
        status: "synced",
        sheetRow: 10,
      },
    ]);
    const harness = createProviderHarness();

    let updated!: TransactionRecord | undefined;
    await act(async () => {
      updated = await harness.getContext().updateTransaction("child-1", {
        type: "expense",
        amount: 45,
        category: "Tampered",
        currency: "USD",
        account: "Bank",
        for: "Someone else",
        note: "Paid back",
        reimbursesTransactionId: "other-source",
      });
    });

    expect(googleMocks.updateRow).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      9,
      expect.objectContaining({
        id: "child-1",
        type: "income",
        amount: 45,
        category: "Reimbursement",
        currency: "THB",
        account: "Bank",
        for: "Me",
        note: "Paid back",
        reimbursesTransactionId: "source-1",
      }),
    );
    expect(updated).toMatchObject({
      type: "income",
      amount: 45,
      category: "Reimbursement",
      currency: "THB",
      account: "Bank",
      for: "Me",
      reimbursesTransactionId: "source-1",
      sheetRow: 9,
      status: "synced",
    });

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("rejects a linked amount increase beyond the current remaining balance", async () => {
    const child = transaction("child-overage", {
      type: "income",
      amount: 40,
      category: "Reimbursement",
      reimbursesTransactionId: "source-overage",
      sheetRow: 6,
    });
    const source = transaction("source-overage", {
      amount: 100,
      sheetRow: 3,
    });
    await db.transactions.add(child);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([["child-overage", 6]]),
    );
    googleMocks.readTransactionById.mockImplementation(
      async (_token: string, _sheetId: string, id: string) =>
        id === child.id ? child : id === source.id ? source : null,
    );
    googleMocks.readLinkedReimbursements.mockResolvedValue([
      {
        id: "child-overage",
        type: "income",
        amount: 40,
        currency: "THB",
        reimbursesTransactionId: "source-overage",
        status: "synced",
      },
      {
        id: "other-overage",
        type: "income",
        amount: 50,
        currency: "THB",
        reimbursesTransactionId: "source-overage",
        status: "synced",
      },
    ]);
    const harness = createProviderHarness();

    let failure: unknown;
    await act(async () => {
      try {
        await harness.getContext().updateTransaction("child-overage", {
          amount: 60,
        });
      } catch (error) {
        failure = error;
      }
    });

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      "Amount exceeds remaining reimbursement balance",
    );
    expect(googleMocks.updateRow).not.toHaveBeenCalled();
    expect(await db.transactions.get("child-overage")).toEqual(child);

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("rejects a direct linked amount edit when a sibling currency mismatches", async () => {
    const child = transaction("child-mismatch", {
      type: "income",
      amount: 40,
      category: "Reimbursement",
      reimbursesTransactionId: "source-mismatch",
      sheetRow: 6,
    });
    const source = transaction("source-mismatch", {
      amount: 100,
      sheetRow: 3,
    });
    await db.transactions.add(child);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[child.id, 6]]),
    );
    googleMocks.readTransactionById.mockImplementation(
      async (_token: string, _sheetId: string, id: string) =>
        id === child.id ? child : id === source.id ? source : null,
    );
    googleMocks.readLinkedReimbursements.mockResolvedValue([
      {
        id: child.id,
        type: "income",
        amount: child.amount,
        currency: "THB",
        reimbursesTransactionId: source.id,
        status: "synced",
      },
      {
        id: "foreign-sibling",
        type: "income",
        amount: 10,
        currency: "USD",
        reimbursesTransactionId: source.id,
        status: "synced",
      },
    ]);
    const harness = createProviderHarness();

    let failure: unknown;
    await act(async () => {
      try {
        await harness.getContext().updateTransaction(child.id, {
          amount: 45,
        });
      } catch (error) {
        failure = error;
      }
    });

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      "Linked reimbursement currency mismatch",
    );
    expect(googleMocks.updateRow).not.toHaveBeenCalled();
    expect(await db.transactions.get(child.id)).toEqual(child);

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("does not reserve a direct linked edit against pending rows from another scope", async () => {
    const child = transaction("child-current-scope", {
      type: "income",
      amount: 40,
      category: "Reimbursement",
      reimbursesTransactionId: "source-current-scope",
      sheetRow: 6,
    });
    const source = transaction("source-current-scope", {
      amount: 100,
      sheetRow: 3,
    });
    const otherScopeSibling = transaction("other-scope-sibling", {
      type: "income",
      amount: 20,
      category: "Reimbursement",
      reimbursesTransactionId: source.id,
      status: "pending",
      targetSheetId: "sheet-b",
      sheetId: undefined,
      sheetRow: undefined,
    });
    await db.transactions.bulkAdd([child, otherScopeSibling]);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[child.id, 6]]),
    );
    googleMocks.readTransactionById.mockImplementation(
      async (_token: string, _sheetId: string, id: string) =>
        id === child.id ? child : id === source.id ? source : null,
    );
    googleMocks.readLinkedReimbursements.mockResolvedValue([
      {
        id: child.id,
        type: "income",
        amount: child.amount,
        currency: "THB",
        reimbursesTransactionId: source.id,
        status: "synced",
      },
    ]);
    const harness = createProviderHarness();

    let updated!: TransactionRecord | undefined;
    await act(async () => {
      updated = await harness
        .getContext()
        .updateTransaction(child.id, { amount: 95 });
    });

    expect(updated).toMatchObject({
      id: child.id,
      amount: 95,
      status: "synced",
    });
    expect(googleMocks.updateRow).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      6,
      expect.objectContaining({ id: child.id, amount: 95 }),
    );

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("allows account, date, and note edits for a dangling linked child", async () => {
    const remoteChild = transaction("dangling-child", {
      type: "income",
      amount: 25,
      category: "Reimbursement",
      reimbursesTransactionId: "deleted-source",
      sheetRow: 12,
    });
    const staleLocalChild = {
      ...remoteChild,
      amount: 20,
      account: "Stale account",
      sheetRow: 91,
    };
    await db.transactions.add(staleLocalChild);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[remoteChild.id, 12]]),
    );
    googleMocks.readTransactionById.mockImplementation(
      async (_token: string, _sheetId: string, id: string) =>
        id === remoteChild.id ? remoteChild : null,
    );
    const harness = createProviderHarness();

    let updated!: TransactionRecord | undefined;
    await act(async () => {
      updated = await harness.getContext().updateTransaction(remoteChild.id, {
        account: "Savings",
        date: "2026-08-16T09:30:00.000Z",
        note: "Friend repaid in cash",
      });
    });

    expect(updated).toMatchObject({
      id: remoteChild.id,
      amount: 25,
      account: "Savings",
      date: "2026-08-16T09:30:00.000Z",
      note: "Friend repaid in cash",
      type: "income",
      category: "Reimbursement",
      reimbursesTransactionId: "deleted-source",
      status: "synced",
    });
    expect(googleMocks.updateRow).toHaveBeenCalledTimes(1);

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("rejects changing the amount of a dangling linked child", async () => {
    const child = transaction("dangling-amount", {
      type: "income",
      amount: 25,
      category: "Reimbursement",
      reimbursesTransactionId: "deleted-source",
      sheetRow: 13,
    });
    await db.transactions.add(child);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[child.id, 13]]),
    );
    googleMocks.readTransactionById.mockImplementation(
      async (_token: string, _sheetId: string, id: string) =>
        id === child.id ? child : null,
    );
    const harness = createProviderHarness();

    let failure: unknown;
    await act(async () => {
      try {
        await harness.getContext().updateTransaction(child.id, { amount: 30 });
      } catch (error) {
        failure = error;
      }
    });

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("Original expense unavailable");
    expect(googleMocks.updateRow).not.toHaveBeenCalled();
    expect(await db.transactions.get(child.id)).toEqual(child);

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("keeps linked locked fields safe when an in-place network write queues", async () => {
    const remoteChild = transaction("network-child", {
      type: "income",
      amount: 25,
      category: "Reimbursement",
      account: "Remote bank",
      date: "2026-08-15T11:00:00.000Z",
      note: "Remote note",
      reimbursesTransactionId: "network-source",
      createdAt: "2026-08-15T10:00:00.000Z",
      sheetRow: 14,
    });
    const staleLocalChild = {
      ...remoteChild,
      amount: 10,
      account: "Stale wallet",
      date: "2026-08-14T11:00:00.000Z",
      note: "Stale note",
      createdAt: "2026-08-14T10:00:00.000Z",
      sheetRow: 99,
      error: "Stale error",
    };
    await db.transactions.add(staleLocalChild);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[remoteChild.id, 13]]),
    );
    googleMocks.readTransactionById.mockResolvedValue(remoteChild);
    googleMocks.updateRow.mockRejectedValue(new TypeError("offline"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const harness = createProviderHarness();

    let updated!: TransactionRecord | undefined;
    await act(async () => {
      updated = await harness.getContext().updateTransaction(remoteChild.id, {
        type: "expense",
        category: "Tampered",
        currency: "USD",
        for: "Someone else",
        reimbursesTransactionId: "wrong-source",
        note: "Queued note",
      });
    });

    expect(warn).toHaveBeenCalled();
    expect(googleMocks.updateRow).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      14,
      {
        ...remoteChild,
        type: "income",
        category: "Reimbursement",
        currency: "THB",
        for: "Me",
        reimbursesTransactionId: "network-source",
        note: "Queued note",
        updatedAt: expect.any(String),
        error: undefined,
      },
    );
    expect(updated).toEqual({
      ...remoteChild,
      note: "Queued note",
      status: "pending",
      updatedAt: expect.any(String),
      sheetRow: undefined,
      error: undefined,
    });

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("queues an offline linked delete as a stable-ID tombstone", async () => {
    const child = transaction("compensated-child", {
      type: "income",
      amount: 25,
      category: "Reimbursement",
      reimbursesTransactionId: "compensated-source",
      sheetRow: 15,
    });
    await db.transactions.add(child);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[child.id, 15]]),
    );
    googleMocks.deleteRow.mockRejectedValue(new TypeError("offline"));
    const harness = createProviderHarness();

    let result!: Awaited<
      ReturnType<TransactionsContextValue["deleteTransaction"]>
    >;
    await act(async () => {
      result = await harness.getContext().deleteTransaction(child.id);
    });

    expect(result).toEqual({
      ok: true,
      outcome: "pending",
      message: "Reimbursement removal queued",
    });
    const remaining = await db.transactions.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({
      id: child.id,
      type: "income",
      amount: 25,
      reimbursesTransactionId: "compensated-source",
      deleteIntent: true,
      status: "pending",
      targetSheetId: "sheet-a",
      targetUserId: "user-a",
    });

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("retries an errored linked tombstone with the same ID", async () => {
    providerState.isOnline = true;
    const harness = createProviderHarness();
    await waitFor(() => {
      expect(harness.getContext().lastSyncAt).not.toBeNull();
    });
    vi.mocked(syncPendingTransactions).mockReset();
    const child = {
      ...transaction("retry-linked-delete", {
        type: "income",
        amount: 25,
        category: "Reimbursement",
        reimbursesTransactionId: "deleted-source",
        status: "error",
        sheetRow: undefined,
        error: "Sheet not found. Reconnect to create a new one.",
      }),
      deleteIntent: true,
    };
    await db.transactions.add(child);
    vi.mocked(syncPendingTransactions).mockImplementation(async () => {
      const retry = await db.transactions.get(child.id);
      expect(retry).toMatchObject({
        id: child.id,
        deleteIntent: true,
        status: "pending",
        error: undefined,
      });
      await db.transactions.delete(child.id);
      return 1;
    });

    let result!: Awaited<
      ReturnType<TransactionsContextValue["deleteTransaction"]>
    >;
    await act(async () => {
      result = await harness.getContext().deleteTransaction(child.id);
    });

    expect(result).toEqual({
      ok: true,
      outcome: "deleted",
      message: "Reimbursement removed",
    });
    expect(syncPendingTransactions).toHaveBeenCalledTimes(1);
    expect(await db.transactions.get(child.id)).toBeUndefined();
    expect(await db.transactions.count()).toBe(0);

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("returns an actionable error while retaining a failed linked tombstone", async () => {
    providerState.isOnline = true;
    const harness = createProviderHarness();
    await waitFor(() => {
      expect(harness.getContext().lastSyncAt).not.toBeNull();
    });
    vi.mocked(syncPendingTransactions).mockReset();
    const child = transaction("failed-linked-delete", {
      type: "income",
      amount: 25,
      category: "Reimbursement",
      reimbursesTransactionId: "deleted-source",
      sheetRow: 15,
    });
    await db.transactions.add(child);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[child.id, 15]]),
    );
    googleMocks.deleteRow.mockRejectedValue(new TypeError("offline"));
    vi.mocked(syncPendingTransactions).mockImplementation(async () => {
      await db.transactions.update(child.id, {
        status: "error",
        error: "Sheet not found. Reconnect to create a new one.",
      });
      return 0;
    });

    let result!: Awaited<
      ReturnType<TransactionsContextValue["deleteTransaction"]>
    >;
    await act(async () => {
      result = await harness.getContext().deleteTransaction(child.id);
    });

    expect(result).toEqual({
      ok: false,
      outcome: "error",
      message: "Sheet not found. Reconnect to create a new one.",
    });
    expect(await db.transactions.get(child.id)).toMatchObject({
      id: child.id,
      amount: 25,
      reimbursesTransactionId: "deleted-source",
      deleteIntent: true,
      status: "error",
    });
    expect(await db.transactions.count()).toBe(1);

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("queues a compensating delete when resolving the tab ID fails", async () => {
    providerState.sheetTabId = null;
    const synced = transaction("tab-lookup-failure", { sheetRow: 16 });
    await db.transactions.add(synced);
    googleMocks.getSheetTabId.mockRejectedValue(new TypeError("offline"));
    const harness = createProviderHarness();

    let result!: Awaited<
      ReturnType<TransactionsContextValue["deleteTransaction"]>
    >;
    await act(async () => {
      result = await harness
        .getContext()
        .deleteTransaction("tab-lookup-failure");
    });

    expect(result).toEqual({
      ok: true,
      outcome: "pending",
      message: "Delete queued as compensating entry",
    });
    const remaining = await db.transactions.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].amount).toBe(-42);
    expect(harness.getContext().lastSyncError).toBe(
      "Network error while syncing.",
    );

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("invalidates transaction cache prefixes when syncNow settles with an error", async () => {
    vi.mocked(syncPendingTransactions).mockRejectedValue(
      new TypeError("offline"),
    );
    const harness = createProviderHarness();
    const invalidateQueries = vi.spyOn(
      harness.queryClient,
      "invalidateQueries",
    );

    await act(async () => {
      await harness.getContext().syncNow();
    });

    expect(invalidatedKeys(invalidateQueries)).toEqual(
      expect.arrayContaining([
        transactionQueryKeys.local,
        ["recentTransactions"],
        transactionQueryKeys.reimbursements,
        ["transactionById"],
      ]),
    );

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("serializes a delete behind an in-flight sync and removes the row remotely", async () => {
    const pending = transaction("delete-during-sync", {
      status: "pending",
      sheetId: undefined,
      sheetRow: undefined,
    });
    await db.transactions.add(pending);
    const syncStarted = deferred<void>();
    const releaseSync = deferred<void>();
    vi.mocked(syncPendingTransactions).mockImplementationOnce(async () => {
      syncStarted.resolve();
      await releaseSync.promise;
      await db.transactions.update(pending.id, {
        status: "synced",
        sheetId: "sheet-a",
        sheetRow: 21,
      });
      return 1;
    });
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[pending.id, 21]]),
    );
    const harness = createProviderHarness();
    let syncPromise!: Promise<void>;
    await act(async () => {
      syncPromise = harness.getContext().syncNow();
      await syncStarted.promise;
    });

    let deletePromise!: ReturnType<
      TransactionsContextValue["deleteTransaction"]
    >;
    act(() => {
      deletePromise = harness.getContext().deleteTransaction(pending.id);
    });

    expect(await db.transactions.get(pending.id)).toBeDefined();
    releaseSync.resolve();
    let result!: Awaited<typeof deletePromise>;
    await act(async () => {
      await syncPromise;
      result = await deletePromise;
    });

    expect(result).toEqual({
      ok: true,
      outcome: "deleted",
      message: "Removed synced entry",
    });
    expect(googleMocks.deleteRow).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      0,
      21,
    );
    expect(await db.transactions.get(pending.id)).toBeUndefined();

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("serializes same-scope providers so a delete cannot shift an update onto the wrong K row", async () => {
    const first = transaction("cross-tab-delete", { sheetRow: 2 });
    const second = transaction("cross-tab-update", {
      note: "Before",
      sheetRow: 3,
    });
    const third = transaction("untouched-third-row", { sheetRow: 4 });
    await db.transactions.bulkAdd([first, second]);
    const remoteRows = [first, second, third];
    const deleteStarted = deferred<void>();
    const releaseDelete = deferred<void>();
    const deleteFinished = deferred<void>();
    const updateStarted = deferred<void>();

    googleMocks.readTransactionIdMap.mockImplementation(async () =>
      new Map(
        remoteRows.map((record, index) => [record.id, index + 2] as const),
      ),
    );
    googleMocks.readTransactionById.mockImplementation(async (_token, _sheet, id) => {
      const index = remoteRows.findIndex((record) => record.id === id);
      return index < 0
        ? null
        : { ...remoteRows[index], sheetRow: index + 2 };
    });
    googleMocks.deleteRow.mockImplementation(
      async (_token, _sheet, tabId, rowIndex) => {
        expect(tabId).toBe(0);
        deleteStarted.resolve();
        await releaseDelete.promise;
        remoteRows.splice(rowIndex - 2, 1);
        deleteFinished.resolve();
      },
    );
    googleMocks.updateRow.mockImplementation(
      async (_token, _sheet, rowIndex, record) => {
        updateStarted.resolve();
        await deleteFinished.promise;
        remoteRows[rowIndex - 2] = record;
      },
    );

    const deletingProvider = createProviderHarness();
    const updatingProvider = createProviderHarness();
    let deletePromise!: ReturnType<
      TransactionsContextValue["deleteTransaction"]
    >;
    let updatePromise!: ReturnType<
      TransactionsContextValue["updateTransaction"]
    >;
    await act(async () => {
      deletePromise = deletingProvider
        .getContext()
        .deleteTransaction(first.id);
      await deleteStarted.promise;
      updatePromise = updatingProvider
        .getContext()
        .updateTransaction(second.id, { note: "After" });
      await Promise.race([
        updateStarted.promise,
        new Promise<void>((resolve) => {
          setTimeout(resolve, 50);
        }),
      ]);
      releaseDelete.resolve();
      await Promise.all([deletePromise, updatePromise]);
    });

    expect(googleMocks.deleteRow).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      0,
      2,
    );
    expect(googleMocks.updateRow).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      2,
      expect.objectContaining({ id: second.id, note: "After" }),
    );
    expect(remoteRows.map(({ id }) => id)).toEqual([
      second.id,
      third.id,
    ]);

    deletingProvider.rendered.unmount();
    deletingProvider.queryClient.clear();
    updatingProvider.rendered.unmount();
    updatingProvider.queryClient.clear();
  });

  it("does not resurrect a row deleted while another provider waits to update it", async () => {
    const transactionToDelete = transaction("delete-before-cross-tab-update", {
      note: "Before",
      sheetRow: 2,
    });
    await db.transactions.add(transactionToDelete);
    const remoteRows = [transactionToDelete];
    const deleteStarted = deferred<void>();
    const releaseDelete = deferred<void>();
    const deleteFinished = deferred<void>();
    const updateStarted = deferred<void>();

    googleMocks.readTransactionIdMap.mockImplementation(async () =>
      new Map(
        remoteRows.map((record, index) => [record.id, index + 2] as const),
      ),
    );
    googleMocks.readTransactionById.mockImplementation(
      async (_token, _sheet, id) => {
        const index = remoteRows.findIndex((record) => record.id === id);
        return index < 0
          ? null
          : { ...remoteRows[index], sheetRow: index + 2 };
      },
    );
    googleMocks.deleteRow.mockImplementation(async (_token, _sheet, _tab, row) => {
      deleteStarted.resolve();
      await releaseDelete.promise;
      remoteRows.splice(row - 2, 1);
      deleteFinished.resolve();
    });
    googleMocks.updateRow.mockImplementation(async (_token, _sheet, row, record) => {
      updateStarted.resolve();
      await deleteFinished.promise;
      remoteRows[row - 2] = record;
    });

    const deletingProvider = createProviderHarness();
    const updatingProvider = createProviderHarness();
    let deleted!: Awaited<
      ReturnType<TransactionsContextValue["deleteTransaction"]>
    >;
    let updated!: Awaited<
      ReturnType<TransactionsContextValue["updateTransaction"]>
    >;
    let updateEnteredBeforeDeleteReleased = false;
    await act(async () => {
      const deletePromise = deletingProvider
        .getContext()
        .deleteTransaction(transactionToDelete.id);
      await deleteStarted.promise;
      const updatePromise = updatingProvider
        .getContext()
        .updateTransaction(transactionToDelete.id, { note: "After" });
      updateEnteredBeforeDeleteReleased = await Promise.race([
        updateStarted.promise.then(() => true),
        new Promise<false>((resolve) => {
          setTimeout(() => resolve(false), 50);
        }),
      ]);
      releaseDelete.resolve();
      [deleted, updated] = await Promise.all([deletePromise, updatePromise]);
    });

    expect(deleted).toEqual({
      ok: true,
      outcome: "deleted",
      message: "Removed synced entry",
    });
    expect(updateEnteredBeforeDeleteReleased).toBe(false);
    expect(updated).toBeUndefined();
    expect(await db.transactions.get(transactionToDelete.id)).toBeUndefined();
    expect(googleMocks.updateRow).not.toHaveBeenCalled();
    expect(syncPendingTransactions).not.toHaveBeenCalled();
    expect(remoteRows).toEqual([]);

    deletingProvider.rendered.unmount();
    deletingProvider.queryClient.clear();
    updatingProvider.rendered.unmount();
    updatingProvider.queryClient.clear();
  });

  it("serializes a pending edit behind sync and writes the edited value remotely", async () => {
    const pending = transaction("edit-during-sync", {
      status: "pending",
      note: "Before",
      sheetId: undefined,
      sheetRow: undefined,
    });
    const remote = transaction(pending.id, {
      note: "Before",
      sheetRow: 22,
    });
    await db.transactions.add(pending);
    const syncStarted = deferred<void>();
    const releaseSync = deferred<void>();
    vi.mocked(syncPendingTransactions).mockImplementationOnce(async () => {
      syncStarted.resolve();
      await releaseSync.promise;
      await db.transactions.update(pending.id, {
        status: "synced",
        sheetId: "sheet-a",
        sheetRow: 22,
      });
      return 1;
    });
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[pending.id, 22]]),
    );
    googleMocks.readTransactionById.mockResolvedValue(remote);
    const harness = createProviderHarness();
    let syncPromise!: Promise<void>;
    await act(async () => {
      syncPromise = harness.getContext().syncNow();
      await syncStarted.promise;
    });

    let updatePromise!: ReturnType<
      TransactionsContextValue["updateTransaction"]
    >;
    act(() => {
      updatePromise = harness.getContext().updateTransaction(pending.id, {
        note: "After",
      });
    });

    expect((await db.transactions.get(pending.id))?.note).toBe("Before");
    releaseSync.resolve();
    let result!: Awaited<typeof updatePromise>;
    await act(async () => {
      await syncPromise;
      result = await updatePromise;
    });

    expect(result).toMatchObject({ status: "synced", note: "After" });
    expect(googleMocks.updateRow).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      22,
      expect.objectContaining({ id: pending.id, note: "After" }),
    );

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("persists an add immediately and runs a follow-up sync during an active sync", async () => {
    providerState.isOnline = true;
    const syncStarted = deferred<void>();
    const releaseSync = deferred<void>();
    vi.mocked(syncPendingTransactions)
      .mockImplementationOnce(async () => {
        syncStarted.resolve();
        await releaseSync.promise;
        return 0;
      })
      .mockImplementationOnce(async (_token, activeSheetId) => {
        const pendingRows = await db.transactions
          .where("status")
          .equals("pending")
          .toArray();
        for (const record of pendingRows) {
          await db.transactions.update(record.id, {
            status: "synced",
            sheetId: activeSheetId,
            sheetRow: 23,
          });
        }
        return pendingRows.length;
      });
    const harness = createProviderHarness();
    await act(async () => {
      await syncStarted.promise;
    });
    const addPersisted = deferred<void>();
    const originalAdd = db.transactions.add.bind(db.transactions);
    const addToDb = vi
      .spyOn(db.transactions, "add")
      .mockImplementation((record, key) => {
        const addResult =
          key === undefined
            ? originalAdd(record)
            : originalAdd(record, key);
        void addResult.then(() => addPersisted.resolve());
        return addResult;
      });

    let addPromise!: ReturnType<TransactionsContextValue["addTransaction"]>;
    let result!: Awaited<typeof addPromise>;
    await act(async () => {
      addPromise = harness.getContext().addTransaction(input);
      await addPersisted.promise;
      expect(addToDb).toHaveBeenCalledTimes(1);
      expect(syncPendingTransactions).toHaveBeenCalledTimes(1);
      expect(
        await db.transactions.where("status").equals("pending").count(),
      ).toBe(1);
      releaseSync.resolve();
      result = await addPromise;
    });

    expect(syncPendingTransactions).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      status: "synced",
      sheetId: "sheet-a",
      sheetRow: 23,
    });

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("does not compensate a completed remote delete when invalidation fails", async () => {
    const synced = transaction("delete-before-invalidation-failure", {
      sheetRow: 91,
    });
    await db.transactions.add(synced);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[synced.id, 26]]),
    );
    const harness = createProviderHarness();
    const invalidationError = new Error("cache unavailable after delete");
    vi.spyOn(harness.queryClient, "invalidateQueries").mockRejectedValue(
      invalidationError,
    );

    let result!: Awaited<
      ReturnType<TransactionsContextValue["deleteTransaction"]>
    >;
    await act(async () => {
      result = await harness.getContext().deleteTransaction(synced.id);
    });

    expect(result).toEqual({
      ok: true,
      outcome: "deleted",
      message: "Removed synced entry",
    });
    expect(googleMocks.deleteRow).toHaveBeenCalledTimes(1);
    expect(googleMocks.deleteRow).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      0,
      26,
    );
    expect(await db.transactions.toArray()).toEqual([]);

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("returns a durable local add when cache invalidation fails", async () => {
    const harness = createProviderHarness();
    vi.spyOn(harness.queryClient, "invalidateQueries").mockRejectedValue(
      new Error("cache unavailable after add"),
    );

    let created!: TransactionRecord;
    await act(async () => {
      created = await harness.getContext().addTransaction(input);
    });

    expect(created).toMatchObject({ status: "pending", ...input });
    expect(await db.transactions.get(created.id)).toEqual(created);

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("keeps a completed direct update synced when cache invalidation fails", async () => {
    const synced = transaction("update-before-invalidation-failure", {
      note: "Before",
      sheetRow: 27,
    });
    await db.transactions.add(synced);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[synced.id, 27]]),
    );
    googleMocks.readTransactionById.mockResolvedValue(synced);
    const harness = createProviderHarness();
    vi.spyOn(harness.queryClient, "invalidateQueries").mockRejectedValue(
      new Error("cache unavailable after update"),
    );

    let updated!: TransactionRecord | undefined;
    await act(async () => {
      updated = await harness.getContext().updateTransaction(synced.id, {
        note: "After",
      });
    });

    expect(googleMocks.updateRow).toHaveBeenCalledTimes(1);
    expect(syncPendingTransactions).not.toHaveBeenCalled();
    expect(updated).toMatchObject({ status: "synced", note: "After" });
    expect(await db.transactions.get(synced.id)).toMatchObject({
      status: "synced",
      note: "After",
    });

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("latches a syncNow call made while another sync is active", async () => {
    const syncStarted = deferred<void>();
    const releaseSync = deferred<void>();
    vi.mocked(syncPendingTransactions)
      .mockImplementationOnce(async () => {
        syncStarted.resolve();
        await releaseSync.promise;
        return 0;
      })
      .mockResolvedValueOnce(0);
    const harness = createProviderHarness();
    let firstSync!: Promise<void>;
    await act(async () => {
      firstSync = harness.getContext().syncNow();
      await syncStarted.promise;
    });

    const followUpSync = harness.getContext().syncNow();

    expect(syncPendingTransactions).toHaveBeenCalledTimes(1);
    releaseSync.resolve();
    await act(async () => {
      await firstSync;
      await followUpSync;
    });
    expect(syncPendingTransactions).toHaveBeenCalledTimes(2);

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("recovers the sync mutex after cache invalidation rejects", async () => {
    const harness = createProviderHarness();
    const invalidationError = new Error("cache unavailable");
    vi.spyOn(harness.queryClient, "invalidateQueries")
      .mockRejectedValueOnce(invalidationError)
      .mockResolvedValue(undefined);

    let firstFailure: unknown;
    await act(async () => {
      try {
        await harness.getContext().syncNow();
      } catch (error) {
        firstFailure = error;
      }
    });
    await act(async () => {
      await harness.getContext().syncNow();
    });

    expect(firstFailure).toBe(invalidationError);
    expect(syncPendingTransactions).toHaveBeenCalledTimes(2);

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("uses an authoritative remote reimbursement relation when local Dexie is unlinked", async () => {
    const staleLocal = transaction("remote-linked", {
      type: "expense",
      category: "Stale expense",
      reimbursesTransactionId: undefined,
      sheetRow: 72,
    });
    const remoteChild = transaction(staleLocal.id, {
      type: "income",
      amount: 25,
      category: "Reimbursement",
      currency: "THB",
      for: "Me",
      reimbursesTransactionId: "source-authoritative",
      sheetRow: 24,
    });
    await db.transactions.add(staleLocal);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[staleLocal.id, 23]]),
    );
    googleMocks.readTransactionById.mockResolvedValue(remoteChild);
    const harness = createProviderHarness();

    let updated!: TransactionRecord | undefined;
    await act(async () => {
      updated = await harness.getContext().updateTransaction(staleLocal.id, {
        type: "expense",
        category: "Tampered",
        currency: "USD",
        for: "Someone else",
        reimbursesTransactionId: "wrong-source",
        note: "Allowed metadata",
      });
    });

    expect(googleMocks.updateRow).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      24,
      expect.objectContaining({
        id: staleLocal.id,
        type: "income",
        category: "Reimbursement",
        currency: "THB",
        for: "Me",
        reimbursesTransactionId: "source-authoritative",
        note: "Allowed metadata",
      }),
    );
    expect(updated).toMatchObject({
      type: "income",
      category: "Reimbursement",
      currency: "THB",
      for: "Me",
      reimbursesTransactionId: "source-authoritative",
    });

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("does not resurrect a stale local relation when the remote child is unlinked", async () => {
    const staleLocal = transaction("remote-unlinked", {
      type: "income",
      category: "Reimbursement",
      reimbursesTransactionId: "deleted-link",
      sheetRow: 73,
    });
    const remote = transaction(staleLocal.id, {
      type: "income",
      category: "Salary",
      reimbursesTransactionId: undefined,
      sheetRow: 25,
    });
    await db.transactions.add(staleLocal);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[staleLocal.id, 25]]),
    );
    googleMocks.readTransactionById.mockResolvedValue(remote);
    const harness = createProviderHarness();

    let updated!: TransactionRecord | undefined;
    await act(async () => {
      updated = await harness.getContext().updateTransaction(staleLocal.id, {
        category: "Bonus",
        note: "Remote is authoritative",
        reimbursesTransactionId: "wrong-source",
      });
    });

    expect(googleMocks.updateRow).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      25,
      expect.objectContaining({
        id: staleLocal.id,
        category: "Bonus",
        note: "Remote is authoritative",
        reimbursesTransactionId: undefined,
      }),
    );
    expect(updated?.reimbursesTransactionId).toBeUndefined();
    expect(updated?.category).toBe("Bonus");

    harness.rendered.unmount();
    harness.queryClient.clear();
  });
});

describe("transaction mutations", () => {
  afterEach(() => {
    onlineManager.setOnline(true);
    mutationContextState.value = null;
  });

  it("returns the add provider record and invalidates without force-fetching", async () => {
    const created = transaction("created-by-hook", {
      status: "pending",
      sheetId: undefined,
      sheetRow: undefined,
    });
    const addTransaction = vi.fn().mockResolvedValue(created);
    mutationContextState.value = mutationContext({ addTransaction });
    const { queryClient, wrapper } = createMutationHarness();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useAddTransactionMutation(), {
      wrapper,
    });

    let returned!: TransactionRecord;
    await act(async () => {
      returned = await result.current.mutateAsync({
        type: "expense",
        amount: "42",
        currency: "THB",
        account: "Wallet",
        forValue: "Me",
        category: "Food",
        dateObject: new Date("2026-08-15T08:00:00.000Z"),
        note: " Lunch ",
      });
    });

    expect(returned).toEqual(created);
    expect(addTransaction).toHaveBeenCalledWith({
      ...input,
      date: "2026-08-15T08:00:00",
    });
    expect(invalidatedKeys(invalidateQueries)).toEqual(
      expect.arrayContaining([
        transactionQueryKeys.local,
        ["recentTransactions"],
        transactionQueryKeys.reimbursements,
        ["transactionById"],
      ]),
    );
    queryClient.clear();
  });

  it("rejects an add result whose persisted row is in error", async () => {
    const failed = transaction("failed-by-hook", {
      status: "error",
      error: "Reconnect to Google to keep syncing.",
      sheetId: undefined,
      sheetRow: undefined,
    });
    mutationContextState.value = mutationContext({
      addTransaction: vi.fn().mockResolvedValue(failed),
    });
    const { queryClient, wrapper } = createMutationHarness();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useAddTransactionMutation(), {
      wrapper,
    });

    let failure: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({
          type: "expense",
          amount: "42",
          currency: "THB",
          account: "Wallet",
          forValue: "Me",
          category: "Food",
          dateObject: new Date("2026-08-15T08:00:00.000Z"),
          note: "Lunch",
        });
      } catch (error) {
        failure = error;
      }
    });

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      "Reconnect to Google to keep syncing.",
    );
    expect(invalidatedKeys(invalidateQueries)).toEqual(
      expect.arrayContaining([
        transactionQueryKeys.local,
        ["recentTransactions"],
        transactionQueryKeys.reimbursements,
        ["transactionById"],
      ]),
    );
    queryClient.clear();
  });

  it("returns the update provider record and invalidates every prefix", async () => {
    const updated = transaction("updated-by-hook", { note: "Updated" });
    const updateTransaction = vi.fn().mockResolvedValue(updated);
    mutationContextState.value = mutationContext({ updateTransaction });
    const { queryClient, wrapper } = createMutationHarness();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useUpdateTransactionMutation(), {
      wrapper,
    });

    let returned!: TransactionRecord | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync({
        id: updated.id,
        input: { note: "Updated" },
      });
    });

    expect(returned).toEqual(updated);
    expect(invalidatedKeys(invalidateQueries)).toEqual(
      expect.arrayContaining([
        transactionQueryKeys.local,
        ["recentTransactions"],
        transactionQueryKeys.reimbursements,
        ["transactionById"],
      ]),
    );
    queryClient.clear();
  });

  it("executes an update immediately offline and settles with the provider result", async () => {
    const updated = transaction("offline-update-by-hook", {
      note: "Queued update",
      status: "pending",
    });
    const updateTransaction = vi.fn().mockResolvedValue(updated);
    mutationContextState.value = mutationContext({ updateTransaction });
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    }
    const { result } = renderHook(() => useUpdateTransactionMutation(), {
      wrapper: Wrapper,
    });
    let mutationPromise: Promise<TransactionRecord> | undefined;

    onlineManager.setOnline(false);
    act(() => {
      mutationPromise = result.current.mutateAsync({
        id: updated.id,
        input: { note: "Queued update" },
      });
    });

    try {
      await waitFor(
        () => {
          expect(updateTransaction).toHaveBeenCalledWith(updated.id, {
            note: "Queued update",
          });
        },
        { timeout: 250 },
      );
      await expect(mutationPromise).resolves.toEqual(updated);
      expect(invalidatedKeys(invalidateQueries)).toEqual(
        expect.arrayContaining([
          transactionQueryKeys.local,
          ["recentTransactions"],
          transactionQueryKeys.reimbursements,
          ["transactionById"],
        ]),
      );
    } finally {
      onlineManager.setOnline(true);
      await mutationPromise?.catch(() => undefined);
      queryClient.clear();
    }
  });

  it("rejects an update result whose persisted row is in error", async () => {
    const failed = transaction("update-failed", {
      status: "error",
      error: "Amount exceeds remaining reimbursement balance",
    });
    const updateTransaction = vi.fn().mockResolvedValue(failed);
    mutationContextState.value = mutationContext({ updateTransaction });
    const { queryClient, wrapper } = createMutationHarness();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useUpdateTransactionMutation(), {
      wrapper,
    });

    let failure: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({
          id: failed.id,
          input: { amount: 101 },
        });
      } catch (error) {
        failure = error;
      }
    });

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      "Amount exceeds remaining reimbursement balance",
    );
    expect(updateTransaction).toHaveBeenCalledWith(failed.id, { amount: 101 });
    expect(invalidatedKeys(invalidateQueries)).toEqual(
      expect.arrayContaining([
        transactionQueryKeys.local,
        ["recentTransactions"],
        transactionQueryKeys.reimbursements,
        ["transactionById"],
      ]),
    );
    queryClient.clear();
  });

  it("rejects a missing update provider result instead of reporting success", async () => {
    mutationContextState.value = mutationContext({
      updateTransaction: vi.fn().mockResolvedValue(undefined),
    });
    const { queryClient, wrapper } = createMutationHarness();
    const { result } = renderHook(() => useUpdateTransactionMutation(), {
      wrapper,
    });

    let failure: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({
          id: "missing-row",
          input: { note: "Updated" },
        });
      } catch (error) {
        failure = error;
      }
    });

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      "Transaction no longer exists. Refresh and try again.",
    );
    queryClient.clear();
  });

  it("returns the delete provider result and invalidates every prefix", async () => {
    const deleted = {
      ok: true,
      outcome: "deleted" as const,
      message: "Removed synced entry",
    };
    const deleteTransaction = vi.fn().mockResolvedValue(deleted);
    mutationContextState.value = mutationContext({ deleteTransaction });
    const { queryClient, wrapper } = createMutationHarness();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDeleteTransactionMutation(), {
      wrapper,
    });

    let returned!: Awaited<
      ReturnType<TransactionsContextValue["deleteTransaction"]>
    >;
    await act(async () => {
      returned = await result.current.mutateAsync("delete-by-hook");
    });

    expect(returned).toEqual(deleted);
    expect(invalidatedKeys(invalidateQueries)).toEqual(
      expect.arrayContaining([
        transactionQueryKeys.local,
        ["recentTransactions"],
        transactionQueryKeys.reimbursements,
        ["transactionById"],
      ]),
    );
    queryClient.clear();
  });

  it("rejects a delete provider result whose operation was not completed", async () => {
    mutationContextState.value = mutationContext({
      deleteTransaction: vi.fn().mockResolvedValue({
        ok: false,
        outcome: "error",
        message: "Transaction not found",
      }),
    });
    const { queryClient, wrapper } = createMutationHarness();
    const { result } = renderHook(() => useDeleteTransactionMutation(), {
      wrapper,
    });

    let failure: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync("missing-transaction");
      } catch (error) {
        failure = error;
      }
    });

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("Transaction not found");
    queryClient.clear();
  });
});
