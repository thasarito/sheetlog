import { describe, expect, it } from "vitest";
import type { TransactionPlace, TransactionRecord } from "./types";
import {
  parseTransactionRow,
  serializeTransactionRow,
  serializeTransactionRowForUserEntered,
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

const numericSheetRow = [
  46249 + (9 * 60 + 30) / (24 * 60),
  "expense",
  100.25,
  "Dining",
  "Cafe",
  46249 + (10 * 60 * 60 + 45 * 60 + 30) / (24 * 60 * 60),
  "PWA",
  "THB",
  "Cash",
  "Me",
  "expense-serial",
  "",
];

function legacyRowWith(index: number, value: unknown): unknown[] {
  const row: unknown[] = [...legacyElevenColumns];
  row[index] = value;
  return row;
}

describe("transaction Sheet rows", () => {
  it("keeps K/L stable and adds place metadata in M/N", () => {
    expect(TRANSACTION_HEADERS).toHaveLength(14);
    expect(TRANSACTION_HEADERS.slice(10)).toEqual([
      "Id",
      "Reimburses Id",
      "Place Provider",
      "Place ID",
    ]);

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
      place: { provider: "google", placeId: "central-cafe" },
    };

    const serialized = serializeTransactionRow(transaction);

    expect(serialized.slice(10)).toEqual([
      "income-1",
      "expense-1",
      "google",
      "central-cafe",
    ]);
  });

  it.each([
    [legacyElevenColumns, "A:K"],
    [[...legacyElevenColumns, "source-id"], "A:L"],
  ])("parses legacy %s rows without place metadata", (row) => {
    expect(parseTransactionRow(row as unknown[], 2).place).toBeUndefined();
  });

  it("parses only a complete M/N pair with a nonblank note", () => {
    const row = [
      ...legacyElevenColumns,
      "",
      " google ",
      " central-cafe ",
    ];
    expect(parseTransactionRow(row, 2).place).toEqual({
      provider: "google",
      placeId: "central-cafe",
    });
    expect(
      parseTransactionRow([...row.slice(0, 4), "", ...row.slice(5)], 2)
        .place,
    ).toBeUndefined();
    expect(
      parseTransactionRow([...row.slice(0, 13), ""], 2).place,
    ).toBeUndefined();
    expect(
      parseTransactionRow([...row.slice(0, 12), "other", "id"], 2).place,
    ).toBeUndefined();
  });

  it("literalizes formula-like provider and place IDs for USER_ENTERED writes", () => {
    const transaction: TransactionRecord = {
      id: "income-1",
      type: "income",
      amount: 40,
      category: "Reimbursement",
      note: "Central Cafe",
      date: "2026-08-15T11:00:00.000Z",
      createdAt: "2026-08-15T11:00:00.000Z",
      updatedAt: "2026-08-15T11:00:00.000Z",
      currency: "THB",
      account: "Bank",
      for: "Me",
      status: "pending",
      reimbursesTransactionId: "expense-1",
      place: {
        provider: "=IMPORTXML(1)",
        placeId: "\n+SUM(1)",
      } as unknown as TransactionPlace,
    };

    const row = serializeTransactionRowForUserEntered(transaction);

    expect(row[12]).toBe("'=IMPORTXML(1)");
    expect(row[13]).toBe("'\n+SUM(1)");
  });

  it("parses a valid legacy eleven-column row without a reimbursement relation", () => {
    const parsed = parseTransactionRow(legacyElevenColumns, 2);

    expect(parsed).toMatchObject({
      id: "expense-1",
      date: "2026-08-15T10:00:00.000Z",
      type: "expense",
      amount: 100,
      createdAt: "2026-08-15T10:00:00.000Z",
      updatedAt: "2026-08-15T10:00:00.000Z",
      reimbursesTransactionId: undefined,
      sheetRow: 2,
      sheetRowValid: true,
    });
  });

  it("normalizes numeric Sheet date and timestamp cells to stable ISO strings", () => {
    const parsed = parseTransactionRow(numericSheetRow, 7);

    expect(parsed).toMatchObject({
      id: "expense-serial",
      date: new Date(2026, 7, 15, 9, 30, 0).toISOString(),
      amount: 100.25,
      createdAt: new Date(2026, 7, 15, 10, 45, 30).toISOString(),
      updatedAt: new Date(2026, 7, 15, 10, 45, 30).toISOString(),
      sheetRow: 7,
      sheetRowValid: true,
    });
    expect(parsed.createdAt).not.toMatch(/^\d+(?:\.\d+)?$/);
    expect(parsed.updatedAt).not.toMatch(/^\d+(?:\.\d+)?$/);
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
