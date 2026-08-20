import { describe, expect, it } from 'vitest';
import { getRadialMenuLabelPosition } from './RadialMenuItem';

describe('radial menu label placement', () => {
  it('places labels below their nodes while keeping them inside the wheel', () => {
    const topNode = { x: 0, y: -120 };
    const bottomNode = { x: 0, y: 120 };

    const topLabel = getRadialMenuLabelPosition(topNode, 160, 70, 22);
    const bottomLabel = getRadialMenuLabelPosition(bottomNode, 160, 70, 22);

    expect(topLabel.y).toBeGreaterThan(topNode.y);
    expect(bottomLabel.y).toBeGreaterThan(bottomNode.y);
    expect(bottomLabel.y).toBeLessThanOrEqual(160 - 11);
  });
});
