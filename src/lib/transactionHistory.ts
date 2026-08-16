import { db, type SheetLogDB } from "./db";
import type {
  CachedTransactionRecord,
  TransactionHistorySnapshot,
  TransactionRecord,
} from "./types";

export function normalizeTransactionSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function transactionSearchText(
  transaction: Pick<TransactionRecord, "account" | "category" | "note">,
): string {
  return normalizeTransactionSearchText(
    [transaction.category, transaction.note, transaction.account]
      .filter(Boolean)
      .join(" "),
  );
}

export function createCachedTransactionRecord(
  transaction: TransactionRecord,
  sheetId: string,
  cachedAt: string,
): CachedTransactionRecord {
  return {
    ...transaction,
    sheetId,
    sheetRow: transaction.sheetRow ?? 0,
    cachedAt,
    canEdit: transaction.sheetRowValid === true,
    searchText: transactionSearchText(transaction),
  };
}

type TransactionWithHistoryCacheFields = TransactionRecord &
  Partial<
    Pick<CachedTransactionRecord, "cachedAt" | "canEdit" | "searchText">
  >;

export function toLocalTransactionRecord(
  transaction: TransactionRecord,
): TransactionRecord {
  const localRecord: TransactionWithHistoryCacheFields = { ...transaction };
  delete localRecord.cachedAt;
  delete localRecord.canEdit;
  delete localRecord.searchText;
  return localRecord;
}

export function canEditTransaction(transaction: TransactionRecord): boolean {
  if (transaction.sheetRowValid === false) {
    return false;
  }
  const cachedCanEdit = (transaction as Partial<CachedTransactionRecord>)
    .canEdit;
  if (cachedCanEdit === false) {
    return false;
  }
  if (transaction.status === "pending" || transaction.status === "error") {
    return true;
  }
  return transaction.sheetRowValid === true;
}

export async function readTransactionHistorySnapshot(
  sheetId: string,
  historyDb: SheetLogDB = db,
): Promise<TransactionHistorySnapshot | null> {
  return historyDb.transaction(
    "r",
    historyDb.transactionHistory,
    historyDb.transactionHistoryMeta,
    async () => {
      const meta = await historyDb.transactionHistoryMeta.get(sheetId);
      if (!meta) {
        return null;
      }
      const records = await historyDb.transactionHistory
        .where("sheetId")
        .equals(sheetId)
        .toArray();
      records.sort((left, right) => left.sheetRow - right.sheetRow);
      return { records, meta };
    },
  );
}

export async function replaceTransactionHistorySnapshot(
  snapshot: TransactionHistorySnapshot,
  historyDb: SheetLogDB = db,
): Promise<TransactionHistorySnapshot> {
  const { meta, records } = snapshot;
  const recordIds = new Set(records.map(({ id }) => id));
  if (
    meta.rowCount !== records.length ||
    recordIds.size !== records.length ||
    records.some(
      (record) => !record.id || record.sheetId !== meta.sheetId,
    )
  ) {
    throw new Error("Transaction history snapshot is inconsistent");
  }

  return historyDb.transaction(
    "rw",
    historyDb.transactionHistory,
    historyDb.transactionHistoryMeta,
    async () => {
      const currentMeta = await historyDb.transactionHistoryMeta.get(
        meta.sheetId,
      );
      if (
        currentMeta &&
        timestamp(currentMeta.capturedAt) > timestamp(meta.capturedAt)
      ) {
        const currentRecords = await historyDb.transactionHistory
          .where("sheetId")
          .equals(meta.sheetId)
          .toArray();
        currentRecords.sort((left, right) => left.sheetRow - right.sheetRow);
        return { records: currentRecords, meta: currentMeta };
      }
      await historyDb.transactionHistory
        .where("sheetId")
        .equals(meta.sheetId)
        .delete();
      if (records.length > 0) {
        await historyDb.transactionHistory.bulkPut(records);
      }
      await historyDb.transactionHistoryMeta.put(meta);
      return snapshot;
    },
  );
}

export async function clearTransactionHistoryCache(
  historyDb: SheetLogDB = db,
): Promise<void> {
  await historyDb.transaction(
    "rw",
    historyDb.transactionHistory,
    historyDb.transactionHistoryMeta,
    async () => {
      await historyDb.transactionHistory.clear();
      await historyDb.transactionHistoryMeta.clear();
    },
  );
}

function timestamp(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function compareTransactionsByDate(
  left: TransactionRecord,
  right: TransactionRecord,
): number {
  const dateDifference = timestamp(right.date) - timestamp(left.date);
  if (dateDifference !== 0) {
    return dateDifference;
  }
  const createdDifference =
    timestamp(right.createdAt) - timestamp(left.createdAt);
  if (createdDifference !== 0) {
    return createdDifference;
  }
  return left.id.localeCompare(right.id);
}

type ReconcileTransactionHistoryOptions = {
  cachedRecords: readonly CachedTransactionRecord[];
  localTransactions: readonly TransactionRecord[];
  capturedAt?: string;
};

export function reconcileTransactionHistory({
  cachedRecords,
  localTransactions,
  capturedAt,
}: ReconcileTransactionHistoryOptions): TransactionRecord[] {
  const capturedAtTimestamp = timestamp(capturedAt);
  const eligibleLocal = localTransactions.filter(
    (transaction) =>
      transaction.status === "pending" ||
      transaction.status === "error" ||
      timestamp(transaction.updatedAt) > capturedAtTimestamp,
  );
  const seen = new Set<string>();
  const records: TransactionRecord[] = [];

  for (const transaction of eligibleLocal) {
    if (seen.has(transaction.id)) {
      continue;
    }
    seen.add(transaction.id);
    records.push(toLocalTransactionRecord(transaction));
  }

  for (const transaction of cachedRecords) {
    if (seen.has(transaction.id)) {
      continue;
    }
    seen.add(transaction.id);
    records.push(transaction);
  }

  return records.sort(compareTransactionsByDate);
}

export function filterTransactionHistory<T extends TransactionRecord>(
  records: readonly T[],
  query: string,
): T[] {
  const normalizedQuery = normalizeTransactionSearchText(query);
  if (!normalizedQuery) {
    return [...records];
  }
  return records.filter((record) => {
    const cachedSearchText =
      "searchText" in record && typeof record.searchText === "string"
        ? record.searchText
        : transactionSearchText(record);
    return cachedSearchText.includes(normalizedQuery);
  });
}
