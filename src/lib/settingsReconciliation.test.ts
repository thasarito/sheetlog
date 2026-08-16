import { describe, expect, it, vi } from 'vitest';
import type {
  SheetSettingsReadResult,
  SheetSettingsSectionReadResult,
} from './googleSettings';
import {
  reconcileSettings,
  type LocalSettingsAtomicCommitResult,
  type LocalSettingsSectionSnapshot,
  type LocalSettingsSnapshot,
  type SettingsLocalRepository,
  type SettingsRemoteAdapter,
} from './settingsReconciliation';
import {
  createDefaultSettingsSyncState,
  fingerprintQuickNotesConfig,
  fingerprintSettingsSection,
  markSettingsSectionDirty,
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
  editLegacy(config: QuickNotesConfig | null): void;
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

  function ready(section: SettingsSection): boolean {
    if (section === 'accounts') return settings.accountsConfirmed;
    if (section === 'categories') return settings.categoriesConfirmed;
    return settings.quickNotesPresent;
  }

  async function updateSyncState(
    _sheetId: string,
    _userId: string,
    update: (current: SettingsSyncState | null) => SettingsSyncState,
  ): Promise<SettingsSyncState> {
    const next = update(state ? clone(state) : null);
    state = clone(next);
    stateWrites.push(clone(next));
    return clone(next);
  }

  async function commitSection<Section extends SettingsSection>(
    _sheetId: string,
    _userId: string,
    section: Section,
    expected: LocalSettingsSectionSnapshot<Section>,
    value: SheetSettingsConfig[Section],
    update: (
      current: SettingsSyncState | null,
      applied: boolean,
    ) => SettingsSyncState,
  ): Promise<LocalSettingsAtomicCommitResult> {
    const currentFingerprint = fingerprintSettingsSection(settings, section);
    const expectedFingerprint = fingerprintSettingsSection(
      { ...settings, [section]: expected.value },
      section,
    );
    const applied =
      ready(section) === expected.ready && currentFingerprint === expectedFingerprint;
    if (applied) edit(section, value);
    const next = update(state ? clone(state) : null, applied);
    state = clone(next);
    stateWrites.push(clone(next));
    return { applied, settings: clone(settings), state: clone(next) };
  }

  return {
    readSettings: vi.fn(async () => clone(settings)),
    updateSyncState: vi.fn(updateSyncState),
    commitSection: vi.fn(commitSection),
    readLegacyQuickNotes: vi.fn(async () => (legacy ? clone(legacy) : null)),
    deleteLegacyQuickNotesIfUnchanged: vi.fn(async (expected) => {
      if (
        legacy === null ||
        fingerprintQuickNotesConfig(legacy) !== fingerprintQuickNotesConfig(expected)
      ) {
        return false;
      }
      legacy = null;
      return true;
    }),
    current: () => clone(settings),
    currentState: () => (state ? clone(state) : null),
    edit,
    legacy: () => (legacy ? clone(legacy) : null),
    editLegacy: (config) => {
      legacy = config ? clone(config) : null;
    },
    stateWrites,
  };
}

