import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceSessionTokenGeneration } from '../app/providers/session/session.generation';
import { db } from '../lib/db';
import * as settingsLocalRepository from '../lib/settingsLocalRepository';
import {
  getQuickNotesStorageKey,
  readLegacyQuickNotesConfig,
  readQuickNotesConfig,
  readSettingsSyncState,
  writeQuickNotesConfig,
} from '../lib/settingsSync';
import type { QuickNotesConfig } from '../lib/types';
import {
  quickNotesKeys,
  useQuickNotesQuery,
  useUpdateDefaultQuickNotes,
  useUpdateQuickNotes,
} from './useQuickNotes';
import { settingsKeys } from './useOnboardingQuery';

const providerState = vi.hoisted(() => ({
  accessToken: 'token-a' as string | null,
  userId: 'user-a' as string | null,
  status: 'authenticated',
  sheetId: 'sheet-a' as string | null,
}));

vi.mock('../app/providers', () => ({
  useSession: () => ({
    accessToken: providerState.accessToken,
    userProfile: providerState.userId
      ? { id: providerState.userId, name: providerState.userId, picture: null }
      : null,
    status: providerState.status,
  }),
  useWorkspace: () => ({ sheetId: providerState.sheetId }),
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

function createWrapper() {
  return createHarness().wrapper;
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

const LEGACY_NOTES: QuickNotesConfig = {
  'default:expense': [
    { id: 'legacy', icon: 'NotebookPen', label: 'Legacy note' },
  ],
};

describe('scoped Quick Notes hooks', () => {
  beforeEach(async () => {
    providerState.accessToken = 'token-a';
    providerState.userId = 'user-a';
    providerState.status = 'authenticated';
    providerState.sheetId = 'sheet-a';
    onlineManager.setOnline(false);
    await db.settings.clear();
    await db.settings.put({
      key: 'quickNotes',
      value: JSON.stringify(LEGACY_NOTES),
      updatedAt: '2026-08-16T00:00:00.000Z',
    });
  });

  afterEach(async () => {
    cleanup();
    onlineManager.setOnline(true);
    await db.settings.clear();
  });

  it('shows legacy notes as a read-only fallback while scoped storage is missing', async () => {
    const { result } = renderHook(() => useQuickNotesQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(LEGACY_NOTES);
    expect(result.current.provenance).toBe('legacy');
    expect(result.current.isLegacyFallback).toBe(true);
    expect(await readQuickNotesConfig('sheet-a')).toBeNull();
  });

  it('treats a scoped empty config as authoritative over legacy fallback', async () => {
    await writeQuickNotesConfig('sheet-a', {});
    const { result } = renderHook(() => useQuickNotesQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({});
    expect(result.current.provenance).toBe('scoped');
    expect(result.current.isLegacyFallback).toBe(false);
  });

  it('surfaces corrupt scoped storage without falling back to healthy-looking legacy data', async () => {
    await db.settings.put({
      key: getQuickNotesStorageKey('sheet-a'),
      value: '{malformed scoped quick notes',
      updatedAt: '2026-08-16T00:00:00.000Z',
    });
    const { result } = renderHook(() => useQuickNotesQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.provenance).toBeNull();
    expect(result.current.isLegacyFallback).toBe(false);
    expect(result.current.error).toMatchObject({
      name: 'SettingsStorageCorruptionError',
    });
  });

  it('atomically preserves concurrent category and default target updates', async () => {
    await writeQuickNotesConfig('sheet-a', {});
    const { queryClient, wrapper } = createHarness();
    const { result } = renderHook(
      () => ({
        query: useQuickNotesQuery(),
        category: useUpdateQuickNotes(),
        defaults: useUpdateDefaultQuickNotes(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));

    await act(async () => {
      await Promise.all([
        result.current.category.mutateAsync({
          type: 'expense',
          categoryName: 'Food',
          notes: [{ id: 'food', icon: 'Utensils', label: 'Food' }],
        }),
        result.current.defaults.mutateAsync({
          type: 'income',
          notes: [{ id: 'salary', icon: 'BadgeDollarSign', label: 'Salary' }],
        }),
      ]);
    });

    await expect(readQuickNotesConfig('sheet-a')).resolves.toEqual({
      'expense:Food': [{ id: 'food', icon: 'Utensils', label: 'Food' }],
      'default:income': [
        { id: 'salary', icon: 'BadgeDollarSign', label: 'Salary' },
      ],
    });
    await expect(readSettingsSyncState('sheet-a', 'user-a')).resolves.toMatchObject({
      dirty: ['quickNotes'],
    });
    expect(
      queryClient.getQueryData([
        'settings',
        'state',
        'sheet-a',
        'user-a',
      ]),
    ).toMatchObject({ dirty: ['quickNotes'] });
  });

  it('persists a deferred scoped edit without restoring old-scope caches after signout', async () => {
    await writeQuickNotesConfig('sheet-a', {});
    const started = deferred<void>();
    const release = deferred<void>();
    const originalMutation = settingsLocalRepository.mutateLocalQuickNotes;
    const mutationSpy = vi
      .spyOn(settingsLocalRepository, 'mutateLocalQuickNotes')
      .mockImplementation(async (...args) => {
        started.resolve();
        await release.promise;
        return originalMutation(...args);
      });
    const { queryClient, wrapper } = createHarness();
    const { result, unmount } = renderHook(() => useUpdateQuickNotes(), {
      wrapper,
    });
    let mutation!: Promise<QuickNotesConfig>;
    await act(async () => {
      mutation = result.current.mutateAsync({
        type: 'expense',
        categoryName: 'Food',
        notes: [{ id: 'old', icon: 'Utensils', label: 'Old local note' }],
      });
      await started.promise;
      await Promise.resolve();
    });

    act(() => {
      advanceSessionTokenGeneration();
      providerState.accessToken = null;
      providerState.userId = null;
      unmount();
      queryClient.removeQueries({ queryKey: quickNotesKeys.all });
      queryClient.removeQueries({ queryKey: settingsKeys.all });
    });
    await act(async () => {
      release.resolve();
      await mutation;
    });

    await expect(readQuickNotesConfig('sheet-a')).resolves.toMatchObject({
      'expense:Food': [expect.objectContaining({ id: 'old' })],
    });
    expect(
      queryClient.getQueryCache().find({
        queryKey: quickNotesKeys.state('sheet-a', 'user-a'),
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

  it('surfaces invalid legacy storage instead of erasing it during a no-scope update', async () => {
    providerState.accessToken = null;
    providerState.userId = null;
    providerState.status = 'unauthenticated';
    providerState.sheetId = null;
    await db.settings.put({
      key: 'quickNotes',
      value: '{invalid json',
      updatedAt: '2026-08-16T00:00:00.000Z',
    });
    const { result } = renderHook(() => useUpdateQuickNotes(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          type: 'expense',
          categoryName: 'Food',
          notes: [{ id: 'food', icon: 'Utensils', label: 'Food' }],
        }),
      ).rejects.toMatchObject({ name: 'SettingsStorageCorruptionError' });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((await db.settings.get('quickNotes'))?.value).toBe('{invalid json');
  });

  it('rejects scoped edits while nonempty legacy fallback is awaiting import', async () => {
    const legacy: QuickNotesConfig = {
      'default:expense': [
        { id: 'expense', icon: 'NotebookPen', label: 'Expense legacy' },
      ],
      'income:Salary': [
        { id: 'income', icon: 'BadgeDollarSign', label: 'Income legacy' },
      ],
    };
    await db.settings.put({
      key: 'quickNotes',
      value: JSON.stringify(legacy),
      updatedAt: '2026-08-16T00:00:00.000Z',
    });
    const { result } = renderHook(() => useUpdateQuickNotes(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          type: 'expense',
          categoryName: 'Food',
          notes: [{ id: 'edit', icon: 'Utensils', label: 'Edited note' }],
        }),
      ).rejects.toMatchObject({
        name: 'LegacyQuickNotesMigrationRequiredError',
      });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    await expect(readLegacyQuickNotesConfig()).resolves.toEqual(legacy);
    await expect(readQuickNotesConfig('sheet-a')).resolves.toBeNull();

    await act(async () => {
      await writeQuickNotesConfig('sheet-a', legacy);
    });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          type: 'expense',
          categoryName: 'Food',
          notes: [{ id: 'edit', icon: 'Utensils', label: 'Edited note' }],
        }),
      ).resolves.toMatchObject({
        'income:Salary': [expect.objectContaining({ id: 'income' })],
        'expense:Food': [expect.objectContaining({ id: 'edit' })],
      });
    });
  });
});
