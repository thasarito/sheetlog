import { db } from './db';
import type { RecentCategories } from './types';

const DEFAULT_RECENTS: RecentCategories = {
  expense: [],
  income: [],
  transfer: []
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
