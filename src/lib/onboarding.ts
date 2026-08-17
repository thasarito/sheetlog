import {
  readOnboardingConfig as realReadOnboardingConfig,
} from './google';
import {
  IS_DEV_MODE,
  readOnboardingConfig as mockReadOnboardingConfig,
} from './mock';
import { setOnboardingState } from './settings';
import type {
  AccountItem,
  AnalyticsBaseCurrencySetting,
  CategoryConfigWithMeta,
  OnboardingState,
} from './types';

const readOnboardingConfig = IS_DEV_MODE ? mockReadOnboardingConfig : realReadOnboardingConfig;

export type OnboardingSheetConfig = {
  accounts?: AccountItem[];
  categories?: CategoryConfigWithMeta;
  analyticsBaseCurrency?: AnalyticsBaseCurrencySetting;
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

export type OnboardingMergeResult = {
  next: OnboardingState;
  changed: boolean;
  settingsNeedPush: boolean;
};

export function mergeOnboardingState(
  current: OnboardingState,
  config: OnboardingSheetConfig,
  options: MergeOptions = {},
): OnboardingMergeResult {
  let next = current;
  let changed = false;
  let settingsNeedPush = false;
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

  const remoteSetting = config.analyticsBaseCurrency;
  const localUpdatedAt = current.analyticsBaseCurrencyUpdatedAt;
  const localTimestamp = localUpdatedAt ? Date.parse(localUpdatedAt) : Number.NaN;
  const remoteTimestamp = remoteSetting ? Date.parse(remoteSetting.updatedAt) : Number.NaN;

  if (remoteSetting && Number.isFinite(remoteTimestamp)) {
    if (!Number.isFinite(localTimestamp) || remoteTimestamp > localTimestamp) {
      next = {
        ...next,
        analyticsBaseCurrency: remoteSetting.currency,
        analyticsBaseCurrencyUpdatedAt: remoteSetting.updatedAt,
      };
      changed = true;
    } else if (
      remoteTimestamp < localTimestamp ||
      (remoteTimestamp === localTimestamp && remoteSetting.currency !== current.analyticsBaseCurrency)
    ) {
      settingsNeedPush = true;
    }
  } else if (localUpdatedAt) {
    settingsNeedPush = true;
  }

  return { next, changed, settingsNeedPush };
}

export async function hydrateOnboardingFromSheet(
  accessToken: string,
  sheetId: string,
  current: OnboardingState,
  options: MergeOptions = {},
): Promise<OnboardingMergeResult> {
  const sheetConfig = await readOnboardingConfig(accessToken, sheetId);
  if (!sheetConfig) {
    return {
      next: current,
      changed: false,
      settingsNeedPush: Boolean(current.analyticsBaseCurrencyUpdatedAt),
    };
  }
  const merged = mergeOnboardingState(current, sheetConfig, options);
  if (merged.changed) {
    await setOnboardingState(merged.next, sheetId);
  }
  return merged;
}
