import {
  readOnboardingConfig as realReadOnboardingConfig,
} from './google';
import {
  IS_DEV_MODE,
  readOnboardingConfig as mockReadOnboardingConfig,
} from './mock';
import { setOnboardingState } from './settings';
import type { AccountItem, CategoryConfigWithMeta, OnboardingState } from './types';

const readOnboardingConfig = IS_DEV_MODE ? mockReadOnboardingConfig : realReadOnboardingConfig;

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
    await setOnboardingState(merged.next, sheetId);
  }
  return merged;
}
