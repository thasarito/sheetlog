import type { AnalyticsRange } from './analytics';

export type AnalyticsMotionReason =
  | 'initial'
  | 'period'
  | 'range'
  | 'bucket'
  | 'big-spending'
  | 'category'
  | 'data';

export type AnalyticsMotionDirection = -1 | 0 | 1;

export type AnalyticsMotionIntent = {
  reason: AnalyticsMotionReason;
  direction: AnalyticsMotionDirection;
  transitionKey: string;
};

export type AnalyticsMotionSnapshot = {
  range: AnalyticsRange;
  periodOffset: number;
  customStart: number;
  customEnd: number;
  noBigSpending: boolean;
  selectedBucket: string | null;
  selectedCategory: string | null;
};

export const DEFAULT_ANALYTICS_MOTION_INTENT: AnalyticsMotionIntent = {
  reason: 'initial',
  direction: 0,
  transitionKey: 'initial',
};

export function getAnalyticsTransitionKey(snapshot: AnalyticsMotionSnapshot): string {
  return snapshot.range === 'custom'
    ? `custom:${snapshot.customStart}:${snapshot.customEnd}`
    : `${snapshot.range}:${snapshot.periodOffset}`;
}

export function resolveAnalyticsMotionIntent(
  previous: AnalyticsMotionSnapshot | null,
  current: AnalyticsMotionSnapshot,
): AnalyticsMotionIntent {
  const transitionKey = getAnalyticsTransitionKey(current);
  if (previous === null) {
    return {
      reason: 'initial',
      direction: 0,
      transitionKey,
    };
  }

  if (
    previous.range !== current.range ||
    (current.range === 'custom' &&
      (previous.customStart !== current.customStart || previous.customEnd !== current.customEnd))
  ) {
    return {
      reason: 'range',
      direction: 0,
      transitionKey,
    };
  }

  if (previous.periodOffset !== current.periodOffset) {
    return {
      reason: 'period',
      direction: current.periodOffset > previous.periodOffset ? 1 : -1,
      transitionKey,
    };
  }

  if (previous.noBigSpending !== current.noBigSpending) {
    return {
      reason: 'big-spending',
      direction: 0,
      transitionKey,
    };
  }

  if (previous.selectedBucket !== current.selectedBucket) {
    return {
      reason: 'bucket',
      direction: 0,
      transitionKey,
    };
  }

  if (previous.selectedCategory !== current.selectedCategory) {
    return {
      reason: 'category',
      direction: 0,
      transitionKey,
    };
  }

  return {
    reason: 'data',
    direction: 0,
    transitionKey,
  };
}
