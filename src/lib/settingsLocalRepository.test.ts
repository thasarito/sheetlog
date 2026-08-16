import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { DEFAULT_ACCOUNT_COLOR, DEFAULT_ACCOUNT_ICON } from './icons';
import {
  dexieSettingsLocalRepository,
  mutateLocalOnboarding,
  mutateLocalQuickNotes,
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

  it('deep-clones default category items for each caller', () => {
    const first = getDefaultOnboardingState();
    const originalName = first.categories.expense[0]?.name;
    if (!originalName) throw new Error('Expected a default expense category.');

    try {
      first.categories.expense[0].name = 'Mutated default';
      expect(getDefaultOnboardingState().categories.expense[0]?.name).toBe(
        originalName,
      );
    } finally {
      first.categories.expense[0].name = originalName;
    }
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

  it('migrates a scoped legacy string-array onboarding record before strict reads', async () => {
    await db.settings.put({
      key: 'onboardingState:sheet/a',
      value: JSON.stringify({
        sheetFolderId: 'folder-a',
        accounts: ['Wallet'],
        accountsConfirmed: true,
        categories: {
          expense: ['Food'],
          income: ['Salary'],
          transfer: ['Savings'],
        },
        categoriesConfirmed: true,
      }),
      updatedAt: '2026-08-16T00:00:00.000Z',
    });

    const settings = await dexieSettingsLocalRepository.readSettings(SHEET_ID);

    expect(settings.accounts).toEqual([
      expect.objectContaining({ name: 'Wallet', icon: expect.any(String), color: expect.any(String) }),
    ]);
    expect(settings.categories.expense).toEqual([
      expect.objectContaining({ name: 'Food', icon: expect.any(String), color: expect.any(String) }),
    ]);
    const migrated = JSON.parse(
      (await db.settings.get('onboardingState:sheet/a'))?.value ?? 'null',
    ) as OnboardingState;
    expect(migrated.accounts[0]).toEqual(settings.accounts[0]);
    expect(migrated.categories).toEqual(settings.categories);
  });

  it('imports the global legacy onboarding record into the requested Sheet scope', async () => {
    await db.settings.put({
      key: 'onboardingState',
      value: JSON.stringify({
        accounts: ['Cash'],
        accountsConfirmed: true,
        categories: {
          expense: ['Food'],
          income: [],
          transfer: [],
        },
        categoriesConfirmed: true,
      }),
      updatedAt: '2026-08-16T00:00:00.000Z',
    });

    const settings = await dexieSettingsLocalRepository.readSettings(SHEET_ID);

    expect(settings.accounts[0]).toEqual(
      expect.objectContaining({ name: 'Cash', icon: expect.any(String), color: expect.any(String) }),
    );
    expect(settings.categories.expense[0]).toEqual(
      expect.objectContaining({ name: 'Food', icon: expect.any(String), color: expect.any(String) }),
    );
    expect(await db.settings.get('onboardingState:sheet/a')).toBeDefined();
    expect(await db.settings.get('onboardingState')).toBeDefined();
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

  it('rejects a blank Sheet ID at the repository boundary', async () => {
    await expect(dexieSettingsLocalRepository.readSettings('   ')).rejects.toThrow(
      'Sheet ID is required.',
    );
    expect(await db.settings.count()).toBe(0);
  });

  it.each([
    {
      boundary: 'sync-state update',
      operation: () =>
        dexieSettingsLocalRepository.updateSyncState(SHEET_ID, ' ', (state) =>
          state ?? createDefaultSettingsSyncState(USER_ID),
        ),
    },
    {
      boundary: 'section commit',
      operation: () =>
        dexieSettingsLocalRepository.commitSection(
          ' ',
          USER_ID,
          'accounts',
          { value: [], ready: false },
          [],
          (state) => state ?? createDefaultSettingsSyncState(USER_ID),
        ),
    },
    {
      boundary: 'onboarding mutation',
      operation: () => mutateLocalOnboarding(SHEET_ID, ' ', (current) => current),
    },
    {
      boundary: 'Quick Notes mutation',
      operation: () => mutateLocalQuickNotes(' ', USER_ID, (current) => current),
    },
    {
      boundary: 'section mutation',
      operation: () =>
        mutateLocalSettingsSection(SHEET_ID, ' ', 'accounts', ACCOUNTS),
    },
  ])('rejects blank scope at the $boundary boundary', async ({ operation }) => {
    await expect(operation()).rejects.toMatchObject({
      name: 'SettingsRepositoryScopeError',
    });
    expect(await db.settings.count()).toBe(0);
  });

  it('canonicalizes local Accounts before persistence and fingerprinting', async () => {
    const result = await mutateLocalSettingsSection(SHEET_ID, USER_ID, 'accounts', [
      { name: '  Wallet  ', icon: '  ', color: '' },
    ]);

    expect(result.settings.accounts).toEqual([
      {
        name: 'Wallet',
        icon: DEFAULT_ACCOUNT_ICON,
        color: DEFAULT_ACCOUNT_COLOR,
      },
    ]);
    const stored = await getOnboardingState(SHEET_ID);
    expect(stored.accounts).toEqual(result.settings.accounts);
  });

  it('canonicalizes Categories and rejects case-insensitive duplicate names atomically', async () => {
    const result = await mutateLocalSettingsSection(
      SHEET_ID,
      USER_ID,
      'categories',
      {
        expense: [{ name: '  Food  ', icon: '', color: ' ' }],
        income: [],
        transfer: [],
      },
    );
    expect(result.settings.categories.expense).toEqual([
      expect.objectContaining({
        name: 'Food',
        icon: expect.any(String),
        color: expect.any(String),
      }),
    ]);
    const previous = result.settings.categories;

    await expect(
      mutateLocalSettingsSection(SHEET_ID, USER_ID, 'categories', {
        expense: [{ name: 'Food' }, { name: ' food ' }],
        income: [],
        transfer: [],
      }),
    ).rejects.toMatchObject({ name: 'SettingsStorageCorruptionError' });

    expect((await dexieSettingsLocalRepository.readSettings(SHEET_ID)).categories).toEqual(
      previous,
    );
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

  it('sanitizes a full Quick Notes replacement against confirmed settings', async () => {
    await setOnboardingState(onboarding(), SHEET_ID);
    const result = await mutateLocalSettingsSection(
      SHEET_ID,
      USER_ID,
      'quickNotes',
      {
        'expense:Removed': [
          { id: 'removed', icon: 'Trash', label: 'Removed category' },
        ],
        'default:expense': [
          {
            id: 'expense',
            icon: 'Receipt',
            label: 'Expense',
            account: 'Missing account',
          },
        ],
        'transfer:Savings': [
          {
            id: 'transfer',
            icon: 'ArrowRightLeft',
            label: 'Transfer',
            account: 'Wallet',
            forValue: 'Missing account',
          },
        ],
      },
    );

    expect(result.settings.quickNotes).toEqual({
      'default:expense': [
        { id: 'expense', icon: 'Receipt', label: 'Expense' },
      ],
      'transfer:Savings': [
        {
          id: 'transfer',
          icon: 'ArrowRightLeft',
          label: 'Transfer',
          account: 'Wallet',
        },
      ],
    });
    expect(result.state.dirty).toContain('quickNotes');
  });

  it('atomically preserves concurrent Quick Note target edits and sanitizes stale references', async () => {
    await setOnboardingState(onboarding(), SHEET_ID);

    await Promise.all([
      mutateLocalQuickNotes(SHEET_ID, USER_ID, (current) => ({
        ...current,
        'default:expense': [
          { id: 'coffee', icon: 'Coffee', label: 'Coffee', account: 'Wallet' },
        ],
      })),
      mutateLocalQuickNotes(SHEET_ID, USER_ID, (current) => {
        current['transfer:Savings'] = [
          {
            id: 'move',
            icon: 'ArrowRightLeft',
            label: 'Move',
            account: 'Missing account',
            forValue: 'Bank',
          },
        ];
        return current;
      }),
    ]);

    const result = await dexieSettingsLocalRepository.readSettings(SHEET_ID);
    expect(result.quickNotes).toEqual({
      'default:expense': [
        { id: 'coffee', icon: 'Coffee', label: 'Coffee', account: 'Wallet' },
      ],
      'transfer:Savings': [
        {
          id: 'move',
          icon: 'ArrowRightLeft',
          label: 'Move',
          forValue: 'Bank',
        },
      ],
    });
    await expect(readSettingsSyncState(SHEET_ID, USER_ID)).resolves.toMatchObject({
      dirty: ['quickNotes'],
    });
  });

  it('preserves Quick Note references that only point at unconfirmed drafts', async () => {
    await setOnboardingState(
      onboarding({
        accounts: [{ name: 'Draft account' }],
        accountsConfirmed: false,
        categories: {
          expense: [{ name: 'Draft category' }],
          income: [],
          transfer: [],
        },
        categoriesConfirmed: false,
      }),
      SHEET_ID,
    );

    const result = await mutateLocalQuickNotes(SHEET_ID, USER_ID, () => ({
      'expense:Draft category': [
        {
          id: 'draft',
          icon: 'NotebookPen',
          label: 'Draft',
          account: 'Draft account',
        },
      ],
    }));

    expect(result.settings.quickNotes).toEqual({
      'expense:Draft category': [
        {
          id: 'draft',
          icon: 'NotebookPen',
          label: 'Draft',
          account: 'Draft account',
        },
      ],
    });
  });

  it('preserves a default transfer destination until Accounts are confirmed', async () => {
    await setOnboardingState(
      onboarding({
        accounts: [{ name: 'Draft account' }],
        accountsConfirmed: false,
      }),
      SHEET_ID,
    );
    const quickNotes: QuickNotesConfig = {
      'default:transfer': [
        {
          id: 'draft-transfer',
          icon: 'ArrowRightLeft',
          label: 'Draft transfer',
          account: 'Draft account',
          forValue: 'Draft destination',
        },
      ],
    };

    const draft = await mutateLocalQuickNotes(
      SHEET_ID,
      USER_ID,
      () => quickNotes,
    );
    expect(draft.settings.quickNotes).toEqual(quickNotes);

    const confirmed = await mutateLocalOnboarding(
      SHEET_ID,
      USER_ID,
      (current) => ({ ...current, accountsConfirmed: true }),
    );
    expect(confirmed.settings.quickNotes).toEqual({
      'default:transfer': [
        {
          id: 'draft-transfer',
          icon: 'ArrowRightLeft',
          label: 'Draft transfer',
          account: 'Draft account',
        },
      ],
    });
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
      accounts: [
        {
          name: 'Cash',
          icon: DEFAULT_ACCOUNT_ICON,
          color: DEFAULT_ACCOUNT_COLOR,
        },
      ],
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
    expect(confirmation.state.dirty).toEqual([]);
  });

  it('persists an unconfirmed account draft without queueing or sanitizing it', async () => {
    const draftQuickNotes: QuickNotesConfig = {
      'default:expense': [
        {
          id: 'legacy-card',
          icon: 'CreditCard',
          label: 'Legacy card',
          account: 'Closed account',
        },
      ],
    };
    await setOnboardingState(
      onboarding({
        accounts: [...ACCOUNTS, { name: 'Closed account' }],
      }),
      SHEET_ID,
    );
    await writeQuickNotesConfig(SHEET_ID, draftQuickNotes);
    await writeSettingsSyncState(
      SHEET_ID,
      USER_ID,
      markSettingsSectionDirty(createDefaultSettingsSyncState(USER_ID), 'accounts'),
    );

    const result = await mutateLocalOnboarding(SHEET_ID, USER_ID, (current) => ({
      ...current,
      accounts: ACCOUNTS,
      accountsConfirmed: false,
    }));

    expect(result.settings.accounts).toEqual(ACCOUNTS);
    expect(result.settings.accountsConfirmed).toBe(false);
    expect(result.settings.quickNotes).toEqual(draftQuickNotes);
    expect(result.state.dirty).toEqual([]);
  });

  it('queues and sanitizes the final account draft when it becomes confirmed', async () => {
    const draftQuickNotes: QuickNotesConfig = {
      'default:expense': [
        {
          id: 'legacy-card',
          icon: 'CreditCard',
          label: 'Legacy card',
          account: 'Closed account',
        },
      ],
    };
    await setOnboardingState(
      onboarding({ accounts: ACCOUNTS, accountsConfirmed: false }),
      SHEET_ID,
    );
    await writeQuickNotesConfig(SHEET_ID, draftQuickNotes);

    const result = await mutateLocalOnboarding(SHEET_ID, USER_ID, (current) => ({
      ...current,
      accountsConfirmed: true,
    }));

    expect(result.settings.quickNotes).toEqual({
      'default:expense': [
        { id: 'legacy-card', icon: 'CreditCard', label: 'Legacy card' },
      ],
    });
    expect(result.state.dirty).toEqual(['accounts', 'quickNotes']);
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
