import { describe, expect, it, vi } from 'vitest';
import type { SheetSettingsReadResult } from './googleSettings';
import {
  reconcileSettings,
  type LocalSettingsSnapshot,
  type SettingsLocalRepository,
  type SettingsRemoteAdapter,
} from './settingsReconciliation';
import {
  createDefaultSettingsSyncState,
  fingerprintSettingsSection,
  type SettingsSection,
  type SettingsSyncState,
  type SheetSettingsConfig,
} from './settingsSync';
import type { QuickNotesConfig } from './types';

const EMPTY_CATEGORIES: SheetSettingsConfig['categories'] = {
  expense: [],
  income: [],
  transfer: [],
};

function clone<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function localSnapshot(
  overrides: Partial<LocalSettingsSnapshot> = {},
): LocalSettingsSnapshot {
  return {
    accounts: [],
    accountsConfirmed: false,
    categories: clone(EMPTY_CATEGORIES),
    categoriesConfirmed: false,
    quickNotes: {},
    quickNotesPresent: false,
    ...clone(overrides),
  };
}

function remoteSettings(
  overrides: Partial<SheetSettingsReadResult> = {},
): SheetSettingsReadResult {
  return {
    accounts: { status: 'ok', present: false, value: [] },
    categories: { status: 'ok', present: false, value: clone(EMPTY_CATEGORIES) },
    quickNotes: { status: 'ok', present: false, value: {} },
    ...overrides,
  };
}

interface MemoryLocal extends SettingsLocalRepository {
  current(): LocalSettingsSnapshot;
  currentState(): SettingsSyncState | null;
  edit(section: SettingsSection, value: SheetSettingsConfig[SettingsSection]): void;
  legacy(): QuickNotesConfig | null;
  stateWrites: SettingsSyncState[];
}

function memoryLocal(
  initial: LocalSettingsSnapshot,
  initialState: SettingsSyncState | null = null,
  initialLegacy: QuickNotesConfig | null = null,
): MemoryLocal {
  let settings = clone(initial);
  let state = initialState ? clone(initialState) : null;
  let legacy = initialLegacy ? clone(initialLegacy) : null;
  const stateWrites: SettingsSyncState[] = [];

  function edit(section: SettingsSection, value: SheetSettingsConfig[SettingsSection]): void {
    settings = { ...settings, [section]: clone(value) };
    if (section === 'accounts') settings.accountsConfirmed = true;
    if (section === 'categories') settings.categoriesConfirmed = true;
    if (section === 'quickNotes') settings.quickNotesPresent = true;
  }

  return {
    readSettings: vi.fn(async () => clone(settings)),
    writeSection: vi.fn(async (_sheetId, section, value) => edit(section, value)),
    readSyncState: vi.fn(async () => (state ? clone(state) : null)),
    writeSyncState: vi.fn(async (_sheetId, _userId, nextState) => {
      state = clone(nextState);
      stateWrites.push(clone(nextState));
    }),
    readLegacyQuickNotes: vi.fn(async () => (legacy ? clone(legacy) : null)),
    deleteLegacyQuickNotes: vi.fn(async () => {
      legacy = null;
    }),
    current: () => clone(settings),
    currentState: () => (state ? clone(state) : null),
    edit,
    legacy: () => (legacy ? clone(legacy) : null),
    stateWrites,
  };
}

function remoteAdapter(readResult: SheetSettingsReadResult): SettingsRemoteAdapter {
  return {
    readSettings: vi.fn(async () => clone(readResult)),
    replaceSection: vi.fn(async (_sheetId, _section, value) => ({
      status: 'ok' as const,
      present: true,
      value: clone(value),
    })),
  };
}

