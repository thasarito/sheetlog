import { db } from './db';
import {
  appendTransaction as realAppendTransaction,
  deleteRow as realDeleteRow,
  ensureReimbursementHeader as realEnsureReimbursementHeader,
  getSheetTabId as realGetSheetTabId,
  readLinkedReimbursements as realReadLinkedReimbursements,
  readTransactionById as realReadTransactionById,
  readTransactionIdMap as realReadTransactionIdMap,
  updateRow as realUpdateRow,
} from './google';
import { mapGoogleSyncError } from './googleErrors';
import {
  IS_DEV_MODE,
  appendTransaction as mockAppendTransaction,
  deleteRow as mockDeleteRow,
  ensureReimbursementHeader as mockEnsureReimbursementHeader,
  getSheetTabId as mockGetSheetTabId,
  readLinkedReimbursements as mockReadLinkedReimbursements,
  readTransactionById as mockReadTransactionById,
  readTransactionIdMap as mockReadTransactionIdMap,
  updateRow as mockUpdateRow,
} from './mock';
import {
  calculateReimbursementSummary,
  isReimbursableExpense,
  validateReimbursementAmount,
} from './reimbursements';
import type { TransactionRecord } from './types';

const appendTransaction = IS_DEV_MODE ? mockAppendTransaction : realAppendTransaction;
const deleteRow = IS_DEV_MODE ? mockDeleteRow : realDeleteRow;
const ensureReimbursementHeader = IS_DEV_MODE
  ? mockEnsureReimbursementHeader
  : realEnsureReimbursementHeader;
const getSheetTabId = IS_DEV_MODE ? mockGetSheetTabId : realGetSheetTabId;
const readLinkedReimbursements = IS_DEV_MODE
  ? mockReadLinkedReimbursements
  : realReadLinkedReimbursements;
const readTransactionById = IS_DEV_MODE
  ? mockReadTransactionById
  : realReadTransactionById;
const readTransactionIdMap = IS_DEV_MODE
  ? mockReadTransactionIdMap
  : realReadTransactionIdMap;
const updateRow = IS_DEV_MODE ? mockUpdateRow : realUpdateRow;

class ReimbursementSyncValidationError extends Error {}

const ORIGINAL_EXPENSE_UNAVAILABLE = 'Original expense unavailable';
const ORIGINAL_EXPENSE_FAILED = 'Original expense failed to sync';
const ORIGINAL_NOT_EXPENSE = 'Original transaction is no longer an expense';
const ORIGINAL_CURRENCY_CHANGED = 'Original expense currency changed';
const AMOUNT_EXCEEDS_REMAINING =
  'Amount exceeds remaining reimbursement balance';

function orderPendingTransactions(
  pending: TransactionRecord[],
): TransactionRecord[] {
  const indexById = new Map(
    pending.map((transaction, index) => [transaction.id, index] as const),
  );
  const childrenBySource = new Map<string, number[]>();
  const dependencyCount = pending.map(() => 0);

  pending.forEach((transaction, childIndex) => {
    const sourceId = transaction.reimbursesTransactionId;
    if (!sourceId) {
      return;
    }
    const sourceIndex = indexById.get(sourceId);
    if (sourceIndex === undefined || sourceIndex === childIndex) {
      return;
    }
    dependencyCount[childIndex] = 1;
    const children = childrenBySource.get(sourceId) ?? [];
    children.push(childIndex);
    childrenBySource.set(sourceId, children);
  });

  const ready = dependencyCount.flatMap((count, index) =>
    count === 0 ? [index] : [],
  );
  const ordered: TransactionRecord[] = [];
  const processed = new Set<number>();

  while (ready.length > 0) {
    ready.sort((left, right) => left - right);
    const index = ready.shift();
    if (index === undefined || processed.has(index)) {
      continue;
    }
    processed.add(index);
    const transaction = pending[index];
    ordered.push(transaction);

    for (const childIndex of childrenBySource.get(transaction.id) ?? []) {
      dependencyCount[childIndex] -= 1;
      if (dependencyCount[childIndex] === 0) {
        ready.push(childIndex);
      }
    }
  }

  pending.forEach((transaction, index) => {
    if (!processed.has(index)) {
      ordered.push(transaction);
    }
  });
  return ordered;
}

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

async function validateLinkedTransaction(
  accessToken: string,
  sheetId: string,
  item: TransactionRecord,
): Promise<void> {
  const sourceId = item.reimbursesTransactionId;
  if (!sourceId) {
    return;
  }

  const localSource = await db.transactions.get(sourceId);
  if (localSource?.status === 'error') {
    throw new ReimbursementSyncValidationError(ORIGINAL_EXPENSE_FAILED);
  }

  const source = await readTransactionById(accessToken, sheetId, sourceId);
  if (!source) {
    throw new ReimbursementSyncValidationError(ORIGINAL_EXPENSE_UNAVAILABLE);
  }
  if (!isReimbursableExpense(source)) {
    throw new ReimbursementSyncValidationError(ORIGINAL_NOT_EXPENSE);
  }
  if (source.currency !== item.currency) {
    throw new ReimbursementSyncValidationError(ORIGINAL_CURRENCY_CHANGED);
  }

  const [remoteRows, localRows] = await Promise.all([
    readLinkedReimbursements(accessToken, sheetId, sourceId),
    db.transactions
      .where('status')
      .anyOf('pending', 'error')
      .toArray(),
  ]);
  const summary = calculateReimbursementSummary(
    source,
    remoteRows,
    localRows,
    item.id,
  );
  const exceedsRemaining =
    item.amount > 0 &&
    validateReimbursementAmount(item.amount, summary) !== null;
  if (!Number.isFinite(item.amount) || exceedsRemaining) {
    throw new ReimbursementSyncValidationError(AMOUNT_EXCEEDS_REMAINING);
  }
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
  const pendingByCreatedAt = await db.transactions
    .where('status')
    .equals('pending')
    .sortBy('createdAt');
  if (pendingByCreatedAt.length === 0) {
    return 0;
  }
  const pendingSnapshot = orderPendingTransactions(pendingByCreatedAt);

  let syncedCount = 0;
  let syncFailure: unknown = null;
  let reimbursementHeaderReady = false;
  const existingIds = await readTransactionIdMap(accessToken, sheetId);

  const ensureLinkedHeader = async () => {
    if (reimbursementHeaderReady) {
      return;
    }
    await ensureReimbursementHeader(accessToken, sheetId);
    reimbursementHeaderReady = true;
  };

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
        if (itemForWrite.reimbursesTransactionId) {
          await ensureLinkedHeader();
          if (itemForWrite.amount !== remote.amount) {
            await validateLinkedTransaction(
              accessToken,
              sheetId,
              itemForWrite,
            );
          }
        }
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

      if (item.reimbursesTransactionId) {
        await ensureLinkedHeader();
        await validateLinkedTransaction(accessToken, sheetId, item);
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
        if (error instanceof ReimbursementSyncValidationError) {
          continue;
        }
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
