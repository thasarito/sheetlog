import { describe, expect, it } from "vitest";
import type { TransactionRecord } from "./types";
import {
  LEGACY_TRANSACTION_SCOPE_ERROR,
  getTransactionTargetSheetId,
  getTransactionTargetUserId,
  isTransactionInSheetScope,
  visibleLocalTransactionsForSheet,
} from "./transactionScope";

function transaction(
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
    category: "Food",
    date: "2026-08-15T08:00:00.000Z",
    status: "pending",
    createdAt: "2026-08-15T08:00:00.000Z",
    updatedAt: "2026-08-15T08:00:00.000Z",
    ...overrides,
  };
}

describe("transaction scope", () => {
  it("uses immutable target provenance and safely recognizes old synced provenance", () => {
    expect(
      getTransactionTargetSheetId(
        transaction("target", {
          targetSheetId: "sheet-a",
          targetUserId: "user-a",
          sheetId: "stale-sheet",
        }),
      ),
    ).toBe("sheet-a");
    expect(
      getTransactionTargetUserId(
        transaction("target-user", { targetUserId: "user-a" }),
      ),
    ).toBe("user-a");
    expect(
      getTransactionTargetSheetId(
        transaction("old-synced", {
          status: "synced",
          sheetId: "sheet-a",
        }),
      ),
    ).toBe("sheet-a");
    expect(getTransactionTargetSheetId(transaction("legacy"))).toBeUndefined();
  });

  it("matches only records with proven ownership of the active sheet", () => {
    expect(
      isTransactionInSheetScope(
        transaction("a", {
          targetSheetId: "sheet-a",
          targetUserId: "user-a",
        }),
        "sheet-a",
        "user-a",
      ),
    ).toBe(true);
    expect(
      isTransactionInSheetScope(
        transaction("b", {
          targetSheetId: "sheet-b",
          targetUserId: "user-a",
        }),
        "sheet-a",
        "user-a",
      ),
    ).toBe(false);
    expect(
      isTransactionInSheetScope(transaction("legacy"), "sheet-a", "user-a"),
    ).toBe(false);
    expect(
      isTransactionInSheetScope(
        transaction("other-user", {
          targetSheetId: "sheet-a",
          targetUserId: "user-b",
        }),
        "sheet-a",
        "user-a",
      ),
    ).toBe(false);
    expect(
      isTransactionInSheetScope(
        transaction("no-workspace", { targetSheetId: "sheet-a" }),
        null,
        "user-a",
      ),
    ).toBe(false);
  });

  it("shows only current-sheet and legacy recovery rows without adopting legacy provenance", () => {
    const current = transaction("current", {
      targetSheetId: "sheet-a",
      targetUserId: "user-a",
    });
    const other = transaction("other", {
      targetSheetId: "sheet-b",
      targetUserId: "user-a",
    });
    const legacy = transaction("legacy", { note: "Old offline item" });

    expect(
      visibleLocalTransactionsForSheet(
        [current, other, legacy],
        "sheet-a",
        "user-a",
      ),
    ).toEqual([
      current,
      {
        ...legacy,
        status: "error",
        error: LEGACY_TRANSACTION_SCOPE_ERROR,
      },
    ]);
  });
});
