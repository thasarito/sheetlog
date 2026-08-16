import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  classifyLegacyQuickNotesMigration,
  clearSettingsSectionDirty,
  clearSettingsSectionError,
  createDefaultSettingsSyncState,
  deleteLegacyQuickNotesConfig,
  fingerprintSettingsSection,
  getQuickNotesStorageKey,
  getSettingsSyncStorageKey,
  markSettingsSectionDirty,
  readLegacyQuickNotesConfig,
  readQuickNotesConfig,
  readSettingsSyncState,
  setSettingsSectionError,
  writeQuickNotesConfig,
  writeSettingsSyncState,
  type SettingsSyncState,
  type SheetSettingsConfig,
} from './settingsSync';
import type { QuickNotesConfig } from './types';

async function expectStorageCorruption(
  operation: () => Promise<unknown>,
  storageKey: string,
): Promise<void> {
  let thrown: unknown;
  try {
    await operation();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toMatchObject({
    name: 'SettingsStorageCorruptionError',
    storageKey,
  });
}

function settingsConfig(): SheetSettingsConfig {
  return {
    accounts: [
      { name: 'Wallet', icon: 'WalletCards', color: '#111111' },
      { name: 'Bank', icon: 'Landmark', color: '#222222' },
    ],
    categories: {
      expense: [
        { name: 'Food', icon: 'Utensils', color: '#333333' },
        { name: 'Travel', icon: 'Plane', color: '#444444' },
      ],
      income: [{ name: 'Salary', icon: 'BadgeDollarSign', color: '#555555' }],
      transfer: [{ name: 'Savings', icon: 'PiggyBank', color: '#666666' }],
    },
    quickNotes: {
      'default:expense': [
        { id: 'lunch', icon: 'Sandwich', label: 'Lunch', amount: '120' },
        { id: 'coffee', icon: 'Coffee', label: 'Coffee', note: 'Flat white' },
      ],
    },
  };
}

describe('portable settings sync state', () => {
  beforeEach(async () => {
    await db.settings.clear();
  });

  afterEach(async () => {
    await db.settings.clear();
  });

  it('creates complete default durable state for the verified user', () => {
    expect(createDefaultSettingsSyncState('verified-user')).toEqual({
      targetUserId: 'verified-user',
      baselines: {
        accounts: '',
        categories: '',
        quickNotes: '',
      },
      dirty: [],
      errors: {},
    });
  });

  it('isolates persisted sync state by encoded Sheet and verified user', async () => {
    const userA: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user/a'),
      dirty: ['accounts'],
    };
    const userB: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user:b'),
      dirty: ['categories'],
    };
    const otherSheet: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user/a'),
      dirty: ['quickNotes'],
    };

    await writeSettingsSyncState('sheet/a', 'user/a', userA);
    await writeSettingsSyncState('sheet/a', 'user:b', userB);
    await writeSettingsSyncState('sheet:b', 'user/a', otherSheet);

    await expect(readSettingsSyncState('sheet/a', 'user/a')).resolves.toEqual(userA);
    await expect(readSettingsSyncState('sheet/a', 'user:b')).resolves.toEqual(userB);
    await expect(readSettingsSyncState('sheet:b', 'user/a')).resolves.toEqual(otherSheet);
    expect(getSettingsSyncStorageKey('sheet/a', 'user/a')).toBe(
      'settingsSync:sheet%2Fa:user%2Fa',
    );
    expect(await db.settings.get('settingsSync:sheet%2Fa:user%2Fa')).toBeDefined();
    expect(await db.settings.get('settingsSync:sheet%2Fa:user%3Ab')).toBeDefined();
  });

  it('normalizes and deduplicates dirty sections before a write-read round trip', async () => {
    const state: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user-a'),
      dirty: ['quickNotes', 'accounts', 'quickNotes'],
    };

    await writeSettingsSyncState('sheet-a', 'user-a', state);

    await expect(readSettingsSyncState('sheet-a', 'user-a')).resolves.toEqual({
      ...state,
      dirty: ['accounts', 'quickNotes'],
    });
    expect(state.dirty).toEqual(['quickNotes', 'accounts', 'quickNotes']);
  });

  it('rejects a malformed sync state before put and preserves the previous readable record', async () => {
    const storageKey = getSettingsSyncStorageKey('sheet-a', 'user-a');
    const previous = {
      ...createDefaultSettingsSyncState('user-a'),
      dirty: ['categories'] as const,
    } satisfies SettingsSyncState;
    await writeSettingsSyncState('sheet-a', 'user-a', previous);
    const previousRecord = await db.settings.get(storageKey);
    const malformed = {
      ...previous,
      lastSyncedAt: 123,
    } as unknown as SettingsSyncState;

    await expectStorageCorruption(
      () => writeSettingsSyncState('sheet-a', 'user-a', malformed),
      storageKey,
    );

    expect(await db.settings.get(storageKey)).toEqual(previousRecord);
    await expect(readSettingsSyncState('sheet-a', 'user-a')).resolves.toEqual(previous);
  });

  it('refuses to persist sync state owned by a different user', async () => {
    const otherUsersState = createDefaultSettingsSyncState('user-b');

    await expect(
      writeSettingsSyncState('sheet-a', 'user-a', otherUsersState),
    ).rejects.toThrow(/targetUserId.*verified user/i);
    expect(await db.settings.get(getSettingsSyncStorageKey('sheet-a', 'user-a'))).toBeUndefined();
  });

  it('reports corruption when a stored sync state owner disagrees with its scoped key', async () => {
    const storageKey = getSettingsSyncStorageKey('sheet-a', 'user-a');
    await db.settings.put({
      key: storageKey,
      value: JSON.stringify(createDefaultSettingsSyncState('user-b')),
      updatedAt: '2026-08-16T01:02:03.000Z',
    });

    await expectStorageCorruption(() => readSettingsSyncState('sheet-a', 'user-a'), storageKey);
  });

  it.each([
    ['invalid JSON', '{'],
    ['a primitive', '42'],
    ['an array', '[]'],
    [
      'a malformed note',
      JSON.stringify({
        'default:expense': [{ id: 'note-1', icon: 'Coffee', label: 42 }],
      }),
    ],
    [
      'a non-array target',
      JSON.stringify({
        'default:expense': { id: 'note-1', icon: 'Coffee', label: 'Coffee' },
      }),
    ],
  ])('reports corrupt scoped Quick Notes for %s instead of returning missing', async (_name, value) => {
    const storageKey = getQuickNotesStorageKey('corrupt-sheet');
    await db.settings.put({
      key: storageKey,
      value,
      updatedAt: '2026-08-16T01:02:03.000Z',
    });

    await expectStorageCorruption(() => readQuickNotesConfig('corrupt-sheet'), storageKey);
  });

  it.each([
    [
      'baselines',
      {
        ...createDefaultSettingsSyncState('user-a'),
        baselines: { accounts: 1, categories: '', quickNotes: '' },
      },
    ],
    [
      'dirty sections',
      {
        ...createDefaultSettingsSyncState('user-a'),
        dirty: ['quickNotes', 'accounts'],
      },
    ],
    [
      'errors',
      {
        ...createDefaultSettingsSyncState('user-a'),
        errors: { accounts: 500 },
      },
    ],
    ['the top-level value', ['not', 'a', 'state']],
  ])('reports malformed sync-state %s as corruption', async (_name, state) => {
    const storageKey = getSettingsSyncStorageKey('sheet-a', 'user-a');
    await db.settings.put({
      key: storageKey,
      value: JSON.stringify(state),
      updatedAt: '2026-08-16T01:02:03.000Z',
    });

    await expectStorageCorruption(() => readSettingsSyncState('sheet-a', 'user-a'), storageKey);
  });

  it('isolates Quick Notes by encoded Sheet while leaving legacy data readable and untouched', async () => {
    const legacy: QuickNotesConfig = {
      'default:income': [],
    };
    const legacyRecord = {
      key: 'quickNotes',
      value: JSON.stringify(legacy),
      updatedAt: '2026-08-16T01:02:03.000Z',
    };
    const sheetA: QuickNotesConfig = {
      'default:expense': [{ id: 'a', icon: 'Coffee', label: 'Coffee' }],
    };
    const sheetB: QuickNotesConfig = {
      'expense:Travel': [],
    };
    await db.settings.put(legacyRecord);

    await writeQuickNotesConfig('sheet/a', sheetA);
    await writeQuickNotesConfig('sheet:b', sheetB);

    await expect(readQuickNotesConfig('sheet/a')).resolves.toEqual(sheetA);
    await expect(readQuickNotesConfig('sheet:b')).resolves.toEqual(sheetB);
    await expect(readQuickNotesConfig('missing')).resolves.toBeNull();
    await expect(readLegacyQuickNotesConfig()).resolves.toEqual(legacy);
    expect(getQuickNotesStorageKey('sheet/a')).toBe('quickNotes:sheet%2Fa');
    expect(await db.settings.get('quickNotes')).toEqual(legacyRecord);
  });

  it('deletes only legacy Quick Notes after a successful migration', async () => {
    const legacy: QuickNotesConfig = {
      'default:expense': [{ id: 'legacy', icon: 'Coffee', label: 'Coffee' }],
    };
    const scoped: QuickNotesConfig = {
      'default:income': [{ id: 'scoped', icon: 'Wallet', label: 'Salary' }],
    };
    await db.settings.put({
      key: 'quickNotes',
      value: JSON.stringify(legacy),
      updatedAt: '2026-08-16T01:02:03.000Z',
    });
    await writeQuickNotesConfig('sheet-a', scoped);
    await deleteLegacyQuickNotesConfig();

    expect(await db.settings.get('quickNotes')).toBeUndefined();
    await expect(readQuickNotesConfig('sheet-a')).resolves.toEqual(scoped);
  });

  it('rejects six Quick Notes before put and preserves the previous readable record', async () => {
    const storageKey = getQuickNotesStorageKey('sheet-a');
    const previous: QuickNotesConfig = {
      'default:income': [],
    };
    await writeQuickNotesConfig('sheet-a', previous);
    const previousRecord = await db.settings.get(storageKey);
    const sixNotes: QuickNotesConfig = {
      'default:expense': Array.from({ length: 6 }, (_, index) => ({
        id: `note-${index + 1}`,
        icon: 'Coffee',
        label: `Note ${index + 1}`,
      })),
    };

    await expectStorageCorruption(() => writeQuickNotesConfig('sheet-a', sixNotes), storageKey);

    expect(await db.settings.get(storageKey)).toEqual(previousRecord);
    await expect(readQuickNotesConfig('sheet-a')).resolves.toEqual(previous);
  });

  it('rejects a malformed type-cast Quick Note before put without overwriting prior data', async () => {
    const storageKey = getQuickNotesStorageKey('sheet-a');
    const previous: QuickNotesConfig = {
      'expense:Food': [{ id: 'lunch', icon: 'Utensils', label: 'Lunch' }],
    };
    await writeQuickNotesConfig('sheet-a', previous);
    const previousRecord = await db.settings.get(storageKey);
    const malformed = {
      'default:expense': [
        { id: 'coffee', icon: 'Coffee', label: 'Coffee', amount: 100 },
      ],
    } as unknown as QuickNotesConfig;

    await expectStorageCorruption(
      () => writeQuickNotesConfig('sheet-a', malformed),
      storageKey,
    );

    expect(await db.settings.get(storageKey)).toEqual(previousRecord);
    await expect(readQuickNotesConfig('sheet-a')).resolves.toEqual(previous);
  });

  it('marks and clears dirty sections uniquely in deterministic order without dropping state', () => {
    const original: SettingsSyncState = {
      targetUserId: 'user-a',
      baselines: {
        accounts: 'accounts-v1',
        categories: 'categories-v1',
        quickNotes: 'quick-notes-v1',
      },
      dirty: ['categories'],
      errors: { categories: 'Category conflict' },
      lastSyncedAt: '2026-08-16T01:02:03.000Z',
    };

    const marked = markSettingsSectionDirty(
      markSettingsSectionDirty(
        markSettingsSectionDirty(original, 'quickNotes'),
        'accounts',
      ),
      'quickNotes',
    );
    const cleared = clearSettingsSectionDirty(marked, 'categories');

    expect(marked.dirty).toEqual(['accounts', 'categories', 'quickNotes']);
    expect(cleared).toEqual({
      ...original,
      dirty: ['accounts', 'quickNotes'],
    });
    expect(original.dirty).toEqual(['categories']);
  });

  it('sets and clears one section error without changing dirty state or other errors', () => {
    const original: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user-a'),
      baselines: {
        accounts: 'accounts-v1',
        categories: 'categories-v1',
        quickNotes: 'quick-notes-v1',
      },
      dirty: ['accounts', 'quickNotes'],
      errors: {
        categories: 'Category conflict',
        quickNotes: 'Quick Note conflict',
      },
      lastSyncedAt: '2026-08-16T01:02:03.000Z',
    };

    const withAccountError = setSettingsSectionError(original, 'accounts', 'Account conflict');
    const withoutCategoryError = clearSettingsSectionError(withAccountError, 'categories');

    expect(withoutCategoryError).toEqual({
      ...original,
      errors: {
        accounts: 'Account conflict',
        quickNotes: 'Quick Note conflict',
      },
    });
    expect(withoutCategoryError.dirty).toEqual(original.dirty);
    expect(original.errors).toEqual({
      categories: 'Category conflict',
      quickNotes: 'Quick Note conflict',
    });
  });

  it('fingerprints objects canonically while preserving every configuration array order', () => {
    const first = settingsConfig();
    const reorderedObjectKeys: SheetSettingsConfig = {
      accounts: first.accounts.map((item) => ({
        color: item.color,
        icon: item.icon,
        name: item.name,
      })),
      categories: {
        transfer: first.categories.transfer.map((item) => ({
          color: item.color,
          name: item.name,
          icon: item.icon,
        })),
        income: first.categories.income.map((item) => ({
          icon: item.icon,
          color: item.color,
          name: item.name,
        })),
        expense: first.categories.expense.map((item) => ({
          name: item.name,
          color: item.color,
          icon: item.icon,
        })),
      },
      quickNotes: {
        'default:expense': first.quickNotes['default:expense'].map((note) => ({
          amount: note.amount,
          label: note.label,
          icon: note.icon,
          id: note.id,
          note: note.note,
        })),
      },
    };

    expect(fingerprintSettingsSection(first, 'accounts')).toBe(
      fingerprintSettingsSection(reorderedObjectKeys, 'accounts'),
    );
    expect(fingerprintSettingsSection(first, 'categories')).toBe(
      fingerprintSettingsSection(reorderedObjectKeys, 'categories'),
    );
    expect(fingerprintSettingsSection(first, 'quickNotes')).toBe(
      fingerprintSettingsSection(reorderedObjectKeys, 'quickNotes'),
    );

    expect(
      fingerprintSettingsSection(
        { ...first, accounts: [...first.accounts].reverse() },
        'accounts',
      ),
    ).not.toBe(fingerprintSettingsSection(first, 'accounts'));
    expect(
      fingerprintSettingsSection(
        {
          ...first,
          categories: {
            ...first.categories,
            expense: [...first.categories.expense].reverse(),
          },
        },
        'categories',
      ),
    ).not.toBe(fingerprintSettingsSection(first, 'categories'));
    expect(
      fingerprintSettingsSection(
        {
          ...first,
          quickNotes: {
            'default:expense': [...first.quickNotes['default:expense']].reverse(),
          },
        },
        'quickNotes',
      ),
    ).not.toBe(fingerprintSettingsSection(first, 'quickNotes'));
  });
});

