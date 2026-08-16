import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  dexieSettingsLocalRepository,
  mutateLocalOnboarding,
  mutateLocalSettingsSection,
} from './settingsLocalRepository';
import {
  createDefaultSettingsSyncState,
  getQuickNotesStorageKey,
  getSettingsSyncStorageKey,
  markSettingsSectionDirty,
  readSettingsSyncState,
  writeQuickNotesConfig,
  writeSettingsSyncState,
  type SettingsSyncState,
  type SheetSettingsConfig,
} from './settingsSync';
import {
  getDefaultOnboardingState,
  getOnboardingState,
  setOnboardingState,
} from './settings';
import type { OnboardingState, QuickNotesConfig } from './types';

const SHEET_ID = 'sheet/a';
const USER_ID = 'verified/user';

const ACCOUNTS: SheetSettingsConfig['accounts'] = [
  { name: 'Wallet', icon: 'WalletCards', color: '#111111' },
  { name: 'Bank', icon: 'Landmark', color: '#222222' },
];

const CATEGORIES: SheetSettingsConfig['categories'] = {
  expense: [{ name: 'Food', icon: 'Utensils', color: '#333333' }],
  income: [{ name: 'Salary', icon: 'BadgeDollarSign', color: '#444444' }],
  transfer: [{ name: 'Savings', icon: 'PiggyBank', color: '#555555' }],
};

const EMPTY_CATEGORIES: SheetSettingsConfig['categories'] = {
  expense: [],
  income: [],
  transfer: [],
};

const QUICK_NOTES: QuickNotesConfig = {
  'default:expense': [
    {
      id: 'lunch',
      icon: 'Sandwich',
      label: 'Lunch',
      account: 'Wallet',
    },
  ],
};

function onboarding(overrides: Partial<OnboardingState> = {}): OnboardingState {
  return {
    ...getDefaultOnboardingState(),
    accounts: ACCOUNTS,
    accountsConfirmed: true,
    categories: CATEGORIES,
    categoriesConfirmed: true,
    ...overrides,
  };
}

