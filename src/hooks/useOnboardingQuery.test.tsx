import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../lib/db';
import { replaceSheetSettingsSection } from '../lib/googleSettings';
import {
  getDefaultOnboardingState,
  setOnboardingState,
} from '../lib/settings';
import {
  dexieSettingsLocalRepository,
  readLocalOnboardingState,
} from '../lib/settingsLocalRepository';
import {
  createDefaultSettingsSyncState,
  markSettingsSectionDirty,
  readSettingsSyncState,
  writeSettingsSyncState,
} from '../lib/settingsSync';
import {
  onboardingKeys,
  settingsKeys,
  useOnboardingQuery,
  useOnboardingSync,
  useUpdateOnboarding,
} from './useOnboardingQuery';
import { useAccountMutations } from './useAccountMutations';
import { useCategoryMutations } from './useCategoryMutations';
import { useOnboarding } from './useOnboarding';

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
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((_resolve, nextReject) => {
    reject = nextReject;
  });
  return { promise, reject };
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
});