function remoteAdapter(readResult: SheetSettingsReadResult) {
  async function readSection<Section extends SettingsSection>(
    _sheetId: string,
    section: Section,
  ): Promise<SheetSettingsSectionReadResult<SheetSettingsConfig[Section]>> {
    return clone(readResult[section]) as SheetSettingsSectionReadResult<
      SheetSettingsConfig[Section]
    >;
  }

  async function replaceSection<Section extends SettingsSection>(
    _sheetId: string,
    _section: Section,
    value: SheetSettingsConfig[Section],
  ): Promise<SheetSettingsSectionReadResult<SheetSettingsConfig[Section]>> {
    return {
      status: 'ok',
      present: true,
      value: clone(value),
    };
  }

  return {
    readSettings: vi.fn(async () => clone(readResult)),
    readSection: vi.fn(readSection) as unknown as SettingsRemoteAdapter['readSection'],
    replaceSection: vi.fn(replaceSection) as unknown as SettingsRemoteAdapter['replaceSection'],
  } satisfies SettingsRemoteAdapter;
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
    expect(local.updateSyncState).toHaveBeenCalledWith(
      'sheet/a',
      'user:a',
      expect.any(Function),
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
    expect(local.deleteLegacyQuickNotesIfUnchanged).toHaveBeenCalledWith(legacy);
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
    expect(local.deleteLegacyQuickNotesIfUnchanged).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      changed: [],
      pushed: [],
      migrationDecision: 'prompt',
      migrationApplied: false,
      status: 'pending',
    });
    expect(result.state.quickNotesMigration).toEqual({
      intent: 'prompt',
      sourceFingerprint: fingerprintQuickNotesConfig(legacy),
      phase: 'pending',
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
    expect(local.deleteLegacyQuickNotesIfUnchanged).toHaveBeenCalledWith(legacy);
    expect(result).toMatchObject({
      pushed: ['quickNotes'],
      conflicts: [],
      migrationDecision: 'prompt',
      migrationApplied: true,
      status: 'synced',
    });
    expect(result.state.quickNotesMigration).toBeUndefined();
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

  it('treats an existing empty remote tab as authoritative with no baseline', async () => {
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

    expect(remote.replaceSection).not.toHaveBeenCalled();
    expect(result.pushed).toEqual([]);
    expect(result.conflicts).toEqual(['accounts']);
    expect(local.current().accounts).toEqual([]);
    expect(result.state.dirty).toEqual([]);
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

  it('converges matching local and remote content without a stale-baseline conflict', async () => {
    const oldBaseline = localSnapshot({
      accounts: [{ name: 'Old account' }],
      accountsConfirmed: true,
    });
    const matching = localSnapshot({
      accounts: [{ name: 'Matching account' }],
      accountsConfirmed: true,
    });
    const state: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user-a'),
      baselines: {
        accounts: fingerprintSettingsSection(oldBaseline, 'accounts'),
        categories: '',
        quickNotes: '',
      },
      dirty: ['accounts'],
    };
    const local = memoryLocal(matching, state);
    const remote = remoteAdapter(
      remoteSettings({
        accounts: { status: 'ok', present: true, value: matching.accounts },
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
    expect(result.state.baselines.accounts).toBe(
      fingerprintSettingsSection(matching, 'accounts'),
    );
    expect(result.state.dirty).toEqual([]);
    expect(result.status).toBe('synced');
  });

  it('confirms local metadata when equal content arrives from a present remote tab', async () => {
    const accounts = [{ name: 'Wallet' }];
    const initial = localSnapshot({
      accounts,
      accountsConfirmed: false,
    });
    const local = memoryLocal(
      initial,
      createDefaultSettingsSyncState('user-a'),
    );
    const remote = remoteAdapter(
      remoteSettings({
        accounts: { status: 'ok', present: true, value: accounts },
      }),
    );

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(local.current().accounts).toEqual(accounts);
    expect(local.current().accountsConfirmed).toBe(true);
    expect(result.changed).toEqual(['accounts']);
    expect(result.status).toBe('synced');
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

  it('preserves dirty work added to another section while a push is in flight', async () => {
    const baseline = localSnapshot({
      accounts: [{ name: 'Wallet' }],
      accountsConfirmed: true,
      categories: clone(EMPTY_CATEGORIES),
      categoriesConfirmed: true,
    });
    const edited = localSnapshot({
      ...baseline,
      categories: {
        ...baseline.categories,
        expense: [{ name: 'Edited category' }],
      },
    });
    const state: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user-a'),
      baselines: {
        accounts: fingerprintSettingsSection(baseline, 'accounts'),
        categories: fingerprintSettingsSection(baseline, 'categories'),
        quickNotes: '',
      },
      dirty: ['categories'],
    };
    const local = memoryLocal(edited, state);
    const remote = remoteAdapter(
      remoteSettings({
        accounts: { status: 'ok', present: true, value: baseline.accounts },
        categories: { status: 'ok', present: true, value: baseline.categories },
      }),
    );
    vi.mocked(remote.replaceSection).mockImplementationOnce(async (_sheetId, _section, value) => {
      local.edit('accounts', [{ name: 'Concurrent account edit' }]);
      await local.updateSyncState('sheet-a', 'user-a', (latest) =>
        markSettingsSectionDirty(
          latest ?? createDefaultSettingsSyncState('user-a'),
          'accounts',
        ),
      );
      return { status: 'ok', present: true, value };
    });

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(result.state.dirty).toContain('accounts');
    expect(local.current().accounts).toEqual([{ name: 'Concurrent account edit' }]);
    expect(local.currentState()?.dirty).toContain('accounts');
    expect(result.status).toBe('pending');
  });

  it('does not overwrite a concurrent local edit when pulling a clean remote winner', async () => {
    const initial = localSnapshot({
      categories: {
        expense: [{ name: 'Food' }],
        income: [{ name: 'Salary' }],
        transfer: [{ name: 'Savings' }],
      },
      categoriesConfirmed: true,
    });
    const remoteCategories: SheetSettingsConfig['categories'] = {
      ...initial.categories,
      expense: [{ name: 'Remote dining' }],
    };
    const concurrentCategories: SheetSettingsConfig['categories'] = {
      ...initial.categories,
      expense: [{ name: 'Concurrent local dining' }],
    };
    const state: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user-a'),
      baselines: {
        accounts: '',
        categories: fingerprintSettingsSection(initial, 'categories'),
        quickNotes: '',
      },
    };
    const local = memoryLocal(initial, state);
    const remote = remoteAdapter(
      remoteSettings({
        categories: { status: 'ok', present: true, value: remoteCategories },
      }),
    );
    const performCommit = vi.mocked(local.commitSection).getMockImplementation();
    if (!performCommit) throw new Error('Atomic commit test repository is not configured.');
    vi.mocked(local.commitSection).mockImplementationOnce(async (...args) => {
      local.edit('categories', concurrentCategories);
      return performCommit(...args);
    });
    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(local.current().categories).toEqual(concurrentCategories);
    expect(result.state.dirty).toContain('categories');
    expect(result.status).toBe('pending');
  });

  it('recovers a confirmed local edit whose durable dirty marker was missed', async () => {
    const baseline = localSnapshot({
      accounts: [{ name: 'Wallet' }],
      accountsConfirmed: true,
    });
    const edited = localSnapshot({
      accounts: [{ name: 'Recovered local edit' }],
      accountsConfirmed: true,
    });
    const state: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user-a'),
      baselines: {
        accounts: fingerprintSettingsSection(baseline, 'accounts'),
        categories: '',
        quickNotes: '',
      },
    };
    const local = memoryLocal(edited, state);
    const remote = remoteAdapter(
      remoteSettings({
        accounts: { status: 'ok', present: true, value: baseline.accounts },
      }),
    );

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(remote.replaceSection).toHaveBeenCalledWith('sheet-a', 'accounts', edited.accounts);
    expect(result.pushed).toEqual(['accounts']);
    expect(result.state.dirty).toEqual([]);
    expect(result.status).toBe('synced');
  });

  it('lets a fresh remote edit win when the aggregate snapshot goes stale before replace', async () => {
    const baseline = localSnapshot({
      accounts: [{ name: 'Wallet' }],
      accountsConfirmed: true,
    });
    const edited = localSnapshot({
      accounts: [{ name: 'Offline edit' }],
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
    const freshSheetAccounts = [{ name: 'Fresh Sheet edit' }];
    const local = memoryLocal(edited, state);
    const remote = remoteAdapter(
      remoteSettings({
        accounts: { status: 'ok', present: true, value: baseline.accounts },
      }),
    );
    vi.mocked(remote.readSection).mockResolvedValueOnce({
      status: 'ok',
      present: true,
      value: freshSheetAccounts,
    });

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(remote.readSection).toHaveBeenCalledWith('sheet-a', 'accounts');
    expect(remote.replaceSection).not.toHaveBeenCalled();
    expect(local.current().accounts).toEqual(freshSheetAccounts);
    expect(result.conflicts).toEqual(['accounts']);
    expect(result.state.dirty).toEqual([]);
  });

  it('preserves an edit and dirty mark committed immediately after conflict-winner adoption', async () => {
    const baseline = localSnapshot({
      accounts: [{ name: 'Wallet' }],
      accountsConfirmed: true,
    });
    const edited = localSnapshot({
      accounts: [{ name: 'Offline edit' }],
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
    const sheetWinner = [{ name: 'Sheet conflict winner' }];
    const concurrentEdit = [{ name: 'Edit after conflict commit' }];
    const local = memoryLocal(edited, state);
    const remote = remoteAdapter(
      remoteSettings({
        accounts: { status: 'ok', present: true, value: sheetWinner },
      }),
    );
    const performCommit = vi.mocked(local.commitSection).getMockImplementation();
    if (!performCommit) throw new Error('Atomic commit test repository is not configured.');
    vi.mocked(local.commitSection).mockImplementationOnce(async (...args) => {
      const result = await performCommit(...args);
      if (result.applied) {
        local.edit('accounts', concurrentEdit);
        await local.updateSyncState('sheet-a', 'user-a', (latest) =>
          markSettingsSectionDirty(
            latest ?? createDefaultSettingsSyncState('user-a'),
            'accounts',
          ),
        );
      }
      return result;
    });

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(local.current().accounts).toEqual(concurrentEdit);
    expect(result.conflicts).toEqual(['accounts']);
    expect(result.state.dirty).toContain('accounts');
    expect(result.status).toBe('pending');
  });

  it('records a conflict when post-write readback diverges and adopts the Sheet winner', async () => {
    const baseline = localSnapshot({
      accounts: [{ name: 'Wallet' }],
      accountsConfirmed: true,
    });
    const edited = localSnapshot({
      accounts: [{ name: 'Offline edit' }],
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
    const readbackAccounts = [{ name: 'Sheet won during write' }];
    const local = memoryLocal(edited, state);
    const remote = remoteAdapter(
      remoteSettings({
        accounts: { status: 'ok', present: true, value: baseline.accounts },
      }),
    );
    vi.mocked(remote.replaceSection).mockResolvedValueOnce({
      status: 'ok',
      present: true,
      value: readbackAccounts,
    });

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(local.current().accounts).toEqual(readbackAccounts);
    expect(result.pushed).toEqual(['accounts']);
    expect(result.conflicts).toEqual(['accounts']);
    expect(result.state.dirty).toEqual([]);
    expect(result.state.baselines.accounts).toBe(
      fingerprintSettingsSection(local.current(), 'accounts'),
    );
  });

  it('preserves an edit and dirty mark committed immediately after divergent readback adoption', async () => {
    const baseline = localSnapshot({
      accounts: [{ name: 'Wallet' }],
      accountsConfirmed: true,
    });
    const edited = localSnapshot({
      accounts: [{ name: 'Offline edit' }],
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
    const sheetWinner = [{ name: 'Sheet write winner' }];
    const concurrentEdit = [{ name: 'Edit after winner commit' }];
    vi.mocked(remote.replaceSection).mockResolvedValueOnce({
      status: 'ok',
      present: true,
      value: sheetWinner,
    });
    const performCommit = vi.mocked(local.commitSection).getMockImplementation();
    if (!performCommit) throw new Error('Atomic commit test repository is not configured.');
    vi.mocked(local.commitSection).mockImplementationOnce(async (...args) => {
      const result = await performCommit(...args);
      if (result.applied) {
        local.edit('accounts', concurrentEdit);
        await local.updateSyncState('sheet-a', 'user-a', (latest) =>
          markSettingsSectionDirty(
            latest ?? createDefaultSettingsSyncState('user-a'),
            'accounts',
          ),
        );
      }
      return result;
    });

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(local.current().accounts).toEqual(concurrentEdit);
    expect(result.conflicts).toEqual(['accounts']);
    expect(result.state.dirty).toContain('accounts');
    expect(result.status).toBe('pending');
  });

  it('sanitizes an orphaned remote Quick Note winner and keeps the cleanup dirty', async () => {
    const initial = localSnapshot({
      accounts: [{ name: 'Wallet' }],
      accountsConfirmed: true,
      categories: {
        expense: [{ name: 'Food' }],
        income: [{ name: 'Salary' }],
        transfer: [{ name: 'Savings' }],
      },
      categoriesConfirmed: true,
      quickNotes: { 'default:income': [] },
      quickNotesPresent: true,
    });
    const state: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user-a'),
      baselines: {
        accounts: fingerprintSettingsSection(initial, 'accounts'),
        categories: fingerprintSettingsSection(initial, 'categories'),
        quickNotes: fingerprintSettingsSection(initial, 'quickNotes'),
      },
    };
    const remoteQuickNotes: QuickNotesConfig = {
      'default:expense': [
        { id: 'coffee', icon: 'Coffee', label: 'Coffee', account: 'Missing bank' },
      ],
      'expense:Missing category': [
        { id: 'orphan', icon: 'Circle', label: 'Orphan' },
      ],
    };
    const local = memoryLocal(initial, state);
    const remote = remoteAdapter(
      remoteSettings({
        accounts: { status: 'ok', present: true, value: initial.accounts },
        categories: { status: 'ok', present: true, value: initial.categories },
        quickNotes: { status: 'ok', present: true, value: remoteQuickNotes },
      }),
    );

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(local.current().quickNotes).toEqual({
      'default:expense': [{ id: 'coffee', icon: 'Coffee', label: 'Coffee' }],
    });
    expect(result.state.dirty).toContain('quickNotes');
    expect(result.status).toBe('pending');
    expect(result.state.baselines.quickNotes).toBe(
      fingerprintSettingsSection(
        { ...initial, quickNotes: remoteQuickNotes },
        'quickNotes',
      ),
    );
  });

  it('persists and resumes an auto-import after a failed upload', async () => {
    const legacy: QuickNotesConfig = {
      'default:expense': [{ id: 'coffee', icon: 'Coffee', label: 'Coffee' }],
    };
    const local = memoryLocal(localSnapshot(), null, legacy);
    const failingRemote = remoteAdapter(remoteSettings());
    vi.mocked(failingRemote.replaceSection).mockRejectedValueOnce(
      new Error('Upload interrupted'),
    );

    await expect(
      reconcileSettings({
        sheetId: 'sheet-a',
        verifiedUserId: 'user-a',
        verifiedWorkspaceCount: 1,
        local,
        remote: failingRemote,
      }),
    ).rejects.toThrow('Upload interrupted');

    expect(local.currentState()).toMatchObject({
      baselines: { quickNotes: '' },
      dirty: ['quickNotes'],
      quickNotesMigration: {
        intent: 'auto-import',
        sourceFingerprint: fingerprintQuickNotesConfig(legacy),
      },
    });
    expect(local.currentState()?.quickNotesMigration).toEqual({
      intent: 'auto-import',
      sourceFingerprint: fingerprintQuickNotesConfig(legacy),
      phase: 'applied',
      appliedScopedFingerprint: fingerprintQuickNotesConfig(legacy),
    });
    expect(local.legacy()).toEqual(legacy);

    const retryRemote = remoteAdapter(remoteSettings());
    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote: retryRemote,
    });

    expect(retryRemote.replaceSection).toHaveBeenCalledWith('sheet-a', 'quickNotes', legacy);
    expect(local.deleteLegacyQuickNotesIfUnchanged).toHaveBeenCalledWith(legacy);
    expect(local.legacy()).toBeNull();
    expect(result.state.quickNotesMigration).toBeUndefined();
    expect(result.status).toBe('synced');
  });

  it('never recopies legacy Quick Notes over a scoped edit after migration was applied', async () => {
    const legacy: QuickNotesConfig = {
      'default:expense': [{ id: 'coffee', icon: 'Coffee', label: 'Coffee' }],
    };
    const scopedEdit: QuickNotesConfig = {
      'default:expense': [{ id: 'tea', icon: 'CupSoda', label: 'Tea' }],
    };
    const localSettings = localSnapshot({
      quickNotes: scopedEdit,
      quickNotesPresent: true,
    });
    const state: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user-a'),
      dirty: ['quickNotes'],
      quickNotesMigration: {
        intent: 'auto-import',
        sourceFingerprint: fingerprintQuickNotesConfig(legacy),
        phase: 'applied',
        appliedScopedFingerprint: fingerprintQuickNotesConfig(legacy),
      },
    };
    const local = memoryLocal(localSettings, state, legacy);
    const remote = remoteAdapter(remoteSettings());

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(local.current().quickNotes).toEqual(scopedEdit);
    expect(remote.replaceSection).not.toHaveBeenCalled();
    expect(local.legacy()).toEqual(legacy);
    expect(result.state.quickNotesMigration).toEqual({
      intent: 'prompt',
      sourceFingerprint: fingerprintQuickNotesConfig(legacy),
      phase: 'applied',
      appliedScopedFingerprint: fingerprintQuickNotesConfig(legacy),
    });
    expect(result.state.dirty).toContain('quickNotes');
    expect(result.migrationApplied).toBe(false);
    expect(result.status).toBe('pending');
  });

  it('preserves a scoped edit made after pending migration intent was persisted', async () => {
    const legacy: QuickNotesConfig = {
      'default:expense': [{ id: 'legacy', icon: 'Coffee', label: 'Legacy' }],
    };
    const scopedEdit: QuickNotesConfig = {
      'default:expense': [{ id: 'scoped', icon: 'CupSoda', label: 'Scoped edit' }],
    };
    const localSettings = localSnapshot({
      quickNotes: scopedEdit,
      quickNotesPresent: true,
    });
    const state: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user-a'),
      dirty: ['quickNotes'],
      quickNotesMigration: {
        intent: 'auto-import',
        sourceFingerprint: fingerprintQuickNotesConfig(legacy),
        phase: 'pending',
      },
    };
    const local = memoryLocal(localSettings, state, legacy);
    const remote = remoteAdapter(remoteSettings());

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(local.current().quickNotes).toEqual(scopedEdit);
    expect(remote.replaceSection).not.toHaveBeenCalled();
    expect(local.legacy()).toEqual(legacy);
    expect(result.state.quickNotesMigration).toEqual({
      ...state.quickNotesMigration,
      intent: 'prompt',
    });
    expect(result.state.dirty).toContain('quickNotes');
    expect(result.status).toBe('pending');
  });

  it('keeps legacy and prompts when scoped Quick Notes change during migration upload', async () => {
    const legacy: QuickNotesConfig = {
      'default:expense': [{ id: 'legacy', icon: 'Coffee', label: 'Legacy' }],
    };
    const scopedEdit: QuickNotesConfig = {
      'default:expense': [{ id: 'scoped', icon: 'CupSoda', label: 'Scoped edit' }],
    };
    const local = memoryLocal(localSnapshot(), null, legacy);
    const remote = remoteAdapter(remoteSettings());
    const pushStarted = deferred<void>();
    const readback = deferred<{
      status: 'ok';
      present: true;
      value: QuickNotesConfig;
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
    local.edit('quickNotes', scopedEdit);
    await local.updateSyncState('sheet-a', 'user-a', (latest) =>
      markSettingsSectionDirty(
        latest ?? createDefaultSettingsSyncState('user-a'),
        'quickNotes',
      ),
    );
    readback.resolve({ status: 'ok', present: true, value: legacy });
    const result = await reconciliation;

    expect(local.current().quickNotes).toEqual(scopedEdit);
    expect(local.legacy()).toEqual(legacy);
    expect(local.deleteLegacyQuickNotesIfUnchanged).not.toHaveBeenCalled();
    expect(result.state.quickNotesMigration).toEqual({
      intent: 'prompt',
      sourceFingerprint: fingerprintQuickNotesConfig(legacy),
      phase: 'applied',
      appliedScopedFingerprint: fingerprintQuickNotesConfig(legacy),
    });
    expect(result.state.dirty).toContain('quickNotes');
    expect(result.status).toBe('pending');
  });

  it('does not recopy an applied migration before retrying its upload', async () => {
    const legacy: QuickNotesConfig = {
      'default:expense': [{ id: 'coffee', icon: 'Coffee', label: 'Coffee' }],
    };
    const localSettings = localSnapshot({
      quickNotes: legacy,
      quickNotesPresent: true,
    });
    const state: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user-a'),
      dirty: ['quickNotes'],
      quickNotesMigration: {
        intent: 'auto-import',
        sourceFingerprint: fingerprintQuickNotesConfig(legacy),
        phase: 'applied',
        appliedScopedFingerprint: fingerprintQuickNotesConfig(legacy),
      },
    };
    const local = memoryLocal(localSettings, state, legacy);
    const remote = remoteAdapter(remoteSettings());
    vi.mocked(remote.replaceSection).mockRejectedValueOnce(
      new Error('Retry upload interrupted'),
    );

    await expect(
      reconcileSettings({
        sheetId: 'sheet-a',
        verifiedUserId: 'user-a',
        verifiedWorkspaceCount: 1,
        local,
        remote,
      }),
    ).rejects.toThrow('Retry upload interrupted');

    expect(local.commitSection).not.toHaveBeenCalled();
    expect(local.current().quickNotes).toEqual(legacy);
    expect(local.currentState()?.quickNotesMigration).toEqual(
      state.quickNotesMigration,
    );
  });

  it('moves an automatic migration to prompt when a newer Sheet value wins', async () => {
    const legacy: QuickNotesConfig = {
      'default:expense': [{ id: 'legacy', icon: 'Coffee', label: 'Legacy' }],
    };
    const oldSheetValue: QuickNotesConfig = {
      'default:expense': [{ id: 'old', icon: 'Circle', label: 'Old Sheet' }],
    };
    const sheetWinner: QuickNotesConfig = {
      'default:income': [{ id: 'winner', icon: 'Wallet', label: 'Sheet winner' }],
    };
    const localSettings = localSnapshot({
      quickNotes: legacy,
      quickNotesPresent: true,
    });
    const state: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user-a'),
      baselines: {
        accounts: '',
        categories: '',
        quickNotes: fingerprintSettingsSection(
          { ...localSettings, quickNotes: oldSheetValue },
          'quickNotes',
        ),
      },
      dirty: ['quickNotes'],
      quickNotesMigration: {
        intent: 'auto-import',
        sourceFingerprint: fingerprintQuickNotesConfig(legacy),
        phase: 'applied',
        appliedScopedFingerprint: fingerprintQuickNotesConfig(legacy),
      },
    };
    const local = memoryLocal(localSettings, state, legacy);
    const remote = remoteAdapter(
      remoteSettings({
        quickNotes: { status: 'ok', present: true, value: sheetWinner },
      }),
    );

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(local.current().quickNotes).toEqual(sheetWinner);
    expect(remote.replaceSection).not.toHaveBeenCalled();
    expect(local.legacy()).toEqual(legacy);
    expect(result.conflicts).toContain('quickNotes');
    expect(result.state.quickNotesMigration).toEqual({
      ...state.quickNotesMigration,
      intent: 'prompt',
    });
    expect(result.migrationDecision).toBe('prompt');
    expect(result.status).toBe('pending');
  });

  it('keeps a scoped edit dirty while a persisted legacy migration prompt is unresolved', async () => {
    const legacy: QuickNotesConfig = {
      'default:expense': [{ id: 'legacy', icon: 'Coffee', label: 'Legacy' }],
    };
    const scopedEdit: QuickNotesConfig = {
      'default:expense': [{ id: 'scoped', icon: 'CupSoda', label: 'Scoped edit' }],
    };
    const localSettings = localSnapshot({
      quickNotes: scopedEdit,
      quickNotesPresent: true,
    });
    const state: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user-a'),
      dirty: ['quickNotes'],
      quickNotesMigration: {
        intent: 'prompt',
        sourceFingerprint: fingerprintQuickNotesConfig(legacy),
        phase: 'pending',
      },
    };
    const local = memoryLocal(localSettings, state, legacy);
    const remote = remoteAdapter(remoteSettings());

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 2,
      local,
      remote,
    });

    expect(local.current().quickNotes).toEqual(scopedEdit);
    expect(remote.replaceSection).not.toHaveBeenCalled();
    expect(result.state.quickNotesMigration).toEqual(state.quickNotesMigration);
    expect(result.state.dirty).toContain('quickNotes');
    expect(result.status).toBe('pending');
  });

  it('clears persisted migration intent when legacy Quick Notes were emptied', async () => {
    const scoped: QuickNotesConfig = {
      'default:expense': [{ id: 'scoped', icon: 'Coffee', label: 'Scoped' }],
    };
    const oldLegacy: QuickNotesConfig = {
      'default:expense': [{ id: 'legacy', icon: 'Circle', label: 'Legacy' }],
    };
    const localSettings = localSnapshot({
      quickNotes: scoped,
      quickNotesPresent: true,
    });
    const state: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user-a'),
      baselines: {
        accounts: '',
        categories: '',
        quickNotes: fingerprintSettingsSection(localSettings, 'quickNotes'),
      },
      quickNotesMigration: {
        intent: 'auto-import',
        sourceFingerprint: fingerprintQuickNotesConfig(oldLegacy),
        phase: 'applied',
        appliedScopedFingerprint: fingerprintQuickNotesConfig(scoped),
      },
    };
    const local = memoryLocal(localSettings, state, {});
    const remote = remoteAdapter(
      remoteSettings({
        quickNotes: { status: 'ok', present: true, value: scoped },
      }),
    );

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(local.current().quickNotes).toEqual(scoped);
    expect(result.state.quickNotesMigration).toBeUndefined();
    expect(result.migrationDecision).toBe('none');
    expect(result.status).toBe('synced');
  });

  it('finishes legacy cleanup after a crash between verified upload and deletion', async () => {
    const legacy: QuickNotesConfig = {
      'default:expense': [{ id: 'coffee', icon: 'Coffee', label: 'Coffee' }],
    };
    const synced = localSnapshot({
      quickNotes: legacy,
      quickNotesPresent: true,
    });
    const state: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user-a'),
      baselines: {
        accounts: '',
        categories: '',
        quickNotes: fingerprintSettingsSection(synced, 'quickNotes'),
      },
      quickNotesMigration: {
        intent: 'auto-import',
        sourceFingerprint: fingerprintQuickNotesConfig(legacy),
      },
    };
    const local = memoryLocal(synced, state, legacy);
    const remote = remoteAdapter(
      remoteSettings({
        quickNotes: { status: 'ok', present: true, value: legacy },
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
    expect(local.deleteLegacyQuickNotesIfUnchanged).toHaveBeenCalledWith(legacy);
    expect(local.legacy()).toBeNull();
    expect(result.state.quickNotesMigration).toBeUndefined();
    expect(result.status).toBe('synced');
  });

  it('finishes crashed migration cleanup when only the fresh remote read sees the upload', async () => {
    const legacy: QuickNotesConfig = {
      'default:expense': [{ id: 'coffee', icon: 'Coffee', label: 'Coffee' }],
    };
    const synced = localSnapshot({
      quickNotes: legacy,
      quickNotesPresent: true,
    });
    const state: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user-a'),
      dirty: ['quickNotes'],
      quickNotesMigration: {
        intent: 'auto-import',
        sourceFingerprint: fingerprintQuickNotesConfig(legacy),
      },
    };
    const local = memoryLocal(synced, state, legacy);
    const remote = remoteAdapter(remoteSettings());
    vi.mocked(remote.readSection).mockResolvedValueOnce({
      status: 'ok',
      present: true,
      value: legacy,
    });

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(remote.readSection).toHaveBeenCalledWith('sheet-a', 'quickNotes');
    expect(remote.replaceSection).not.toHaveBeenCalled();
    expect(local.deleteLegacyQuickNotesIfUnchanged).toHaveBeenCalledWith(legacy);
    expect(local.legacy()).toBeNull();
    expect(result.state.quickNotesMigration).toBeUndefined();
    expect(result.status).toBe('synced');
  });

  it('re-enters prompt without deleting a newer legacy edit made during upload', async () => {
    const legacy: QuickNotesConfig = {
      'default:expense': [{ id: 'coffee', icon: 'Coffee', label: 'Coffee' }],
    };
    const newerLegacy: QuickNotesConfig = {
      'default:expense': [{ id: 'tea', icon: 'CupSoda', label: 'Tea' }],
    };
    const local = memoryLocal(localSnapshot(), null, legacy);
    const remote = remoteAdapter(remoteSettings());
    vi.mocked(remote.replaceSection).mockImplementationOnce(async (_sheetId, _section, value) => {
      local.editLegacy(newerLegacy);
      return { status: 'ok', present: true, value };
    });

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(local.legacy()).toEqual(newerLegacy);
    expect(result.migrationDecision).toBe('prompt');
    expect(result.state.quickNotesMigration).toEqual({
      intent: 'prompt',
      sourceFingerprint: fingerprintQuickNotesConfig(newerLegacy),
      phase: 'pending',
    });
    expect(result.status).toBe('pending');
  });

  it('clears migration intent when legacy Quick Notes are emptied during upload', async () => {
    const legacy: QuickNotesConfig = {
      'default:expense': [{ id: 'coffee', icon: 'Coffee', label: 'Coffee' }],
    };
    const local = memoryLocal(localSnapshot(), null, legacy);
    const remote = remoteAdapter(remoteSettings());
    vi.mocked(remote.replaceSection).mockImplementationOnce(
      async (_sheetId, _section, value) => {
        local.editLegacy({});
        return { status: 'ok', present: true, value };
      },
    );

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(local.legacy()).toEqual({});
    expect(result.state.quickNotesMigration).toBeUndefined();
    expect(result.status).toBe('synced');
  });

  it('keeps legacy data and prompts when migration write readback diverges', async () => {
    const legacy: QuickNotesConfig = {
      'default:expense': [{ id: 'coffee', icon: 'Coffee', label: 'Coffee' }],
    };
    const sheetWinner: QuickNotesConfig = {
      'default:income': [{ id: 'salary', icon: 'Wallet', label: 'Salary' }],
    };
    const local = memoryLocal(localSnapshot(), null, legacy);
    const remote = remoteAdapter(remoteSettings());
    vi.mocked(remote.replaceSection).mockResolvedValueOnce({
      status: 'ok',
      present: true,
      value: sheetWinner,
    });

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(local.current().quickNotes).toEqual(sheetWinner);
    expect(local.legacy()).toEqual(legacy);
    expect(local.deleteLegacyQuickNotesIfUnchanged).not.toHaveBeenCalled();
    expect(result.conflicts).toContain('quickNotes');
    expect(result.state.quickNotesMigration).toEqual({
      intent: 'prompt',
      sourceFingerprint: fingerprintQuickNotesConfig(legacy),
      phase: 'applied',
      appliedScopedFingerprint: fingerprintQuickNotesConfig(legacy),
    });
    expect(result.migrationDecision).toBe('prompt');
    expect(result.status).toBe('pending');
  });

  it('sanitizes divergent Quick Note readback and keeps the cleanup pushable', async () => {
    const legacy: QuickNotesConfig = {
      'default:expense': [{ id: 'legacy', icon: 'Coffee', label: 'Legacy' }],
    };
    const orphanedSheetWinner: QuickNotesConfig = {
      'default:expense': [
        {
          id: 'winner',
          icon: 'Coffee',
          label: 'Winner',
          account: 'Missing account',
        },
      ],
      'expense:Missing category': [
        { id: 'orphan', icon: 'Circle', label: 'Orphan category' },
      ],
    };
    const localSettings = localSnapshot({
      quickNotes: legacy,
      quickNotesPresent: true,
    });
    const state: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user-a'),
      dirty: ['quickNotes'],
      quickNotesMigration: {
        intent: 'auto-import',
        sourceFingerprint: fingerprintQuickNotesConfig(legacy),
        phase: 'applied',
        appliedScopedFingerprint: fingerprintQuickNotesConfig(legacy),
      },
    };
    const local = memoryLocal(localSettings, state, legacy);
    const remote = remoteAdapter(remoteSettings());
    vi.mocked(remote.replaceSection).mockResolvedValueOnce({
      status: 'ok',
      present: true,
      value: orphanedSheetWinner,
    });

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(local.current().quickNotes).toEqual({
      'default:expense': [
        { id: 'winner', icon: 'Coffee', label: 'Winner' },
      ],
    });
    expect(result.conflicts).toContain('quickNotes');
    expect(result.state.baselines.quickNotes).toBe(
      fingerprintSettingsSection(
        { ...localSettings, quickNotes: orphanedSheetWinner },
        'quickNotes',
      ),
    );
    expect(result.state.dirty).toContain('quickNotes');
    expect(result.state.quickNotesMigration?.intent).toBe('prompt');
    expect(local.deleteLegacyQuickNotesIfUnchanged).not.toHaveBeenCalled();
    expect(local.legacy()).toEqual(legacy);
    expect(result.status).toBe('pending');
  });

  it('does not delete or finish a migration when sanitation changes the legacy value', async () => {
    const legacy: QuickNotesConfig = {
      'default:expense': [
        {
          id: 'coffee',
          icon: 'Coffee',
          label: 'Coffee',
          account: 'Missing account',
        },
      ],
    };
    const local = memoryLocal(localSnapshot(), null, legacy);
    const remote = remoteAdapter(remoteSettings());

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    const sanitized = {
      'default:expense': [{ id: 'coffee', icon: 'Coffee', label: 'Coffee' }],
    };
    expect(remote.replaceSection).toHaveBeenCalledWith('sheet-a', 'quickNotes', sanitized);
    expect(local.current().quickNotes).toEqual(sanitized);
    expect(local.legacy()).toEqual(legacy);
    expect(local.deleteLegacyQuickNotesIfUnchanged).not.toHaveBeenCalled();
    expect(result.state.quickNotesMigration).toEqual({
      intent: 'prompt',
      sourceFingerprint: fingerprintQuickNotesConfig(legacy),
      phase: 'applied',
      appliedScopedFingerprint: fingerprintQuickNotesConfig(legacy),
    });
    expect(result.status).toBe('pending');
  });

  it('resets a stale Quick Note baseline before an automatic legacy import', async () => {
    const legacy: QuickNotesConfig = {
      'default:expense': [{ id: 'coffee', icon: 'Coffee', label: 'Coffee' }],
    };
    const staleRemote: QuickNotesConfig = {
      'default:income': [{ id: 'old', icon: 'Wallet', label: 'Old' }],
    };
    const initial = localSnapshot();
    const staleState: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user-a'),
      baselines: {
        accounts: '',
        categories: '',
        quickNotes: fingerprintSettingsSection(
          { ...initial, quickNotes: staleRemote },
          'quickNotes',
        ),
      },
    };
    const local = memoryLocal(initial, staleState, legacy);
    const remote = remoteAdapter(remoteSettings());

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(remote.replaceSection).toHaveBeenCalledWith('sheet-a', 'quickNotes', legacy);
    expect(result.conflicts).not.toContain('quickNotes');
    expect(local.legacy()).toBeNull();
    expect(result.status).toBe('synced');
  });

  it('upgrades a phase-less pending auto-import and resets its stale baseline', async () => {
    const legacy: QuickNotesConfig = {
      'default:expense': [{ id: 'coffee', icon: 'Coffee', label: 'Coffee' }],
    };
    const staleRemote: QuickNotesConfig = {
      'default:income': [{ id: 'old', icon: 'Wallet', label: 'Old' }],
    };
    const initial = localSnapshot();
    const legacyState: SettingsSyncState = {
      ...createDefaultSettingsSyncState('user-a'),
      baselines: {
        accounts: '',
        categories: '',
        quickNotes: fingerprintSettingsSection(
          { ...initial, quickNotes: staleRemote },
          'quickNotes',
        ),
      },
      quickNotesMigration: {
        intent: 'auto-import',
        sourceFingerprint: fingerprintQuickNotesConfig(legacy),
      },
    };
    const local = memoryLocal(initial, legacyState, legacy);
    const remote = remoteAdapter(remoteSettings());

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(remote.replaceSection).toHaveBeenCalledWith(
      'sheet-a',
      'quickNotes',
      legacy,
    );
    expect(result.conflicts).not.toContain('quickNotes');
    expect(local.legacy()).toBeNull();
    expect(result.status).toBe('synced');
  });

  it('persists prompt and explicit migration intent across invalid remote reads', async () => {
    const legacy: QuickNotesConfig = {
      'default:expense': [{ id: 'coffee', icon: 'Coffee', label: 'Coffee' }],
    };
    const local = memoryLocal(localSnapshot(), null, legacy);
    const invalidRemote = remoteAdapter(
      remoteSettings({
        quickNotes: {
          status: 'invalid',
          present: true,
          error: 'Quick Note row 3: Duplicate note ID "coffee".',
        },
      }),
    );

    const prompted = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 2,
      local,
      remote: invalidRemote,
    });
    expect(prompted.state.quickNotesMigration).toEqual({
      intent: 'prompt',
      sourceFingerprint: fingerprintQuickNotesConfig(legacy),
      phase: 'pending',
    });

    const explicit = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 2,
      importLegacyQuickNotes: true,
      local,
      remote: invalidRemote,
    });
    expect(explicit.state.quickNotesMigration).toEqual({
      intent: 'explicit-import',
      sourceFingerprint: fingerprintQuickNotesConfig(legacy),
      phase: 'applied',
      appliedScopedFingerprint: fingerprintQuickNotesConfig(legacy),
    });
    expect(explicit.status).toBe('error');

    const healthyRemote = remoteAdapter(remoteSettings());
    const resumed = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 2,
      local,
      remote: healthyRemote,
    });
    expect(healthyRemote.replaceSection).toHaveBeenCalledWith(
      'sheet-a',
      'quickNotes',
      legacy,
    );
    expect(resumed.state.quickNotesMigration).toBeUndefined();
    expect(resumed.status).toBe('synced');
  });

  it('returns an error snapshot that cannot mutate the returned durable state', async () => {
    const local = memoryLocal(
      localSnapshot(),
      createDefaultSettingsSyncState('user-a'),
    );
    const remote = remoteAdapter(
      remoteSettings({
        accounts: {
          status: 'invalid',
          present: true,
          error: 'Account row 2: Name is required.',
        },
      }),
    );

    const result = await reconcileSettings({
      sheetId: 'sheet-a',
      verifiedUserId: 'user-a',
      verifiedWorkspaceCount: 1,
      local,
      remote,
    });

    expect(result.errors).not.toBe(result.state.errors);
    result.errors.accounts = 'mutated by caller';
    expect(result.state.errors.accounts).toBe('Account row 2: Name is required.');
    expect(local.currentState()?.errors.accounts).toBe(
      'Account row 2: Name is required.',
    );
  });
});
