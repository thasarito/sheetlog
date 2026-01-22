import { DEFAULT_CATEGORIES } from './categories';
import { db } from './db';
import {
  DEFAULT_ACCOUNT_COLOR,
  DEFAULT_ACCOUNT_ICON,
  DEFAULT_CATEGORY_COLORS,
  DEFAULT_CATEGORY_ICONS,
  SUGGESTED_CATEGORY_COLORS,
  SUGGESTED_CATEGORY_ICONS,
} from './icons';
import { isSheetlogAppId, type SheetlogAppId } from './sheetlogApps';
import type {
  AccountItem,
  CategoryConfigWithMeta,
  CategoryItem,
  OnboardingState,
  RecentCategories,
  TransactionType,
} from './types';

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

const LEGACY_ONBOARDING_STATE_KEY = 'onboardingState';
const ONBOARDING_STATE_KEY_PREFIX = 'onboardingState:';
const PRE_SHEET_ONBOARDING_STATE_KEY = `${ONBOARDING_STATE_KEY_PREFIX}preSheet`;
const SELECTED_APP_ID_KEY = 'selectedAppId';

function getOnboardingStateKey(sheetId: string | null | undefined): string {
  return sheetId ? `${ONBOARDING_STATE_KEY_PREFIX}${sheetId}` : PRE_SHEET_ONBOARDING_STATE_KEY;
}

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

export async function getRecentCategories(): Promise<RecentCategories> {
  const record = await db.settings.get('recentCategories');
  if (!record?.value) {
    return DEFAULT_RECENTS;
  }
  try {
    return JSON.parse(record.value) as RecentCategories;
  } catch {
    return DEFAULT_RECENTS;
  }
}

export async function setRecentCategories(recents: RecentCategories): Promise<void> {
  await db.settings.put({
    key: 'recentCategories',
    value: JSON.stringify(recents),
    updatedAt: new Date().toISOString(),
  });
}

export async function updateRecentCategory(
  type: keyof RecentCategories,
  category: string,
): Promise<RecentCategories> {
  const current = await getRecentCategories();
  const existing = current[type].filter((item) => item !== category);
  const next = [category, ...existing].slice(0, 6);
  const updated = { ...current, [type]: next };
  await setRecentCategories(updated);
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

export async function getOnboardingState(sheetId?: string | null): Promise<OnboardingState> {
  const key = getOnboardingStateKey(sheetId);
  const record = await db.settings.get(key);
  if (!record?.value) {
    if (sheetId) {
      const legacy = await db.settings.get(LEGACY_ONBOARDING_STATE_KEY);
      if (legacy?.value) {
        try {
          const parsed = JSON.parse(legacy.value) as Record<string, unknown>;
          const defaults = getDefaultOnboardingState();

          const accounts = Array.isArray(parsed.accounts)
            ? migrateAccounts(parsed.accounts)
            : defaults.accounts;

          const categories =
            parsed.categories && typeof parsed.categories === 'object'
              ? migrateCategoryConfig(parsed.categories as Record<string, unknown[]>)
              : defaults.categories;

          const migrated: OnboardingState = {
            sheetFolderId: typeof parsed.sheetFolderId === 'string' ? parsed.sheetFolderId : defaults.sheetFolderId,
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

          await setOnboardingState(migrated, sheetId);
          return migrated;
        } catch {
          // Fall through to default
        }
      }
    }
    return getDefaultOnboardingState();
  }
  try {
    const parsed = JSON.parse(record.value) as Record<string, unknown>;
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

export async function setOnboardingState(state: OnboardingState, sheetId?: string | null): Promise<void> {
  await db.settings.put({
    key: getOnboardingStateKey(sheetId),
    value: JSON.stringify(state),
    updatedAt: new Date().toISOString(),
  });
}

export async function getSelectedAppId(): Promise<SheetlogAppId | null> {
  const record = await db.settings.get(SELECTED_APP_ID_KEY);
  if (!record?.value) {
    return null;
  }
  return isSheetlogAppId(record.value) ? record.value : null;
}

export async function setSelectedAppId(appId: SheetlogAppId | null): Promise<void> {
  if (!appId) {
    await db.settings.delete(SELECTED_APP_ID_KEY);
    return;
  }
  await db.settings.put({
    key: SELECTED_APP_ID_KEY,
    value: appId,
    updatedAt: new Date().toISOString(),
  });
}
