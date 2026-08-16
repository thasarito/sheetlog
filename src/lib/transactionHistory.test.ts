import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SheetLogDB } from "./db";
import {
  canEditTransaction,
  filterTransactionHistory,
  readTransactionHistorySnapshot,
  reconcileTransactionHistory,
  replaceTransactionHistorySnapshot,
} from "./transactionHistory";
import type {
  CachedTransactionRecord,
  TransactionHistorySnapshot,
  TransactionRecord,
} from "./types";

const TEST_DB_NAME = "SheetLogDB-history-test";

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
    category: "Food",
    note: "Lunch",
    date: "2026-08-15T08:00:00.000Z",
    status: "synced",
    createdAt: "2026-08-15T09:00:00.000Z",
    updatedAt: "2026-08-15T09:00:00.000Z",
    sheetId: "sheet-a",
    sheetRow: 2,
    cachedAt: "2026-08-15T10:00:00.000Z",
    canEdit: true,
    searchText: "food lunch wallet",
    ...overrides,
  };
}

function snapshot(
  sheetId: string,
  records: CachedTransactionRecord[],
): TransactionHistorySnapshot {
  return {
    records,
    meta: {
      sheetId,
      capturedAt: "2026-08-15T10:00:00.000Z",
      sourceLastRow: records.length + 1,
      rowCount: records.length,
    },
  };
}

describe("transaction history cache", () => {
  afterEach(async () => {
    await Dexie.delete(TEST_DB_NAME);
  });

  it("replaces one sheet atomically without touching another sheet", async () => {
    const historyDb = new SheetLogDB(TEST_DB_NAME);
    await replaceTransactionHistorySnapshot(
      snapshot("sheet-a", [cached("old-a")]),
      historyDb,
    );
    await replaceTransactionHistorySnapshot(
      snapshot("sheet-b", [cached("row-b", { sheetId: "sheet-b" })]),
      historyDb,
    );
    await replaceTransactionHistorySnapshot(
      snapshot("sheet-a", [cached("new-a")]),
      historyDb,
    );

    expect(
      (await readTransactionHistorySnapshot("sheet-a", historyDb))?.records.map(
        ({ id }) => id,
      ),
    ).toEqual(["new-a"]);
    expect(
      (await readTransactionHistorySnapshot("sheet-b", historyDb))?.records.map(
        ({ id }) => id,
      ),
    ).toEqual(["row-b"]);
    historyDb.close();
  });

  it("reads metadata and rows in one readonly transaction", async () => {
    const historyDb = new SheetLogDB(TEST_DB_NAME);
    await replaceTransactionHistorySnapshot(
      snapshot("sheet-a", [cached("row-a")]),
      historyDb,
    );
    const transactionSpy = vi.spyOn(historyDb, "transaction");

    await readTransactionHistorySnapshot("sheet-a", historyDb);

    expect(transactionSpy).toHaveBeenCalledWith(
      "r",
      historyDb.transactionHistory,
      historyDb.transactionHistoryMeta,
      expect.any(Function),
    );
    historyDb.close();
  });

  it("rejects duplicate record IDs before an atomic replacement", async () => {
    const historyDb = new SheetLogDB(TEST_DB_NAME);
    const duplicateSnapshot = snapshot("sheet-a", [
      cached("duplicate"),
      cached("duplicate", { sheetRow: 3 }),
    ]);

    await expect(
      replaceTransactionHistorySnapshot(duplicateSnapshot, historyDb),
    ).rejects.toThrow("Transaction history snapshot is inconsistent");
    expect(
      await readTransactionHistorySnapshot("sheet-a", historyDb),
    ).toBeNull();
    historyDb.close();
  });
});

describe("transaction history reconciliation", () => {
  it("keeps explicitly invalid legacy rows read-only without blocking new pending rows", () => {
    const ordinaryPending: TransactionRecord = {
      id: "new-local",
      type: "expense",
      amount: 10,
      currency: "THB",
      account: "Wallet",
      for: "Me",
      category: "Food",
      date: "2026-08-15T08:00:00.000Z",
      status: "pending",
      createdAt: "2026-08-15T08:00:00.000Z",
      updatedAt: "2026-08-15T08:00:00.000Z",
    };

    expect(canEditTransaction(ordinaryPending)).toBe(true);
    expect(
      canEditTransaction({ ...ordinaryPending, sheetRowValid: false }),
    ).toBe(false);
    expect(
      canEditTransaction({
        ...ordinaryPending,
        status: "error",
        sheetRowValid: false,
      }),
    ).toBe(false);
  });

  it("lets local pending/error rows win, bridges newer synced rows, and sorts by transaction date", () => {
    const remote = [
      cached("duplicate", { date: "2026-08-15T08:00:00.000Z" }),
      cached("backdated", {
        date: "2026-08-01T08:00:00.000Z",
        createdAt: "2026-08-16T08:00:00.000Z",
      }),
    ];
    const local: TransactionRecord[] = [
      {
        ...cached("duplicate"),
        category: "Local pending",
        status: "pending",
        updatedAt: "2026-08-15T11:00:00.000Z",
      },
      {
        ...cached("synced-bridge", {
          date: "2026-08-14T08:00:00.000Z",
        }),
        status: "synced",
        updatedAt: "2026-08-15T11:00:00.000Z",
      },
      {
        ...cached("stale-synced"),
        status: "synced",
        updatedAt: "2026-08-15T09:00:00.000Z",
      },
    ];

    const result = reconcileTransactionHistory({
      cachedRecords: remote,
      localTransactions: local,
      capturedAt: "2026-08-15T10:00:00.000Z",
    });

    expect(result.map(({ id }) => id)).toEqual([
      "duplicate",
      "synced-bridge",
      "backdated",
    ]);
    expect(result[0]).toMatchObject({
      category: "Local pending",
      status: "pending",
    });
  });

  it("searches category, note, and account with case and accent normalization", () => {
    const records = [
      cached("coffee", {
        category: "Café",
        note: "Morning meeting",
        account: "Travel Card",
        searchText: "cafe morning meeting travel card",
      }),
      cached("salary", {
        category: "Salary",
        note: undefined,
        account: "Bank",
        searchText: "salary bank",
      }),
    ];

    expect(filterTransactionHistory(records, "CAFE").map(({ id }) => id)).toEqual([
      "coffee",
    ]);
    expect(
      filterTransactionHistory(records, "travel card").map(({ id }) => id),
    ).toEqual(["coffee"]);
    expect(filterTransactionHistory(records, "meeting").map(({ id }) => id)).toEqual([
      "coffee",
    ]);
  });

  it("recomputes search data after a cached history row is edited offline", () => {
    const selectedFromHistory = cached("offline-edit", {
      category: "Old category",
      note: "Old note",
      searchText: "old category old note wallet",
    });
    const editedLocal = {
      ...selectedFromHistory,
      category: "New category",
      note: "New note",
      status: "pending" as const,
      updatedAt: "2026-08-15T11:00:00.000Z",
    };

    const records = reconcileTransactionHistory({
      cachedRecords: [selectedFromHistory],
      localTransactions: [editedLocal],
      capturedAt: "2026-08-15T10:00:00.000Z",
    });

    expect(filterTransactionHistory(records, "new note")).toHaveLength(1);
    expect(filterTransactionHistory(records, "old note")).toHaveLength(0);
    expect(records[0]).not.toHaveProperty("searchText");
  });
});
