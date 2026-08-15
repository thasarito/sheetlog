import type { TransactionRecord } from "./types";

export const LEGACY_TRANSACTION_SCOPE_ERROR =
  "This older offline entry has no verified Google account scope and cannot sync safely. Delete it and recreate it in the intended workspace.";

export function getTransactionTargetSheetId(
  transaction: TransactionRecord,
): string | undefined {
  return transaction.targetSheetId ?? transaction.sheetId;
}

export function getTransactionTargetUserId(
  transaction: TransactionRecord,
): string | undefined {
  return transaction.targetUserId;
}

export function isTransactionInSheetScope(
  transaction: TransactionRecord,
  sheetId: string | null | undefined,
  userId: string | null | undefined,
): boolean {
  return Boolean(
    sheetId &&
      userId &&
      getTransactionTargetSheetId(transaction) === sheetId &&
      getTransactionTargetUserId(transaction) === userId,
  );
}

export function visibleLocalTransactionsForSheet(
  transactions: TransactionRecord[],
  sheetId: string | null | undefined,
  userId: string | null | undefined,
): TransactionRecord[] {
  return transactions.flatMap((transaction) => {
    if (isTransactionInSheetScope(transaction, sheetId, userId)) {
      return [transaction];
    }

    const targetSheetId = getTransactionTargetSheetId(transaction);
    const isLegacyForVisibleSheet =
      !getTransactionTargetUserId(transaction) &&
      (!targetSheetId || targetSheetId === sheetId);
    if (!isLegacyForVisibleSheet) {
      return [];
    }

    return [
      {
        ...transaction,
        status: "error" as const,
        error: LEGACY_TRANSACTION_SCOPE_ERROR,
      },
    ];
  });
}
