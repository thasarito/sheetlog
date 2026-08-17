import { db } from '../../lib/db';
import type { SettingRecord } from '../../lib/types';

export type AnalyticsSyncMetadata = {
  sheetId: string;
  baseCurrency: string;
  historyCapturedAt: string;
  completedAt: string;
};

export type AnalyticsSyncMetadataStore = {
  get: (key: string) => Promise<SettingRecord | undefined>;
  put: (record: SettingRecord) => Promise<unknown>;
};

const defaultStore: AnalyticsSyncMetadataStore = {
  get: (key) => db.settings.get(key),
  put: (record) => db.settings.put(record),
};

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function analyticsSyncMetadataKey(
  sheetId: string,
  baseCurrency: string,
): string {
  return `analytics-sync:${sheetId}:${baseCurrency.trim().toUpperCase()}`;
}

export async function readAnalyticsSyncMetadata(
  sheetId: string,
  baseCurrency: string,
  store: AnalyticsSyncMetadataStore = defaultStore,
): Promise<AnalyticsSyncMetadata | null> {
  const normalizedBase = baseCurrency.trim().toUpperCase();
  const record = await store.get(analyticsSyncMetadataKey(sheetId, normalizedBase));
  if (!record) return null;

  try {
    const value = JSON.parse(record.value) as Partial<AnalyticsSyncMetadata>;
    if (
      value.sheetId !== sheetId ||
      value.baseCurrency !== normalizedBase ||
      !isIsoTimestamp(value.historyCapturedAt) ||
      !isIsoTimestamp(value.completedAt)
    ) {
      return null;
    }
    return {
      sheetId,
      baseCurrency: normalizedBase,
      historyCapturedAt: value.historyCapturedAt,
      completedAt: value.completedAt,
    };
  } catch {
    return null;
  }
}

export async function writeAnalyticsSyncMetadata(
  metadata: AnalyticsSyncMetadata,
  store: AnalyticsSyncMetadataStore = defaultStore,
): Promise<AnalyticsSyncMetadata> {
  const normalized = {
    ...metadata,
    baseCurrency: metadata.baseCurrency.trim().toUpperCase(),
  };
  await store.put({
    key: analyticsSyncMetadataKey(normalized.sheetId, normalized.baseCurrency),
    value: JSON.stringify(normalized),
    updatedAt: normalized.completedAt,
  });
  return normalized;
}
