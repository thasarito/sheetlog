import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../lib/db';
import { readQuickNotesConfig, writeQuickNotesConfig } from '../lib/settingsSync';
import type { QuickNotesConfig } from '../lib/types';
import {
  quickNotesKeys,
  useReplaceQuickNotesConfig,
} from './useQuickNotes';

const providerState = vi.hoisted(() => ({
  accessToken: 'token-a',
  userId: 'user-a',
  sheetId: 'sheet-a',
}));

vi.mock('../app/providers', () => ({
  useSession: () => ({
    accessToken: providerState.accessToken,
    userProfile: { id: providerState.userId, name: providerState.userId, picture: null },
    status: 'authenticated',
  }),
  useWorkspace: () => ({ sheetId: providerState.sheetId }),
}));

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 60_000 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { queryClient, wrapper: Wrapper };
}

describe('useReplaceQuickNotesConfig', () => {
  beforeEach(async () => {
    await db.settings.clear();
    await writeQuickNotesConfig('sheet-a', {
      'expense:Food': [{ id: 'food', icon: 'Utensils', label: 'Food' }],
    });
  });

  afterEach(async () => {
    cleanup();
    await db.settings.clear();
  });

  it('replaces the complete scoped config and refreshes the scoped query snapshot', async () => {
    const next: QuickNotesConfig = {
      'expense:Dining': [{ id: 'food', icon: 'Utensils', label: 'Food' }],
      'default:income': [{ id: 'salary', icon: 'Banknote', label: 'Salary' }],
    };
    const { queryClient, wrapper } = createHarness();
    const { result } = renderHook(() => useReplaceQuickNotesConfig(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ config: next });
    });

    await expect(readQuickNotesConfig('sheet-a')).resolves.toEqual(next);
    expect(
      queryClient.getQueryData(quickNotesKeys.state('sheet-a', 'user-a')),
    ).toMatchObject({ config: next, provenance: 'scoped' });
  });
});