describe('legacy Quick Note migration classification', () => {
  const legacy: QuickNotesConfig = { 'default:expense': [] };

  it('returns none without legacy data or when scoped data already exists', () => {
    expect(
      classifyLegacyQuickNotesMigration({
        legacyConfig: {},
        scopedConfig: null,
        verifiedWorkspaceCount: 1,
        remoteQuickNoteTabExists: false,
      }),
    ).toBe('none');
    expect(
      classifyLegacyQuickNotesMigration({
        legacyConfig: legacy,
        scopedConfig: {},
        verifiedWorkspaceCount: 1,
        remoteQuickNoteTabExists: false,
      }),
    ).toBe('none');
  });

  it('auto-imports only for one verified workspace and an absent remote tab', () => {
    expect(
      classifyLegacyQuickNotesMigration({
        legacyConfig: legacy,
        scopedConfig: null,
        verifiedWorkspaceCount: 1,
        remoteQuickNoteTabExists: false,
      }),
    ).toBe('auto-import');
  });

  it.each([
    ['no verified workspaces', 0, false],
    ['multiple verified workspaces', 2, false],
    ['an existing remote tab', 1, true],
    ['unknown remote-tab state', 1, null],
  ] as const)('prompts for %s', (_name, verifiedWorkspaceCount, remoteQuickNoteTabExists) => {
    expect(
      classifyLegacyQuickNotesMigration({
        legacyConfig: legacy,
        scopedConfig: null,
        verifiedWorkspaceCount,
        remoteQuickNoteTabExists,
      }),
    ).toBe('prompt');
  });
});
