import { db } from './db';
import { appendTransaction } from './google';
import { mapGoogleSyncError } from './googleErrors';

export async function syncPendingTransactions(accessToken: string, sheetId: string): Promise<number> {
  const pending = await db.transactions.where('status').equals('pending').sortBy('createdAt');
  let syncedCount = 0;
  let syncFailure: unknown = null;

  for (const item of pending) {
    try {
      const rowIndex = await appendTransaction(accessToken, sheetId, item);
      await db.transactions.update(item.id, {
        status: 'synced',
        sheetRow: rowIndex ?? undefined,
        sheetId,
        error: undefined,
        updatedAt: new Date().toISOString()
      });
      syncedCount += 1;
    } catch (error) {
      const info = mapGoogleSyncError(error);
      await db.transactions.update(item.id, {
        status: info.retryable ? 'pending' : 'error',
        error: info.message,
        updatedAt: new Date().toISOString()
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
