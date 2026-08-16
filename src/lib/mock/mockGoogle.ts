/**
 * Mock Google API implementations for offline development
 * All operations read/write to localStorage via mockStorage
 */

import type { ReimbursementLedgerRow } from '../reimbursements';
import type {
  SheetSettingsReadResult,
  SheetSettingsSectionReadResult,
} from '../googleSettings';
import type { SettingsSection, SheetSettingsConfig } from '../settingsSync';
import { createCachedTransactionRecord } from '../transactionHistory';
import type {
  AccountItem,
  CategoryConfigWithMeta,
  TransactionHistorySnapshot,
  TransactionRecord,
} from '../types';
import {
  getMockAccounts,
  getMockCategories,
  getMockQuickNotes,
  getMockTransactions,
  setMockAccounts,
  setMockCategories,
  setMockQuickNotes,
  setMockTransactions,
} from './mockStorage';

// Simulate network delay
const MOCK_DELAY_MS = 50;

function delay(ms: number = MOCK_DELAY_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mock sheet ID
const MOCK_SHEET_ID = 'mock-sheet-id-dev';
const MOCK_SHEET_TAB_ID = 0;

/**
 * Find existing sheet - always returns the mock sheet ID
 */
export async function findExistingSheet(
  _accessToken: string,
  _folderId?: string | null,
): Promise<string | null> {
  await delay();
  return MOCK_SHEET_ID;
}

/**
 * Create sheet - returns mock sheet ID
 */
export async function createSheet(_accessToken: string): Promise<string> {
  await delay();
  return MOCK_SHEET_ID;
}

/**
 * Ensure sheet exists - returns mock sheet ID
 */
export async function ensureSheet(
  _accessToken: string,
  _folderId?: string | null,
): Promise<string> {
  await delay();
  return MOCK_SHEET_ID;
}

/**
 * Get sheet tab ID - returns mock tab ID
 */
export async function getSheetTabId(
  _accessToken: string,
  _spreadsheetId: string,
  _title?: string,
): Promise<number | null> {
  await delay();
  return MOCK_SHEET_TAB_ID;
}

/**
 * Ensure headers - no-op in mock mode
 */
export async function ensureHeaders(_accessToken: string, _spreadsheetId: string): Promise<void> {
  await delay();
}

/**
 * Ensure reimbursement headers - no-op in mock mode
 */
export async function ensureReimbursementHeader(
  _accessToken: string,
  _spreadsheetId: string,
): Promise<void> {
  await delay();
}

/**
 * Ensure place headers - no-op in mock mode
 */
export async function ensurePlaceHeaders(
  _accessToken: string,
  _spreadsheetId: string,
): Promise<void> {
  await delay();
}

/**
 * Append transaction to mock storage
 */
export async function appendTransaction(
  _accessToken: string,
  spreadsheetId: string,
  transaction: TransactionRecord,
): Promise<number | null> {
  await delay();

  const transactions = getMockTransactions();
  const rowIndex = transactions.length + 2; // Row 1 is header, data starts at row 2
  const remoteTransaction = { ...transaction };
  delete remoteTransaction.placeUpdateIntent;

  const recordWithRow: TransactionRecord = {
    ...remoteTransaction,
    sheetId: spreadsheetId,
    sheetRow: rowIndex,
    sheetRowValid: Boolean(transaction.id),
    status: 'synced',
  };

  transactions.push(recordWithRow);
  setMockTransactions(transactions);

  return rowIndex;
}

/**
 * Read transaction ID map from mock storage
 */
export async function readTransactionIdMap(
  _accessToken: string,
  _spreadsheetId: string,
): Promise<Map<string, number>> {
  await delay();

  const transactions = getMockTransactions();
  const map = new Map<string, number>();

  transactions.forEach((tx, index) => {
    if (tx.id) {
      map.set(tx.id, index + 2); // Row 1 is header
    }
  });

  return map;
}

/**
 * Update row in mock storage
 */
export async function updateRow(
  _accessToken: string,
  spreadsheetId: string,
  rowIndex: number,
  transaction: TransactionRecord,
): Promise<void> {
  await delay();

  if (rowIndex <= 1) {
    throw new Error('Refusing to update header row');
  }

  const transactions = getMockTransactions();
  const dataIndex = rowIndex - 2; // Convert row index to array index

  if (dataIndex >= 0 && dataIndex < transactions.length) {
    const remoteTransaction = { ...transaction };
    delete remoteTransaction.placeUpdateIntent;
    transactions[dataIndex] = {
      ...remoteTransaction,
      sheetId: spreadsheetId,
      sheetRow: rowIndex,
      sheetRowValid: Boolean(transaction.id),
      status: 'synced',
    };
    setMockTransactions(transactions);
  }
}

/**
 * Delete row from mock storage
 */
export async function deleteRow(
  _accessToken: string,
  _spreadsheetId: string,
  _sheetTabId: number,
  rowIndex: number,
): Promise<void> {
  await delay();

  if (rowIndex <= 1) {
    throw new Error('Refusing to delete header row');
  }

  const transactions = getMockTransactions();
  const dataIndex = rowIndex - 2;

  if (dataIndex >= 0 && dataIndex < transactions.length) {
    transactions.splice(dataIndex, 1);
    // Update row indices for remaining transactions
    transactions.forEach((tx, index) => {
      tx.sheetRow = index + 2;
    });
    setMockTransactions(transactions);
  }
}

/**
 * Read onboarding config from mock storage
 */
export async function readOnboardingConfig(
  _accessToken: string,
  _spreadsheetId: string,
): Promise<{
  accounts?: AccountItem[];
  categories?: CategoryConfigWithMeta;
} | null> {
  await delay();

  const accounts = getMockAccounts();
  const categories = getMockCategories();

  return {
    accounts: accounts.length > 0 ? accounts : undefined,
    categories,
  };
}

/**
 * Write onboarding config to mock storage
 */
export async function writeOnboardingConfig(
  _accessToken: string,
  _spreadsheetId: string,
  updates: { accounts?: AccountItem[]; categories?: CategoryConfigWithMeta },
): Promise<void> {
  await delay();

  if (updates.accounts) {
    setMockAccounts(updates.accounts);
  }

  if (updates.categories) {
    setMockCategories(updates.categories);
  }
}

export async function readSheetSettingsConfig(
  _accessToken: string,
  _spreadsheetId: string,
): Promise<SheetSettingsReadResult> {
  await delay();
  const quickNotes = getMockQuickNotes();
  return {
    accounts: { status: 'ok', present: true, value: getMockAccounts() },
    categories: { status: 'ok', present: true, value: getMockCategories() },
    quickNotes:
      quickNotes === null
        ? { status: 'ok', present: false, value: {} }
        : { status: 'ok', present: true, value: quickNotes },
  };
}

export async function replaceSheetSettingsSection<Section extends SettingsSection>(
  accessToken: string,
  spreadsheetId: string,
  section: Section,
  value: SheetSettingsConfig[Section],
): Promise<SheetSettingsSectionReadResult<SheetSettingsConfig[Section]>> {
  await delay();
  if (section === 'accounts') {
    setMockAccounts(value as SheetSettingsConfig['accounts']);
  } else if (section === 'categories') {
    setMockCategories(value as SheetSettingsConfig['categories']);
  } else {
    setMockQuickNotes(value as SheetSettingsConfig['quickNotes']);
  }
  const readBack = await readSheetSettingsConfig(accessToken, spreadsheetId);
  return readBack[section] as SheetSettingsSectionReadResult<SheetSettingsConfig[Section]>;
}

/**
 * List folders - returns empty array in mock mode
 */
export async function listFolders(
  _accessToken: string,
  _parentId?: string,
): Promise<{ id: string; name: string }[]> {
  await delay();
  return [];
}

/**
 * Get recent transactions from mock storage
 */
export async function getRecentTransactions(
  _accessToken: string,
  spreadsheetId: string,
  limit: number = 50,
): Promise<TransactionRecord[]> {
  await delay();

  const transactions = getMockTransactions();
  const startIndex = Math.max(0, transactions.length - limit);

  // Return the most recent transactions (newest first)
  return transactions
    .slice(startIndex)
    .map((tx, index) => ({
      ...tx,
      status: 'synced' as const,
      sheetRow: startIndex + index + 2,
      sheetRowValid: Boolean(tx.id),
      sheetId: spreadsheetId,
    }))
    .reverse();
}

export async function getTransactionHistorySnapshot(
  _accessToken: string,
  spreadsheetId: string,
  options: { signal?: AbortSignal } = {},
): Promise<TransactionHistorySnapshot> {
  await delay();
  if (options.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  const capturedAt = new Date().toISOString();
  const records = getMockTransactions().map((transaction, index) =>
    createCachedTransactionRecord(
      {
        ...transaction,
        status: 'synced',
        sheetId: spreadsheetId,
        sheetRow: index + 2,
        sheetRowValid: Boolean(transaction.id),
      },
      spreadsheetId,
      capturedAt,
    ),
  );
  return {
    records,
    meta: {
      sheetId: spreadsheetId,
      capturedAt,
      sourceLastRow: records.length + 1,
      rowCount: records.length,
    },
  };
}

/**
 * Read one mock transaction by its stable ID
 */
export async function readTransactionById(
  _accessToken: string,
  spreadsheetId: string,
  id: string,
): Promise<TransactionRecord | null> {
  await delay();

  const transactions = getMockTransactions();
  const index = transactions.findIndex((transaction) => transaction.id === id);
  if (index < 0) {
    return null;
  }

  return {
    ...transactions[index],
    status: 'synced',
    sheetRow: index + 2,
    sheetRowValid: Boolean(transactions[index].id),
    sheetId: spreadsheetId,
  };
}

/**
 * Read focused mock reimbursement ledger rows linked to a source expense
 */
export async function readLinkedReimbursements(
  _accessToken: string,
  _spreadsheetId: string,
  sourceId: string,
): Promise<ReimbursementLedgerRow[]> {
  await delay();

  return getMockTransactions().flatMap((transaction, index) => {
    if (
      transaction.type !== 'income' ||
      !Number.isFinite(transaction.amount) ||
      !transaction.id ||
      transaction.reimbursesTransactionId !== sourceId
    ) {
      return [];
    }

    return [
      {
        id: transaction.id,
        type: transaction.type,
        amount: transaction.amount,
        currency: transaction.currency,
        reimbursesTransactionId: transaction.reimbursesTransactionId,
        status: 'synced' as const,
        sheetRow: index + 2,
      },
    ];
  });
}

// Re-export the error class and helper for compatibility
export class GoogleApiError extends Error {
  status: number;
  code?: string;
  detail?: string;

  constructor({
    status,
    message,
    code,
    detail,
  }: {
    status: number;
    message: string;
    code?: string;
    detail?: string;
  }) {
    super(message);
    this.name = 'GoogleApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof GoogleApiError && error.status === 401;
}
