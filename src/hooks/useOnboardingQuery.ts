import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getOnboardingState, setOnboardingState, getDefaultOnboardingState } from '../lib/settings';
import { hydrateOnboardingFromSheet } from '../lib/onboarding';
import { writeOnboardingConfig } from '../lib/google';
import { useAuth } from '../components/providers/auth';
import { useConnectivity } from '../components/providers/ConnectivityContext';
import { isGoogleAuthError } from '../lib/googleErrors';
import type { OnboardingState, AccountItem, CategoryConfigWithMeta } from '../lib/types';

export const onboardingKeys = {
  all: ['onboarding'] as const,
  sync: (sheetId: string | null) => ['onboarding', 'sync', sheetId] as const,
};

/**
 * Main query that reads onboarding state from IndexedDB
 */
export function useOnboardingQuery() {
  return useQuery({
    queryKey: onboardingKeys.all,
    queryFn: getOnboardingState,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

/**
 * Background sync query for Sheets hydration
 * Only runs when authenticated and online
 */
export function useOnboardingSync() {
  const { accessToken, sheetId, clearAuth } = useAuth();
  const { isOnline } = useConnectivity();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: onboardingKeys.sync(sheetId),
    queryFn: async () => {
      if (!accessToken || !sheetId) {
        return { next: getDefaultOnboardingState(), changed: false };
      }
      const current = queryClient.getQueryData<OnboardingState>(onboardingKeys.all) ?? getDefaultOnboardingState();
      try {
        const result = await hydrateOnboardingFromSheet(accessToken, sheetId, current);
        if (result.changed) {
          queryClient.setQueryData(onboardingKeys.all, result.next);
        }
        return result;
      } catch (error) {
        if (isGoogleAuthError(error)) {
          clearAuth();
        }
        throw error;
      }
    },
    enabled: Boolean(accessToken && sheetId && isOnline),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });
}

// Helper types for sheet updates
type SheetUpdates = {
  accounts?: AccountItem[];
  categories?: CategoryConfigWithMeta;
};

function hasAllCategories(categories: CategoryConfigWithMeta): boolean {
  return (
    categories.expense.length > 0 &&
    categories.income.length > 0 &&
    categories.transfer.length > 0
  );
}

function normalizeAccountList(accounts: AccountItem[]): AccountItem[] {
  const seen = new Set<string>();
  return accounts.filter((item) => {
    const key = item.name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeCategoryList(items: { name: string; icon?: string; color?: string }[]): typeof items {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeCategories(categories: CategoryConfigWithMeta): CategoryConfigWithMeta {
  return {
    expense: normalizeCategoryList(categories.expense),
    income: normalizeCategoryList(categories.income),
    transfer: normalizeCategoryList(categories.transfer),
  };
}

/**
 * Determines what updates should be written to Sheets based on
 * what changed and confirmation status
 */
function buildSheetUpdates(
  _current: OnboardingState,
  updates: Partial<OnboardingState>,
  next: OnboardingState
): SheetUpdates {
  const result: SheetUpdates = {};

  // Only write accounts if accounts changed AND accountsConfirmed is true
  const accountsChanged = 'accounts' in updates || 'accountsConfirmed' in updates;
  if (accountsChanged && next.accountsConfirmed) {
    const normalizedAccounts = normalizeAccountList(next.accounts);
    if (normalizedAccounts.length > 0) {
      result.accounts = normalizedAccounts;
    }
  }

  // Only write categories if categories changed AND categoriesConfirmed is true
  const categoriesChanged = 'categories' in updates || 'categoriesConfirmed' in updates;
  if (categoriesChanged && next.categoriesConfirmed) {
    const normalizedCategories = normalizeCategories(next.categories);
    if (hasAllCategories(normalizedCategories)) {
      result.categories = normalizedCategories;
    }
  }

  return result;
}

/**
 * Base mutation with optimistic updates for updating onboarding state
 */
export function useUpdateOnboarding() {
  const queryClient = useQueryClient();
  const { accessToken, sheetId, clearAuth } = useAuth();
  const { isOnline } = useConnectivity();

  return useMutation({
    mutationFn: async (updates: Partial<OnboardingState>): Promise<OnboardingState> => {
      const current = queryClient.getQueryData<OnboardingState>(onboardingKeys.all) ?? getDefaultOnboardingState();
      const next = { ...current, ...updates };

      // Always persist to IndexedDB
      await setOnboardingState(next);

      // Sync to Sheets if online and authenticated
      if (accessToken && sheetId && isOnline) {
        const sheetUpdates = buildSheetUpdates(current, updates, next);
        if (sheetUpdates.accounts || sheetUpdates.categories) {
          try {
            await writeOnboardingConfig(accessToken, sheetId, sheetUpdates);
          } catch (error) {
            if (isGoogleAuthError(error)) {
              clearAuth();
            }
            throw error;
          }
        }
      }

      return next;
    },
    onMutate: async (updates) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: onboardingKeys.all });

      // Snapshot the previous value
      const previous = queryClient.getQueryData<OnboardingState>(onboardingKeys.all);

      // Optimistically update to the new value
      if (previous) {
        const next = { ...previous, ...updates };
        queryClient.setQueryData(onboardingKeys.all, next);
      }

      return { previous };
    },
    onError: (_error, _updates, context) => {
      // Rollback to the previous state on error
      if (context?.previous) {
        queryClient.setQueryData(onboardingKeys.all, context.previous);
      }
    },
    onSettled: () => {
      // Invalidate to ensure we have the latest data after mutation
      queryClient.invalidateQueries({ queryKey: onboardingKeys.all });
    },
  });
}
