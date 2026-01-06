import { DEFAULT_CATEGORIES } from './categories';
import {
  DEFAULT_ACCOUNT_COLOR,
  DEFAULT_ACCOUNT_ICON,
  DEFAULT_CATEGORY_COLORS,
  DEFAULT_CATEGORY_ICONS,
  SUGGESTED_CATEGORY_COLORS,
  SUGGESTED_CATEGORY_ICONS,
} from './icons';
import type {
  AccountItem,
  CategoryConfigWithMeta,
  CategoryItem,
  OnboardingState,
  RecentCategories,
  TransactionType,
} from './types';

const STORAGE_KEY_RECENT_CATEGORIES = 'sheetlog_recentCategories';
const STORAGE_KEY_ONBOARDING_STATE = 'sheetlog_onboardingState';

const DEFAULT_RECENTS: RecentCategories = {
  expense: [],
  income: [],
  transfer: [],
};

const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  sheetFolderId: null,
  accounts: [],
  accountsConfirmed: false,
  categories: DEFAULT_CATEGORIES,
  categoriesConfirmed: false,
};

// Migration helpers for legacy string[] data
function migrateAccounts(accounts: unknown[]): AccountItem[] {
  if (accounts.length === 0) return [];
  // Check if already migrated (first item is an object with 'name')
  if (typeof accounts[0] === 'object' && accounts[0] !== null && 'name' in accounts[0]) {
    return accounts as AccountItem[];
  }
  // Migrate from string[]
  return (accounts as string[]).map((name) => ({
    name,
    icon: DEFAULT_ACCOUNT_ICON,
    color: DEFAULT_ACCOUNT_COLOR,
  }));
}

function migrateCategories(
  categories: Record<string, unknown[]>,
  type: TransactionType,
): CategoryItem[] {
  const items = categories[type];
  if (!items || items.length === 0) return [];
  // Check if already migrated
  if (typeof items[0] === 'object' && items[0] !== null && 'name' in items[0]) {
    return items as CategoryItem[];
  }
  // Migrate from string[]
  return (items as string[]).map((name) => ({
    name,
    icon: SUGGESTED_CATEGORY_ICONS[name] ?? DEFAULT_CATEGORY_ICONS[type],
    color: SUGGESTED_CATEGORY_COLORS[name] ?? DEFAULT_CATEGORY_COLORS[type],
  }));
}

function migrateCategoryConfig(categories: Record<string, unknown[]>): CategoryConfigWithMeta {
  return {
    expense: migrateCategories(categories, 'expense'),
    income: migrateCategories(categories, 'income'),
    transfer: migrateCategories(categories, 'transfer'),
  };
}

export function getRecentCategories(): RecentCategories {
  if (typeof window === 'undefined') {
    return DEFAULT_RECENTS;
  }
  const stored = window.localStorage.getItem(STORAGE_KEY_RECENT_CATEGORIES);
  if (!stored) {
    return DEFAULT_RECENTS;
  }
  try {
    return JSON.parse(stored) as RecentCategories;
  } catch {
    return DEFAULT_RECENTS;
  }
}

export function setRecentCategories(recents: RecentCategories): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY_RECENT_CATEGORIES, JSON.stringify(recents));
}

export function updateRecentCategory(
  type: keyof RecentCategories,
  category: string,
): RecentCategories {
  const current = getRecentCategories();
  const existing = current[type].filter((item) => item !== category);
  const next = [category, ...existing].slice(0, 6);
  const updated = { ...current, [type]: next };
  setRecentCategories(updated);
  return updated;
}

export function getDefaultOnboardingState(): OnboardingState {
  return {
    ...DEFAULT_ONBOARDING_STATE,
    accounts: [...DEFAULT_ONBOARDING_STATE.accounts],
    categories: {
      expense: [...DEFAULT_ONBOARDING_STATE.categories.expense],
      income: [...DEFAULT_ONBOARDING_STATE.categories.income],
      transfer: [...DEFAULT_ONBOARDING_STATE.categories.transfer],
    },
  };
}

export function getOnboardingState(): OnboardingState {
  if (typeof window === 'undefined') {
    return getDefaultOnboardingState();
  }
  const stored = window.localStorage.getItem(STORAGE_KEY_ONBOARDING_STATE);
  if (!stored) {
    return getDefaultOnboardingState();
  }
  try {
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    const defaults = getDefaultOnboardingState();

    // Migrate legacy data
    const accounts = Array.isArray(parsed.accounts)
      ? migrateAccounts(parsed.accounts)
      : defaults.accounts;

    const categories =
      parsed.categories && typeof parsed.categories === 'object'
        ? migrateCategoryConfig(parsed.categories as Record<string, unknown[]>)
        : defaults.categories;

    return {
      sheetFolderId:
        typeof parsed.sheetFolderId === 'string' ? parsed.sheetFolderId : defaults.sheetFolderId,
      accounts,
      accountsConfirmed:
        typeof parsed.accountsConfirmed === 'boolean'
          ? parsed.accountsConfirmed
          : defaults.accountsConfirmed,
      categories,
      categoriesConfirmed:
        typeof parsed.categoriesConfirmed === 'boolean'
          ? parsed.categoriesConfirmed
          : defaults.categoriesConfirmed,
    };
  } catch {
    return getDefaultOnboardingState();
  }
}

export function setOnboardingState(state: OnboardingState): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY_ONBOARDING_STATE, JSON.stringify(state));
}
