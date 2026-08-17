/**
 * Mock storage using localStorage for offline development
 */

import type {
  AccountItem,
  AnalyticsBaseCurrencySetting,
  AnalyticsBigSpendingThresholdSetting,
  CategoryConfigWithMeta,
  QuickNotesConfig,
  TransactionRecord,
} from '../types';

const STORAGE_PREFIX = 'sheetlog.mock';
const TRANSACTIONS_KEY = `${STORAGE_PREFIX}.transactions`;
const ACCOUNTS_KEY = `${STORAGE_PREFIX}.accounts`;
const CATEGORIES_KEY = `${STORAGE_PREFIX}.categories`;
const QUICK_NOTES_KEY = `${STORAGE_PREFIX}.quickNotes`;
const ANALYTICS_BASE_CURRENCY_KEY = `${STORAGE_PREFIX}.analyticsBaseCurrency`;
const ANALYTICS_BIG_SPENDING_THRESHOLD_KEY = `${STORAGE_PREFIX}.analyticsBigSpendingThreshold`;

export interface MockSheetData {
  transactions: TransactionRecord[];
  accounts: AccountItem[];
  categories: CategoryConfigWithMeta;
  quickNotes: QuickNotesConfig | null;
  analyticsBaseCurrency: AnalyticsBaseCurrencySetting | null;
  analyticsBigSpendingThreshold: AnalyticsBigSpendingThresholdSetting | null;
}

const DEFAULT_ACCOUNTS: AccountItem[] = [
  { name: 'Cash', icon: '💵', color: '#22c55e' },
  { name: 'Bank', icon: '🏦', color: '#3b82f6' },
  { name: 'Credit Card', icon: '💳', color: '#f97316' },
];

const DEFAULT_CATEGORIES: CategoryConfigWithMeta = {
  expense: [
    { name: 'Food Delivery', icon: '🍕', color: '#ef4444' },
    { name: 'Dining Out', icon: '🍽️', color: '#f97316' },
    { name: 'Groceries & Home Supplies', icon: '🛒', color: '#84cc16' },
    { name: 'Coffee & Snacks', icon: '☕', color: '#a855f7' },
    { name: 'Housing', icon: '🏠', color: '#6366f1' },
    { name: 'Utilities & Connectivity', icon: '💡', color: '#14b8a6' },
    { name: 'Transport', icon: '🚗', color: '#f59e0b' },
    { name: 'Subscriptions', icon: '📱', color: '#8b5cf6' },
    { name: 'Shopping', icon: '🛍️', color: '#ec4899' },
    { name: 'Entertainment & Social', icon: '🎬', color: '#06b6d4' },
    { name: 'Health', icon: '💊', color: '#10b981' },
    { name: 'Gifts & Donations', icon: '🎁', color: '#f43f5e' },
    { name: 'Work / Reimbursable', icon: '💼', color: '#64748b' },
    { name: 'Travel', icon: '✈️', color: '#0ea5e9' },
  ],
  income: [
    { name: 'Salary', icon: '💰', color: '#22c55e' },
    { name: 'Bonus', icon: '🎉', color: '#eab308' },
    { name: 'Gift', icon: '🎁', color: '#f43f5e' },
    { name: 'Interest', icon: '📈', color: '#3b82f6' },
    { name: 'Other', icon: '💵', color: '#6b7280' },
  ],
  transfer: [
    { name: 'Savings', icon: '🏦', color: '#3b82f6' },
    { name: 'Invest', icon: '📊', color: '#8b5cf6' },
    { name: 'Credit Card', icon: '💳', color: '#f97316' },
    { name: 'Other', icon: '🔄', color: '#6b7280' },
  ],
};

function getFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored) as T;
    }
  } catch {
    // Ignore parse errors
  }
  return JSON.parse(JSON.stringify(defaultValue)) as T;
}

function setToStorage<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getMockTransactions(): TransactionRecord[] {
  return getFromStorage<TransactionRecord[]>(TRANSACTIONS_KEY, []);
}

