export type TransactionType = 'expense' | 'income' | 'transfer';
export type TransactionStatus = 'pending' | 'synced' | 'error';

export interface TransactionInput {
  type: TransactionType;
  amount: number;
  currency: string;
  account: string;
  for: string;
  category: string;
  date: string;
  note?: string;
}

export interface TransactionRecord extends TransactionInput {
  id: string;
  status: TransactionStatus;
  createdAt: string;
  updatedAt: string;
  sheetRow?: number;
  sheetId?: string;
  error?: string;
}

export interface SettingRecord {
  key: string;
  value: string;
  updatedAt: string;
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

export interface OnboardingState {
  sheetFolderId: string | null;
  accounts: AccountItem[];
  accountsConfirmed: boolean;
  categories: CategoryConfigWithMeta;
  categoriesConfirmed: boolean;
}
