import { createContext, useContext } from 'react';
import type { OnboardingState } from '../../lib/types';

export interface OnboardingContextValue {
  onboarding: OnboardingState;
  updateOnboarding: (updates: Partial<OnboardingState>) => Promise<OnboardingState>;
  refreshOnboarding: () => Promise<boolean>;
}

export const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return context;
}
