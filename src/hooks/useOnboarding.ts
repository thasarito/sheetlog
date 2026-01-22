import { useWorkspace } from '../app/providers';
import { useOnboardingQuery, useOnboardingSync, useUpdateOnboarding } from './useOnboardingQuery';
import { getDefaultOnboardingState } from '../lib/settings';

export function useOnboarding() {
  const { sheetId } = useWorkspace();
  const { data: onboarding = getDefaultOnboardingState(), isLoading } = useOnboardingQuery(sheetId);
  const { isFetching: isSyncing, refetch: refreshOnboarding } = useOnboardingSync();
  const updateMutation = useUpdateOnboarding();

  return {
    onboarding,
    isLoading,
    isSyncing,
    updateOnboarding: updateMutation.mutateAsync,
    refreshOnboarding: async () => {
      const result = await refreshOnboarding();
      return result.data?.changed ?? false;
    },
  };
}
