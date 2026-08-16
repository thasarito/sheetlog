import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../lib/db';
import { advanceSessionTokenGeneration } from '../app/providers/session/session.generation';
import { replaceSheetSettingsSection } from '../lib/googleSettings';
import {
  getDefaultOnboardingState,
  getOnboardingStateKey,
  setOnboardingState,
} from '../lib/settings';
import {
  dexieSettingsLocalRepository,
  readLocalOnboardingState,
} from '../lib/settingsLocalRepository';
import * as settingsLocalRepository from '../lib/settingsLocalRepository';
import type { SettingsReconciliationResult } from '../lib/settingsReconciliation';
import type { OnboardingState } from '../lib/types';
import {
  createDefaultSettingsSyncState,
  getSettingsSyncStorageKey,
  markSettingsSectionDirty,
  readSettingsSyncState,
  writeQuickNotesConfig,
  writeSettingsSyncState,
} from '../lib/settingsSync';
import {
  onboardingKeys,
  settingsKeys,
  useImportLegacyQuickNotes,
  useOnboardingQuery,
  useOnboardingSync,
  useUpdateOnboarding,
} from './useOnboardingQuery';
import { useAccountMutations } from './useAccountMutations';
import { useCategoryMutations } from './useCategoryMutations';
import { useOnboarding } from './useOnboarding';
import { useQuickNotesQuery } from './useQuickNotes';

const providerState = vi.hoisted(() => ({
  accessToken: 'token-a' as string | null,
  userId: 'user-a' as string | null,
  status: 'authenticated',
  sheetId: 'sheet-a' as string | null,
  isOnline: false,
  signOut: vi.fn(),
}));

const googleSettingsMocks = vi.hoisted(() => ({
  readSheetSettingsConfig: vi.fn(),
  replaceSheetSettingsSection: vi.fn(),
}));

const runnerMocks = vi.hoisted(() => ({
  runSettingsReconciliation: vi.fn(),
}));

vi.mock('../app/providers', () => ({
  useSession: () => ({
    accessToken: providerState.accessToken,
    userProfile: providerState.userId
      ? { id: providerState.userId, name: providerState.userId, picture: null }
      : null,
    status: providerState.status,
    signOut: providerState.signOut,
  }),
  useWorkspace: () => ({ sheetId: providerState.sheetId }),
  useConnectivity: () => ({ isOnline: providerState.isOnline }),
}));

vi.mock('../lib/googleSettings', () => googleSettingsMocks);
vi.mock('../lib/settingsReconciliationRunner', () => runnerMocks);
vi.mock('../lib/mock', () => ({
  IS_DEV_MODE: false,
  writeOnboardingConfig: vi.fn(),
}));

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 60_000, networkMode: 'offlineFirst' },
      mutations: { retry: false, networkMode: 'offlineFirst' },
    },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }
  return { queryClient, wrapper: Wrapper };
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

function cachedSettingsScopeQueries(
  queryClient: QueryClient,
  sheetId: string,
  userId: string,
) {
  return queryClient
    .getQueryCache()
    .getAll()
    .filter(({ queryKey }) => {
      const [family, , cachedSheetId, cachedUserId] = queryKey;
      return (
        (family === 'onboarding' ||
          family === 'settings' ||
          family === 'quickNotes') &&
        cachedSheetId === sheetId &&
        cachedUserId === userId
      );
    });
}

