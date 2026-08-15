import { describe, expect, it } from "vitest";
import type { TransactionRecord } from "./types";
import {
  calculateReimbursementSummary,
  isReimbursableExpense,
  REIMBURSEMENT_CATEGORY,
  type ReimbursementLedgerRow,
  validateReimbursementAmount,
} from "./reimbursements";

const source: TransactionRecord = {
  id: "expense-1",
  type: "expense",
  amount: 100,
  currency: "THB",
  account: "Cash",
  for: "Me",
  category: "Dining",
  date: "2026-08-15T10:00:00.000Z",
  note: "Cafe",
  status: "synced",
  createdAt: "2026-08-15T10:00:00.000Z",
  updatedAt: "2026-08-15T10:00:00.000Z",
  sheetRowValid: true,
};

function ledgerRow(
  id: string,
  amount: number,
  overrides: Partial<ReimbursementLedgerRow> = {},
): ReimbursementLedgerRow {
  return {
    id,
    type: "income",
    amount,
    currency: "THB",
    reimbursesTransactionId: source.id,
    status: "synced",
    ...overrides,
  };
}

describe("reimbursement domain", () => {
  it("uses the system reimbursement category", () => {
    expect(REIMBURSEMENT_CATEGORY).toBe("Reimbursement");
  });

  it("combines confirmed Sheet rows with pending local rows", () => {
    const summary = calculateReimbursementSummary(
      source,
      [ledgerRow("remote-40", 40)],
      [ledgerRow("pending-20", 20, { status: "pending" })],
    );

    expect(summary).toEqual({
      confirmed: 40,
      queued: 20,
      remaining: 40,
      overReimbursed: 0,
      currencyMismatchIds: [],
    });
  });

  it("lets a queued edit win a stale remote duplicate without double counting", () => {
    const summary = calculateReimbursementSummary(
      source,
      [ledgerRow("edited", 40), ledgerRow("unchanged", 15)],
      [
        ledgerRow("edited", 50, { status: "pending" }),
        ledgerRow("unchanged", 15),
      ],
    );

    expect(summary).toMatchObject({
      confirmed: 15,
      queued: 50,
      remaining: 35,
    });
  });

  it("uses signed amounts so compensation rows reduce the confirmed total", () => {
    const summary = calculateReimbursementSummary(
      source,
      [ledgerRow("payment", 40), ledgerRow("compensation", -40)],
      [],
    );

    expect(summary).toMatchObject({
      confirmed: 0,
      queued: 0,
      remaining: 100,
    });
  });

  it("continues reserving errored local reimbursements", () => {
    const summary = calculateReimbursementSummary(source, [], [
      ledgerRow("errored", 25, { status: "error" }),
    ]);

    expect(summary).toMatchObject({ queued: 25, remaining: 75 });
  });

  it("conservatively reserves a reimbursement while its stable-ID delete is pending", () => {
    const deleteIntent = {
      ...ledgerRow("deleting", 25, { status: "pending" }),
      deleteIntent: true,
    };
    const summary = calculateReimbursementSummary(
      source,
      [ledgerRow("deleting", 25)],
      [deleteIntent],
    );

    expect(summary).toMatchObject({
      confirmed: 0,
      queued: 25,
      remaining: 75,
    });
  });

  it("excludes the current child while calculating an editable maximum", () => {
    const summary = calculateReimbursementSummary(
      source,
      [ledgerRow("current", 60), ledgerRow("other", 20)],
      [ledgerRow("current", 70, { status: "pending" })],
      "current",
    );

    expect(summary).toMatchObject({
      confirmed: 20,
      queued: 0,
      remaining: 80,
    });
  });

  it.each([
    { amount: 100, remaining: 0, overReimbursed: 0 },
    { amount: 125, remaining: 0, overReimbursed: 25 },
  ])(
    "derives full and over-reimbursement balances from $amount",
    ({ amount, remaining, overReimbursed }) => {
      expect(
        calculateReimbursementSummary(
          source,
          [ledgerRow("confirmed", amount)],
          [],
        ),
      ).toMatchObject({ remaining, overReimbursed });
    },
  );

  it("reports currency mismatches without adding incomparable amounts", () => {
    const summary = calculateReimbursementSummary(
      source,
      [ledgerRow("foreign", 40, { currency: "USD" })],
      [],
    );

    expect(summary).toEqual({
      confirmed: 0,
      queued: 0,
      remaining: 100,
      overReimbursed: 0,
      currencyMismatchIds: ["foreign"],
    });
  });

  it("ignores dangling relations, non-income rows, and non-finite amounts", () => {
    const summary = calculateReimbursementSummary(
      source,
      [
        ledgerRow("dangling", 50, { reimbursesTransactionId: "expense-2" }),
        ledgerRow("expense", 30, { type: "expense" }),
        ledgerRow("infinite", Number.POSITIVE_INFINITY),
        ledgerRow("valid", 10),
      ],
      [],
    );

    expect(summary).toMatchObject({ confirmed: 10, remaining: 90 });
  });

  it("avoids binary floating-point artifacts in monetary totals", () => {
    const decimalSource = { ...source, amount: 1 };
    const summary = calculateReimbursementSummary(
      decimalSource,
      [ledgerRow("one", 0.1), ledgerRow("two", 0.2)],
      [],
    );

    expect(summary.confirmed).toBe(0.3);
    expect(summary.remaining).toBe(0.7);
  });

  it("allows only valid positive expenses to be reimbursed", () => {
    expect(isReimbursableExpense(source)).toBe(true);
    expect(isReimbursableExpense({ ...source, sheetRowValid: undefined })).toBe(true);
    expect(isReimbursableExpense({ ...source, sheetRowValid: false })).toBe(false);
    expect(isReimbursableExpense({ ...source, type: "income" })).toBe(false);
    expect(isReimbursableExpense({ ...source, amount: 0 })).toBe(false);
    expect(isReimbursableExpense({ ...source, amount: -1 })).toBe(false);
    expect(isReimbursableExpense({ ...source, amount: Number.POSITIVE_INFINITY })).toBe(
      false,
    );
  });

  it("returns an empty balance for malformed and non-positive sources", () => {
    for (const invalidSource of [
      { ...source, sheetRowValid: false },
      { ...source, amount: 0 },
      { ...source, type: "transfer" as const },
    ]) {
      expect(
        calculateReimbursementSummary(
          invalidSource,
          [ledgerRow("child", 20)],
          [],
        ),
      ).toEqual({
        confirmed: 0,
        queued: 0,
        remaining: 0,
        overReimbursed: 0,
        currencyMismatchIds: [],
      });
    }
  });

  it("strictly validates positive finite amounts against the remaining balance", () => {
    const summary = calculateReimbursementSummary(
      source,
      [ledgerRow("existing", 60)],
      [],
    );

    expect(validateReimbursementAmount(Number.NaN, summary)).toBe(
      "Enter a valid reimbursement amount",
    );
    expect(validateReimbursementAmount(Number.POSITIVE_INFINITY, summary)).toBe(
      "Enter a valid reimbursement amount",
    );
    expect(validateReimbursementAmount(0, summary)).toBe(
      "Enter a valid reimbursement amount",
    );
    expect(validateReimbursementAmount(-1, summary)).toBe(
      "Enter a valid reimbursement amount",
    );
    expect(validateReimbursementAmount(40, summary)).toBeNull();
    expect(validateReimbursementAmount(40.01, summary)).toBe(
      "Amount exceeds remaining reimbursement balance",
    );
  });

  it("does not reject an equivalent amount because of floating-point noise", () => {
    const summary = {
      confirmed: 0,
      queued: 0,
      remaining: 0.3,
      overReimbursed: 0,
      currencyMismatchIds: [],
    };

    expect(validateReimbursementAmount(0.1 + 0.2, summary)).toBeNull();
  });
});
