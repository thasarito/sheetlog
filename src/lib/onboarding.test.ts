import { describe, expect, it } from 'vitest';
import { mergeOnboardingState } from './onboarding';
import { getDefaultOnboardingState } from './settings';

describe('mergeOnboardingState analytics base currency', () => {
  it('hydrates a newer remote value', () => {
    const current = {
      ...getDefaultOnboardingState(),
      analyticsBaseCurrency: 'THB' as const,
      analyticsBaseCurrencyUpdatedAt: '2026-08-16T10:00:00.000Z',
    };
    const result = mergeOnboardingState(current, {
      analyticsBaseCurrency: {
        currency: 'USD',
        updatedAt: '2026-08-17T10:00:00.000Z',
      },
    });

    expect(result.next.analyticsBaseCurrency).toBe('USD');
    expect(result.changed).toBe(true);
    expect(result.settingsNeedPush).toBe(false);
  });

  it('keeps and schedules a newer local value for push', () => {
    const current = {
      ...getDefaultOnboardingState(),
      analyticsBaseCurrency: 'EUR' as const,
      analyticsBaseCurrencyUpdatedAt: '2026-08-17T10:00:00.000Z',
    };
    const result = mergeOnboardingState(current, {
      analyticsBaseCurrency: {
        currency: 'USD',
        updatedAt: '2026-08-16T10:00:00.000Z',
      },
    });

    expect(result.next.analyticsBaseCurrency).toBe('EUR');
    expect(result.changed).toBe(false);
    expect(result.settingsNeedPush).toBe(true);
  });

  it('schedules a timestamped local value when the remote setting is missing', () => {
    const current = {
      ...getDefaultOnboardingState(),
      analyticsBaseCurrency: 'GBP' as const,
      analyticsBaseCurrencyUpdatedAt: '2026-08-17T10:00:00.000Z',
    };

    const result = mergeOnboardingState(current, {});

    expect(result.next.analyticsBaseCurrency).toBe('GBP');
    expect(result.changed).toBe(false);
    expect(result.settingsNeedPush).toBe(true);
  });

  it('hydrates a newer remote big spending cutoff', () => {
    const current = {
      ...getDefaultOnboardingState(),
      analyticsBigSpendingThreshold: {
        amount: 5_000,
        currency: 'THB' as const,
        updatedAt: '2026-08-16T10:00:00.000Z',
      },
    };
    const remote = {
      amount: 10_000,
      currency: 'THB' as const,
      updatedAt: '2026-08-17T10:00:00.000Z',
    };

    const result = mergeOnboardingState(current, {
      analyticsBigSpendingThreshold: remote,
    });

    expect(result.next.analyticsBigSpendingThreshold).toEqual(remote);
    expect(result.changed).toBe(true);
    expect(result.settingsNeedPush).toBe(false);
  });

  it('keeps a newer local cutoff and schedules it for push', () => {
    const local = {
      amount: 10_000,
      currency: 'THB' as const,
      updatedAt: '2026-08-17T10:00:00.000Z',
    };

    const result = mergeOnboardingState(
      { ...getDefaultOnboardingState(), analyticsBigSpendingThreshold: local },
      {
        analyticsBigSpendingThreshold: {
          amount: 5_000,
          currency: 'THB',
          updatedAt: '2026-08-16T10:00:00.000Z',
        },
      },
    );

    expect(result.next.analyticsBigSpendingThreshold).toEqual(local);
    expect(result.changed).toBe(false);
    expect(result.settingsNeedPush).toBe(true);
  });

  it('hydrates a timestamped remote clear', () => {
    const result = mergeOnboardingState(
      {
        ...getDefaultOnboardingState(),
        analyticsBigSpendingThreshold: {
          amount: 10_000,
          currency: 'THB',
          updatedAt: '2026-08-16T10:00:00.000Z',
        },
      },
      {
        analyticsBigSpendingThreshold: {
          amount: null,
          currency: 'THB',
          updatedAt: '2026-08-17T10:00:00.000Z',
        },
      },
    );

    expect(result.next.analyticsBigSpendingThreshold?.amount).toBeNull();
    expect(result.changed).toBe(true);
  });
});