describe('settings-backed onboarding hooks', () => {
  beforeEach(async () => {
    providerState.accessToken = 'token-a';
    providerState.userId = 'user-a';
    providerState.status = 'authenticated';
    providerState.sheetId = 'sheet-a';
    providerState.isOnline = false;
    providerState.signOut.mockReset();
    googleSettingsMocks.readSheetSettingsConfig.mockReset();
    googleSettingsMocks.replaceSheetSettingsSection.mockReset();
    runnerMocks.runSettingsReconciliation.mockReset().mockResolvedValue({
      state: createDefaultSettingsSyncState('user-a'),
      changed: [],
      pushed: [],
      conflicts: [],
      errors: {},
      migrationDecision: 'none',
      migrationApplied: false,
      status: 'synced',
    });
    onlineManager.setOnline(false);
    window.localStorage.clear();
    await db.settings.clear();
  });

  afterEach(async () => {
    cleanup();
    onlineManager.setOnline(true);
    await db.settings.clear();
  });

  it('resolves an offline scoped update after durable data and dirty state are committed', async () => {
    const { queryClient, wrapper } = createHarness();
    const { result } = renderHook(
      () => ({
        local: useOnboardingQuery(),
        update: useUpdateOnboarding(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.local.isSuccess).toBe(true));

    await act(async () => {
      await result.current.update.mutateAsync({
        accounts: [],
        accountsConfirmed: true,
      });
    });

    await expect(
      dexieSettingsLocalRepository.readSettings('sheet-a'),
    ).resolves.toMatchObject({ accounts: [], accountsConfirmed: true });
    await expect(readSettingsSyncState('sheet-a', 'user-a')).resolves.toMatchObject({
      dirty: ['accounts'],
    });
    expect(
      queryClient.getQueryData(['onboarding', 'state', 'sheet-a', 'user-a']),
    ).toMatchObject({ accounts: [], accountsConfirmed: true });
    expect(
      queryClient.getQueryData(
        settingsKeys.state('sheet-a', 'user-a'),
      ),
    ).toMatchObject({ dirty: ['accounts'] });
    expect(replaceSheetSettingsSection).not.toHaveBeenCalled();
  });

  it('preserves an unconfirmed draft without queueing its section', async () => {
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useUpdateOnboarding(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        accounts: [{ name: 'Draft wallet' }],
        accountsConfirmed: false,
      });
    });

    await expect(
      dexieSettingsLocalRepository.readSettings('sheet-a'),
    ).resolves.toMatchObject({
      accounts: [expect.objectContaining({ name: 'Draft wallet' })],
      accountsConfirmed: false,
    });
    await expect(readSettingsSyncState('sheet-a', 'user-a')).resolves.toMatchObject({
      dirty: [],
    });
    expect(replaceSheetSettingsSection).not.toHaveBeenCalled();
  });

  it('runs the online-only reconciliation query automatically when connectivity returns', async () => {
    const { queryClient, wrapper } = createHarness();
    const { result, rerender } = renderHook(() => useOnboardingSync(), {
      wrapper,
    });

    expect(runnerMocks.runSettingsReconciliation).not.toHaveBeenCalled();
    expect(
      queryClient.getQueryCache().find({
        queryKey: settingsKeys.sync('sheet-a', 'user-a'),
        exact: true,
      })?.options.networkMode,
    ).toBe('online');

    act(() => {
      providerState.isOnline = true;
      onlineManager.setOnline(true);
      rerender();
    });

    await waitFor(() => {
      expect(runnerMocks.runSettingsReconciliation).toHaveBeenCalledWith({
        accessToken: 'token-a',
        sheetId: 'sheet-a',
        verifiedUserId: 'user-a',
        verifiedWorkspaceCount: 1,
        signOut: providerState.signOut,
      });
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it('reconciles on TanStack reconnect before the connectivity context rerenders', async () => {
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(
      settingsKeys.sync('sheet-a', 'user-a'),
      {
        state: createDefaultSettingsSyncState('user-a'),
        changed: [],
        pushed: [],
        conflicts: [],
        errors: {},
        migrationDecision: 'none',
        migrationApplied: false,
        status: 'synced',
      },
      { updatedAt: Date.now() },
    );
    renderHook(() => useOnboardingSync(), { wrapper });
    expect(runnerMocks.runSettingsReconciliation).not.toHaveBeenCalled();

    act(() => {
      onlineManager.setOnline(true);
    });

    await waitFor(() => {
      expect(runnerMocks.runSettingsReconciliation).toHaveBeenCalledTimes(1);
    });
    expect(providerState.isOnline).toBe(false);
  });

  it('rejects manual refresh immediately offline while reconnect still reconciles', async () => {
    const cachedResult: SettingsReconciliationResult = {
      state: createDefaultSettingsSyncState('user-a'),
      changed: [],
      pushed: [],
      conflicts: [],
      errors: {},
      migrationDecision: 'none',
      migrationApplied: false,
      status: 'synced',
    };
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(
      settingsKeys.sync('sheet-a', 'user-a'),
      cachedResult,
      { updatedAt: Date.now() },
    );
    const { result } = renderHook(() => useOnboarding(), { wrapper });
    const outcome = result.current.refreshSettings().then(
      () => 'resolved' as const,
      () => 'rejected' as const,
    );
    let settledBeforeReconnect = false;
    void outcome.then(() => {
      settledBeforeReconnect = true;
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    });

    act(() => {
      onlineManager.setOnline(true);
    });
    await waitFor(() => {
      expect(runnerMocks.runSettingsReconciliation).toHaveBeenCalledTimes(1);
    });

    expect(settledBeforeReconnect).toBe(true);
    await expect(outcome).resolves.toBe('rejected');
  });

  it('does not restore old-scope settings caches after an auth failure signs out', async () => {
    providerState.isOnline = true;
    onlineManager.setOnline(true);
    const request = deferred<never>();
    const { queryClient, wrapper } = createHarness();
    providerState.signOut.mockImplementation(() => {
      advanceSessionTokenGeneration();
      providerState.accessToken = null;
      providerState.userId = null;
      queryClient.removeQueries({ queryKey: onboardingKeys.all });
      queryClient.removeQueries({ queryKey: settingsKeys.all });
      queryClient.removeQueries({ queryKey: ['quickNotes'] });
    });
    runnerMocks.runSettingsReconciliation.mockImplementation(async (options) => {
      try {
        return await request.promise;
      } catch (error) {
        options.signOut(options.accessToken);
        throw error;
      }
    });
    const { rerender } = renderHook(() => useOnboardingSync(), { wrapper });
    await waitFor(() => {
      expect(runnerMocks.runSettingsReconciliation).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      request.reject(new Error('Google returned 401'));
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    });
    rerender();

    await waitFor(() => {
      expect(
        queryClient.getQueryCache().find({
          queryKey: onboardingKeys.state('sheet-a', 'user-a'),
          exact: true,
        }),
      ).toBeUndefined();
      expect(
        queryClient.getQueryCache().find({
          queryKey: settingsKeys.state('sheet-a', 'user-a'),
          exact: true,
        }),
      ).toBeUndefined();
      expect(
        queryClient.getQueryCache().find({
          queryKey: ['quickNotes', 'state', 'sheet-a', 'user-a'],
          exact: true,
        }),
      ).toBeUndefined();
    });
    expect(cachedSettingsScopeQueries(queryClient, 'sheet-a', 'user-a')).toEqual(
      [],
    );
  });

  it('does not restore old-scope settings caches when a deferred sync succeeds after signout', async () => {
    providerState.isOnline = true;
    onlineManager.setOnline(true);
    const request = deferred<SettingsReconciliationResult>();
    const { queryClient, wrapper } = createHarness();
    runnerMocks.runSettingsReconciliation.mockReturnValue(request.promise);
    const { rerender } = renderHook(() => useOnboardingSync(), { wrapper });
    await waitFor(() => {
      expect(runnerMocks.runSettingsReconciliation).toHaveBeenCalledTimes(1);
    });

    advanceSessionTokenGeneration();
    providerState.accessToken = null;
    providerState.userId = null;
    queryClient.removeQueries({ queryKey: onboardingKeys.all });
    queryClient.removeQueries({ queryKey: settingsKeys.all });
    queryClient.removeQueries({ queryKey: ['quickNotes'] });
    rerender();
    await act(async () => {
      request.resolve({
        state: createDefaultSettingsSyncState('user-a'),
        changed: ['accounts'],
        pushed: [],
        conflicts: [],
        errors: {},
        migrationDecision: 'none',
        migrationApplied: false,
        status: 'synced',
      });
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    });

    expect(
      queryClient.getQueryCache().find({
        queryKey: onboardingKeys.state('sheet-a', 'user-a'),
        exact: true,
      }),
    ).toBeUndefined();
    expect(cachedSettingsScopeQueries(queryClient, 'sheet-a', 'user-a')).toEqual(
      [],
    );
    expect(
      queryClient.getQueryCache().find({
        queryKey: settingsKeys.state('sheet-a', 'user-a'),
        exact: true,
      }),
    ).toBeUndefined();
    expect(
      queryClient.getQueryCache().find({
        queryKey: ['quickNotes', 'state', 'sheet-a', 'user-a'],
        exact: true,
      }),
    ).toBeUndefined();
  });

  it('does not restore old-scope caches when a deferred legacy import succeeds after signout', async () => {
    providerState.isOnline = true;
    onlineManager.setOnline(true);
    const request = deferred<SettingsReconciliationResult>();
    runnerMocks.runSettingsReconciliation.mockReturnValue(request.promise);
    const { queryClient, wrapper } = createHarness();
    const { result, rerender } = renderHook(
      () => useImportLegacyQuickNotes(),
      { wrapper },
    );
    let mutation!: Promise<SettingsReconciliationResult>;
    act(() => {
      mutation = result.current.mutateAsync();
    });
    await waitFor(() => {
      expect(runnerMocks.runSettingsReconciliation).toHaveBeenCalledTimes(1);
    });

    act(() => {
      advanceSessionTokenGeneration();
      providerState.accessToken = null;
      providerState.userId = null;
      queryClient.removeQueries({ queryKey: onboardingKeys.all });
      queryClient.removeQueries({ queryKey: settingsKeys.all });
      queryClient.removeQueries({ queryKey: ['quickNotes'] });
    });
    await act(async () => {
      request.resolve({
        state: createDefaultSettingsSyncState('user-a'),
        changed: ['quickNotes'],
        pushed: ['quickNotes'],
        conflicts: [],
        errors: {},
        migrationDecision: 'auto-import',
        migrationApplied: true,
        status: 'synced',
      });
      await mutation;
    });
    rerender();

    expect(
      queryClient.getQueryCache().find({
        queryKey: onboardingKeys.state('sheet-a', 'user-a'),
        exact: true,
      }),
    ).toBeUndefined();
    expect(
      queryClient.getQueryCache().find({
        queryKey: settingsKeys.state('sheet-a', 'user-a'),
        exact: true,
      }),
    ).toBeUndefined();
    expect(
      queryClient.getQueryCache().find({
        queryKey: settingsKeys.sync('sheet-a', 'user-a'),
        exact: true,
      }),
    ).toBeUndefined();
  });

  it('applies account edits against the current durable onboarding state', async () => {
    await setOnboardingState(
      {
        ...getDefaultOnboardingState(),
        accounts: [{ name: 'Wallet', icon: 'WalletCards', color: '#111111' }],
        accountsConfirmed: true,
      },
      'sheet-a',
    );
    const { wrapper } = createHarness();
    const { result } = renderHook(
      () => ({
        local: useOnboardingQuery(),
        accounts: useAccountMutations(vi.fn()),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.local.isSuccess).toBe(true));

    await act(async () => {
      await result.current.accounts.addAccount.mutateAsync({ name: 'Bank' });
    });

    await expect(
      dexieSettingsLocalRepository.readSettings('sheet-a'),
    ).resolves.toMatchObject({
      accounts: [
        { name: 'Wallet', icon: 'WalletCards', color: '#111111' },
        expect.objectContaining({ name: 'Bank' }),
      ],
      accountsConfirmed: true,
    });
  });

  it('persists a deferred onboarding write without restoring old-scope caches after signout', async () => {
    const started = deferred<void>();
    const release = deferred<void>();
    const originalMutation = settingsLocalRepository.mutateLocalOnboarding;
    const mutationSpy = vi
      .spyOn(settingsLocalRepository, 'mutateLocalOnboarding')
      .mockImplementation(async (...args) => {
        started.resolve();
        await release.promise;
        return originalMutation(...args);
      });
    const { queryClient, wrapper } = createHarness();
    const { result, unmount } = renderHook(() => useUpdateOnboarding(), {
      wrapper,
    });
    let mutation!: Promise<OnboardingState>;
    await act(async () => {
      mutation = result.current.mutateAsync({
        accounts: [{ name: 'Old account local value' }],
        accountsConfirmed: true,
      });
      await started.promise;
    });

    act(() => {
      advanceSessionTokenGeneration();
      providerState.accessToken = null;
      providerState.userId = null;
      unmount();
      queryClient.removeQueries({ queryKey: onboardingKeys.all });
      queryClient.removeQueries({ queryKey: settingsKeys.all });
      queryClient.removeQueries({ queryKey: ['quickNotes'] });
    });
    await act(async () => {
      release.resolve();
      await mutation;
    });

    await expect(readLocalOnboardingState('sheet-a')).resolves.toMatchObject({
      accounts: [{ name: 'Old account local value' }],
      accountsConfirmed: true,
    });
    expect(
      queryClient.getQueryCache().find({
        queryKey: onboardingKeys.state('sheet-a', 'user-a'),
        exact: true,
      }),
    ).toBeUndefined();
    expect(
      queryClient.getQueryCache().find({
        queryKey: settingsKeys.state('sheet-a', 'user-a'),
        exact: true,
      }),
    ).toBeUndefined();
    mutationSpy.mockRestore();
  });

  it('applies category edits against the current durable onboarding state', async () => {
    const initial = {
      ...getDefaultOnboardingState(),
      categoriesConfirmed: true,
    };
    await setOnboardingState(initial, 'sheet-a');
    const { wrapper } = createHarness();
    const { result } = renderHook(
      () => ({
        local: useOnboardingQuery(),
        categories: useCategoryMutations(vi.fn()),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.local.isSuccess).toBe(true));

    await act(async () => {
      await result.current.categories.addCategory.mutateAsync({
        name: 'Custom expense',
        categoryType: 'expense',
      });
    });

    const stored = await dexieSettingsLocalRepository.readSettings('sheet-a');
    expect(stored.categories.expense.at(-1)).toMatchObject({
      name: 'Custom expense',
    });
    expect(stored.categories.income).toEqual(initial.categories.income);
    expect(stored.categories.transfer).toEqual(initial.categories.transfer);
  });

  it('exposes reconciliation result, migration prompt, and explicit import action', async () => {
    providerState.isOnline = true;
    onlineManager.setOnline(true);
    const promptState = {
      ...markSettingsSectionDirty(
        createDefaultSettingsSyncState('user-a'),
        'quickNotes',
      ),
      quickNotesMigration: {
        intent: 'prompt' as const,
        sourceFingerprint: 'legacy-fingerprint',
        phase: 'pending' as const,
      },
    };
    await writeSettingsSyncState('sheet-a', 'user-a', promptState);
    runnerMocks.runSettingsReconciliation.mockImplementation(async (options) =>
      options.importLegacyQuickNotes
        ? {
            state: createDefaultSettingsSyncState('user-a'),
            changed: ['quickNotes'],
            pushed: ['quickNotes'],
            conflicts: [],
            errors: {},
            migrationDecision: 'none',
            migrationApplied: true,
            status: 'synced',
          }
        : {
            state: promptState,
            changed: [],
            pushed: [],
            conflicts: ['quickNotes'],
            errors: {},
            migrationDecision: 'prompt',
            migrationApplied: false,
            status: 'pending',
          },
    );
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useOnboarding(), { wrapper });

    await waitFor(() => {
      expect(result.current.settingsSyncResult?.migrationDecision).toBe(
        'prompt',
      );
    });
    expect(result.current.settingsSyncStatus).toBe('pending');
    expect(result.current.hasLegacyQuickNotesMigrationPrompt).toBe(true);
    expect(result.current.settingsSyncResult?.conflicts).toEqual([
      'quickNotes',
    ]);

    let importedStatus: string | undefined;
    await act(async () => {
      importedStatus = (await result.current.importLegacyQuickNotes()).status;
    });

    expect(importedStatus).toBe('synced');
    expect(runnerMocks.runSettingsReconciliation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accessToken: 'token-a',
        sheetId: 'sheet-a',
        verifiedUserId: 'user-a',
        importLegacyQuickNotes: true,
      }),
    );
  });

  it('derives error status from a failed reconciliation and rejects manual refresh', async () => {
    providerState.isOnline = true;
    onlineManager.setOnline(true);
    runnerMocks.runSettingsReconciliation.mockRejectedValue(
      new TypeError('Network unavailable'),
    );
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useOnboarding(), { wrapper });
    await waitFor(() => {
      expect(result.current.settingsSyncStatus).toBe('error');
      expect(result.current.settingsSyncError?.message).toBe(
        'Network unavailable',
      );
    });

    await act(async () => {
      await expect(result.current.refreshSettings()).rejects.toThrow(
        'Network unavailable',
      );
    });
    const stored = await readSettingsSyncState('sheet-a', 'user-a');
    expect(stored?.dirty ?? []).toEqual([]);
  });

  it('surfaces corrupt scoped onboarding through the public settings error API', async () => {
    await db.settings.put({
      key: getOnboardingStateKey('sheet-a'),
      value: '{malformed',
      updatedAt: '2026-08-16T00:00:00.000Z',
    });
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useOnboarding(), { wrapper });

    await waitFor(() => {
      expect(result.current.settingsSyncStatus).toBe('error');
    });
    expect(result.current.settingsSyncError?.message).toContain(
      'onboardingState:sheet-a',
    );
    expect(result.current.onboarding).toEqual(getDefaultOnboardingState());
  });

  it('surfaces corrupt durable sync state while offline', async () => {
    await db.settings.put({
      key: getSettingsSyncStorageKey('sheet-a', 'user-a'),
      value: JSON.stringify({ targetUserId: 'wrong-user' }),
      updatedAt: '2026-08-16T00:00:00.000Z',
    });
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useOnboarding(), { wrapper });

    await waitFor(() => {
      expect(result.current.settingsSyncStatus).toBe('error');
    });
    expect(result.current.settingsSyncError?.message).toContain(
      'targetUserId does not match',
    );
  });

  it('refreshes engine-written durable errors after an explicit import fails', async () => {
    providerState.isOnline = true;
    onlineManager.setOnline(true);
    const clean = createDefaultSettingsSyncState('user-a');
    await writeSettingsSyncState('sheet-a', 'user-a', clean);
    runnerMocks.runSettingsReconciliation.mockImplementation(async (options) => {
      if (!options.importLegacyQuickNotes) {
        return {
          state: clean,
          changed: [],
          pushed: [],
          conflicts: [],
          errors: {},
          migrationDecision: 'none',
          migrationApplied: false,
          status: 'synced',
        };
      }
      await writeSettingsSyncState('sheet-a', 'user-a', {
        ...markSettingsSectionDirty(clean, 'quickNotes'),
        errors: { quickNotes: 'Remote import failed' },
      });
      throw new TypeError('Import network failed');
    });
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useOnboarding(), { wrapper });
    await waitFor(() => {
      expect(result.current.settingsSyncStatus).toBe('synced');
    });

    await act(async () => {
      await expect(result.current.importLegacyQuickNotes()).rejects.toThrow(
        'Import network failed',
      );
    });

    await waitFor(() => {
      expect(result.current.settingsSyncState).toMatchObject({
        dirty: ['quickNotes'],
        errors: { quickNotes: 'Remote import failed' },
      });
    });
    expect(result.current.settingsSyncStatus).toBe('error');
    expect(result.current.settingsSyncError?.message).toBe(
      'Import network failed',
    );
  });

  it('keeps a successful local mutation and dirty cache state when Google reconciliation fails', async () => {
    providerState.isOnline = true;
    onlineManager.setOnline(true);
    const followUp = deferred<never>();
    runnerMocks.runSettingsReconciliation
      .mockRejectedValueOnce(new TypeError('Google network failed'))
      .mockReturnValueOnce(followUp.promise);
    const { queryClient, wrapper } = createHarness();
    const { result } = renderHook(() => useOnboarding(), { wrapper });
    await waitFor(() => expect(result.current.settingsSyncStatus).toBe('error'));

    await act(async () => {
      await expect(
        result.current.updateOnboarding({
          accounts: [{ name: 'Offline wallet' }],
          accountsConfirmed: true,
        }),
      ).resolves.toMatchObject({
        accounts: [expect.objectContaining({ name: 'Offline wallet' })],
      });
    });
    await waitFor(() => {
      expect(runnerMocks.runSettingsReconciliation).toHaveBeenCalledTimes(2);
      expect(result.current.isSyncing).toBe(true);
    });
    await act(async () => {
      followUp.reject(new TypeError('Google network failed'));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.isSyncing).toBe(false));

    await expect(readSettingsSyncState('sheet-a', 'user-a')).resolves.toMatchObject({
      dirty: ['accounts'],
    });
    expect(
      queryClient.getQueryData(
        onboardingKeys.state('sheet-a', 'user-a'),
      ),
    ).toMatchObject({
      accounts: [expect.objectContaining({ name: 'Offline wallet' })],
      accountsConfirmed: true,
    });
  });

  it('runs one follow-up when a local mutation stays dirty after an active initial sync', async () => {
    providerState.isOnline = true;
    onlineManager.setOnline(true);
    const first = deferred<SettingsReconciliationResult>();
    const clean = createDefaultSettingsSyncState('user-a');
    runnerMocks.runSettingsReconciliation
      .mockReturnValueOnce(first.promise)
      .mockImplementationOnce(async () => {
        await writeSettingsSyncState('sheet-a', 'user-a', clean);
        return {
          state: clean,
          changed: [],
          pushed: ['accounts'],
          conflicts: [],
          errors: {},
          migrationDecision: 'none',
          migrationApplied: false,
          status: 'synced',
        };
      });
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useOnboarding(), { wrapper });
    await waitFor(() => {
      expect(runnerMocks.runSettingsReconciliation).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await result.current.updateOnboarding({
        accounts: [{ name: 'Concurrent local account' }],
        accountsConfirmed: true,
      });
    });
    expect(runnerMocks.runSettingsReconciliation).toHaveBeenCalledTimes(1);
    await expect(readSettingsSyncState('sheet-a', 'user-a')).resolves.toMatchObject({
      dirty: ['accounts'],
    });

    await act(async () => {
      first.resolve({
        state: clean,
        changed: [],
        pushed: [],
        conflicts: [],
        errors: {},
        migrationDecision: 'none',
        migrationApplied: false,
        status: 'synced',
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(runnerMocks.runSettingsReconciliation).toHaveBeenCalledTimes(2);
    });
    await expect(readSettingsSyncState('sheet-a', 'user-a')).resolves.toMatchObject({
      dirty: [],
    });
  });

  it('does not follow up an active sync that settles with a durable section error', async () => {
    providerState.isOnline = true;
    onlineManager.setOnline(true);
    const first = deferred<SettingsReconciliationResult>();
    const clean = createDefaultSettingsSyncState('user-a');
    runnerMocks.runSettingsReconciliation.mockReturnValueOnce(first.promise);
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useOnboarding(), { wrapper });
    await waitFor(() => {
      expect(runnerMocks.runSettingsReconciliation).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      await result.current.updateOnboarding({
        accounts: [{ name: 'Dirty account' }],
        accountsConfirmed: true,
      });
    });
    const failedState = {
      ...markSettingsSectionDirty(clean, 'accounts'),
      errors: { accounts: 'Remote accounts failed' },
    };
    await writeSettingsSyncState('sheet-a', 'user-a', failedState);

    await act(async () => {
      first.resolve({
        state: failedState,
        changed: [],
        pushed: [],
        conflicts: [],
        errors: failedState.errors,
        migrationDecision: 'none',
        migrationApplied: false,
        status: 'error',
      });
      await new Promise((resolve) => window.setTimeout(resolve, 30));
    });

    expect(runnerMocks.runSettingsReconciliation).toHaveBeenCalledTimes(1);
    expect(result.current.settingsSyncStatus).toBe('error');
  });

  it('does not follow up an active sync that settles with a migration prompt', async () => {
    providerState.isOnline = true;
    onlineManager.setOnline(true);
    const first = deferred<SettingsReconciliationResult>();
    const clean = createDefaultSettingsSyncState('user-a');
    runnerMocks.runSettingsReconciliation.mockReturnValueOnce(first.promise);
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useOnboarding(), { wrapper });
    await waitFor(() => {
      expect(runnerMocks.runSettingsReconciliation).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      await result.current.updateOnboarding({
        accounts: [{ name: 'Dirty account' }],
        accountsConfirmed: true,
      });
    });
    const promptState = {
      ...markSettingsSectionDirty(clean, 'quickNotes'),
      quickNotesMigration: {
        intent: 'prompt' as const,
        sourceFingerprint: 'legacy-fingerprint',
        phase: 'pending' as const,
      },
    };
    await writeSettingsSyncState('sheet-a', 'user-a', promptState);

    await act(async () => {
      first.resolve({
        state: promptState,
        changed: [],
        pushed: [],
        conflicts: [],
        errors: {},
        migrationDecision: 'prompt',
        migrationApplied: false,
        status: 'pending',
      });
      await new Promise((resolve) => window.setTimeout(resolve, 30));
    });

    expect(runnerMocks.runSettingsReconciliation).toHaveBeenCalledTimes(1);
    expect(result.current.hasLegacyQuickNotesMigrationPrompt).toBe(true);
  });

  it('schedules another bounded run for a new local edit during the follow-up', async () => {
    providerState.isOnline = true;
    onlineManager.setOnline(true);
    const first = deferred<SettingsReconciliationResult>();
    const second = deferred<SettingsReconciliationResult>();
    const clean = createDefaultSettingsSyncState('user-a');
    runnerMocks.runSettingsReconciliation
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockImplementationOnce(async () => {
        await writeSettingsSyncState('sheet-a', 'user-a', clean);
        return {
          state: clean,
          changed: [],
          pushed: ['accounts'],
          conflicts: [],
          errors: {},
          migrationDecision: 'none',
          migrationApplied: false,
          status: 'synced',
        };
      });
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useOnboarding(), { wrapper });
    await waitFor(() => {
      expect(runnerMocks.runSettingsReconciliation).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      await result.current.updateOnboarding({
        accounts: [{ name: 'First edit' }],
        accountsConfirmed: true,
      });
      first.resolve({
        state: clean,
        changed: [],
        pushed: [],
        conflicts: [],
        errors: {},
        migrationDecision: 'none',
        migrationApplied: false,
        status: 'synced',
      });
    });
    await waitFor(() => {
      expect(runnerMocks.runSettingsReconciliation).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      await result.current.updateOnboarding((current) => ({
        accounts: [...current.accounts, { name: 'Second edit' }],
      }));
    });
    expect(runnerMocks.runSettingsReconciliation).toHaveBeenCalledTimes(2);
    await act(async () => {
      second.resolve({
        state: clean,
        changed: [],
        pushed: [],
        conflicts: [],
        errors: {},
        migrationDecision: 'none',
        migrationApplied: false,
        status: 'synced',
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(runnerMocks.runSettingsReconciliation).toHaveBeenCalledTimes(3);
    });
    await expect(readSettingsSyncState('sheet-a', 'user-a')).resolves.toMatchObject({
      dirty: [],
    });
  });

  it('refreshes durable section errors into cache when reconciliation throws', async () => {
    const clean = createDefaultSettingsSyncState('user-a');
    await writeSettingsSyncState('sheet-a', 'user-a', clean);
    runnerMocks.runSettingsReconciliation.mockImplementation(async () => {
      await writeSettingsSyncState('sheet-a', 'user-a', {
        ...markSettingsSectionDirty(clean, 'accounts'),
        errors: { accounts: 'Remote accounts failed' },
      });
      throw new TypeError('Network unavailable');
    });
    const { wrapper } = createHarness();
    const { result, rerender } = renderHook(() => useOnboarding(), { wrapper });
    await waitFor(() => {
      expect(result.current.settingsSyncState).toEqual(clean);
    });

    act(() => {
      providerState.isOnline = true;
      onlineManager.setOnline(true);
      rerender();
    });
    await waitFor(() => {
      expect(result.current.settingsSyncStatus).toBe('error');
    });
    expect(result.current.settingsSyncState).toMatchObject({
      dirty: ['accounts'],
      errors: { accounts: 'Remote accounts failed' },
    });
  });

  it('replaces an inactive scoped Quick Notes cache after reconciliation', async () => {
    providerState.isOnline = true;
    onlineManager.setOnline(true);
    await writeQuickNotesConfig('sheet-a', {
      'default:expense': [
        { id: 'old', icon: 'NotebookPen', label: 'Old cached note' },
      ],
    });
    const { wrapper } = createHarness();
    const mounted = renderHook(() => useQuickNotesQuery(), { wrapper });
    await waitFor(() => {
      expect(mounted.result.current.data?.['default:expense']?.[0]?.id).toBe(
        'old',
      );
    });
    mounted.unmount();
    runnerMocks.runSettingsReconciliation.mockImplementationOnce(async () => {
      await writeQuickNotesConfig('sheet-a', {
        'default:expense': [
          { id: 'new', icon: 'NotebookPen', label: 'New remote note' },
        ],
      });
      return {
        state: createDefaultSettingsSyncState('user-a'),
        changed: ['quickNotes'],
        pushed: [],
        conflicts: [],
        errors: {},
        migrationDecision: 'none',
        migrationApplied: false,
        status: 'synced',
      };
    });
    const sync = renderHook(() => useOnboardingSync(), { wrapper });
    await waitFor(() => expect(sync.result.current.isSuccess).toBe(true));

    const remounted = renderHook(() => useQuickNotesQuery(), { wrapper });
    await waitFor(() => {
      expect(remounted.result.current.data?.['default:expense']?.[0]?.id).toBe(
        'new',
      );
    });
  });

  it('isolates local query data across account and Sheet handoffs', async () => {
    const sheetA = {
      ...getDefaultOnboardingState(),
      accounts: [{ name: 'Sheet A wallet' }],
    };
    const sheetB = {
      ...getDefaultOnboardingState(),
      accounts: [{ name: 'Sheet B wallet' }],
    };
    await Promise.all([
      setOnboardingState(sheetA, 'sheet-a'),
      setOnboardingState(sheetB, 'sheet-b'),
    ]);
    const [expectedA, expectedB] = await Promise.all([
      readLocalOnboardingState('sheet-a'),
      readLocalOnboardingState('sheet-b'),
    ]);
    const { queryClient, wrapper } = createHarness();
    const { result, rerender } = renderHook(() => useOnboardingQuery(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.data).toEqual(expectedA));
    queryClient.setQueryData(onboardingKeys.state('sheet-a', 'user-a'), {
      ...expectedA,
      accounts: [{ name: 'Account A cache only' }],
    });

    providerState.userId = 'user-b';
    rerender();
    await waitFor(() => expect(result.current.data).toEqual(expectedA));
    expect(
      queryClient.getQueryData(onboardingKeys.state('sheet-a', 'user-b')),
    ).toEqual(expectedA);

    providerState.sheetId = 'sheet-b';
    rerender();
    await waitFor(() => expect(result.current.data).toEqual(expectedB));
    expect(
      queryClient.getQueryData(onboardingKeys.state('sheet-a', 'user-a')),
    ).toMatchObject({ accounts: [{ name: 'Account A cache only' }] });
  });

  it('atomically preserves concurrent pre-Sheet functional onboarding updates', async () => {
    providerState.accessToken = null;
    providerState.userId = null;
    providerState.status = 'unauthenticated';
    providerState.sheetId = null;
    await setOnboardingState(getDefaultOnboardingState(), null);
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useUpdateOnboarding(), { wrapper });

    await act(async () => {
      await Promise.all([
        result.current.mutateAsync((current) => ({
          accounts: [...current.accounts, { name: 'Pre-Sheet account' }],
        })),
        result.current.mutateAsync((current) => ({
          categories: {
            ...current.categories,
            expense: [
              ...current.categories.expense,
              { name: 'Pre-Sheet category' },
            ],
          },
        })),
      ]);
    });

    const stored = JSON.parse(
      (await db.settings.get(getOnboardingStateKey(null)))?.value ?? 'null',
    ) as OnboardingState;
    expect(stored.accounts).toEqual([
      expect.objectContaining({ name: 'Pre-Sheet account' }),
    ]);
    expect(stored.categories.expense).toContainEqual(
      expect.objectContaining({ name: 'Pre-Sheet category' }),
    );
  });

  it('surfaces corrupt pre-Sheet onboarding and retains its original bytes', async () => {
    providerState.accessToken = null;
    providerState.userId = null;
    providerState.status = 'unauthenticated';
    providerState.sheetId = null;
    const storageKey = getOnboardingStateKey(null);
    await db.settings.put({
      key: storageKey,
      value: '{malformed pre-sheet',
      updatedAt: '2026-08-16T00:00:00.000Z',
    });
    const { wrapper } = createHarness();
    const { result } = renderHook(
      () => ({
        local: useOnboardingQuery(),
        update: useUpdateOnboarding(),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.local.isError).toBe(true));
    await act(async () => {
      await expect(
        result.current.update.mutateAsync({
          accounts: [{ name: 'Must not overwrite corruption' }],
        }),
      ).rejects.toMatchObject({ name: 'SettingsStorageCorruptionError' });
    });
    expect((await db.settings.get(storageKey))?.value).toBe(
      '{malformed pre-sheet',
    );
  });
});
