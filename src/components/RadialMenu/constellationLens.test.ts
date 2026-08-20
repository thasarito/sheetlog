import { describe, expect, it } from 'vitest';
import {
  createConstellationBoundary,
  getConstellationAccent,
  isConstellationBoundaryHighlighted,
} from './constellationLens';
import type { RadialMenuSafeBounds } from './equalAreaSectors';

const safeBounds: RadialMenuSafeBounds = {
  left: 12,
  top: 12,
  right: 378,
  bottom: 832,
};

describe('constellation lens presentation geometry', () => {
  it('curves each divider from the long-press point to the viewport boundary', () => {
    const anchor = { x: 46, y: 318 };
    const boundary = createConstellationBoundary(
      anchor,
      Math.PI,
      safeBounds,
      0,
      22,
    );

    expect(boundary.path).toMatch(/^M 46 318 Q /);
    expect(boundary.end.x).toBeCloseTo(safeBounds.left, 5);
    expect(boundary.end.y).toBeCloseTo(anchor.y, 5);
  });

  it('alternates contour bends so adjacent dividers do not look mechanical', () => {
    const anchor = { x: 46, y: 318 };
    const first = createConstellationBoundary(
      anchor,
      0,
      safeBounds,
      0,
      22,
    );
    const second = createConstellationBoundary(
      anchor,
      0,
      safeBounds,
      1,
      22,
    );
    const straightMidpointY = (anchor.y + first.end.y) / 2;

    expect(first.control.y).toBeGreaterThan(straightMidpointY);
    expect(second.control.y).toBeLessThan(straightMidpointY);
  });

  it('highlights both contour edges surrounding the selected territory', () => {
    expect(isConstellationBoundaryHighlighted(2, 2, 5)).toBe(true);
    expect(isConstellationBoundaryHighlighted(3, 2, 5)).toBe(true);
    expect(isConstellationBoundaryHighlighted(1, 2, 5)).toBe(false);
    expect(isConstellationBoundaryHighlighted(0, null, 5)).toBe(false);
  });

  it('cycles chart accents while keeping Cancel on the danger token', () => {
    expect(getConstellationAccent(0, false)).toBe('hsl(var(--chart-1))');
    expect(getConstellationAccent(5, false)).toBe('hsl(var(--chart-1))');
    expect(getConstellationAccent(2, true)).toBe('hsl(var(--danger))');
  });
});
