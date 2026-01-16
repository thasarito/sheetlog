import { db } from './db';
import {
  appendTransaction as realAppendTransaction,
  readTransactionIdMap as realReadTransactionIdMap,
} from './google';
import { mapGoogleSyncError } from './googleErrors';
import {
  IS_DEV_MODE,
  appendTransaction as mockAppendTransaction,
  readTransactionIdMap as mockReadTransactionIdMap,
} from './mock';

const appendTransaction = IS_DEV_MODE ? mockAppendTransaction : realAppendTransaction;
const readTransactionIdMap = IS_DEV_MODE ? mockReadTransactionIdMap : realReadTransactionIdMap;

export async function syncPendingTransactions(
  accessToken: string,
  sheetId: string,
): Promise<number> {
  const pending = await db.transactions.where('status').equals('pending').sortBy('createdAt');
  if (pending.length === 0) {
    return 0;
  }
  let syncedCount = 0;
  let syncFailure: unknown = null;
  const existingIds = await readTransactionIdMap(accessToken, sheetId);

  for (const item of pending) {
    const existingRow = existingIds.get(item.id);
    if (existingRow) {
      await db.transactions.update(item.id, {
        status: 'synced',
        sheetRow: existingRow,
        sheetId,
        error: undefined,
        updatedAt: new Date().toISOString(),
      });
      syncedCount += 1;
      continue;
    }
    try {
      const rowIndex = await appendTransaction(accessToken, sheetId, item);
      await db.transactions.update(item.id, {
        status: 'synced',
        sheetRow: rowIndex ?? undefined,
        sheetId,
        error: undefined,
        updatedAt: new Date().toISOString(),
      });
      if (rowIndex) {
        existingIds.set(item.id, rowIndex);
      }
      syncedCount += 1;
    } catch (error) {
      const info = mapGoogleSyncError(error);
      await db.transactions.update(item.id, {
        status: info.retryable ? 'pending' : 'error',
        error: info.message,
        updatedAt: new Date().toISOString(),
      });
      if (info.shouldClearAuth || info.retryable) {
        syncFailure = error;
        break;
      }
    }
  }

  if (syncFailure) {
    throw syncFailure;
  }

  return syncedCount;
}
