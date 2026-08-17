import { describe, expect, it } from 'vitest';
import type { SettingRecord } from '../../lib/types';
import {
  analyticsSyncMetadataKey,
  clearAnalyticsSyncMetadata,
  readAnalyticsSyncMetadata,
  writeAnalyticsSyncMetadata,
  type AnalyticsSyncMetadataStore,
} from './analyticsSyncMetadata';

function memoryStore(seed?: SettingRecord): AnalyticsSyncMetadataStore {
  const records = new Map<string, SettingRecord>();
  if (seed) records.set(seed.key, seed);
  return {
    get: async (key) => records.get(key),
    put: async (record) => {
      records.set(record.key, record);
      return record.key;
    },
    delete: async (key) => {
      records.delete(key);
    },
  };
}

describe('analytics sync metadata', () => {
  it('isolates completion by sheet and base currency', () => {
    expect(analyticsSyncMetadataKey('sheet-a', 'THB')).toBe(
      'analytics-sync:sheet-a:THB',
    );
    expect(analyticsSyncMetadataKey('sheet-a', 'USD')).not.toBe(
      analyticsSyncMetadataKey('sheet-b', 'USD'),
    );
  });

  it('round trips valid metadata', async () => {
    const store = memoryStore();
    const metadata = {
      sheetId: 'sheet-a',
      baseCurrency: 'THB',
      historyCapturedAt: '2026-08-17T10:00:00.000Z',
      requirementsFingerprint: '2:0123456789abcdef',
      completedAt: '2026-08-17T10:01:00.000Z',
    };

    await writeAnalyticsSyncMetadata(metadata, store);

    await expect(readAnalyticsSyncMetadata('sheet-a', 'THB', store)).resolves.toEqual(
      metadata,
    );
    await expect(readAnalyticsSyncMetadata('sheet-a', 'USD', store)).resolves.toBeNull();
  });

  it('treats corrupt or mismatched records as incomplete', async () => {
    const corrupt = memoryStore({
      key: analyticsSyncMetadataKey('sheet-a', 'THB'),
      value: '{not-json',
      updatedAt: '2026-08-17T10:00:00.000Z',
    });
    await expect(readAnalyticsSyncMetadata('sheet-a', 'THB', corrupt)).resolves.toBeNull();

    const mismatched = memoryStore({
      key: analyticsSyncMetadataKey('sheet-a', 'THB'),
      value: JSON.stringify({
        sheetId: 'sheet-b',
        baseCurrency: 'THB',
        historyCapturedAt: '2026-08-17T10:00:00.000Z',
        requirementsFingerprint: '2:0123456789abcdef',
        completedAt: '2026-08-17T10:01:00.000Z',
      }),
      updatedAt: '2026-08-17T10:01:00.000Z',
    });
    await expect(readAnalyticsSyncMetadata('sheet-a', 'THB', mismatched)).resolves.toBeNull();

    const staleShape = memoryStore({
      key: analyticsSyncMetadataKey('sheet-a', 'THB'),
      value: JSON.stringify({
        sheetId: 'sheet-a',
        baseCurrency: 'THB',
        historyCapturedAt: '2026-08-17T10:00:00.000Z',
        completedAt: '2026-08-17T10:01:00.000Z',
      }),
      updatedAt: '2026-08-17T10:01:00.000Z',
    });
    await expect(readAnalyticsSyncMetadata('sheet-a', 'THB', staleShape)).resolves.toBeNull();
  });

  it('clears stale completion before a manual resync', async () => {
    const store = memoryStore();
    await writeAnalyticsSyncMetadata(
      {
        sheetId: 'sheet-a',
        baseCurrency: 'THB',
        historyCapturedAt: '2026-08-17T10:00:00.000Z',
        requirementsFingerprint: '2:0123456789abcdef',
        completedAt: '2026-08-17T10:01:00.000Z',
      },
      store,
    );

    await clearAnalyticsSyncMetadata('sheet-a', 'THB', store);

    await expect(readAnalyticsSyncMetadata('sheet-a', 'THB', store)).resolves.toBeNull();
  });
});
