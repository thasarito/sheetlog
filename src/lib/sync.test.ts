import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { DuplicateTransactionIdError } from "./google";
import { syncPendingTransactions } from "./sync";
import { parseTransactionRow } from "./transactionRows";
import type { TransactionRecord } from "./types";

const googleMocks = vi.hoisted(() => ({
  appendTransaction: vi.fn(),
  deleteRow: vi.fn(),
  ensureReimbursementHeader: vi.fn(),
  getSheetTabId: vi.fn(),
  readLinkedReimbursements: vi.fn(),
  readTransactionById: vi.fn(),
  readTransactionIdMap: vi.fn(),
  updateRow: vi.fn(),
}));

vi.mock("./google", () => {
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

  class GoogleApiError extends Error {
    status: number;

    constructor({ status, message }: { status: number; message: string }) {
      super(message);
      this.status = status;
    }
  }

  return {
    ...googleMocks,
    DuplicateTransactionIdError,
    GoogleApiError,
  };
});

vi.mock("./mock", () => ({
  IS_DEV_MODE: false,
  appendTransaction: vi.fn(),
  deleteRow: vi.fn(),
  ensureReimbursementHeader: vi.fn(),
  getSheetTabId: vi.fn(),
  readLinkedReimbursements: vi.fn(),
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
    targetSheetId: "sheet-a",
    targetUserId: "user-a",
    createdAt: "2026-08-15T08:00:00.000Z",
    updatedAt: "2026-08-15T08:00:00.000Z",
    ...overrides,
  };
}

function reimbursement(
  id: string,
  sourceId: string,
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  return transaction(id, {
    type: "income",
    amount: 25,
    category: "Reimbursement",
    reimbursesTransactionId: sourceId,
    ...overrides,
  });
}

function reimbursementDeleteIntent(
  id: string,
  sourceId: string,
  overrides: Partial<TransactionRecord> = {},
) {
  return {
    ...reimbursement(id, sourceId, overrides),
    deleteIntent: true as const,
  };
}

function linkedLedgerRow(record: TransactionRecord) {
  return {
    id: record.id,
    type: record.type,
    amount: record.amount,
    currency: record.currency,
    reimbursesTransactionId: record.reimbursesTransactionId,
    status: "synced" as const,
    sheetRow: record.sheetRow,
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
    googleMocks.ensureReimbursementHeader.mockReset().mockResolvedValue(undefined);
    googleMocks.getSheetTabId.mockReset().mockResolvedValue(0);
    googleMocks.readLinkedReimbursements.mockReset().mockResolvedValue([]);
    googleMocks.readTransactionById.mockReset().mockResolvedValue(null);
    googleMocks.readTransactionIdMap.mockReset().mockResolvedValue(new Map());
    googleMocks.updateRow.mockReset().mockResolvedValue(undefined);
    await db.transactions.clear();
    await db.settings.clear();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.transactions.clear();
    await db.settings.clear();
  });

  it("prevents two independent sync callers from appending the same absent K ID", async () => {
    const pending = transaction("same-browser-cross-tab");
    await db.transactions.add(pending);
    const firstAppendStarted = deferred<void>();
    const secondAppendStarted = deferred<void>();
    const releaseFirstAppend = deferred<number | null>();
    let appendCount = 0;

    googleMocks.appendTransaction.mockImplementation(async () => {
      appendCount += 1;
      if (appendCount === 1) {
        firstAppendStarted.resolve();
        return releaseFirstAppend.promise;
      }
      secondAppendStarted.resolve();
      return 3;
    });

    const firstSync = syncPendingTransactions(
      "access-token-a",
      "sheet-a",
      "user-a",
    );
    await firstAppendStarted.promise;

    const secondSync = syncPendingTransactions(
      "access-token-b",
      "sheet-a",
      "user-a",
    );
    await Promise.race([
      secondAppendStarted.promise,
      new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      }),
    ]);
    releaseFirstAppend.resolve(2);

    await Promise.all([firstSync, secondSync]);

    expect(googleMocks.appendTransaction).toHaveBeenCalledTimes(1);
    expect(await db.transactions.get(pending.id)).toMatchObject({
      status: "synced",
      sheetId: "sheet-a",
      sheetRow: 2,
    });
  });

  it("serializes different users on one Sheet so a row shift cannot stale the later update", async () => {
    const removal = reimbursementDeleteIntent(
      "user-a-removal",
      "source-a",
      { sheetRow: 5 },
    );
    const pendingEdit = transaction("user-b-edit", {
      note: "Edited by B",
      targetUserId: "user-b",
      updatedAt: "2026-08-15T10:00:00.000Z",
    });
    const remoteBeforeEdit = transaction(pendingEdit.id, {
      note: "Original remote value",
      targetUserId: undefined,
      status: "synced",
      sheetId: "sheet-a",
      sheetRow: 8,
    });
    const deleteStarted = deferred<void>();
    const releaseDelete = deferred<void>();
    const laterUpdateStarted = deferred<void>();
    let deleteFinished = false;
    let laterUpdateEntered = false;
    await db.transactions.bulkAdd([removal, pendingEdit]);
    googleMocks.readTransactionIdMap.mockImplementation(async () =>
      new Map([
        [removal.id, 5],
        [pendingEdit.id, deleteFinished ? 7 : 8],
      ]),
    );
    googleMocks.deleteRow.mockImplementationOnce(async () => {
      deleteStarted.resolve();
      await releaseDelete.promise;
      deleteFinished = true;
    });
    googleMocks.readTransactionById.mockImplementation(
      async (_token: string, _sheetId: string, id: string) =>
        id === pendingEdit.id
          ? { ...remoteBeforeEdit, sheetRow: deleteFinished ? 7 : 8 }
          : null,
    );
    googleMocks.updateRow.mockImplementationOnce(async () => {
      laterUpdateEntered = true;
      laterUpdateStarted.resolve();
    });

    const userASync = syncPendingTransactions(
      "access-token-a",
      "sheet-a",
      "user-a",
    );
    await deleteStarted.promise;
    const userBSync = syncPendingTransactions(
      "access-token-b",
      "sheet-a",
      "user-b",
    );
    await Promise.race([
      laterUpdateStarted.promise,
      new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      }),
    ]);
    const updateEnteredBeforeDeleteReleased = laterUpdateEntered;
    releaseDelete.resolve();

    await expect(Promise.all([userASync, userBSync])).resolves.toEqual([1, 1]);
    expect(updateEnteredBeforeDeleteReleased).toBe(false);
    expect(googleMocks.updateRow).toHaveBeenCalledWith(
      "access-token-b",
      "sheet-a",
      7,
      expect.objectContaining({
        id: pendingEdit.id,
        note: "Edited by B",
      }),
    );
    expect(await db.transactions.get(removal.id)).toBeUndefined();
    expect(await db.transactions.get(pendingEdit.id)).toMatchObject({
      status: "synced",
      sheetRow: 7,
    });
  });

  it("fails closed before append when the fallback lock loses ownership", async () => {
    const pending = transaction("lock-lost-before-append");
    const idReadStarted = deferred<void>();
    const releaseIdRead = deferred<Map<string, number>>();
    await db.transactions.add(pending);
    googleMocks.readTransactionIdMap.mockImplementationOnce(async () => {
      idReadStarted.resolve();
      return releaseIdRead.promise;
    });

    const activeSync = syncPendingTransactions(
      "access-token",
      "sheet-a",
      "user-a",
    );
    await idReadStarted.promise;
    await db.settings.put({
      key: "sheetlog.sheet-mutation:sheet-a",
      value: JSON.stringify({
        ownerId: "successor-tab",
        expiresAt: Date.now() + 60_000,
      }),
      updatedAt: new Date().toISOString(),
    });
    releaseIdRead.resolve(new Map());

    await expect(activeSync).rejects.toThrow(
      "Sheet mutation lock was lost before the operation completed",
    );
    expect(googleMocks.appendTransaction).not.toHaveBeenCalled();
    expect(await db.transactions.get(pending.id)).toEqual(pending);
  });

  it("does not commit synced state after losing the fallback lock during append", async () => {
    const pending = transaction("lock-lost-after-append");
    const appendStarted = deferred<void>();
    const releaseAppend = deferred<number | null>();
    await db.transactions.add(pending);
    googleMocks.appendTransaction.mockImplementationOnce(async () => {
      appendStarted.resolve();
      return releaseAppend.promise;
    });

    const activeSync = syncPendingTransactions(
      "access-token",
      "sheet-a",
      "user-a",
    );
    await appendStarted.promise;
    await db.settings.put({
      key: "sheetlog.sheet-mutation:sheet-a",
      value: JSON.stringify({
        ownerId: "successor-tab",
        expiresAt: Date.now() + 60_000,
      }),
      updatedAt: new Date().toISOString(),
    });
    releaseAppend.resolve(7);

    await expect(activeSync).rejects.toThrow(
      "Sheet mutation lock was lost before the operation completed",
    );
    expect(googleMocks.appendTransaction).toHaveBeenCalledTimes(1);
    expect(await db.transactions.get(pending.id)).toEqual(pending);
  });

  it("keeps an offline A queue out of B after sign-out and resumes it only when A returns", async () => {
    const sheetA = transaction("sheet-a-only");
    const sheetB = transaction("sheet-b-only", { targetSheetId: "sheet-b" });
    const otherUser = transaction("sheet-b-other-user", {
      targetSheetId: "sheet-b",
      targetUserId: "user-b",
    });
    const legacy = transaction("legacy-unscoped", {
      targetSheetId: undefined,
      targetUserId: undefined,
    });
    await db.transactions.bulkAdd([sheetA, sheetB, otherUser, legacy]);

    expect(
      await syncPendingTransactions("token-b", "sheet-b", "user-a"),
    ).toBe(1);
    expect(
      googleMocks.appendTransaction.mock.calls.map(
        (call) => (call[2] as TransactionRecord).id,
      ),
    ).toEqual(["sheet-b-only"]);
    expect(await db.transactions.get("sheet-b-only")).toMatchObject({
      status: "synced",
      sheetId: "sheet-b",
      targetSheetId: "sheet-b",
    });
    expect(await db.transactions.get("sheet-a-only")).toMatchObject({
      status: "pending",
      targetSheetId: "sheet-a",
    });
    expect(await db.transactions.get("legacy-unscoped")).toMatchObject({
      status: "pending",
    });
    expect(await db.transactions.get("sheet-b-other-user")).toMatchObject({
      status: "pending",
      targetUserId: "user-b",
    });

    googleMocks.appendTransaction.mockClear();
    googleMocks.readTransactionIdMap.mockResolvedValue(new Map());

    expect(
      await syncPendingTransactions("token-a", "sheet-a", "user-a"),
    ).toBe(1);
    expect(
      googleMocks.appendTransaction.mock.calls.map(
        (call) => (call[2] as TransactionRecord).id,
      ),
    ).toEqual(["sheet-a-only"]);
    expect(await db.transactions.get("sheet-a-only")).toMatchObject({
      status: "synced",
      sheetId: "sheet-a",
      targetSheetId: "sheet-a",
    });
    expect(await db.transactions.get("legacy-unscoped")).toMatchObject({
      status: "pending",
      targetSheetId: undefined,
    });

    googleMocks.appendTransaction.mockClear();
    googleMocks.readTransactionIdMap.mockResolvedValue(new Map());
    expect(
      await syncPendingTransactions("token-b-user", "sheet-b", "user-b"),
    ).toBe(1);
    expect(
      googleMocks.appendTransaction.mock.calls.map(
        (call) => (call[2] as TransactionRecord).id,
      ),
    ).toEqual(["sheet-b-other-user"]);
  });

  it("skips a snapshot row deleted before its remote write", async () => {
    const pending = transaction("deleted-before-write");
    await db.transactions.add(pending);
    googleMocks.readTransactionIdMap.mockImplementationOnce(async () => {
      await db.transactions.delete(pending.id);
      return new Map();
    });

    const count = await syncPendingTransactions("access-token", "sheet-a", "user-a");

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

    await syncPendingTransactions("access-token", "sheet-a", "user-a");

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

    const activeSync = syncPendingTransactions("access-token", "sheet-a", "user-a");
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

    const activeSync = syncPendingTransactions("access-token", "sheet-a", "user-a");
    await appendStarted.promise;
    await db.transactions.delete(pending.id);
    releaseAppend.resolve(13);

    await expect(activeSync).rejects.toBe(cleanupError);
    expect(await db.transactions.get(pending.id)).toBeUndefined();
    expect(googleMocks.appendTransaction).toHaveBeenCalledTimes(1);
    expect(googleMocks.deleteRow).toHaveBeenCalledTimes(1);
  });

  it("restores an existing K row when another context deletes its pending edit mid-update", async () => {
    const pending = transaction("deleted-during-existing-update", {
      note: "Edited locally",
      updatedAt: "2026-08-15T10:00:00.000Z",
    });
    const remoteBeforeEdit = transaction(pending.id, {
      note: "Original remote value",
      status: "synced",
      sheetId: "sheet-a",
      sheetRow: 8,
    });
    const updateStarted = deferred<void>();
    const releaseUpdate = deferred<void>();
    let updateCount = 0;
    await db.transactions.add(pending);
    googleMocks.readTransactionIdMap
      .mockResolvedValueOnce(new Map([[pending.id, 8]]))
      .mockResolvedValueOnce(new Map([[pending.id, 11]]));
    googleMocks.readTransactionById.mockResolvedValue(remoteBeforeEdit);
    googleMocks.updateRow.mockImplementation(async () => {
      updateCount += 1;
      if (updateCount === 1) {
        updateStarted.resolve();
        await releaseUpdate.promise;
      }
    });

    const activeSync = syncPendingTransactions(
      "access-token",
      "sheet-a",
      "user-a",
    );
    await updateStarted.promise;
    await db.transactions.delete(pending.id);
    releaseUpdate.resolve();

    expect(await activeSync).toBe(0);
    expect(googleMocks.updateRow).toHaveBeenNthCalledWith(
      1,
      "access-token",
      "sheet-a",
      8,
      expect.objectContaining({
        id: pending.id,
        note: "Edited locally",
      }),
    );
    expect(googleMocks.updateRow).toHaveBeenNthCalledWith(
      2,
      "access-token",
      "sheet-a",
      11,
      expect.objectContaining({
        id: pending.id,
        note: "Original remote value",
      }),
    );
    expect(await db.transactions.get(pending.id)).toBeUndefined();
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

    const firstSync = syncPendingTransactions("access-token", "sheet-a", "user-a");
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
    expect(await syncPendingTransactions("access-token", "sheet-a", "user-a")).toBe(1);

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

    expect(await syncPendingTransactions("access-token", "sheet-a", "user-a")).toBe(1);

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
    expect(googleMocks.ensureReimbursementHeader).toHaveBeenCalledTimes(1);
    expect(await db.transactions.get(pending.id)).toMatchObject({
      status: "synced",
      type: "income",
      currency: "THB",
      category: "Reimbursement",
      for: "Me",
      reimbursesTransactionId: "source-authoritative",
    });
  });

  it("never adopts or rewrites a numeric Sheet timestamp during an authoritative linked update", async () => {
    const dateSerial = 46249 + (9 * 60 + 30) / (24 * 60);
    const createdAtSerial =
      46249 + (10 * 60 * 60 + 45 * 60 + 30) / (24 * 60 * 60);
    const normalizedDate = new Date(2026, 7, 15, 9, 30, 0).toISOString();
    const normalizedCreatedAt = new Date(
      2026,
      7,
      15,
      10,
      45,
      30,
    ).toISOString();
    const id = "serial-authoritative-child";
    const pending = transaction(id, {
      type: "expense",
      amount: 25,
      currency: "USD",
      category: "Tampered",
      for: "Someone else",
      note: "Allowed metadata",
      date: normalizedDate,
      createdAt: normalizedCreatedAt,
      updatedAt: "2026-08-16T11:00:00.000Z",
    });
    const remote = {
      ...parseTransactionRow(
        [
          dateSerial,
          "income",
          25,
          "Reimbursement",
          "Before",
          createdAtSerial,
          "PWA",
          "THB",
          "Bank",
          "Me",
          id,
          "source-authoritative",
        ],
        18,
      ),
      sheetId: "sheet-a",
    };
    await db.transactions.add(pending);
    googleMocks.readTransactionIdMap.mockResolvedValue(new Map([[id, 18]]));
    googleMocks.readTransactionById.mockResolvedValue(remote);

    expect(
      await syncPendingTransactions("access-token", "sheet-a", "user-a"),
    ).toBe(1);

    expect(googleMocks.updateRow).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      18,
      expect.objectContaining({
        id,
        date: normalizedDate,
        createdAt: normalizedCreatedAt,
        reimbursesTransactionId: "source-authoritative",
      }),
    );
    expect(googleMocks.updateRow).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ createdAt: String(createdAtSerial) }),
    );
    expect(await db.transactions.get(id)).toMatchObject({
      status: "synced",
      createdAt: normalizedCreatedAt,
      reimbursesTransactionId: "source-authoritative",
    });
  });
});

