import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../lib/db';
import {
  readQuickNotesConfig,
  readSettingsSyncState,
  writeQuickNotesConfig,
} from '../lib/settingsSync';
import type { QuickNotesConfig } from '../lib/types';
import {
  useQuickNotesQuery,
  useUpdateDefaultQuickNotes,
  useUpdateQuickNotes,
} from './useQuickNotes';

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
    expect(await readQuickNotesConfig('sheet-a')).toBeNull();
  });

  it('treats a scoped empty config as authoritative over legacy fallback', async () => {
    await writeQuickNotesConfig('sheet-a', {});
    const { result } = renderHook(() => useQuickNotesQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({});
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
    expect((await db.settings.get('quickNotes'))?.value).toBe('{invalid json');
  });
});
