import "fake-indexeddb/auto";
import {
  QueryClient,
  QueryClientProvider,
  type QueryKey,
} from "@tanstack/react-query";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../../lib/db";
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
  sheetId: "sheet-a" as string | null,
  sheetTabId: 0 as number | null,
  isOnline: false,
  signOut: vi.fn(),
}));

const googleMocks = vi.hoisted(() => ({
  deleteRow: vi.fn(),
  getSheetTabId: vi.fn(),
  readLinkedReimbursements: vi.fn(),
  readTransactionById: vi.fn(),
  readTransactionIdMap: vi.fn(),
  updateRow: vi.fn(),
}));

const mutationContextState = vi.hoisted(() => ({
  value: null as TransactionsContextValue | null,
}));

vi.mock("../../../lib/google", () => {
  class GoogleApiError extends Error {
    status: number;

    constructor({ status, message }: { status: number; message: string }) {
      super(message);
      this.status = status;
    }
  }

  return { ...googleMocks, GoogleApiError };
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
    sheetId: "sheet-a",
    sheetRow: 2,
    sheetRowValid: true,
    ...overrides,
  };
}

function createProviderHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  let context: TransactionsContextValue | null = null;

  function CaptureContext() {
    context = useTransactions();
    return null;
  }

  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <TransactionsProvider>
        <CaptureContext />
      </TransactionsProvider>
    </QueryClientProvider>,
  );

  return {
    queryClient,
    rendered,
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
    expect(await db.transactions.get(created.id)).toEqual(created);
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

    expect(result).toEqual({ ok: true, message: "Removed synced entry" });
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
      message: "Removed entry already absent from Sheets",
    });
    expect(await db.transactions.get("remote-missing")).toBeUndefined();
    expect(googleMocks.deleteRow).not.toHaveBeenCalled();

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

    expect(result).toEqual({ ok: true, message: "Removed last synced entry" });
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
    const child = transaction("network-child", {
      type: "income",
      amount: 25,
      category: "Reimbursement",
      reimbursesTransactionId: "network-source",
      sheetRow: 14,
    });
    await db.transactions.add(child);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[child.id, 14]]),
    );
    googleMocks.readTransactionById.mockResolvedValue(child);
    googleMocks.updateRow.mockRejectedValue(new TypeError("offline"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const harness = createProviderHarness();

    let updated!: TransactionRecord | undefined;
    await act(async () => {
      updated = await harness.getContext().updateTransaction(child.id, {
        type: "expense",
        category: "Tampered",
        currency: "USD",
        for: "Someone else",
        reimbursesTransactionId: "wrong-source",
        note: "Queued note",
      });
    });

    expect(warn).toHaveBeenCalled();
    expect(updated).toMatchObject({
      type: "income",
      category: "Reimbursement",
      currency: "THB",
      for: "Me",
      reimbursesTransactionId: "network-source",
      note: "Queued note",
      status: "pending",
    });

    harness.rendered.unmount();
    harness.queryClient.clear();
  });

  it("preserves a linked relation on a compensating delete row", async () => {
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

    await act(async () => {
      await harness.getContext().deleteTransaction(child.id);
    });

    const remaining = await db.transactions.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({
      type: "income",
      amount: -25,
      reimbursesTransactionId: "compensated-source",
      status: "pending",
    });
    expect(remaining[0].id).not.toBe(child.id);

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
      message: "Delete queued as compensating entry",
    });
    const remaining = await db.transactions.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].amount).toBe(-42);

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
});

describe("transaction mutations", () => {
  afterEach(() => {
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

  it("rejects an update result whose persisted row is in error", async () => {
    const failed = transaction("update-failed", {
      status: "error",
      error: "Amount exceeds remaining reimbursement balance",
    });
    mutationContextState.value = mutationContext({
      updateTransaction: vi.fn().mockResolvedValue(failed),
    });
    const { queryClient, wrapper } = createMutationHarness();
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
    queryClient.clear();
  });

  it("returns the delete provider result and invalidates every prefix", async () => {
    const deleted = { ok: true, message: "Removed synced entry" };
    const deleteTransaction = vi.fn().mockResolvedValue(deleted);
    mutationContextState.value = mutationContext({ deleteTransaction });
    const { queryClient, wrapper } = createMutationHarness();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDeleteTransactionMutation(), {
      wrapper,
    });

    let returned!: typeof deleted;
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
});
