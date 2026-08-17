import type { Currency } from './currencies';

export type TransactionType = 'expense' | 'income' | 'transfer';
export type TransactionStatus = 'pending' | 'synced' | 'error';

export type TransactionPlace = {
  provider: 'google';
  placeId: string;
};

export type PlaceUpdateIntent = 'preserve' | 'set' | 'clear';

export interface TransactionInput {
  type: TransactionType;
  amount: number;
  currency: string;
  account: string;
  for: string;
  category: string;
  date: string;
  note?: string;
  reimbursesTransactionId?: string;
  place?: TransactionPlace;
}

export type TransactionUpdateInput =
  Partial<Omit<TransactionInput, 'place'>> & {
    place?: TransactionPlace | null;
  };

export interface TransactionRecord extends TransactionInput {
  id: string;
  status: TransactionStatus;
  /** Durable request to remove this exact stable ID from Google Sheets. */
  deleteIntent?: boolean;
  /** Local-only three-way place update state for existing Sheet rows. */
  placeUpdateIntent?: PlaceUpdateIntent;
  createdAt: string;
  updatedAt: string;
  /** Immutable local queue destination. Never serialized to Google Sheets. */
  targetSheetId?: string;
  /** Immutable Google account subject that created the local queue entry. */
  targetUserId?: string;
  sheetRow?: number;
  sheetId?: string;
  sheetRowValid?: boolean;
  error?: string;
}

export interface CachedTransactionRecord extends TransactionRecord {
  sheetId: string;
  sheetRow: number;
  cachedAt: string;
  canEdit: boolean;
  searchText: string;
}

export interface TransactionHistoryMeta {
  sheetId: string;
  capturedAt: string;
  sourceLastRow: number;
  rowCount: number;
}

export interface TransactionHistorySnapshot {
  records: CachedTransactionRecord[];
  meta: TransactionHistoryMeta;
}

export interface SettingRecord {
  key: string;
  value: string;
  updatedAt: string;
}

export interface ExchangeRateRecord {
  id: string;
  base: string;
  quote: string;
  date: string;
  rate: number;
  fetchedAt: string;
}

export interface RecentCategories {
  expense: string[];
  income: string[];
  transfer: string[];
}

export type CategoryConfig = Record<TransactionType, string[]>;

export interface AccountItem {
  name: string;
  icon?: string;
  color?: string;
}

export interface CategoryItem {
  name: string;
  icon?: string;
  color?: string;
}

export type CategoryConfigWithMeta = Record<TransactionType, CategoryItem[]>;

export type AnalyticsBaseCurrencySetting = {
  currency: Currency;
  updatedAt: string;
};

export interface OnboardingState {
  sheetFolderId: string | null;
  accounts: AccountItem[];
  accountsConfirmed: boolean;
  categories: CategoryConfigWithMeta;
  categoriesConfirmed: boolean;
  analyticsBaseCurrency: Currency;
  analyticsBaseCurrencyUpdatedAt: string | null;
}

export interface QuickNote {
  id: string;
  icon: string;      // lucide icon name
  label: string;     // short label for radial menu
  note?: string;     // full note text to pre-fill (optional)
  amount?: string;   // amount to pre-fill (optional)
  currency?: string;
  account?: string;  // "from" account
  forValue?: string; // "for" (Me/Partner/etc.) or "to" account for transfers
}

// Key formats:
// - Category: "{transactionType}:{categoryName}"
// - Default: "default:{transactionType}"
export type QuickNotesConfig = Record<string, QuickNote[]>;
