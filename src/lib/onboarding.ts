import { readOnboardingConfig, writeOnboardingConfig } from './google';
import { setOnboardingState } from './settings';
import type { AccountItem, CategoryConfigWithMeta, CategoryItem, OnboardingState } from './types';

type OnboardingSheetConfig = {
  accounts?: AccountItem[];
  categories?: CategoryConfigWithMeta;
};

function hasAllCategories(categories: CategoryConfigWithMeta): boolean {
  return (
    categories.expense.length > 0 && categories.income.length > 0 && categories.transfer.length > 0
  );
}

function hasAnyCategories(categories: CategoryConfigWithMeta): boolean {
  return (
    categories.expense.length > 0 || categories.income.length > 0 || categories.transfer.length > 0
  );
}

function normalizeAccountList(accounts: AccountItem[]): AccountItem[] {
  const seen = new Set<string>();
  return accounts.filter((item) => {
    const key = item.name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeCategoryList(items: CategoryItem[]): CategoryItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeCategories(categories: CategoryConfigWithMeta): CategoryConfigWithMeta {
  return {
    expense: normalizeCategoryList(categories.expense),
    income: normalizeCategoryList(categories.income),
    transfer: normalizeCategoryList(categories.transfer),
  };
}

type MergeOptions = {
  force?: boolean;
};

function mergeOnboardingState(
  current: OnboardingState,
  config: OnboardingSheetConfig,
  options: MergeOptions = {},
): { next: OnboardingState; changed: boolean } {
  let next = current;
  let changed = false;
  if (
    config.accounts &&
    config.accounts.length > 0 &&
    (options.force || !current.accountsConfirmed)
  ) {
    next = {
      ...next,
      accounts: config.accounts,
      accountsConfirmed: true,
    };
    changed = true;
  }
  if (
    config.categories &&
    hasAnyCategories(config.categories) &&
    (options.force || !current.categoriesConfirmed)
  ) {
    next = {
      ...next,
      categories: config.categories,
      categoriesConfirmed: hasAllCategories(config.categories),
    };
    changed = true;
  }
  return { next, changed };
}

export async function hydrateOnboardingFromSheet(
  accessToken: string,
  sheetId: string,
  current: OnboardingState,
  options: MergeOptions = {},
): Promise<{ next: OnboardingState; changed: boolean }> {
  const sheetConfig = await readOnboardingConfig(accessToken, sheetId);
  if (!sheetConfig) {
    return { next: current, changed: false };
  }
  const merged = mergeOnboardingState(current, sheetConfig, options);
  if (merged.changed) {
    await setOnboardingState(merged.next);
  }
  return merged;
}

export async function updateOnboarding(params: {
  current: OnboardingState;
  updates: Partial<OnboardingState>;
  accessToken: string | null;
  sheetId: string | null;
  isOnline: boolean;
}): Promise<OnboardingState> {
  const { current, updates, accessToken, sheetId, isOnline } = params;
  const nextState = { ...current, ...updates };

  if (accessToken && sheetId && isOnline) {
    const shouldPersistAccounts =
      ('accounts' in updates || 'accountsConfirmed' in updates) && nextState.accountsConfirmed;
    const shouldPersistCategories =
      ('categories' in updates || 'categoriesConfirmed' in updates) &&
      nextState.categoriesConfirmed;

    const updatesToSheet: {
      accounts?: AccountItem[];
      categories?: CategoryConfigWithMeta;
    } = {};

    if (shouldPersistAccounts) {
      const normalizedAccounts = normalizeAccountList(nextState.accounts);
      if (normalizedAccounts.length > 0) {
        updatesToSheet.accounts = normalizedAccounts;
      }
    }

    if (shouldPersistCategories) {
      const normalizedCategories = normalizeCategories(nextState.categories);
      if (hasAllCategories(normalizedCategories)) {
        updatesToSheet.categories = normalizedCategories;
      }
    }

    if (updatesToSheet.accounts || updatesToSheet.categories) {
      await writeOnboardingConfig(accessToken, sheetId, updatesToSheet);
    }
  }

  await setOnboardingState(nextState);
  return nextState;
}
