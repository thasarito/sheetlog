import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OnboardingState } from '../lib/types';
import { useAccountMutations } from './useAccountMutations';
import { useCategoryMutations } from './useCategoryMutations';

const mocks = vi.hoisted(() => ({
  current: null as OnboardingState | null,
  updateOnboarding: vi.fn(),
}));

vi.mock('./useOnboardingQuery', () => ({
  useUpdateOnboarding: () => ({ mutateAsync: mocks.updateOnboarding }),
}));

const initialState = (): OnboardingState => ({
  sheetFolderId: null,
  accounts: [
    { name: 'Wallet', icon: 'Wallet', color: '#22c55e' },
    { name: 'Cash', icon: 'Banknote', color: '#f59e0b' },
  ],
  accountsConfirmed: true,
  categories: {
    expense: [{ name: 'Food', icon: 'Utensils', color: '#f97316' }],
    income: [{ name: 'Food', icon: 'Banknote', color: '#22c55e' }],
    transfer: [],
  },
  categoriesConfirmed: true,
  analyticsBaseCurrency: 'THB',
  analyticsBaseCurrencyUpdatedAt: null,
  analyticsBigSpendingThreshold: null,
});

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('Settings collection mutations', () => {
  beforeEach(() => {
    mocks.current = initialState();
    mocks.updateOnboarding.mockReset().mockImplementation(async (update) => {
      if (!mocks.current) throw new Error('Missing onboarding state');
      const patch = typeof update === 'function' ? update(mocks.current) : update;
      mocks.current = { ...mocks.current, ...patch };
      return mocks.current;
    });
  });

  it('renames an account by its previous identity while preserving order and appearance', async () => {
    const { result } = renderHook(() => useAccountMutations(vi.fn()), { wrapper });

    await act(async () => {
      await result.current.updateAccountMeta.mutateAsync({
        previousName: 'Wallet',
        name: 'Travel Wallet',
      });
    });

    expect(mocks.current?.accounts).toEqual([
      { name: 'Travel Wallet', icon: 'Wallet', color: '#22c55e' },
      { name: 'Cash', icon: 'Banknote', color: '#f59e0b' },
    ]);
  });

  it('creates an account with the editor-selected appearance', async () => {
    const { result } = renderHook(() => useAccountMutations(vi.fn()), { wrapper });

    await act(async () => {
      await result.current.addAccount.mutateAsync({
        name: 'Card',
        icon: 'CreditCard',
        color: '#3b82f6',
      });
    });

    expect(mocks.current?.accounts.at(-1)).toEqual({
      name: 'Card',
      icon: 'CreditCard',
      color: '#3b82f6',
    });
  });

  it('renames only the matching category inside its transaction type', async () => {
    const { result } = renderHook(() => useCategoryMutations(vi.fn()), { wrapper });

    await act(async () => {
      await result.current.updateCategoryMeta.mutateAsync({
        previousName: 'Food',
        name: 'Dining',
        categoryType: 'expense',
      });
    });

    expect(mocks.current?.categories.expense).toEqual([
      { name: 'Dining', icon: 'Utensils', color: '#f97316' },
    ]);
    expect(mocks.current?.categories.income).toEqual([
      { name: 'Food', icon: 'Banknote', color: '#22c55e' },
    ]);
  });
});
