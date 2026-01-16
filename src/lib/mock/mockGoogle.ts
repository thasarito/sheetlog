/**
 * Mock Google API implementations for offline development
 * All operations read/write to localStorage via mockStorage
 */

import type { AccountItem, CategoryConfigWithMeta, TransactionRecord } from '../types';
import {
  getMockAccounts,
  getMockCategories,
  getMockTransactions,
  setMockAccounts,
  setMockCategories,
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
 * Append transaction to mock storage
 */
export async function appendTransaction(
  _accessToken: string,
  _spreadsheetId: string,
  transaction: TransactionRecord,
): Promise<number | null> {
  await delay();

  const transactions = getMockTransactions();
  const rowIndex = transactions.length + 2; // Row 1 is header, data starts at row 2

  const recordWithRow: TransactionRecord = {
    ...transaction,
    sheetRow: rowIndex,
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
  _spreadsheetId: string,
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
    transactions[dataIndex] = {
      ...transaction,
      sheetRow: rowIndex,
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
  _spreadsheetId: string,
  limit: number = 50,
): Promise<TransactionRecord[]> {
  await delay();

  const transactions = getMockTransactions();

  // Return the most recent transactions (newest first)
  return transactions
    .slice(-limit)
    .reverse()
    .map((tx, index, arr) => ({
      ...tx,
      sheetRow: transactions.length - arr.length + index + 2,
    }));
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
