/**
 * Mock onboarding state for offline development
 * Pre-populated with default accounts and categories
 */

import type { OnboardingState } from '../types';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from './mockStorage';

/**
 * Pre-configured onboarding state that bypasses the onboarding flow
 * - 3 accounts (Cash, Bank, Credit Card) already confirmed
 * - Default categories already confirmed
 */
export const MOCK_ONBOARDING_STATE: OnboardingState = {
  sheetFolderId: null,
  accounts: DEFAULT_ACCOUNTS,
  accountsConfirmed: true,
  categories: DEFAULT_CATEGORIES,
  categoriesConfirmed: true,
};
