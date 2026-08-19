import { describe, expect, it } from 'vitest';
import {
  getAnalyticsTransitionKey,
  resolveAnalyticsMotionIntent,
  type AnalyticsMotionSnapshot,
} from './analyticsMotion';

const snapshot: AnalyticsMotionSnapshot = {
  range: 'week',
  periodOffset: -1,
  customStart: 1,
  customEnd: 2,
  noBigSpending: false,
  selectedBucket: null,
  selectedCategory: null,
};

describe('analytics motion intent', () => {
  it('starts settled and keys navigation to the visible period', () => {
    expect(resolveAnalyticsMotionIntent(null, snapshot)).toEqual({
      reason: 'initial',
      direction: 0,
      transitionKey: 'week:-1',
    });
    expect(getAnalyticsTransitionKey({ ...snapshot, range: 'custom' })).toBe('custom:1:2');
  });

  it('maps later and earlier periods to directional scene motion', () => {
    expect(
      resolveAnalyticsMotionIntent(snapshot, { ...snapshot, periodOffset: 0 }),
    ).toMatchObject({ reason: 'period', direction: 1, transitionKey: 'week:0' });
    expect(
      resolveAnalyticsMotionIntent(snapshot, { ...snapshot, periodOffset: -2 }),
    ).toMatchObject({ reason: 'period', direction: -1, transitionKey: 'week:-2' });
  });

  it('treats range and custom-boundary changes as recomposition', () => {
    expect(
      resolveAnalyticsMotionIntent(snapshot, { ...snapshot, range: 'month' }),
    ).toMatchObject({ reason: 'range', direction: 0 });
    const custom = { ...snapshot, range: 'custom' as const };
    expect(
      resolveAnalyticsMotionIntent(custom, { ...custom, customEnd: 3 }),
    ).toMatchObject({ reason: 'range', direction: 0, transitionKey: 'custom:1:3' });
  });

  it('prioritizes a big-spending filter over the filters it clears', () => {
    expect(
      resolveAnalyticsMotionIntent(
        { ...snapshot, selectedBucket: '2026-08-18' },
        { ...snapshot, noBigSpending: true },
      ),
    ).toMatchObject({ reason: 'big-spending', direction: 0 });
  });

  it('distinguishes bucket, category, and passive data updates', () => {
    expect(
      resolveAnalyticsMotionIntent(snapshot, { ...snapshot, selectedBucket: '2026-08-18' }),
    ).toMatchObject({ reason: 'bucket' });
    expect(
      resolveAnalyticsMotionIntent(snapshot, { ...snapshot, selectedCategory: 'food' }),
    ).toMatchObject({ reason: 'category' });
    expect(resolveAnalyticsMotionIntent(snapshot, { ...snapshot })).toMatchObject({
      reason: 'data',
      direction: 0,
    });
  });
});
