import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '../lib/constants';
import { countRememberedSettingsWorkspaces } from '../lib/settingsSync';
import { quickNotesKeys } from './useQuickNotes';
import { onboardingKeys } from './useOnboardingQuery';

function storage(entries: Array<readonly [string, string]>) {
  return {
    length: entries.length,
    key: (index: number) => entries[index]?.[0] ?? null,
    getItem: (key: string) =>
      entries.find(([candidate]) => candidate === key)?.[1] ?? null,
  };
}

describe('settings query identity', () => {
  it('partitions onboarding state by both Sheet and verified user', () => {
    expect(onboardingKeys.state('sheet-a', 'user-a')).not.toEqual(
      onboardingKeys.state('sheet-a', 'user-b'),
    );
    expect(onboardingKeys.state('sheet-a', 'user-a')).toEqual([
      'onboarding',
      'state',
      'sheet-a',
      'user-a',
    ]);
  });

  it('defines scoped settings and Quick Notes key families', async () => {
    const onboardingModule = await import('./useOnboardingQuery');

    expect(onboardingModule).toHaveProperty('settingsKeys');
    expect(quickNotesKeys).toHaveProperty('state');
  });

  it('exports a pure remembered-workspace counter', async () => {
    const settingsSyncModule = await import('../lib/settingsSync');

    expect(settingsSyncModule).toHaveProperty(
      'countRememberedSettingsWorkspaces',
    );
  });

  it('counts distinct scoped remembered workspaces and unions the current scope', () => {
    const remembered = storage([
      [STORAGE_KEYS.SHEET_ID, 'legacy-sheet'],
      [`${STORAGE_KEYS.SHEET_ID}:user-a`, 'sheet-a'],
      [`${STORAGE_KEYS.SHEET_ID}:user-b`, '   '],
      ['unrelated', 'sheet-c'],
    ]);

    expect(
      countRememberedSettingsWorkspaces(remembered, {
        verifiedUserId: 'user-b',
        sheetId: 'sheet-b',
      }),
    ).toBe(2);
    expect(
      countRememberedSettingsWorkspaces(remembered, {
        verifiedUserId: 'user-a',
        sheetId: 'sheet-a',
      }),
    ).toBe(1);
  });

  it('uses the current verified workspace as the SSR fallback', () => {
    expect(
      countRememberedSettingsWorkspaces(null, {
        verifiedUserId: 'user-a',
        sheetId: 'sheet-a',
      }),
    ).toBe(1);
  });
});
