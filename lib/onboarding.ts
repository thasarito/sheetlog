import type { CategoryConfig, OnboardingState } from "./types";
import { setOnboardingState } from "./settings";
import { readOnboardingConfig, writeOnboardingConfig } from "./google";

type OnboardingSheetConfig = {
  accounts?: string[];
  categories?: CategoryConfig;
};

function hasAllCategories(categories: CategoryConfig): boolean {
  return (
    categories.expense.length > 0 &&
    categories.income.length > 0 &&
    categories.transfer.length > 0
  );
}

function hasAnyCategories(categories: CategoryConfig): boolean {
  return (
    categories.expense.length > 0 ||
    categories.income.length > 0 ||
    categories.transfer.length > 0
  );
}

function normalizeStringList(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(trimmed);
  }
  return next;
}

function normalizeCategories(categories: CategoryConfig): CategoryConfig {
  return {
    expense: normalizeStringList(categories.expense),
    income: normalizeStringList(categories.income),
    transfer: normalizeStringList(categories.transfer),
  };
}

function mergeOnboardingState(
  current: OnboardingState,
  config: OnboardingSheetConfig
): { next: OnboardingState; changed: boolean } {
  let next = current;
  let changed = false;
  if (
    config.accounts &&
    config.accounts.length > 0 &&
    !current.accountsConfirmed
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
    !current.categoriesConfirmed
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
  current: OnboardingState
): Promise<{ next: OnboardingState; changed: boolean }> {
  const sheetConfig = await readOnboardingConfig(accessToken, sheetId);
  if (!sheetConfig) {
    return { next: current, changed: false };
  }
  const merged = mergeOnboardingState(current, sheetConfig);
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
      ("accounts" in updates || "accountsConfirmed" in updates) &&
      nextState.accountsConfirmed;
    const shouldPersistCategories =
      ("categories" in updates || "categoriesConfirmed" in updates) &&
      nextState.categoriesConfirmed;

    const updatesToSheet: {
      accounts?: string[];
      categories?: CategoryConfig;
    } = {};

    if (shouldPersistAccounts) {
      const normalizedAccounts = normalizeStringList(nextState.accounts);
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
