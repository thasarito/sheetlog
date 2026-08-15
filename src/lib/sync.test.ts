import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { syncPendingTransactions } from "./sync";
import type { TransactionRecord } from "./types";

const googleMocks = vi.hoisted(() => ({
  appendTransaction: vi.fn(),
  deleteRow: vi.fn(),
  getSheetTabId: vi.fn(),
  readTransactionById: vi.fn(),
  readTransactionIdMap: vi.fn(),
  updateRow: vi.fn(),
}));

vi.mock("./google", () => {
  class GoogleApiError extends Error {
    status: number;

    constructor({ status, message }: { status: number; message: string }) {
      super(message);
      this.status = status;
    }
  }

  return { ...googleMocks, GoogleApiError };
});

vi.mock("./mock", () => ({
  IS_DEV_MODE: false,
  appendTransaction: vi.fn(),
  deleteRow: vi.fn(),
  getSheetTabId: vi.fn(),
  readTransactionById: vi.fn(),
  readTransactionIdMap: vi.fn(),
  updateRow: vi.fn(),
}));

function transaction(
  id: string,
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  return {
    id,
    type: "expense",
    amount: 42,
    currency: "THB",
    account: "Wallet",
    for: "Me",
    category: "Food",
    date: "2026-08-15T08:00:00.000Z",
    note: "Original",
    status: "pending",
    createdAt: "2026-08-15T08:00:00.000Z",
    updatedAt: "2026-08-15T08:00:00.000Z",
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("syncPendingTransactions concurrency", () => {
  beforeEach(async () => {
    googleMocks.appendTransaction.mockReset().mockResolvedValue(2);
    googleMocks.deleteRow.mockReset().mockResolvedValue(undefined);
    googleMocks.getSheetTabId.mockReset().mockResolvedValue(0);
    googleMocks.readTransactionById.mockReset().mockResolvedValue(null);
    googleMocks.readTransactionIdMap.mockReset().mockResolvedValue(new Map());
    googleMocks.updateRow.mockReset().mockResolvedValue(undefined);
    await db.transactions.clear();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.transactions.clear();
  });

  it("skips a snapshot row deleted before its remote write", async () => {
    const pending = transaction("deleted-before-write");
    await db.transactions.add(pending);
    googleMocks.readTransactionIdMap.mockImplementationOnce(async () => {
      await db.transactions.delete(pending.id);
      return new Map();
    });

    const count = await syncPendingTransactions("access-token", "sheet-a");

    expect(count).toBe(0);
    expect(googleMocks.appendTransaction).not.toHaveBeenCalled();
    expect(await db.transactions.get(pending.id)).toBeUndefined();
  });

  it("re-reads and appends the latest edit instead of its initial snapshot", async () => {
    const pending = transaction("edited-before-write");
    const latestUpdatedAt = "2026-08-15T09:00:00.000Z";
    await db.transactions.add(pending);
    googleMocks.readTransactionIdMap.mockImplementationOnce(async () => {
      await db.transactions.update(pending.id, {
        note: "Latest",
        updatedAt: latestUpdatedAt,
      });
      return new Map();
    });

    await syncPendingTransactions("access-token", "sheet-a");

    expect(googleMocks.appendTransaction).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      expect.objectContaining({
        id: pending.id,
        note: "Latest",
        updatedAt: latestUpdatedAt,
      }),
    );
  });

  it("removes the exact appended row when another context deletes it mid-request", async () => {
    const pending = transaction("deleted-during-append");
    await db.transactions.add(pending);
    const appendStarted = deferred<void>();
    const releaseAppend = deferred<number | null>();
    googleMocks.readTransactionIdMap
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(new Map([[pending.id, 17]]));
    googleMocks.appendTransaction.mockImplementationOnce(async () => {
      appendStarted.resolve();
      return releaseAppend.promise;
    });

    const activeSync = syncPendingTransactions("access-token", "sheet-a");
    await appendStarted.promise;
    await db.transactions.delete(pending.id);
    releaseAppend.resolve(12);

    expect(await activeSync).toBe(0);
    expect(googleMocks.deleteRow).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      0,
      17,
    );
    expect(await db.transactions.get(pending.id)).toBeUndefined();
  });

  it("propagates an append rollback failure without resurrecting the deleted row", async () => {
    const pending = transaction("rollback-failure");
    const cleanupError = new Error("rollback unavailable");
    await db.transactions.add(pending);
    const appendStarted = deferred<void>();
    const releaseAppend = deferred<number | null>();
    googleMocks.readTransactionIdMap
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(new Map([[pending.id, 18]]));
    googleMocks.appendTransaction.mockImplementationOnce(async () => {
      appendStarted.resolve();
      return releaseAppend.promise;
    });
    googleMocks.deleteRow.mockRejectedValueOnce(cleanupError);

    const activeSync = syncPendingTransactions("access-token", "sheet-a");
    await appendStarted.promise;
    await db.transactions.delete(pending.id);
    releaseAppend.resolve(13);

    await expect(activeSync).rejects.toBe(cleanupError);
    expect(await db.transactions.get(pending.id)).toBeUndefined();
    expect(googleMocks.appendTransaction).toHaveBeenCalledTimes(1);
    expect(googleMocks.deleteRow).toHaveBeenCalledTimes(1);
  });

  it("leaves an edit made during append pending, then updates its current K row", async () => {
    const pending = transaction("edited-during-append");
    const remoteBeforeEdit = transaction(pending.id, {
      status: "synced",
      sheetId: "sheet-a",
      sheetRow: 8,
    });
    await db.transactions.add(pending);
    const appendStarted = deferred<void>();
    const releaseAppend = deferred<number | null>();
    googleMocks.readTransactionIdMap
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(new Map([[pending.id, 8]]));
    googleMocks.appendTransaction.mockImplementationOnce(async () => {
      appendStarted.resolve();
      return releaseAppend.promise;
    });

    const firstSync = syncPendingTransactions("access-token", "sheet-a");
    await appendStarted.promise;
    await db.transactions.update(pending.id, {
      note: "Edited during append",
      updatedAt: "2026-08-15T10:00:00.000Z",
    });
    releaseAppend.resolve(8);

    expect(await firstSync).toBe(0);
    expect(await db.transactions.get(pending.id)).toMatchObject({
      status: "pending",
      note: "Edited during append",
    });

    googleMocks.readTransactionById.mockResolvedValue(remoteBeforeEdit);
    expect(await syncPendingTransactions("access-token", "sheet-a")).toBe(1);

    expect(googleMocks.updateRow).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      8,
      expect.objectContaining({
        id: pending.id,
        note: "Edited during append",
      }),
    );
    expect(await db.transactions.get(pending.id)).toMatchObject({
      status: "synced",
      note: "Edited during append",
      sheetId: "sheet-a",
      sheetRow: 8,
    });
  });

  it("preserves authoritative linked fields when a stale unlinked row is retried", async () => {
    const pending = transaction("stale-unlinked-fallback", {
      type: "expense",
      amount: 25,
      currency: "USD",
      category: "Tampered",
      for: "Someone else",
      note: "Allowed metadata",
      reimbursesTransactionId: undefined,
      updatedAt: "2026-08-15T11:00:00.000Z",
    });
    const remote = transaction(pending.id, {
      type: "income",
      amount: 25,
      currency: "THB",
      category: "Reimbursement",
      for: "Me",
      note: "Before",
      reimbursesTransactionId: "source-authoritative",
      status: "synced",
      sheetId: "sheet-a",
      sheetRow: 9,
    });
    await db.transactions.add(pending);
    googleMocks.readTransactionIdMap.mockResolvedValue(new Map([[pending.id, 9]]));
    googleMocks.readTransactionById.mockResolvedValue(remote);

    expect(await syncPendingTransactions("access-token", "sheet-a")).toBe(1);

    expect(googleMocks.updateRow).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      9,
      expect.objectContaining({
        id: pending.id,
        type: "income",
        amount: 25,
        currency: "THB",
        category: "Reimbursement",
        for: "Me",
        note: "Allowed metadata",
        reimbursesTransactionId: "source-authoritative",
      }),
    );
    expect(await db.transactions.get(pending.id)).toMatchObject({
      status: "synced",
      type: "income",
      currency: "THB",
      category: "Reimbursement",
      for: "Me",
      reimbursesTransactionId: "source-authoritative",
    });
  });
});
