import { parseDate } from "./date-utils";
import type { TransactionRecord, TransactionType } from "./types";

export const TRANSACTION_HEADERS = [
  "Date",
  "Type",
  "Amount",
  "Category",
  "Note",
  "Timestamp",
  "Device/Source",
  "Currency",
  "Account",
  "For",
  "Id",
  "Reimburses Id",
] as const;

const TRANSACTION_TYPES: readonly TransactionType[] = [
  "expense",
  "income",
  "transfer",
];

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  return null;
}

function parseSheetDate(value: unknown, fallback: string): string {
  if (typeof value !== "string" && typeof value !== "number") {
    return fallback;
  }

  try {
    const parsed = parseDate(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : fallback;
  } catch {
    return fallback;
  }
}

export function serializeTransactionRow(
  transaction: TransactionRecord,
): unknown[] {
  let note = transaction.note ?? "";
  let currency = transaction.currency ?? "";

  if (!currency && note) {
    const prefixedCurrency = note.match(/^\[([A-Z]{3})\]\s*/);
    if (prefixedCurrency) {
      currency = prefixedCurrency[1];
      note = note.slice(prefixedCurrency[0].length);
    }
  }

  return [
    transaction.date,
    transaction.type,
    transaction.amount,
    transaction.category,
    note,
    transaction.createdAt,
    "PWA",
    currency,
    transaction.account ?? "",
    transaction.for ?? "",
    transaction.id,
    transaction.reimbursesTransactionId?.trim() ?? "",
  ];
}

const USER_ENTERED_TEXT_COLUMNS = new Set([1, 3, 4, 6, 7, 8, 9, 10, 11]);
const FORMULA_LIKE_TEXT = /^[\s\p{Cc}\p{Cf}]*[=+\-@]/u;

/**
 * Keeps dates and amounts eligible for Sheets' USER_ENTERED parsing while
 * forcing formula-like text cells to remain literal text.
 */
export function serializeTransactionRowForUserEntered(
  transaction: TransactionRecord,
): unknown[] {
  return serializeTransactionRow(transaction).map((value, index) => {
    if (
      USER_ENTERED_TEXT_COLUMNS.has(index) &&
      typeof value === "string" &&
      FORMULA_LIKE_TEXT.test(value)
    ) {
      return `'${value}`;
    }
    return value;
  });
}

export function parseTransactionRow(
  row: unknown[],
  rowIndex: number,
): TransactionRecord {
  const [
    date,
    typeRaw,
    amountRaw,
    category,
    note,
    createdAt,
    _device,
    currency,
    account,
    forValue,
    idRaw,
    reimbursesTransactionIdRaw,
  ] = row;

  const typeIsValid = TRANSACTION_TYPES.includes(typeRaw as TransactionType);
  const amount = finiteNumber(amountRaw);
  const stableId = String(idRaw ?? "").trim();
  const relation = String(reimbursesTransactionIdRaw ?? "").trim();
  const now = new Date().toISOString();
  const timestamp = String(createdAt || now);

  return {
    id: stableId || `row-${rowIndex}`,
    date: parseSheetDate(date, now),
    type: typeIsValid ? (typeRaw as TransactionType) : "expense",
    amount: amount ?? 0,
    category: String(category || "Uncategorized"),
    note: note ? String(note) : undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
    currency: String(currency || "THB"),
    account: String(account || ""),
    for: String(forValue || ""),
    status: "synced",
    sheetRow: rowIndex,
    sheetRowValid: typeIsValid && amount !== null && stableId.length > 0,
    reimbursesTransactionId: relation || undefined,
  };
}