describe("syncPendingTransactions reimbursement validation", () => {
  beforeEach(async () => {
    googleMocks.appendTransaction.mockReset().mockResolvedValue(20);
    googleMocks.deleteRow.mockReset().mockResolvedValue(undefined);
    googleMocks.ensureReimbursementHeader.mockReset().mockResolvedValue(undefined);
    googleMocks.getSheetTabId.mockReset().mockResolvedValue(0);
    googleMocks.readLinkedReimbursements.mockReset().mockResolvedValue([]);
    googleMocks.readTransactionById.mockReset().mockResolvedValue(null);
    googleMocks.readTransactionIdMap.mockReset().mockResolvedValue(new Map());
    googleMocks.updateRow.mockReset().mockResolvedValue(undefined);
    await db.transactions.clear();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.transactions.clear();
  });

  it("deletes a stable-ID intent from its fresh K row with tab zero and no source validation", async () => {
    const intent = reimbursementDeleteIntent(
      "delete-exact-child",
      "missing-source",
    );
    await db.transactions.add(intent);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[intent.id, 17]]),
    );
    googleMocks.readTransactionById.mockRejectedValue(
      new Error("delete intents must not read their source or remote child"),
    );

    await expect(
      syncPendingTransactions("access-token", "sheet-a", "user-a"),
    ).resolves.toBe(1);

    expect(googleMocks.deleteRow).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      0,
      17,
    );
    expect(googleMocks.readTransactionById).not.toHaveBeenCalled();
    expect(googleMocks.readLinkedReimbursements).not.toHaveBeenCalled();
    expect(googleMocks.ensureReimbursementHeader).not.toHaveBeenCalled();
    expect(googleMocks.appendTransaction).not.toHaveBeenCalled();
    expect(googleMocks.updateRow).not.toHaveBeenCalled();
    expect(await db.transactions.get(intent.id)).toBeUndefined();
  });

  it("preserves a delete intent when its fresh K read finds duplicate stable IDs", async () => {
    const intent = reimbursementDeleteIntent(
      "duplicate-delete-intent",
      "missing-source",
    );
    const integrityError = new DuplicateTransactionIdError(
      intent.id,
      5,
      9,
    );
    await db.transactions.add(intent);
    googleMocks.readTransactionIdMap
      .mockResolvedValueOnce(new Map([[intent.id, 5]]))
      .mockRejectedValueOnce(integrityError);

    await expect(
      syncPendingTransactions("access-token", "sheet-a", "user-a"),
    ).rejects.toBe(integrityError);

    expect(googleMocks.deleteRow).not.toHaveBeenCalled();
    expect(await db.transactions.get(intent.id)).toEqual(intent);
  });

  it("completes a stable-ID delete intent already absent from K without resolving a tab or source", async () => {
    const intent = reimbursementDeleteIntent(
      "already-deleted-child",
      "missing-source",
    );
    await db.transactions.add(intent);

    await expect(
      syncPendingTransactions("access-token", "sheet-a", "user-a"),
    ).resolves.toBe(1);

    expect(googleMocks.getSheetTabId).not.toHaveBeenCalled();
    expect(googleMocks.deleteRow).not.toHaveBeenCalled();
    expect(googleMocks.readTransactionById).not.toHaveBeenCalled();
    expect(googleMocks.readLinkedReimbursements).not.toHaveBeenCalled();
    expect(googleMocks.appendTransaction).not.toHaveBeenCalled();
    expect(await db.transactions.get(intent.id)).toBeUndefined();
  });

  it("keeps a stable-ID delete intent pending after a retryable row deletion failure", async () => {
    const intent = reimbursementDeleteIntent(
      "retry-delete-child",
      "missing-source",
    );
    const networkError = new TypeError("offline");
    await db.transactions.add(intent);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[intent.id, 18]]),
    );
    googleMocks.deleteRow.mockRejectedValue(networkError);

    await expect(
      syncPendingTransactions("access-token", "sheet-a", "user-a"),
    ).rejects.toBe(networkError);

    expect(googleMocks.deleteRow).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      0,
      18,
    );
    expect(googleMocks.readTransactionById).not.toHaveBeenCalled();
    expect(await db.transactions.get(intent.id)).toMatchObject({
      id: intent.id,
      amount: intent.amount,
      reimbursesTransactionId: intent.reimbursesTransactionId,
      deleteIntent: true,
      status: "pending",
      error: "Network error while syncing.",
    });
  });

  it("retains a failed stable-ID delete intent as an actionable error", async () => {
    const intent = reimbursementDeleteIntent(
      "failed-delete-child",
      "missing-source",
    );
    await db.transactions.add(intent);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[intent.id, 19]]),
    );
    googleMocks.deleteRow.mockRejectedValue(new Error("Deletion rejected"));

    await expect(
      syncPendingTransactions("access-token", "sheet-a", "user-a"),
    ).resolves.toBe(0);

    expect(googleMocks.readTransactionById).not.toHaveBeenCalled();
    expect(await db.transactions.get(intent.id)).toMatchObject({
      id: intent.id,
      deleteIntent: true,
      status: "error",
      error: "Deletion rejected",
    });
  });

  it("updates later K positions after deleting an earlier stable-ID intent", async () => {
    const first = reimbursementDeleteIntent("delete-first", "source", {
      createdAt: "2026-08-15T08:00:00.000Z",
      updatedAt: "2026-08-15T08:00:00.000Z",
    });
    const second = reimbursementDeleteIntent("delete-second", "source", {
      createdAt: "2026-08-15T09:00:00.000Z",
      updatedAt: "2026-08-15T09:00:00.000Z",
    });
    await db.transactions.bulkAdd([first, second]);
    const remoteIds = [first.id, second.id];
    googleMocks.readTransactionIdMap.mockImplementation(async () =>
      new Map(remoteIds.map((id, index) => [id, index + 5])),
    );
    googleMocks.deleteRow.mockImplementation(
      async (
        _token: string,
        _sheetId: string,
        _tabId: number,
        rowIndex: number,
      ) => {
        remoteIds.splice(rowIndex - 5, 1);
      },
    );

    await expect(
      syncPendingTransactions("access-token", "sheet-a", "user-a"),
    ).resolves.toBe(2);

    expect(googleMocks.deleteRow.mock.calls).toEqual([
      ["access-token", "sheet-a", 0, 5],
      ["access-token", "sheet-a", 0, 5],
    ]);
    expect(googleMocks.readTransactionIdMap).toHaveBeenCalledTimes(3);
    expect(remoteIds).toEqual([]);
    expect(await db.transactions.count()).toBe(0);
  });

  it("syncs a pending source before its child while preserving unrelated createdAt order", async () => {
    const child = reimbursement("child", "source", {
      createdAt: "2026-08-15T08:00:00.000Z",
      updatedAt: "2026-08-15T08:00:00.000Z",
    });
    const unrelated = transaction("unrelated", {
      createdAt: "2026-08-15T08:30:00.000Z",
      updatedAt: "2026-08-15T08:30:00.000Z",
    });
    const source = transaction("source", {
      amount: 100,
      createdAt: "2026-08-15T09:00:00.000Z",
      updatedAt: "2026-08-15T09:00:00.000Z",
    });
    await db.transactions.bulkAdd([child, unrelated, source]);

    const remoteById = new Map<string, TransactionRecord>();
    googleMocks.appendTransaction.mockImplementation(
      async (_token: string, sheetId: string, item: TransactionRecord) => {
        remoteById.set(item.id, {
          ...item,
          status: "synced",
          sheetId,
          sheetRow: remoteById.size + 2,
        });
        return remoteById.size + 1;
      },
    );
    googleMocks.readTransactionById.mockImplementation(
      async (_token: string, _sheetId: string, id: string) =>
        remoteById.get(id) ?? null,
    );

    expect(await syncPendingTransactions("access-token", "sheet-a", "user-a")).toBe(3);

    expect(
      googleMocks.appendTransaction.mock.calls.map(
        (call) => (call[2] as TransactionRecord).id,
      ),
    ).toEqual(["unrelated", "source", "child"]);
    expect(await db.transactions.get("source")).toMatchObject({
      createdAt: "2026-08-15T09:00:00.000Z",
      status: "synced",
    });
  });

  it("installs column L once before validating and appending linked rows", async () => {
    const source = transaction("source", {
      amount: 100,
      status: "synced",
      sheetRow: 2,
    });
    await db.transactions.bulkAdd([
      reimbursement("child-a", source.id, { amount: 20 }),
      reimbursement("child-b", source.id, {
        amount: 30,
        createdAt: "2026-08-15T09:00:00.000Z",
        updatedAt: "2026-08-15T09:00:00.000Z",
      }),
    ]);
    googleMocks.readTransactionById.mockResolvedValue(source);

    await syncPendingTransactions("access-token", "sheet-a", "user-a");

    expect(googleMocks.ensureReimbursementHeader).toHaveBeenCalledTimes(1);
    expect(
      googleMocks.ensureReimbursementHeader.mock.invocationCallOrder[0],
    ).toBeLessThan(googleMocks.readLinkedReimbursements.mock.invocationCallOrder[0]);
    expect(
      googleMocks.ensureReimbursementHeader.mock.invocationCallOrder[0],
    ).toBeLessThan(googleMocks.appendTransaction.mock.invocationCallOrder[0]);
  });

  it("updates an existing linked child in its current K row after validating an amount edit", async () => {
    const source = transaction("source", {
      amount: 100,
      status: "synced",
      sheetRow: 2,
    });
    const remoteChild = reimbursement("child", source.id, {
      amount: 20,
      status: "synced",
      sheetRow: 8,
    });
    const pendingChild = reimbursement("child", source.id, {
      amount: 40,
      createdAt: remoteChild.createdAt,
      updatedAt: "2026-08-15T10:00:00.000Z",
    });
    await db.transactions.add(pendingChild);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([
        [source.id, 2],
        [remoteChild.id, 8],
      ]),
    );
    googleMocks.readTransactionById.mockImplementation(
      async (_token: string, _sheetId: string, id: string) =>
        id === source.id ? source : id === remoteChild.id ? remoteChild : null,
    );
    googleMocks.readLinkedReimbursements.mockResolvedValue([
      linkedLedgerRow(remoteChild),
      linkedLedgerRow(
        reimbursement("other-child", source.id, {
          amount: 60,
          status: "synced",
          sheetRow: 9,
        }),
      ),
    ]);

    expect(await syncPendingTransactions("access-token", "sheet-a", "user-a")).toBe(1);

    expect(googleMocks.appendTransaction).not.toHaveBeenCalled();
    expect(googleMocks.ensureReimbursementHeader).toHaveBeenCalledTimes(1);
    expect(googleMocks.readTransactionById).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      source.id,
    );
    expect(googleMocks.readLinkedReimbursements).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      source.id,
    );
    expect(
      googleMocks.ensureReimbursementHeader.mock.invocationCallOrder[0],
    ).toBeLessThan(googleMocks.updateRow.mock.invocationCallOrder[0]);
    expect(googleMocks.updateRow).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      8,
      expect.objectContaining({
        id: remoteChild.id,
        amount: 40,
        type: "income",
        category: "Reimbursement",
        reimbursesTransactionId: source.id,
      }),
    );
    expect(await db.transactions.get(remoteChild.id)).toMatchObject({
      status: "synced",
      sheetRow: 8,
      amount: 40,
    });
  });

  it("marks an equal existing K row synced without appending or updating", async () => {
    const remoteChild = reimbursement("lost-response", "source", {
      status: "synced",
      sheetRow: 12,
    });
    await db.transactions.add({
      ...remoteChild,
      status: "pending",
      sheetId: undefined,
      sheetRow: undefined,
    });
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[remoteChild.id, 12]]),
    );
    googleMocks.readTransactionById.mockResolvedValue(remoteChild);

    expect(await syncPendingTransactions("access-token", "sheet-a", "user-a")).toBe(1);

    expect(googleMocks.ensureReimbursementHeader).toHaveBeenCalledTimes(1);
    expect(googleMocks.appendTransaction).not.toHaveBeenCalled();
    expect(googleMocks.updateRow).not.toHaveBeenCalled();
    expect(await db.transactions.get(remoteChild.id)).toMatchObject({
      status: "synced",
      sheetRow: 12,
    });
  });

  it("allows metadata-only edits to an existing linked child after its source is deleted", async () => {
    const remoteChild = reimbursement("dangling-child", "deleted-source", {
      amount: 25,
      account: "Wallet",
      note: "Before",
      status: "synced",
      sheetRow: 14,
    });
    await db.transactions.add({
      ...remoteChild,
      account: "Savings",
      date: "2026-08-16T09:30:00.000Z",
      note: "Friend repaid in cash",
      status: "pending",
      sheetRow: undefined,
      updatedAt: "2026-08-16T09:30:00.000Z",
    });
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[remoteChild.id, 14]]),
    );
    googleMocks.readTransactionById.mockImplementation(
      async (_token: string, _sheetId: string, id: string) =>
        id === remoteChild.id ? remoteChild : null,
    );

    expect(await syncPendingTransactions("access-token", "sheet-a", "user-a")).toBe(1);

    expect(googleMocks.updateRow).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      14,
      expect.objectContaining({
        amount: 25,
        account: "Savings",
        date: "2026-08-16T09:30:00.000Z",
        note: "Friend repaid in cash",
      }),
    );
  });

  it("rejects an amount edit to an existing linked child after its source is deleted", async () => {
    const remoteChild = reimbursement("dangling-amount", "deleted-source", {
      amount: 25,
      status: "synced",
      sheetRow: 15,
    });
    await db.transactions.add({
      ...remoteChild,
      amount: 30,
      status: "pending",
      sheetRow: undefined,
      updatedAt: "2026-08-16T10:00:00.000Z",
    });
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[remoteChild.id, 15]]),
    );
    googleMocks.readTransactionById.mockImplementation(
      async (_token: string, _sheetId: string, id: string) =>
        id === remoteChild.id ? remoteChild : null,
    );

    expect(await syncPendingTransactions("access-token", "sheet-a", "user-a")).toBe(0);

    expect(googleMocks.updateRow).not.toHaveBeenCalled();
    expect(await db.transactions.get(remoteChild.id)).toMatchObject({
      status: "error",
      error: "Original expense unavailable",
    });
  });

  it("preserves authoritative locked fields when a queued linked edit was tampered", async () => {
    const remoteChild = reimbursement("locked-child", "source", {
      amount: 25,
      currency: "THB",
      for: "Me",
      status: "synced",
      sheetRow: 16,
    });
    await db.transactions.add({
      ...remoteChild,
      type: "expense",
      category: "Tampered",
      currency: "USD",
      for: "Someone else",
      reimbursesTransactionId: "wrong-source",
      note: "Allowed metadata",
      status: "pending",
      sheetRow: undefined,
      updatedAt: "2026-08-16T11:00:00.000Z",
    });
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[remoteChild.id, 16]]),
    );
    googleMocks.readTransactionById.mockResolvedValue(remoteChild);

    expect(await syncPendingTransactions("access-token", "sheet-a", "user-a")).toBe(1);

    expect(googleMocks.updateRow).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      16,
      expect.objectContaining({
        type: "income",
        category: "Reimbursement",
        currency: "THB",
        for: "Me",
        reimbursesTransactionId: "source",
        note: "Allowed metadata",
      }),
    );
  });

  it("reserves confirmed and other pending or errored amounts with local rows winning duplicates", async () => {
    const source = transaction("source", {
      amount: 100,
      status: "synced",
      sheetRow: 2,
    });
    const confirmed = reimbursement("confirmed", source.id, {
      amount: 40,
      status: "synced",
      sheetRow: 3,
    });
    const staleRemoteDuplicate = reimbursement("reserved-error", source.id, {
      amount: 10,
      status: "synced",
      sheetRow: 4,
    });
    const current = reimbursement("current", source.id, { amount: 20 });
    const pendingOther = reimbursement("reserved-pending", source.id, {
      amount: 30,
      createdAt: "2026-08-15T10:00:00.000Z",
      updatedAt: "2026-08-15T10:00:00.000Z",
    });
    const errorOther = reimbursement("reserved-error", source.id, {
      amount: 50,
      status: "error",
      error: "Needs attention",
      createdAt: "2026-08-15T09:00:00.000Z",
      updatedAt: "2026-08-15T09:00:00.000Z",
    });
    await db.transactions.bulkAdd([current, pendingOther, errorOther]);
    googleMocks.readTransactionById.mockResolvedValue(source);
    googleMocks.readLinkedReimbursements.mockResolvedValue([
      linkedLedgerRow(confirmed),
      linkedLedgerRow(staleRemoteDuplicate),
    ]);

    await syncPendingTransactions("access-token", "sheet-a", "user-a");

    expect(await db.transactions.get(current.id)).toMatchObject({
      status: "error",
      error: "Amount exceeds remaining reimbursement balance",
    });
    expect(
      googleMocks.appendTransaction.mock.calls.some(
        (call) => (call[2] as TransactionRecord).id === current.id,
      ),
    ).toBe(false);
  });

  it("blocks a new child when a remote sibling has a currency mismatch and continues unrelated sync", async () => {
    const source = transaction("source", {
      amount: 100,
      status: "synced",
      sheetRow: 2,
    });
    const mismatchedSibling = reimbursement("foreign-sibling", source.id, {
      amount: 20,
      currency: "USD",
      status: "synced",
      sheetRow: 3,
    });
    const child = reimbursement("current", source.id, {
      amount: 20,
      createdAt: "2026-08-15T08:00:00.000Z",
      updatedAt: "2026-08-15T08:00:00.000Z",
    });
    const unrelated = transaction("unrelated", {
      createdAt: "2026-08-15T09:00:00.000Z",
      updatedAt: "2026-08-15T09:00:00.000Z",
    });
    await db.transactions.bulkAdd([child, unrelated]);
    googleMocks.readTransactionById.mockResolvedValue(source);
    googleMocks.readLinkedReimbursements.mockResolvedValue([
      linkedLedgerRow(mismatchedSibling),
    ]);

    expect(await syncPendingTransactions("access-token", "sheet-a", "user-a")).toBe(1);

    expect(await db.transactions.get(child.id)).toMatchObject({
      status: "error",
      error: "Linked reimbursement currency mismatch",
    });
    expect(await db.transactions.get(unrelated.id)).toMatchObject({
      status: "synced",
    });
    expect(
      googleMocks.appendTransaction.mock.calls.some(
        (call) => (call[2] as TransactionRecord).id === child.id,
      ),
    ).toBe(false);
  });

  it("blocks an existing amount edit when a local sibling has a currency mismatch", async () => {
    const source = transaction("source", {
      amount: 100,
      status: "synced",
      sheetRow: 2,
    });
    const remoteChild = reimbursement("current", source.id, {
      amount: 20,
      status: "synced",
      sheetRow: 8,
    });
    const pendingChild = {
      ...remoteChild,
      amount: 30,
      status: "pending" as const,
      sheetRow: undefined,
      updatedAt: "2026-08-15T10:00:00.000Z",
    };
    const localMismatch = reimbursement("foreign-local", source.id, {
      amount: 15,
      currency: "USD",
      status: "error",
      error: "Needs attention",
    });
    await db.transactions.bulkAdd([pendingChild, localMismatch]);
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[remoteChild.id, 8]]),
    );
    googleMocks.readTransactionById.mockImplementation(
      async (_token: string, _sheetId: string, id: string) =>
        id === remoteChild.id ? remoteChild : id === source.id ? source : null,
    );
    googleMocks.readLinkedReimbursements.mockResolvedValue([
      linkedLedgerRow(remoteChild),
    ]);

    expect(await syncPendingTransactions("access-token", "sheet-a", "user-a")).toBe(0);

    expect(await db.transactions.get(remoteChild.id)).toMatchObject({
      status: "error",
      error: "Linked reimbursement currency mismatch",
    });
    expect(googleMocks.updateRow).not.toHaveBeenCalled();
  });

  it("excludes the current child from currency mismatch validation during an amount edit", async () => {
    const source = transaction("source", {
      amount: 100,
      status: "synced",
      sheetRow: 2,
    });
    const remoteChild = reimbursement("current", source.id, {
      amount: 20,
      status: "synced",
      sheetRow: 8,
    });
    await db.transactions.add({
      ...remoteChild,
      amount: 30,
      status: "pending",
      sheetRow: undefined,
      updatedAt: "2026-08-15T10:00:00.000Z",
    });
    googleMocks.readTransactionIdMap.mockResolvedValue(
      new Map([[remoteChild.id, 8]]),
    );
    googleMocks.readTransactionById.mockImplementation(
      async (_token: string, _sheetId: string, id: string) =>
        id === remoteChild.id ? remoteChild : id === source.id ? source : null,
    );
    googleMocks.readLinkedReimbursements.mockResolvedValue([
      {
        ...linkedLedgerRow(remoteChild),
        currency: "USD",
      },
    ]);

    expect(await syncPendingTransactions("access-token", "sheet-a", "user-a")).toBe(1);

    expect(googleMocks.updateRow).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      8,
      expect.objectContaining({ id: remoteChild.id, amount: 30 }),
    );
    expect(await db.transactions.get(remoteChild.id)).toMatchObject({
      status: "synced",
      amount: 30,
    });
  });

  it("accepts a signed compensating child when the source is fully reimbursed", async () => {
    const source = transaction("source", {
      amount: 100,
      status: "synced",
      sheetRow: 2,
    });
    const confirmed = reimbursement("confirmed", source.id, {
      amount: 100,
      status: "synced",
      sheetRow: 3,
    });
    const compensation = reimbursement("compensation", source.id, {
      amount: -25,
    });
    await db.transactions.add(compensation);
    googleMocks.readTransactionById.mockResolvedValue(source);
    googleMocks.readLinkedReimbursements.mockResolvedValue([
      linkedLedgerRow(confirmed),
    ]);

    expect(await syncPendingTransactions("access-token", "sheet-a", "user-a")).toBe(1);

    expect(googleMocks.appendTransaction).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      expect.objectContaining({ id: compensation.id, amount: -25 }),
    );
    expect(googleMocks.ensureReimbursementHeader).toHaveBeenCalledTimes(1);
    expect(googleMocks.readLinkedReimbursements).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      source.id,
    );
    expect(await db.transactions.get(compensation.id)).toMatchObject({
      status: "synced",
    });
  });

  it("re-reads a just-attempted source and reports its sync failure on the child", async () => {
    const source = transaction("source", {
      amount: 100,
      createdAt: "2026-08-15T09:00:00.000Z",
      updatedAt: "2026-08-15T09:00:00.000Z",
    });
    const child = reimbursement("child", source.id, {
      createdAt: "2026-08-15T08:00:00.000Z",
      updatedAt: "2026-08-15T08:00:00.000Z",
    });
    await db.transactions.bulkAdd([child, source]);
    googleMocks.appendTransaction.mockImplementation(
      async (_token: string, _sheetId: string, item: TransactionRecord) => {
        if (item.id === source.id) {
          throw new Error("Source row rejected");
        }
        return 3;
      },
    );

    expect(await syncPendingTransactions("access-token", "sheet-a", "user-a")).toBe(0);

    expect(await db.transactions.get(source.id)).toMatchObject({
      status: "error",
      error: "Source row rejected",
    });
    expect(await db.transactions.get(child.id)).toMatchObject({
      status: "error",
      error: "Original expense failed to sync",
    });
    expect(
      googleMocks.appendTransaction.mock.calls.map(
        (call) => (call[2] as TransactionRecord).id,
      ),
    ).toEqual([source.id]);
  });

  it.each([
    {
      name: "missing source",
      source: null,
      error: "Original expense unavailable",
    },
    {
      name: "retyped source",
      source: transaction("source", {
        type: "income",
        amount: 100,
        status: "synced",
      }),
      error: "Original transaction is no longer an expense",
    },
    {
      name: "non-positive source",
      source: transaction("source", { amount: 0, status: "synced" }),
      error: "Original transaction is no longer an expense",
    },
    {
      name: "malformed source",
      source: transaction("source", {
        amount: 100,
        status: "synced",
        sheetRowValid: false,
      }),
      error: "Original transaction is no longer an expense",
    },
    {
      name: "currency-changed source",
      source: transaction("source", {
        amount: 100,
        currency: "USD",
        status: "synced",
      }),
      error: "Original expense currency changed",
    },
  ])("marks a new child error for a $name", async ({ source, error }) => {
    const child = reimbursement("child", "source", { currency: "THB" });
    await db.transactions.add(child);
    googleMocks.readTransactionById.mockResolvedValue(source);

    expect(await syncPendingTransactions("access-token", "sheet-a", "user-a")).toBe(0);

    expect(await db.transactions.get(child.id)).toMatchObject({
      status: "error",
      error,
    });
    expect(googleMocks.appendTransaction).not.toHaveBeenCalled();
  });

  it("marks a child for an already errored local source without trusting stale remote data", async () => {
    const source = transaction("source", {
      amount: 100,
      status: "error",
      sheetId: undefined,
      sheetRow: undefined,
      error: "Source failed",
    });
    const child = reimbursement("child", source.id);
    await db.transactions.bulkAdd([source, child]);
    googleMocks.readTransactionById.mockResolvedValue({
      ...source,
      status: "synced",
      sheetRow: 2,
    });

    expect(await syncPendingTransactions("access-token", "sheet-a", "user-a")).toBe(0);

    expect(await db.transactions.get(child.id)).toMatchObject({
      status: "error",
      error: "Original expense failed to sync",
    });
    expect(googleMocks.readTransactionById).not.toHaveBeenCalled();
  });

  it("continues syncing unrelated rows after a linked validation error", async () => {
    const invalidChild = reimbursement("invalid-child", "missing-source", {
      createdAt: "2026-08-15T08:00:00.000Z",
      updatedAt: "2026-08-15T08:00:00.000Z",
    });
    const unrelated = transaction("unrelated", {
      createdAt: "2026-08-15T09:00:00.000Z",
      updatedAt: "2026-08-15T09:00:00.000Z",
    });
    await db.transactions.bulkAdd([invalidChild, unrelated]);

    expect(await syncPendingTransactions("access-token", "sheet-a", "user-a")).toBe(1);

    expect(await db.transactions.get(invalidChild.id)).toMatchObject({
      status: "error",
      error: "Original expense unavailable",
    });
    expect(await db.transactions.get(unrelated.id)).toMatchObject({
      status: "synced",
    });
    expect(googleMocks.appendTransaction).toHaveBeenCalledTimes(1);
    expect(googleMocks.appendTransaction).toHaveBeenCalledWith(
      "access-token",
      "sheet-a",
      expect.objectContaining({ id: unrelated.id }),
    );
  });

  it("keeps a linked row pending and stops on a retryable Google failure", async () => {
    const networkError = new TypeError("offline");
    const source = transaction("source", {
      amount: 100,
      status: "synced",
      sheetRow: 2,
    });
    const child = reimbursement("child", source.id);
    const unrelated = transaction("unrelated", {
      createdAt: "2026-08-15T09:00:00.000Z",
      updatedAt: "2026-08-15T09:00:00.000Z",
    });
    await db.transactions.bulkAdd([child, unrelated]);
    googleMocks.readTransactionById.mockResolvedValue(source);
    googleMocks.readLinkedReimbursements.mockRejectedValue(networkError);

    await expect(
      syncPendingTransactions("access-token", "sheet-a", "user-a"),
    ).rejects.toBe(networkError);

    expect(await db.transactions.get(child.id)).toMatchObject({
      status: "pending",
      error: "Network error while syncing.",
    });
    expect(await db.transactions.get(unrelated.id)).toMatchObject({
      status: "pending",
    });
    expect(googleMocks.appendTransaction).not.toHaveBeenCalled();
  });

  it("does not turn a concurrent local child deletion into a sync failure", async () => {
    const child = reimbursement("deleted-during-validation", "missing-source", {
      createdAt: "2026-08-15T08:00:00.000Z",
      updatedAt: "2026-08-15T08:00:00.000Z",
    });
    const unrelated = transaction("unrelated-after-delete", {
      createdAt: "2026-08-15T09:00:00.000Z",
      updatedAt: "2026-08-15T09:00:00.000Z",
    });
    await db.transactions.bulkAdd([child, unrelated]);
    googleMocks.readTransactionById.mockImplementationOnce(async () => {
      await db.transactions.delete(child.id);
      return null;
    });

    await expect(
      syncPendingTransactions("access-token", "sheet-a", "user-a"),
    ).resolves.toBe(1);

    expect(await db.transactions.get(child.id)).toBeUndefined();
    expect(await db.transactions.get(unrelated.id)).toMatchObject({
      status: "synced",
    });
  });
});
