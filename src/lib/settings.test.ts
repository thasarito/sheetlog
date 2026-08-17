import { describe, expect, it } from 'vitest';
import { normalizeOnboardingState } from './settings';

describe('normalizeOnboardingState', () => {
  it('defaults legacy records to THB with no remote timestamp', () => {
    const state = normalizeOnboardingState({
      accounts: [],
      accountsConfirmed: false,
      categories: { expense: [], income: [], transfer: [] },
      categoriesConfirmed: false,
      sheetFolderId: null,
    });

    expect(state.analyticsBaseCurrency).toBe('THB');
    expect(state.analyticsBaseCurrencyUpdatedAt).toBeNull();
  });

  it('keeps a supported saved currency and timestamp', () => {
    const state = normalizeOnboardingState({
      analyticsBaseCurrency: 'USD',
      analyticsBaseCurrencyUpdatedAt: '2026-08-17T12:00:00.000Z',
    });

    expect(state.analyticsBaseCurrency).toBe('USD');
    expect(state.analyticsBaseCurrencyUpdatedAt).toBe('2026-08-17T12:00:00.000Z');
  });
});
