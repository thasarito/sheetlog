import { describe, expect, it } from "vitest";
import type { TransactionRecord } from "./types";
import {
  parseTransactionRow,
  serializeTransactionRow,
  TRANSACTION_HEADERS,
} from "./transactionRows";

const legacyElevenColumns = [
  "2026-08-15T10:00:00.000Z",
  "expense",
  100,
  "Dining",
  "Cafe",
  "2026-08-15T10:00:00.000Z",
  "PWA",
  "THB",
  "Cash",
  "Me",
  "expense-1",
];

function legacyRowWith(index: number, value: unknown): unknown[] {
  const row: unknown[] = [...legacyElevenColumns];
  row[index] = value;
  return row;
}

describe("transaction Sheet rows", () => {
  it("keeps the stable transaction ID in column K and the relation in column L", () => {
    expect(TRANSACTION_HEADERS).toHaveLength(12);
    expect(TRANSACTION_HEADERS[10]).toBe("Id");
    expect(TRANSACTION_HEADERS[11]).toBe("Reimburses Id");

    const transaction: TransactionRecord = {
      id: "income-1",
      type: "income",
      amount: 40,
      category: "Reimbursement",
      note: "Cafe",
      date: "2026-08-15T11:00:00.000Z",
      createdAt: "2026-08-15T11:00:00.000Z",
      updatedAt: "2026-08-15T11:00:00.000Z",
      currency: "THB",
      account: "Bank",
      for: "Me",
      status: "pending",
      reimbursesTransactionId: "expense-1",
    };

    const serialized = serializeTransactionRow(transaction);

    expect(serialized[10]).toBe("income-1");
    expect(serialized[11]).toBe("expense-1");
  });

  it("parses a valid legacy eleven-column row without a reimbursement relation", () => {
    const parsed = parseTransactionRow(legacyElevenColumns, 2);

    expect(parsed).toMatchObject({
      id: "expense-1",
      type: "expense",
      amount: 100,
      reimbursesTransactionId: undefined,
      sheetRow: 2,
      sheetRowValid: true,
    });
  });

  it("parses and trims a twelve-column reimbursement relation", () => {
    const parsed = parseTransactionRow(
      [...legacyElevenColumns, "  source-expense  "],
      3,
    );

    expect(parsed.reimbursesTransactionId).toBe("source-expense");
    expect(parsed.sheetRowValid).toBe(true);
  });

  it.each([
    {
      name: "unknown type",
      row: legacyRowWith(1, "refund"),
      fallback: { type: "expense", amount: 100, id: "expense-1" },
    },
    {
      name: "non-finite amount",
      row: legacyRowWith(2, "not-a-number"),
      fallback: { type: "expense", amount: 0, id: "expense-1" },
    },
    {
      name: "missing stable ID",
      row: legacyRowWith(10, "   "),
      fallback: { type: "expense", amount: 100, id: "row-4" },
    },
  ])("marks a row with $name invalid while retaining safe fallbacks", ({ row, fallback }) => {
    expect(parseTransactionRow(row, 4)).toMatchObject({
      ...fallback,
      sheetRowValid: false,
    });
  });

  it.each([
    ["an empty string", ""],
    ["whitespace", "   "],
    ["null", null],
    ["true", true],
    ["false", false],
  ])("rejects %s instead of coercing it into a valid amount", (_name, amount) => {
    expect(parseTransactionRow(legacyRowWith(2, amount), 5)).toMatchObject({
      amount: 0,
      sheetRowValid: false,
    });
  });

  it("accepts a non-empty finite numeric amount string", () => {
    expect(parseTransactionRow(legacyRowWith(2, " 42.5 "), 5)).toMatchObject({
      amount: 42.5,
      sheetRowValid: true,
    });
  });

  it("falls back safely for a finite numeric date outside the JavaScript Date range", () => {
    const parsed = parseTransactionRow(
      legacyRowWith(0, Number.MAX_VALUE),
      5,
    );

    expect(Number.isFinite(new Date(parsed.date).getTime())).toBe(true);
    expect(parsed.sheetRowValid).toBe(true);
  });

  it("treats only exact transaction type values as valid", () => {
    const parsed = parseTransactionRow(legacyRowWith(1, "EXPENSE"), 5);

    expect(parsed.type).toBe("expense");
    expect(parsed.sheetRowValid).toBe(false);
  });
});
