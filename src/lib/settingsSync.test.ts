import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  classifyLegacyQuickNotesMigration,
  clearSettingsSectionDirty,
  clearSettingsSectionError,
  createDefaultSettingsSyncState,
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

  it('refuses to persist sync state owned by a different user', async () => {
    const otherUsersState = createDefaultSettingsSyncState('user-b');

    await expect(
      writeSettingsSyncState('sheet-a', 'user-a', otherUsersState),
    ).rejects.toThrow(/targetUserId.*verified user/i);
    expect(await db.settings.get(getSettingsSyncStorageKey('sheet-a', 'user-a'))).toBeUndefined();
  });

  it('does not return a stored sync state whose owner disagrees with its scoped key', async () => {
    await db.settings.put({
      key: getSettingsSyncStorageKey('sheet-a', 'user-a'),
      value: JSON.stringify(createDefaultSettingsSyncState('user-b')),
      updatedAt: '2026-08-16T01:02:03.000Z',
    });

    await expect(readSettingsSyncState('sheet-a', 'user-a')).resolves.toBeNull();
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
