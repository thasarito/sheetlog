import { db } from './db';
import { appendTransaction } from './google';

export async function syncPendingTransactions(accessToken: string, sheetId: string): Promise<number> {
  const pending = await db.transactions.where('status').equals('pending').sortBy('createdAt');
  let syncedCount = 0;

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
      await db.transactions.update(item.id, {
        error: error instanceof Error ? error.message : 'Sync failed',
        updatedAt: new Date().toISOString()
      });
    }
  }

  return syncedCount;
}
