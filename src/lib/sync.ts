import { db } from './db';
import {
  appendTransaction as realAppendTransaction,
  deleteRow as realDeleteRow,
  getSheetTabId as realGetSheetTabId,
  readTransactionById as realReadTransactionById,
  readTransactionIdMap as realReadTransactionIdMap,
  updateRow as realUpdateRow,
} from './google';
import { mapGoogleSyncError } from './googleErrors';
import {
  IS_DEV_MODE,
  appendTransaction as mockAppendTransaction,
  deleteRow as mockDeleteRow,
  getSheetTabId as mockGetSheetTabId,
  readTransactionById as mockReadTransactionById,
  readTransactionIdMap as mockReadTransactionIdMap,
  updateRow as mockUpdateRow,
} from './mock';
import type { TransactionRecord } from './types';

const appendTransaction = IS_DEV_MODE ? mockAppendTransaction : realAppendTransaction;
const deleteRow = IS_DEV_MODE ? mockDeleteRow : realDeleteRow;
const getSheetTabId = IS_DEV_MODE ? mockGetSheetTabId : realGetSheetTabId;
const readTransactionById = IS_DEV_MODE
  ? mockReadTransactionById
  : realReadTransactionById;
const readTransactionIdMap = IS_DEV_MODE
  ? mockReadTransactionIdMap
  : realReadTransactionIdMap;
const updateRow = IS_DEV_MODE ? mockUpdateRow : realUpdateRow;

function hasSameTransactionContent(
  left: TransactionRecord,
  right: TransactionRecord,
): boolean {
  return (
    left.id === right.id &&
    left.type === right.type &&
    left.amount === right.amount &&
    left.currency === right.currency &&
    left.account === right.account &&
    left.for === right.for &&
    left.category === right.category &&
    left.date === right.date &&
    left.createdAt === right.createdAt &&
    (left.note ?? '') === (right.note ?? '') &&
    (left.reimbursesTransactionId ?? '') ===
      (right.reimbursesTransactionId ?? '')
  );
}

function applyAuthoritativeRelation(
  pending: TransactionRecord,
  remote: TransactionRecord,
): TransactionRecord {
  if (!remote.reimbursesTransactionId) {
    return {
      ...pending,
      createdAt: remote.createdAt,
      reimbursesTransactionId: undefined,
    };
  }

  return {
    ...pending,
    type: remote.type,
    category: remote.category,
    currency: remote.currency,
    for: remote.for,
    createdAt: remote.createdAt,
    reimbursesTransactionId: remote.reimbursesTransactionId,
  };
}

function isSamePendingRevision(
  current: TransactionRecord,
  attempted: TransactionRecord,
): boolean {
  return (
    current.status === 'pending' &&
    current.createdAt === attempted.createdAt &&
    current.updatedAt === attempted.updatedAt &&
    hasSameTransactionContent(current, attempted)
  );
}

async function updatePendingRevision(
  attempted: TransactionRecord,
  updates: Partial<TransactionRecord>,
): Promise<boolean> {
  return db.transaction('rw', db.transactions, async () => {
    const current = await db.transactions.get(attempted.id);
    if (!current || !isSamePendingRevision(current, attempted)) {
      return false;
    }
    await db.transactions.update(attempted.id, updates);
    return true;
  });
}

async function getPendingRevision(id: string): Promise<TransactionRecord | null> {
  const current = await db.transactions.get(id);
  return current?.status === 'pending' ? current : null;
}

async function rollbackDeletedAppend(
  accessToken: string,
  sheetId: string,
  id: string,
): Promise<void> {
  const tabId = await getSheetTabId(accessToken, sheetId);
  if (tabId === null) {
    throw new Error('Transactions sheet tab unavailable for append rollback');
  }

  const currentIds = await readTransactionIdMap(accessToken, sheetId);
  const currentRow = currentIds.get(id);
  if (currentRow === undefined) {
    return;
  }
  await deleteRow(accessToken, sheetId, tabId, currentRow);
}

export async function syncPendingTransactions(
  accessToken: string,
  sheetId: string,
): Promise<number> {
  const pendingSnapshot = await db.transactions
    .where('status')
    .equals('pending')
    .sortBy('createdAt');
  if (pendingSnapshot.length === 0) {
    return 0;
  }

  let syncedCount = 0;
  let syncFailure: unknown = null;
  const existingIds = await readTransactionIdMap(accessToken, sheetId);

  for (const snapshotItem of pendingSnapshot) {
    let item = await getPendingRevision(snapshotItem.id);
    if (!item) {
      continue;
    }

    try {
      const existingRow = existingIds.get(item.id);
      if (existingRow !== undefined) {
        const remote = await readTransactionById(accessToken, sheetId, item.id);
        if (!remote) {
          throw new TypeError('Current transaction row could not be read');
        }

        item = await getPendingRevision(item.id);
        if (!item) {
          continue;
        }

        const itemForWrite = applyAuthoritativeRelation(item, remote);
        const currentRow = remote.sheetRow ?? existingRow;
        if (!hasSameTransactionContent(remote, itemForWrite)) {
          await updateRow(accessToken, sheetId, currentRow, itemForWrite);
        }

        const didMarkSynced = await updatePendingRevision(item, {
          type: itemForWrite.type,
          category: itemForWrite.category,
          currency: itemForWrite.currency,
          for: itemForWrite.for,
          createdAt: itemForWrite.createdAt,
          reimbursesTransactionId: itemForWrite.reimbursesTransactionId,
          status: 'synced',
          sheetRow: currentRow,
          sheetId,
          error: undefined,
          updatedAt: new Date().toISOString(),
        });
        if (didMarkSynced) {
          syncedCount += 1;
        }
        continue;
      }

      item = await getPendingRevision(item.id);
      if (!item) {
        continue;
      }

      const rowIndex = await appendTransaction(accessToken, sheetId, item);
      if (rowIndex !== null) {
        existingIds.set(item.id, rowIndex);
      }

      if (!(await db.transactions.get(snapshotItem.id))) {
        await rollbackDeletedAppend(accessToken, sheetId, item.id);
        continue;
      }

      const didMarkSynced = await updatePendingRevision(item, {
        status: 'synced',
        sheetRow: rowIndex ?? undefined,
        sheetId,
        error: undefined,
        updatedAt: new Date().toISOString(),
      });
      if (didMarkSynced) {
        syncedCount += 1;
      } else if (!(await db.transactions.get(item.id))) {
        await rollbackDeletedAppend(accessToken, sheetId, item.id);
      }
    } catch (error) {
      if (!(await db.transactions.get(snapshotItem.id))) {
        syncFailure = error;
        break;
      }
      const info = mapGoogleSyncError(error);
      if (item) {
        await updatePendingRevision(item, {
          status: info.retryable ? 'pending' : 'error',
          error: info.message,
          updatedAt: new Date().toISOString(),
        });
      }
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
