import { getDefaultOnboardingState } from '../lib/settings';
import { useOnboardingQuery, useOnboardingSync, useUpdateOnboarding } from './useOnboardingQuery';

export function useOnboarding() {
  const { data: onboarding = getDefaultOnboardingState(), isLoading } = useOnboardingQuery();
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
