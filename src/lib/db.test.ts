import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { SheetLogDB } from "./db";
import type { TransactionRecord } from "./types";

const TEST_DB_NAME = "SheetLogDB-scope-migration-test";

function oldPending(
  id: string,
  sheetId?: string,
): TransactionRecord {
  return {
    id,
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
    sheetId,
  };
}

describe("SheetLogDB scope migration", () => {
  afterEach(async () => {
    await Dexie.delete(TEST_DB_NAME);
  });

  it("backfills only proven sheet provenance and never guesses a Google user", async () => {
    const oldDb = new Dexie(TEST_DB_NAME);
    oldDb.version(1).stores({
      transactions: "id, status, createdAt",
      settings: "key",
    });
    await oldDb.table("transactions").bulkPut([
      oldPending("known-sheet", "sheet-a"),
      oldPending("fully-unscoped"),
    ]);
    oldDb.close();

    const migratedDb = new SheetLogDB(TEST_DB_NAME);
    await migratedDb.open();

    const knownSheet = await migratedDb.transactions.get("known-sheet");
    expect(knownSheet?.targetSheetId).toBe("sheet-a");
    expect(knownSheet?.targetUserId).toBeUndefined();
    const fullyUnscoped = await migratedDb.transactions.get("fully-unscoped");
    expect(fullyUnscoped?.targetSheetId).toBeUndefined();
    expect(fullyUnscoped?.targetUserId).toBeUndefined();
    migratedDb.close();
  });

  it("adds sheet-scoped history tables without dropping migrated transactions", async () => {
    const oldDb = new Dexie(TEST_DB_NAME);
    oldDb.version(2).stores({
      transactions:
        "id, status, createdAt, targetSheetId, targetUserId, [targetSheetId+targetUserId+status]",
      settings: "key",
    });
    await oldDb.table("transactions").put(oldPending("keep-me", "sheet-a"));
    oldDb.close();

    const migratedDb = new SheetLogDB(TEST_DB_NAME);
    await migratedDb.open();

    expect(await migratedDb.transactions.get("keep-me")).toBeDefined();
    expect(migratedDb.tables.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "transactions",
        "transactionHistory",
        "transactionHistoryMeta",
      ]),
    );
    migratedDb.close();
  });
});
