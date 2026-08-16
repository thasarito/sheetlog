import { DEFAULT_CATEGORIES } from './categories';
import { db } from './db';
import {
  normalizeAccounts,
  normalizeCategories,
  SettingsSectionValidationError,
} from './settingsSections';
import { isSheetlogAppId, type SheetlogAppId } from './sheetlogApps';
import type {
  AccountItem,
  CategoryConfigWithMeta,
  OnboardingState,
  RecentCategories,
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

export const LEGACY_ONBOARDING_STATE_KEY = 'onboardingState';
const ONBOARDING_STATE_KEY_PREFIX = 'onboardingState:';
const PRE_SHEET_ONBOARDING_STATE_KEY = `${ONBOARDING_STATE_KEY_PREFIX}preSheet`;
const SELECTED_APP_ID_KEY = 'selectedAppId';

export class OnboardingStateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OnboardingStateValidationError';
  }
}

export interface StoredOnboardingStateResult {
  state: OnboardingState;
  migrated: boolean;
}

export function getOnboardingStateKey(sheetId: string | null | undefined): string {
  return sheetId ? `${ONBOARDING_STATE_KEY_PREFIX}${sheetId}` : PRE_SHEET_ONBOARDING_STATE_KEY;
}

function onboardingValidationError(message: string): never {
  throw new OnboardingStateValidationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasLegacyStrings(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => typeof item === 'string');
}

function normalizeOnboardingSection<Value>(read: () => Value): Value {
  try {
    return read();
  } catch (error) {
    if (error instanceof SettingsSectionValidationError) {
      return onboardingValidationError(error.message);
    }
    throw error;
  }
}

function migrateAccounts(accounts: unknown, useDefaults: boolean): AccountItem[] {
  if (accounts === undefined && useDefaults) return [];
  if (!Array.isArray(accounts)) {
    return onboardingValidationError('Accounts must be an array.');
  }
  if (hasLegacyStrings(accounts)) {
    if (!accounts.every((item) => typeof item === 'string')) {
      return onboardingValidationError('Legacy Accounts cannot mix names and objects.');
    }
    return normalizeOnboardingSection(() =>
      normalizeAccounts(accounts.map((name) => ({ name }))),
    );
  }
  return normalizeOnboardingSection(() => normalizeAccounts(accounts));
}

function migrateCategories(
  categories: unknown,
  useDefaults: boolean,
): CategoryConfigWithMeta {
  if (categories === undefined && useDefaults) {
    return getDefaultOnboardingState().categories;
  }
  if (!isRecord(categories)) {
    return onboardingValidationError('Categories must be a section object.');
  }
  const migrated = {} as Record<string, unknown[]>;
  for (const type of ['expense', 'income', 'transfer'] as const) {
    const items = categories[type];
    if (items === undefined && useDefaults) {
      migrated[type] = getDefaultOnboardingState().categories[type];
      continue;
    }
    if (!Array.isArray(items)) {
      return onboardingValidationError(`Categories ${type} must be an array.`);
    }
    if (hasLegacyStrings(items)) {
      if (!items.every((item) => typeof item === 'string')) {
        return onboardingValidationError(
          `Legacy ${type} Categories cannot mix names and objects.`,
        );
      }
      migrated[type] = items.map((name) => ({ name }));
      continue;
    }
    migrated[type] = items;
  }
  return normalizeOnboardingSection(() => normalizeCategories(migrated));
}

export function migrateStoredOnboardingState(
  value: unknown,
  options: { legacySource?: boolean } = {},
): StoredOnboardingStateResult {
  if (!isRecord(value)) {
    return onboardingValidationError('Onboarding state must be an object.');
  }
  const categoryRecord = isRecord(value.categories) ? value.categories : undefined;
  const containsLegacyStrings =
    hasLegacyStrings(value.accounts) ||
    (categoryRecord !== undefined &&
      (hasLegacyStrings(categoryRecord.expense) ||
        hasLegacyStrings(categoryRecord.income) ||
        hasLegacyStrings(categoryRecord.transfer)));
  const legacyFormat = options.legacySource === true || containsLegacyStrings;
  if (
    value.sheetFolderId !== undefined &&
    value.sheetFolderId !== null &&
    typeof value.sheetFolderId !== 'string'
  ) {
    return onboardingValidationError('sheetFolderId must be a string or null.');
  }
  if (!legacyFormat && value.sheetFolderId === undefined) {
    return onboardingValidationError('sheetFolderId must be a string or null.');
  }
  if (
    value.accountsConfirmed !== undefined &&
    typeof value.accountsConfirmed !== 'boolean'
  ) {
    return onboardingValidationError('accountsConfirmed must be a boolean.');
  }
  if (!legacyFormat && value.accountsConfirmed === undefined) {
    return onboardingValidationError('accountsConfirmed must be a boolean.');
  }
  if (
    value.categoriesConfirmed !== undefined &&
    typeof value.categoriesConfirmed !== 'boolean'
  ) {
    return onboardingValidationError('categoriesConfirmed must be a boolean.');
  }
  if (!legacyFormat && value.categoriesConfirmed === undefined) {
    return onboardingValidationError('categoriesConfirmed must be a boolean.');
  }
  const state: OnboardingState = {
    sheetFolderId:
      typeof value.sheetFolderId === 'string' ? value.sheetFolderId : null,
    accounts: migrateAccounts(value.accounts, legacyFormat),
    accountsConfirmed:
      typeof value.accountsConfirmed === 'boolean'
        ? value.accountsConfirmed
        : false,
    categories: migrateCategories(value.categories, legacyFormat),
    categoriesConfirmed:
      typeof value.categoriesConfirmed === 'boolean'
        ? value.categoriesConfirmed
        : false,
  };
  return {
    state,
    migrated: legacyFormat || JSON.stringify(state) !== JSON.stringify(value),
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
      expense: DEFAULT_ONBOARDING_STATE.categories.expense.map((item) => ({ ...item })),
      income: DEFAULT_ONBOARDING_STATE.categories.income.map((item) => ({ ...item })),
      transfer: DEFAULT_ONBOARDING_STATE.categories.transfer.map((item) => ({ ...item })),
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
          const result = migrateStoredOnboardingState(
            JSON.parse(legacy.value) as unknown,
            { legacySource: true },
          );
          await setOnboardingState(result.state, sheetId);
          return result.state;
        } catch {
          // Fall through to default
        }
      }
    }
    return getDefaultOnboardingState();
  }
  try {
    const result = migrateStoredOnboardingState(
      JSON.parse(record.value) as unknown,
    );
    if (result.migrated) {
      await setOnboardingState(result.state, sheetId);
    }
    return result.state;
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