describe('settings reconciliation', () => {
  it('durably seeds a missing Account tab from confirmed local settings', async () => {
    const settings = localSnapshot({
      accounts: [{ name: 'Wallet', icon: 'WalletCards', color: '#123456' }],
      accountsConfirmed: true,
    });
    const local = memoryLocal(settings);
    const remote = remoteAdapter(remoteSettings());

    const result = await reconcileSettings({
      sheetId: 'sheet/a',
      verifiedUserId: 'user:a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
      now: () => '2026-08-16T10:00:00.000Z',
    });

    expect(remote.readSettings).toHaveBeenCalledWith('sheet/a');
    expect(remote.replaceSection).toHaveBeenCalledTimes(1);
    expect(remote.replaceSection).toHaveBeenCalledWith('sheet/a', 'accounts', settings.accounts);
    expect(result).toMatchObject({
      changed: [],
      pushed: ['accounts'],
      conflicts: [],
      errors: {},
      migrationDecision: 'none',
      migrationApplied: false,
      status: 'synced',
    });
    expect(result.state).toEqual({
      ...createDefaultSettingsSyncState('user:a'),
      baselines: {
        accounts: fingerprintSettingsSection(settings, 'accounts'),
        categories: '',
        quickNotes: '',
      },
      lastSyncedAt: '2026-08-16T10:00:00.000Z',
    });
    expect(local.stateWrites.length).toBeGreaterThanOrEqual(4);
    expect(local.readSyncState).toHaveBeenCalledWith('sheet/a', 'user:a');
    expect(local.writeSyncState).toHaveBeenCalledWith(
      'sheet/a',
      'user:a',
      expect.objectContaining({ targetUserId: 'user:a' }),
    );
  });

  it('pulls clean remote changes, including authoritative empty sections', async () => {
    const previous = localSnapshot({
      accounts: [{ name: 'Wallet' }],
      accountsConfirmed: true,
      categories: {
        expense: [{ name: 'Food' }],
        income: [{ name: 'Salary' }],
        transfer: [{ name: 'Savings' }],
      },
      categoriesConfirmed: true,
    });
    const state: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user-a'),
      baselines: {
        accounts: fingerprintSettingsSection(previous, 'accounts'),
        categories: fingerprintSettingsSection(previous, 'categories'),
        quickNotes: '',
      },
      errors: { accounts: 'old error', categories: 'old error' },
    };
    const local = memoryLocal(previous, state);
    const remote = remoteAdapter(
      remoteSettings({
        accounts: { status: 'ok', present: true, value: [] },
        categories: {
          status: 'ok',
          present: true,
          value: clone(EMPTY_CATEGORIES),
        },
      }),
    );

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
      now: () => '2026-08-16T11:00:00.000Z',
    });

    expect(local.current()).toMatchObject({
      accounts: [],
      categories: EMPTY_CATEGORIES,
      accountsConfirmed: true,
      categoriesConfirmed: true,
    });
    expect(remote.replaceSection).not.toHaveBeenCalled();
    expect(result.changed).toEqual(['accounts', 'categories']);
    expect(result.errors).toEqual({});
    expect(result.status).toBe('synced');
    expect(result.state.baselines).toEqual({
      accounts: fingerprintSettingsSection(local.current(), 'accounts'),
      categories: fingerprintSettingsSection(local.current(), 'categories'),
      quickNotes: '',
    });
  });

  it('lets the Sheet win a same-section conflict without dropping other state', async () => {
    const baseline = localSnapshot({
      accounts: [{ name: 'Wallet' }],
      accountsConfirmed: true,
    });
    const edited = localSnapshot({
      accounts: [{ name: 'Edited offline' }],
      accountsConfirmed: true,
    });
    const state: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user-a'),
      baselines: {
        accounts: fingerprintSettingsSection(baseline, 'accounts'),
        categories: '',
        quickNotes: '',
      },
      dirty: ['accounts'],
    };
    const local = memoryLocal(edited, state);
    const sheetAccounts = [{ name: 'Sheet edit', icon: 'Landmark' }];
    const remote = remoteAdapter(
      remoteSettings({
        accounts: { status: 'ok', present: true, value: sheetAccounts },
      }),
    );

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(remote.replaceSection).not.toHaveBeenCalled();
    expect(local.current().accounts).toEqual(sheetAccounts);
    expect(result.changed).toEqual(['accounts']);
    expect(result.conflicts).toEqual(['accounts']);
    expect(result.state.dirty).toEqual([]);
    expect(result.state.baselines.accounts).toBe(
      fingerprintSettingsSection(local.current(), 'accounts'),
    );
  });

  it('pushes a dirty section when the Sheet still matches its baseline and adopts readback', async () => {
    const baseline = localSnapshot({
      categories: {
        expense: [{ name: 'Food' }],
        income: [{ name: 'Salary' }],
        transfer: [{ name: 'Savings' }],
      },
      categoriesConfirmed: true,
    });
    const editedCategories: SheetSettingsConfig['categories'] = {
      ...baseline.categories,
      expense: [{ name: 'Dining', icon: 'Utensils' }],
    };
    const edited = localSnapshot({
      ...baseline,
      categories: editedCategories,
    });
    const state: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user-a'),
      baselines: {
        accounts: '',
        categories: fingerprintSettingsSection(baseline, 'categories'),
        quickNotes: '',
      },
      dirty: ['categories'],
    };
    const local = memoryLocal(edited, state);
    const remote = remoteAdapter(
      remoteSettings({
        categories: { status: 'ok', present: true, value: baseline.categories },
      }),
    );
    const readback: SheetSettingsConfig['categories'] = {
      ...editedCategories,
      expense: [{ name: 'Dining', icon: 'Utensils', color: '#abcdef' }],
    };
    vi.mocked(remote.replaceSection).mockResolvedValueOnce({
      status: 'ok',
      present: true,
      value: readback,
    });

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(remote.replaceSection).toHaveBeenCalledWith(
      'sheet-a',
      'categories',
      editedCategories,
    );
    expect(local.current().categories).toEqual(readback);
    expect(result.changed).toEqual(['categories']);
    expect(result.pushed).toEqual(['categories']);
    expect(result.state.dirty).toEqual([]);
    expect(result.state.baselines.categories).toBe(
      fingerprintSettingsSection(local.current(), 'categories'),
    );
  });

  it('records an exact malformed-section error while reconciling other sections', async () => {
    const previous = localSnapshot({
      accounts: [{ name: 'Wallet' }],
      accountsConfirmed: true,
      categories: {
        expense: [{ name: 'Food' }],
        income: [{ name: 'Salary' }],
        transfer: [{ name: 'Savings' }],
      },
      categoriesConfirmed: true,
    });
    const state: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user-a'),
      baselines: {
        accounts: fingerprintSettingsSection(previous, 'accounts'),
        categories: fingerprintSettingsSection(previous, 'categories'),
        quickNotes: '',
      },
    };
    const nextCategories: SheetSettingsConfig['categories'] = {
      ...previous.categories,
      expense: [{ name: 'Dining' }],
    };
    const local = memoryLocal(previous, state);
    const remote = remoteAdapter(
      remoteSettings({
        accounts: {
          status: 'invalid',
          present: true,
          error: 'Account row 4: Duplicate name "Wallet".',
        },
        categories: { status: 'ok', present: true, value: nextCategories },
      }),
    );

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(local.current().categories).toEqual(nextCategories);
    expect(result.changed).toEqual(['categories']);
    expect(result.errors).toEqual({
      accounts: 'Account row 4: Duplicate name "Wallet".',
    });
    expect(result.status).toBe('error');
    expect(local.stateWrites.some(({ errors }) => errors.accounts === result.errors.accounts)).toBe(
      true,
    );
  });

  it('sanitizes Quick Note references after Account and Category winners are known', async () => {
    const previous = localSnapshot({
      accounts: [{ name: 'Wallet' }, { name: 'Bank' }],
      accountsConfirmed: true,
      categories: {
        expense: [{ name: 'Food' }, { name: 'Travel' }],
        income: [{ name: 'Salary' }],
        transfer: [{ name: 'Savings' }],
      },
      categoriesConfirmed: true,
      quickNotesPresent: true,
      quickNotes: {
        'default:expense': [
          { id: 'coffee', icon: 'Coffee', label: 'Coffee', account: 'Bank' },
        ],
        'expense:Travel': [
          { id: 'flight', icon: 'Plane', label: 'Flight', account: 'Wallet' },
        ],
        'transfer:Savings': [
          {
            id: 'save',
            icon: 'PiggyBank',
            label: 'Save',
            account: 'Wallet',
            forValue: 'Bank',
          },
        ],
      },
    });
    const state: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user-a'),
      baselines: {
        accounts: fingerprintSettingsSection(previous, 'accounts'),
        categories: fingerprintSettingsSection(previous, 'categories'),
        quickNotes: fingerprintSettingsSection(previous, 'quickNotes'),
      },
    };
    const winningAccounts = [{ name: 'Wallet' }];
    const winningCategories: SheetSettingsConfig['categories'] = {
      expense: [{ name: 'Food' }],
      income: [{ name: 'Salary' }],
      transfer: [{ name: 'Savings' }],
    };
    const local = memoryLocal(previous, state);
    const remote = remoteAdapter(
      remoteSettings({
        accounts: { status: 'ok', present: true, value: winningAccounts },
        categories: { status: 'ok', present: true, value: winningCategories },
        quickNotes: { status: 'ok', present: true, value: previous.quickNotes },
      }),
    );

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    const sanitized = {
      'default:expense': [{ id: 'coffee', icon: 'Coffee', label: 'Coffee' }],
      'transfer:Savings': [
        {
          id: 'save',
          icon: 'PiggyBank',
          label: 'Save',
          account: 'Wallet',
        },
      ],
    };
    expect(local.current().quickNotes).toEqual(sanitized);
    expect(remote.replaceSection).toHaveBeenCalledTimes(1);
    expect(remote.replaceSection).toHaveBeenCalledWith('sheet-a', 'quickNotes', sanitized);
    expect(result.changed).toEqual(['accounts', 'categories', 'quickNotes']);
    expect(result.pushed).toEqual(['quickNotes']);
    expect(result.state.dirty).toEqual([]);
  });

  it('auto-imports legacy Quick Notes only into the one verified workspace with no remote tab', async () => {
    const legacy: QuickNotesConfig = {
      'default:expense': [{ id: 'coffee', icon: 'Coffee', label: 'Coffee' }],
    };
    const initial = localSnapshot();
    const local = memoryLocal(
      initial,
      createDefaultSettingsSyncState('user-a'),
      legacy,
    );
    const remote = remoteAdapter(remoteSettings());

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(local.current().quickNotes).toEqual(legacy);
    expect(local.current().quickNotesPresent).toBe(true);
    expect(remote.replaceSection).toHaveBeenCalledWith('sheet-a', 'quickNotes', legacy);
    expect(local.deleteLegacyQuickNotes).toHaveBeenCalledTimes(1);
    expect(local.legacy()).toBeNull();
    expect(result).toMatchObject({
      changed: ['quickNotes'],
      pushed: ['quickNotes'],
      migrationDecision: 'auto-import',
      migrationApplied: true,
      status: 'synced',
    });
  });

  it('prompts and skips Quick Notes while recording the current remote baseline', async () => {
    const legacy: QuickNotesConfig = {
      'default:expense': [{ id: 'legacy', icon: 'Coffee', label: 'Legacy' }],
    };
    const sheetQuickNotes: QuickNotesConfig = {
      'default:income': [{ id: 'sheet', icon: 'Wallet', label: 'Sheet' }],
    };
    const initial = localSnapshot();
    const local = memoryLocal(
      initial,
      createDefaultSettingsSyncState('user-a'),
      legacy,
    );
    const remote = remoteAdapter(
      remoteSettings({
        quickNotes: { status: 'ok', present: true, value: sheetQuickNotes },
      }),
    );

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 2,
      local,
      remote,
    });

    expect(local.current().quickNotesPresent).toBe(false);
    expect(remote.replaceSection).not.toHaveBeenCalled();
    expect(local.deleteLegacyQuickNotes).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      changed: [],
      pushed: [],
      migrationDecision: 'prompt',
      migrationApplied: false,
      status: 'pending',
    });
    expect(result.state.lastSyncedAt).toBeUndefined();
    expect(result.state.baselines.quickNotes).toBe(
      fingerprintSettingsSection(
        { ...initial, quickNotes: sheetQuickNotes },
        'quickNotes',
      ),
    );
  });

  it('honors an explicit legacy import over an existing remote Quick Note tab', async () => {
    const legacy: QuickNotesConfig = {
      'default:expense': [{ id: 'legacy', icon: 'Coffee', label: 'Legacy' }],
    };
    const sheetQuickNotes: QuickNotesConfig = {
      'default:income': [{ id: 'sheet', icon: 'Wallet', label: 'Sheet' }],
    };
    const local = memoryLocal(
      localSnapshot(),
      createDefaultSettingsSyncState('user-a'),
      legacy,
    );
    const remote = remoteAdapter(
      remoteSettings({
        quickNotes: { status: 'ok', present: true, value: sheetQuickNotes },
      }),
    );

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 2,
      importLegacyQuickNotes: true,
      local,
      remote,
    });

    expect(remote.replaceSection).toHaveBeenCalledWith('sheet-a', 'quickNotes', legacy);
    expect(local.current().quickNotes).toEqual(legacy);
    expect(local.deleteLegacyQuickNotes).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      pushed: ['quickNotes'],
      conflicts: [],
      migrationDecision: 'prompt',
      migrationApplied: true,
      status: 'synced',
    });
  });

  it('preserves a newer local edit that arrives while an older revision is being pushed', async () => {
    const baseline = localSnapshot({
      accounts: [{ name: 'Wallet' }],
      accountsConfirmed: true,
    });
    const attemptedAccounts = [{ name: 'Offline edit' }];
    const newerAccounts = [{ name: 'Edited during sync' }];
    const edited = localSnapshot({
      accounts: attemptedAccounts,
      accountsConfirmed: true,
    });
    const state: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user-a'),
      baselines: {
        accounts: fingerprintSettingsSection(baseline, 'accounts'),
        categories: '',
        quickNotes: '',
      },
      dirty: ['accounts'],
    };
    const local = memoryLocal(edited, state);
    const remote = remoteAdapter(
      remoteSettings({
        accounts: { status: 'ok', present: true, value: baseline.accounts },
      }),
    );
    const pushStarted = deferred<void>();
    const readback = deferred<{
      status: 'ok';
      present: true;
      value: SheetSettingsConfig['accounts'];
    }>();
    vi.mocked(remote.replaceSection).mockImplementationOnce(async () => {
      pushStarted.resolve();
      return readback.promise;
    });

    const reconciliation = reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });
    await pushStarted.promise;
    local.edit('accounts', newerAccounts);
    readback.resolve({ status: 'ok', present: true, value: attemptedAccounts });
    const result = await reconciliation;

    expect(local.current().accounts).toEqual(newerAccounts);
    expect(result.pushed).toEqual(['accounts']);
    expect(result.state.dirty).toEqual(['accounts']);
    expect(result.state.baselines.accounts).toBe(
      fingerprintSettingsSection(edited, 'accounts'),
    );
    expect(result.status).toBe('pending');
  });

  it('persists the dirty section and exact network error before rethrowing a failed push', async () => {
    const initial = localSnapshot({
      accounts: [{ name: 'Wallet' }],
      accountsConfirmed: true,
    });
    const local = memoryLocal(initial);
    const remote = remoteAdapter(remoteSettings());
    vi.mocked(remote.replaceSection).mockRejectedValueOnce(new Error('Network unavailable'));

    await expect(
      reconcileSettings({
        sheetId: 'sheet-a',
        verifiedUserId: 'user-a',
        verifiedWorkspaceCount: 1,
        local,
        remote,
      }),
    ).rejects.toThrow('Network unavailable');

    expect(local.currentState()).toMatchObject({
      targetUserId: 'user-a',
      dirty: ['accounts'],
      errors: { accounts: 'Network unavailable' },
    });
  });

  it('keeps a dirty section retryable when post-write readback is invalid', async () => {
    const baseline = localSnapshot({
      accounts: [{ name: 'Wallet' }],
      accountsConfirmed: true,
    });
    const edited = localSnapshot({
      accounts: [{ name: 'Edited' }],
      accountsConfirmed: true,
    });
    const state: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user-a'),
      baselines: {
        accounts: fingerprintSettingsSection(baseline, 'accounts'),
        categories: '',
        quickNotes: '',
      },
      dirty: ['accounts'],
    };
    const local = memoryLocal(edited, state);
    const remote = remoteAdapter(
      remoteSettings({
        accounts: { status: 'ok', present: true, value: baseline.accounts },
      }),
    );
    vi.mocked(remote.replaceSection).mockResolvedValueOnce({
      status: 'invalid',
      present: true,
      error: 'Settings tab "Account" header must be exact.',
    });

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(result.state.dirty).toEqual(['accounts']);
    expect(result.errors).toEqual({
      accounts: 'Settings tab "Account" header must be exact.',
    });
    expect(result.status).toBe('error');
  });

  it('pushes every initial local migration candidate in dependency order', async () => {
    const initial = localSnapshot({
      accounts: [{ name: 'Wallet' }],
      accountsConfirmed: true,
      categories: {
        expense: [{ name: 'Food' }],
        income: [{ name: 'Salary' }],
        transfer: [{ name: 'Savings' }],
      },
      categoriesConfirmed: true,
      quickNotes: {
        'expense:Food': [
          { id: 'lunch', icon: 'Utensils', label: 'Lunch', account: 'Wallet' },
        ],
      },
      quickNotesPresent: true,
    });
    const local = memoryLocal(initial);
    const remote = remoteAdapter(remoteSettings());

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(vi.mocked(remote.replaceSection).mock.calls.map(([, section]) => section)).toEqual([
      'accounts',
      'categories',
      'quickNotes',
    ]);
    expect(result.pushed).toEqual(['accounts', 'categories', 'quickNotes']);
    expect(result.state.dirty).toEqual([]);
  });

  it('seeds confirmed local settings into an existing but empty remote tab', async () => {
    const initial = localSnapshot({
      accounts: [{ name: 'Wallet' }],
      accountsConfirmed: true,
    });
    const local = memoryLocal(initial);
    const remote = remoteAdapter(
      remoteSettings({
        accounts: { status: 'ok', present: true, value: [] },
      }),
    );

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(remote.replaceSection).toHaveBeenCalledWith('sheet-a', 'accounts', initial.accounts);
    expect(result.pushed).toEqual(['accounts']);
    expect(local.current().accounts).toEqual(initial.accounts);
  });

  it('accepts matching remote data as the baseline for an initial local candidate', async () => {
    const initial = localSnapshot({
      accounts: [{ name: 'Wallet' }],
      accountsConfirmed: true,
    });
    const local = memoryLocal(initial);
    const remote = remoteAdapter(
      remoteSettings({
        accounts: { status: 'ok', present: true, value: initial.accounts },
      }),
    );

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(remote.replaceSection).not.toHaveBeenCalled();
    expect(result.conflicts).toEqual([]);
    expect(result.state.dirty).toEqual([]);
    expect(result.state.baselines.accounts).toBe(
      fingerprintSettingsSection(initial, 'accounts'),
    );
  });

  it('persists initial dirty migration candidates before a remote read fails', async () => {
    const initial = localSnapshot({
      categories: {
        expense: [{ name: 'Food' }],
        income: [{ name: 'Salary' }],
        transfer: [{ name: 'Savings' }],
      },
      categoriesConfirmed: true,
    });
    const local = memoryLocal(initial);
    const remote = remoteAdapter(remoteSettings());
    vi.mocked(remote.readSettings).mockRejectedValueOnce(new Error('Offline'));

    await expect(
      reconcileSettings({
        sheetId: 'sheet-a',
        verifiedUserId: 'user-a',
        verifiedWorkspaceCount: 1,
        local,
        remote,
      }),
    ).rejects.toThrow('Offline');

    expect(local.currentState()).toMatchObject({
      targetUserId: 'user-a',
      dirty: ['categories'],
    });
  });
});
