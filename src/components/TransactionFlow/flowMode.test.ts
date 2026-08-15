import { describe, expect, it } from "vitest";
import { REIMBURSEMENT_CATEGORY } from "../../lib/reimbursements";
import type { TransactionRecord } from "../../lib/types";
import {
  getReimbursementFormDefaults,
  reimbursementFieldsLocked,
  type TransactionFlowMode,
} from "./flowMode";

function transaction(
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  return {
    id: "expense-1",
    type: "expense",
    amount: 100,
    currency: "THB",
    account: "Wallet",
    for: "Household",
    category: "Food",
    date: "2026-08-15T08:00:00.000Z",
    note: "Lunch",
    status: "synced",
    createdAt: "2026-08-15T08:00:00.000Z",
    updatedAt: "2026-08-15T08:00:00.000Z",
    sheetRowValid: true,
    ...overrides,
  };
}

describe("TransactionFlowMode", () => {
  it("locks reimbursement fields only for reimburse mode and linked edits", () => {
    const source = transaction();
    const linked = transaction({
      id: "child-1",
      type: "income",
      category: REIMBURSEMENT_CATEGORY,
      reimbursesTransactionId: source.id,
    });
    const modes: Array<[TransactionFlowMode, boolean]> = [
      [{ kind: "create" }, false],
      [{ kind: "edit", transaction: source }, false],
      [{ kind: "edit", transaction: linked }, true],
      [{ kind: "reimburse", source }, true],
    ];

    for (const [mode, expected] of modes) {
      expect(reimbursementFieldsLocked(mode)).toBe(expected);
    }
  });

  it("builds reimbursement defaults from the source and the current balance", () => {
    const now = new Date("2026-08-15T12:34:56.000Z");

    expect(
      getReimbursementFormDefaults(transaction(), 60, now),
    ).toEqual({
      type: "income",
      category: REIMBURSEMENT_CATEGORY,
      amount: "60",
      currency: "THB",
      account: "Wallet",
      forValue: "Household",
      dateObject: now,
      note: "Lunch",
    });
  });

  it("uses the source category when its note is blank", () => {
    expect(
      getReimbursementFormDefaults(transaction({ note: "  " }), 100),
    ).toMatchObject({ note: "Food" });
  });
});