export function setMockTransactions(transactions: TransactionRecord[]): void {
  setToStorage(TRANSACTIONS_KEY, transactions);
}

export function getMockAccounts(): AccountItem[] {
  return getFromStorage<AccountItem[]>(ACCOUNTS_KEY, DEFAULT_ACCOUNTS);
}

export function setMockAccounts(accounts: AccountItem[]): void {
  setToStorage(ACCOUNTS_KEY, accounts);
}

export function getMockCategories(): CategoryConfigWithMeta {
  return getFromStorage<CategoryConfigWithMeta>(CATEGORIES_KEY, DEFAULT_CATEGORIES);
}

export function setMockCategories(categories: CategoryConfigWithMeta): void {
  setToStorage(CATEGORIES_KEY, categories);
}

export function getMockQuickNotes(): QuickNotesConfig | null {
  if (localStorage.getItem(QUICK_NOTES_KEY) === null) {
    return null;
  }
  return getFromStorage<QuickNotesConfig>(QUICK_NOTES_KEY, {});
}

export function setMockQuickNotes(quickNotes: QuickNotesConfig): void {
  setToStorage(QUICK_NOTES_KEY, quickNotes);
}

export function clearMockQuickNotes(): void {
  localStorage.removeItem(QUICK_NOTES_KEY);
}

export function getMockAnalyticsBaseCurrency(): AnalyticsBaseCurrencySetting | null {
  return getFromStorage<AnalyticsBaseCurrencySetting | null>(ANALYTICS_BASE_CURRENCY_KEY, null);
}

export function setMockAnalyticsBaseCurrency(setting: AnalyticsBaseCurrencySetting): void {
  setToStorage(ANALYTICS_BASE_CURRENCY_KEY, setting);
}

export function getMockAnalyticsBigSpendingThreshold(): AnalyticsBigSpendingThresholdSetting | null {
  return getFromStorage<AnalyticsBigSpendingThresholdSetting | null>(
    ANALYTICS_BIG_SPENDING_THRESHOLD_KEY,
    null,
  );
}

export function setMockAnalyticsBigSpendingThreshold(
  setting: AnalyticsBigSpendingThresholdSetting | null,
): void {
  setToStorage(ANALYTICS_BIG_SPENDING_THRESHOLD_KEY, setting);
}

export function getMockSheetData(): MockSheetData {
  return {
    transactions: getMockTransactions(),
    accounts: getMockAccounts(),
    categories: getMockCategories(),
    quickNotes: getMockQuickNotes(),
    analyticsBaseCurrency: getMockAnalyticsBaseCurrency(),
    analyticsBigSpendingThreshold: getMockAnalyticsBigSpendingThreshold(),
  };
}

export function setMockSheetData(data: Partial<MockSheetData>): void {
  if (data.transactions !== undefined) {
    setMockTransactions(data.transactions);
  }
  if (data.accounts !== undefined) {
    setMockAccounts(data.accounts);
  }
  if (data.categories !== undefined) {
    setMockCategories(data.categories);
  }
  if (data.quickNotes !== undefined) {
    if (data.quickNotes === null) {
      clearMockQuickNotes();
    } else {
      setMockQuickNotes(data.quickNotes);
    }
  }
  if (data.analyticsBaseCurrency) {
    setMockAnalyticsBaseCurrency(data.analyticsBaseCurrency);
  }
  if (data.analyticsBigSpendingThreshold !== undefined) {
    setMockAnalyticsBigSpendingThreshold(data.analyticsBigSpendingThreshold);
  }
}

export function clearMockData(): void {
  localStorage.removeItem(TRANSACTIONS_KEY);
  localStorage.removeItem(ACCOUNTS_KEY);
  localStorage.removeItem(CATEGORIES_KEY);
  localStorage.removeItem(QUICK_NOTES_KEY);
  localStorage.removeItem(ANALYTICS_BASE_CURRENCY_KEY);
  localStorage.removeItem(ANALYTICS_BIG_SPENDING_THRESHOLD_KEY);
}

export { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES };
