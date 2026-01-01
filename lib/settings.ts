import { db } from './db';
import { DEFAULT_CATEGORIES } from './categories';
import type { OnboardingState, RecentCategories } from './types';

const DEFAULT_RECENTS: RecentCategories = {
  expense: [],
  income: [],
  transfer: []
};

const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  sheetFolderId: null,
  accounts: [],
  accountsConfirmed: false,
  categories: DEFAULT_CATEGORIES,
  categoriesConfirmed: false
};

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
    updatedAt: new Date().toISOString()
  });
}

export async function updateRecentCategory(type: keyof RecentCategories, category: string): Promise<RecentCategories> {
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
      transfer: [...DEFAULT_ONBOARDING_STATE.categories.transfer]
    }
  };
}

export async function getOnboardingState(): Promise<OnboardingState> {
  const record = await db.settings.get('onboardingState');
  if (!record?.value) {
    return getDefaultOnboardingState();
  }
  try {
    const parsed = JSON.parse(record.value) as Partial<OnboardingState>;
    const defaults = getDefaultOnboardingState();
    return {
      ...defaults,
      ...parsed,
      categories: {
        ...defaults.categories,
        ...(parsed.categories ?? {})
      }
    };
  } catch {
    return getDefaultOnboardingState();
  }
}

export async function setOnboardingState(state: OnboardingState): Promise<void> {
  await db.settings.put({
    key: 'onboardingState',
    value: JSON.stringify(state),
    updatedAt: new Date().toISOString()
  });
}
