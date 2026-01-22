import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession, useWorkspace, useConnectivity } from '../app/providers';
import { writeOnboardingConfig as realWriteOnboardingConfig } from '../lib/google';
import { isGoogleAuthError } from '../lib/googleErrors';
import { IS_DEV_MODE, writeOnboardingConfig as mockWriteOnboardingConfig } from '../lib/mock';
import { hydrateOnboardingFromSheet } from '../lib/onboarding';
import { getDefaultOnboardingState, getOnboardingState, setOnboardingState } from '../lib/settings';
import type { AccountItem, CategoryConfigWithMeta, OnboardingState } from '../lib/types';

const writeOnboardingConfig = IS_DEV_MODE ? mockWriteOnboardingConfig : realWriteOnboardingConfig;

export const onboardingKeys = {
  state: (sheetId: string | null) => ['onboarding', sheetId] as const,
  sync: (sheetId: string | null) => ['onboarding', 'sync', sheetId] as const,
};

/**
 * Main query that reads onboarding state from IndexedDB
 */
export function useOnboardingQuery(sheetId: string | null) {
  return useQuery({
    queryKey: onboardingKeys.state(sheetId),
    queryFn: () => getOnboardingState(sheetId),
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
  const { accessToken, signOut } = useSession();
  const { sheetId } = useWorkspace();
  const { isOnline } = useConnectivity();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: onboardingKeys.sync(sheetId),
    queryFn: async () => {
      if (!accessToken || !sheetId) {
        return { next: getDefaultOnboardingState(), changed: false };
      }
      const current =
        queryClient.getQueryData<OnboardingState>(onboardingKeys.state(sheetId)) ??
        getDefaultOnboardingState();
      try {
        const result = await hydrateOnboardingFromSheet(accessToken, sheetId, current);
        if (result.changed) {
          queryClient.setQueryData(onboardingKeys.state(sheetId), result.next);
        }
        return result;
      } catch (error) {
        if (isGoogleAuthError(error)) {
          signOut();
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
    categories.expense.length > 0 && categories.income.length > 0 && categories.transfer.length > 0
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

function normalizeCategoryList(
  items: { name: string; icon?: string; color?: string }[],
): typeof items {
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
  next: OnboardingState,
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
  const { accessToken, signOut } = useSession();
  const { sheetId } = useWorkspace();
  const { isOnline } = useConnectivity();

  return useMutation({
    mutationFn: async (updates: Partial<OnboardingState>): Promise<OnboardingState> => {
      const current =
        queryClient.getQueryData<OnboardingState>(onboardingKeys.state(sheetId)) ??
        getDefaultOnboardingState();
      const next = { ...current, ...updates };

      // Always persist to IndexedDB
      await setOnboardingState(next, sheetId);

      // Sync to Sheets if online and authenticated
      if (accessToken && sheetId && isOnline) {
        const sheetUpdates = buildSheetUpdates(current, updates, next);
        if (sheetUpdates.accounts || sheetUpdates.categories) {
          try {
            await writeOnboardingConfig(accessToken, sheetId, sheetUpdates);
          } catch (error) {
            if (isGoogleAuthError(error)) {
              signOut();
            }
            throw error;
          }
        }
      }

      return next;
    },
    onMutate: async (updates) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: onboardingKeys.state(sheetId) });

      // Snapshot the previous value
      const previous = queryClient.getQueryData<OnboardingState>(onboardingKeys.state(sheetId));

      // Optimistically update to the new value
      if (previous) {
        const next = { ...previous, ...updates };
        queryClient.setQueryData(onboardingKeys.state(sheetId), next);
      }

      return { previous };
    },
    onError: (_error, _updates, context) => {
      // Rollback to the previous state on error
      if (context?.previous) {
        queryClient.setQueryData(onboardingKeys.state(sheetId), context.previous);
      }
    },
    onSettled: () => {
      // Invalidate to ensure we have the latest data after mutation
      queryClient.invalidateQueries({ queryKey: onboardingKeys.state(sheetId) });
    },
  });
}