describe('Dexie settings local repository', () => {
  beforeEach(async () => {
    await db.settings.clear();
  });

  afterEach(async () => {
    await db.settings.clear();
  });

  it('distinguishes a missing Quick Notes record from an authoritative empty record', async () => {
    const missing = await dexieSettingsLocalRepository.readSettings(SHEET_ID);

    expect(missing).toEqual({
      accounts: [],
      accountsConfirmed: false,
      categories: getDefaultOnboardingState().categories,
      categoriesConfirmed: false,
      quickNotes: {},
      quickNotesPresent: false,
    });

    await writeQuickNotesConfig(SHEET_ID, {});

    await expect(dexieSettingsLocalRepository.readSettings(SHEET_ID)).resolves.toEqual({
      accounts: [],
      accountsConfirmed: false,
      categories: getDefaultOnboardingState().categories,
      categoriesConfirmed: false,
      quickNotes: {},
      quickNotesPresent: true,
    });
  });

  it('binds durable dirty state to the verified account and Sheet', async () => {
    await mutateLocalSettingsSection(SHEET_ID, USER_ID, 'accounts', ACCOUNTS);

    await expect(readSettingsSyncState(SHEET_ID, USER_ID)).resolves.toMatchObject({
      targetUserId: USER_ID,
      dirty: ['accounts'],
    });
    await expect(readSettingsSyncState(SHEET_ID, 'other-user')).resolves.toBeNull();
    await expect(readSettingsSyncState('other-sheet', USER_ID)).resolves.toBeNull();
  });

  it('atomically commits a section winner and its reduced sync state when expected value and readiness match', async () => {
    await setOnboardingState(onboarding(), SHEET_ID);
    await writeSettingsSyncState(
      SHEET_ID,
      USER_ID,
      markSettingsSectionDirty(createDefaultSettingsSyncState(USER_ID), 'accounts'),
    );

    const result = await dexieSettingsLocalRepository.commitSection(
      SHEET_ID,
      USER_ID,
      'accounts',
      { value: ACCOUNTS, ready: true },
      [{ name: 'Cash', icon: 'Banknote', color: '#666666' }],
      (state, applied) => ({
        ...(state ?? createDefaultSettingsSyncState(USER_ID)),
        dirty: applied ? [] : ['accounts'],
        baselines: {
          ...(state ?? createDefaultSettingsSyncState(USER_ID)).baselines,
          accounts: applied ? 'remote-winner' : '',
        },
      }),
    );

    expect(result.applied).toBe(true);
    expect(result.settings.accounts).toEqual([
      { name: 'Cash', icon: 'Banknote', color: '#666666' },
    ]);
    expect(result.settings.accountsConfirmed).toBe(true);
    expect(result.state).toMatchObject({
      targetUserId: USER_ID,
      dirty: [],
      baselines: { accounts: 'remote-winner' },
    });
    await expect(dexieSettingsLocalRepository.readSettings(SHEET_ID)).resolves.toEqual(
      result.settings,
    );
    await expect(readSettingsSyncState(SHEET_ID, USER_ID)).resolves.toEqual(result.state);
  });

  it('does not overwrite a concurrent value when commit expected value no longer matches', async () => {
    const concurrent = [{ name: 'Concurrent', icon: 'Wallet', color: '#777777' }];
    await setOnboardingState(onboarding({ accounts: concurrent }), SHEET_ID);
    await writeSettingsSyncState(
      SHEET_ID,
      USER_ID,
      markSettingsSectionDirty(createDefaultSettingsSyncState(USER_ID), 'accounts'),
    );

    const result = await dexieSettingsLocalRepository.commitSection(
      SHEET_ID,
      USER_ID,
      'accounts',
      { value: ACCOUNTS, ready: true },
      [{ name: 'Remote' }],
      (state, applied) =>
        markSettingsSectionDirty(
          state ?? createDefaultSettingsSyncState(USER_ID),
          applied ? 'categories' : 'accounts',
        ),
    );

    expect(result.applied).toBe(false);
    expect(result.settings.accounts).toEqual(concurrent);
    expect(result.state.dirty).toContain('accounts');
  });

  it('does not overwrite a concurrent readiness change even when the value matches', async () => {
    await setOnboardingState(onboarding({ accountsConfirmed: false }), SHEET_ID);

    const result = await dexieSettingsLocalRepository.commitSection(
      SHEET_ID,
      USER_ID,
      'accounts',
      { value: ACCOUNTS, ready: true },
      [{ name: 'Remote' }],
      (state, applied) =>
        applied
          ? state ?? createDefaultSettingsSyncState(USER_ID)
          : markSettingsSectionDirty(
              state ?? createDefaultSettingsSyncState(USER_ID),
              'accounts',
            ),
    );

    expect(result.applied).toBe(false);
    expect(result.settings.accounts).toEqual(ACCOUNTS);
    expect(result.settings.accountsConfirmed).toBe(false);
    expect(result.state.dirty).toEqual(['accounts']);
  });

  it('rolls back the section winner when the reduced state is invalid', async () => {
    await setOnboardingState(onboarding(), SHEET_ID);
    const previousState = createDefaultSettingsSyncState(USER_ID);
    await writeSettingsSyncState(SHEET_ID, USER_ID, previousState);

    await expect(
      dexieSettingsLocalRepository.commitSection(
        SHEET_ID,
        USER_ID,
        'accounts',
        { value: ACCOUNTS, ready: true },
        [{ name: 'Must roll back' }],
        () =>
          ({
            ...createDefaultSettingsSyncState('wrong-user'),
          }) as SettingsSyncState,
      ),
    ).rejects.toMatchObject({ name: 'SettingsStorageCorruptionError' });

    expect((await dexieSettingsLocalRepository.readSettings(SHEET_ID)).accounts).toEqual(
      ACCOUNTS,
    );
    await expect(readSettingsSyncState(SHEET_ID, USER_ID)).resolves.toEqual(previousState);
  });

  it('persists a local section value and its dirty marker in one durable mutation', async () => {
    const result = await mutateLocalSettingsSection(
      SHEET_ID,
      USER_ID,
      'quickNotes',
      {},
    );

    expect(result.settings.quickNotes).toEqual({});
    expect(result.settings.quickNotesPresent).toBe(true);
    expect(result.state.dirty).toEqual(['quickNotes']);
    await expect(readSettingsSyncState(SHEET_ID, USER_ID)).resolves.toEqual(result.state);
  });

  it('marks an explicitly written section dirty even when its canonical value is unchanged', async () => {
    await setOnboardingState(onboarding(), SHEET_ID);

    const result = await mutateLocalSettingsSection(
      SHEET_ID,
      USER_ID,
      'accounts',
      ACCOUNTS.map((account) => ({ ...account })),
    );

    expect(result.state.dirty).toEqual(['accounts']);
  });

  it('preserves concurrent onboarding section mutations and both dirty markers', async () => {
    await Promise.all([
      mutateLocalSettingsSection(SHEET_ID, USER_ID, 'accounts', ACCOUNTS),
      mutateLocalSettingsSection(SHEET_ID, USER_ID, 'categories', CATEGORIES),
    ]);

    const settings = await dexieSettingsLocalRepository.readSettings(SHEET_ID);
    expect(settings.accounts).toEqual(ACCOUNTS);
    expect(settings.categories).toEqual(CATEGORIES);
    expect(settings.accountsConfirmed).toBe(true);
    expect(settings.categoriesConfirmed).toBe(true);
    await expect(readSettingsSyncState(SHEET_ID, USER_ID)).resolves.toMatchObject({
      dirty: ['accounts', 'categories'],
    });
  });

  it('preserves the rest of onboarding when one section is mutated', async () => {
    const original = onboarding({ sheetFolderId: 'folder-a' });
    await setOnboardingState(original, SHEET_ID);

    await mutateLocalSettingsSection(SHEET_ID, USER_ID, 'accounts', [
      { name: 'Cash' },
    ]);

    await expect(getOnboardingState(SHEET_ID)).resolves.toEqual({
      ...original,
      accounts: [{ name: 'Cash' }],
      accountsConfirmed: true,
    });
  });

  it('atomically updates full onboarding state and sanitizes dependent Quick Notes', async () => {
    const quickNotes: QuickNotesConfig = {
      'expense:Food': [
        { id: 'food', icon: 'Utensils', label: 'Food', account: 'Wallet' },
      ],
      'expense:Travel': [
        { id: 'travel', icon: 'Plane', label: 'Travel', account: 'Closed account' },
      ],
      'default:expense': [
        { id: 'default', icon: 'Receipt', label: 'Default', account: 'Closed account' },
      ],
      'transfer:Savings': [
        {
          id: 'move',
          icon: 'ArrowRightLeft',
          label: 'Move',
          account: 'Wallet',
          forValue: 'Closed account',
        },
      ],
    };
    await setOnboardingState(
      onboarding({
        accounts: [...ACCOUNTS, { name: 'Closed account' }],
        categories: {
          ...CATEGORIES,
          expense: [...CATEGORIES.expense, { name: 'Travel' }],
        },
      }),
      SHEET_ID,
    );
    await writeQuickNotesConfig(SHEET_ID, quickNotes);

    const result = await mutateLocalOnboarding(SHEET_ID, USER_ID, (current) => ({
      ...current,
      sheetFolderId: 'keep-folder',
      accounts: ACCOUNTS,
      categories: CATEGORIES,
    }));

    expect(result.settings.accounts).toEqual(ACCOUNTS);
    expect(result.settings.categories).toEqual(CATEGORIES);
    expect(result.settings.quickNotes).toEqual({
      'expense:Food': [
        { id: 'food', icon: 'Utensils', label: 'Food', account: 'Wallet' },
      ],
      'default:expense': [{ id: 'default', icon: 'Receipt', label: 'Default' }],
      'transfer:Savings': [
        {
          id: 'move',
          icon: 'ArrowRightLeft',
          label: 'Move',
          account: 'Wallet',
        },
      ],
    });
    expect(result.state.dirty).toEqual(['accounts', 'categories', 'quickNotes']);
    expect((await db.settings.get('onboardingState:sheet/a'))?.value).toContain(
      'keep-folder',
    );
  });

  it('marks only changed onboarding sections and does not dirty unchanged sanitized Quick Notes', async () => {
    await setOnboardingState(onboarding(), SHEET_ID);
    await writeQuickNotesConfig(SHEET_ID, QUICK_NOTES);

    const folderOnly = await mutateLocalOnboarding(SHEET_ID, USER_ID, (current) => ({
      ...current,
      sheetFolderId: 'folder-a',
    }));
    expect(folderOnly.state.dirty).toEqual([]);

    const confirmation = await mutateLocalOnboarding(SHEET_ID, USER_ID, (current) => ({
      ...current,
      accountsConfirmed: false,
    }));
    expect(confirmation.state.dirty).toEqual(['accounts']);
  });

  it('detects changes made by an in-place onboarding updater', async () => {
    await setOnboardingState(onboarding(), SHEET_ID);

    const result = await mutateLocalOnboarding(SHEET_ID, USER_ID, (current) => {
      current.accounts = [];
      return current;
    });

    expect(result.settings.accounts).toEqual([]);
    expect(result.state.dirty).toEqual(['accounts']);
  });

  it('persists confirmed authoritative empty account, category, and Quick Notes sections', async () => {
    await mutateLocalSettingsSection(SHEET_ID, USER_ID, 'accounts', []);
    await mutateLocalSettingsSection(SHEET_ID, USER_ID, 'categories', EMPTY_CATEGORIES);
    const result = await mutateLocalSettingsSection(
      SHEET_ID,
      USER_ID,
      'quickNotes',
      {},
    );

    expect(result.settings).toMatchObject({
      accounts: [],
      accountsConfirmed: true,
      categories: EMPTY_CATEGORIES,
      categoriesConfirmed: true,
      quickNotes: {},
      quickNotesPresent: true,
    });
    expect(result.state.dirty).toEqual(['accounts', 'categories', 'quickNotes']);
  });

  it('fails closed on malformed scoped storage and never overwrites it', async () => {
    const malformedOnboarding = {
      key: 'onboardingState:sheet/a',
      value: '{malformed',
      updatedAt: '2026-08-16T00:00:00.000Z',
    };
    const malformedQuickNotes = {
      key: getQuickNotesStorageKey(SHEET_ID),
      value: JSON.stringify({ 'default:expense': [{ id: '' }] }),
      updatedAt: '2026-08-16T00:00:00.000Z',
    };
    await db.settings.bulkPut([malformedOnboarding, malformedQuickNotes]);

    await expect(
      mutateLocalOnboarding(SHEET_ID, USER_ID, (current) => current),
    ).rejects.toMatchObject({ name: 'SettingsStorageCorruptionError' });
    await expect(
      mutateLocalSettingsSection(SHEET_ID, USER_ID, 'accounts', ACCOUNTS),
    ).rejects.toMatchObject({ name: 'SettingsStorageCorruptionError' });

    await expect(db.settings.get(malformedOnboarding.key)).resolves.toEqual(
      malformedOnboarding,
    );
    await expect(db.settings.get(malformedQuickNotes.key)).resolves.toEqual(
      malformedQuickNotes,
    );
    await expect(db.settings.get(getSettingsSyncStorageKey(SHEET_ID, USER_ID))).resolves.toBe(
      undefined,
    );
  });

  it('fails closed on malformed scoped Quick Notes without replacing them', async () => {
    const malformedQuickNotes = {
      key: getQuickNotesStorageKey(SHEET_ID),
      value: JSON.stringify({ 'default:expense': [{ id: '' }] }),
      updatedAt: '2026-08-16T00:00:00.000Z',
    };
    await setOnboardingState(onboarding(), SHEET_ID);
    await db.settings.put(malformedQuickNotes);

    await expect(dexieSettingsLocalRepository.readSettings(SHEET_ID)).rejects.toMatchObject({
      name: 'SettingsStorageCorruptionError',
      storageKey: getQuickNotesStorageKey(SHEET_ID),
    });
    await expect(
      mutateLocalSettingsSection(SHEET_ID, USER_ID, 'quickNotes', QUICK_NOTES),
    ).rejects.toMatchObject({ name: 'SettingsStorageCorruptionError' });

    await expect(db.settings.get(malformedQuickNotes.key)).resolves.toEqual(
      malformedQuickNotes,
    );
    await expect(db.settings.get(getSettingsSyncStorageKey(SHEET_ID, USER_ID))).resolves.toBe(
      undefined,
    );
  });
});
