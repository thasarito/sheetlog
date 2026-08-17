import { tryParseDate } from "./date-utils";
import { parseSheetTransactionPlace } from "./transactionPlace";
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
  "Place Provider",
  "Place ID",
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

function parseSheetDate(
  value: unknown,
  fallback: string,
): { value: string; isValid: boolean } {
  if (typeof value !== "string" && typeof value !== "number") {
    return { value: fallback, isValid: false };
  }

  const parsed = tryParseDate(value);
  if (!parsed) {
    return { value: fallback, isValid: false };
  }

  return { value: parsed.toISOString(), isValid: true };
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
    transaction.place?.provider ?? "",
    transaction.place?.placeId ?? "",
  ];
}

const USER_ENTERED_TEXT_COLUMNS = new Set([
  1, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13,
]);
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
    placeProviderRaw,
    placeIdRaw,
  ] = row;

  const typeIsValid = TRANSACTION_TYPES.includes(typeRaw as TransactionType);
  const amount = finiteNumber(amountRaw);
  const stableId = String(idRaw ?? "").trim();
  const relation = String(reimbursesTransactionIdRaw ?? "").trim();
  const now = new Date().toISOString();
  const dateResult = parseSheetDate(date, now);
  const timestamp = parseSheetDate(createdAt, now).value;
  const place = parseSheetTransactionPlace(
    note,
    placeProviderRaw,
    placeIdRaw,
  );

  return {
    id: stableId || `row-${rowIndex}`,
    date: dateResult.value,
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
    sheetRowValid:
      dateResult.isValid &&
      typeIsValid &&
      amount !== null &&
      stableId.length > 0,
    reimbursesTransactionId: relation || undefined,
    ...(place ? { place } : {}),
  };
}
