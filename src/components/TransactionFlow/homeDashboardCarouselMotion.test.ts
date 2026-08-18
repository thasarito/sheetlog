import { describe, expect, it } from 'vitest';
import {
  directionFrom,
  shouldCommitSwipe,
  slidePosition,
  wrappedSlideIndex,
} from './homeDashboardCarouselMotion';

describe('home dashboard carousel motion', () => {
  it('places the destination beside either origin in either direction', () => {
    for (const origin of [0, 1]) {
      for (const direction of [-1, 1] as const) {
        const target = wrappedSlideIndex(origin + direction);
        expect(slidePosition(origin, origin, 0, direction)).toBe(0);
        expect(slidePosition(target, origin, 0, direction)).toBe(direction);
        expect(slidePosition(origin, origin, direction, direction)).toBe(-direction);
        expect(slidePosition(target, origin, direction, direction)).toBe(0);
      }
    }
  });

  it('reverses from the progress sign without reading slide geometry', () => {
    expect(directionFrom(0.3)).toBe(1);
    expect(directionFrom(-0.3)).toBe(-1);
    expect(slidePosition(1, 0, 0.3, 1)).toBe(0.7);
    expect(slidePosition(1, 0, -0.3, -1)).toBe(-0.7);
  });

  it('uses distance or a meaningful fling to commit', () => {
    expect(
      shouldCommitSwipe({ progress: 0.249, velocity: 0.1, cancelled: false }),
    ).toBe(false);
    expect(
      shouldCommitSwipe({ progress: 0.25, velocity: 0.1, cancelled: false }),
    ).toBe(true);
    expect(
      shouldCommitSwipe({ progress: 0.08, velocity: 0.5, cancelled: false }),
    ).toBe(true);
    expect(
      shouldCommitSwipe({ progress: 0.079, velocity: 2, cancelled: false }),
    ).toBe(false);
    expect(
      shouldCommitSwipe({ progress: -0.4, velocity: -1, cancelled: true }),
    ).toBe(false);
  });
});
