import { describe, expect, it } from 'vitest';
import {
  findHoveredItem,
  getRadialMenuGeometry,
  projectDragPositionToCenter,
  type RadialMenuItemData,
} from './index';

describe('centered radial menu geometry', () => {
  it('preserves drag displacement when projecting to the screen center', () => {
    expect(
      projectDragPositionToCenter(
        { x: 80, y: 620 },
        { x: 125, y: 560 },
        { x: 187.5, y: 406 },
      ),
    ).toEqual({ x: 232.5, y: 346 });
  });

  it('enlarges the ring while keeping it inside a compact viewport', () => {
    const geometry = getRadialMenuGeometry({ width: 375, height: 812 });

    expect(geometry.ringRadius).toBeGreaterThanOrEqual(125);
    expect(geometry.outerRadius).toBeLessThanOrEqual(375 / 2);
    expect(geometry.maxDragDistance).toBeGreaterThan(geometry.ringRadius);
  });

  it('selects by projected direction independently of the pressed category position', () => {
    const items: RadialMenuItemData[] = [
      { id: 'top', icon: 'Utensils', label: 'Top' },
      { id: 'right', icon: 'Car', label: 'Right' },
      { id: 'bottom', icon: 'Wallet', label: 'Bottom' },
      { id: 'left', icon: 'House', label: 'Left' },
    ];
    const geometry = getRadialMenuGeometry({ width: 375, height: 812 });
    const arc = { startAngle: -90, sweepAngle: 360 };

    for (const anchor of [
      { x: 44, y: 690 },
      { x: 326, y: 148 },
    ]) {
      const projected = projectDragPositionToCenter(
        anchor,
        { x: anchor.x, y: anchor.y - geometry.ringRadius },
        geometry.center,
      );

      expect(findHoveredItem(items, geometry.center, projected, arc, geometry)).toBe('top');
    }
  });
});
