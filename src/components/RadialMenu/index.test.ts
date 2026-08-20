import { describe, expect, it } from 'vitest';
import {
  findHoveredItem,
  getRadialMenuGeometry,
  isRadialMenuDragArmed,
  resolveRadialMenuReleaseTarget,
  type RadialMenuBounds,
  type RadialMenuItemData,
} from './index';

const items: RadialMenuItemData[] = [
  { id: 'top', icon: 'Utensils', label: 'Top' },
  { id: 'right', icon: 'Car', label: 'Right' },
  { id: 'bottom', icon: 'Wallet', label: 'Bottom' },
  { id: 'left', icon: 'House', label: 'Left' },
];

const stepCategoryBounds: RadialMenuBounds = {
  left: 12,
  top: 244,
  width: 351,
  height: 351,
};

describe('StepCategory-centered absolute radial menu geometry', () => {
  it('centers the wheel inside the StepCategory carousel bounds', () => {
    const geometry = getRadialMenuGeometry(stepCategoryBounds);

    expect(geometry.center).toEqual({ x: 187.5, y: 419.5 });
    expect(geometry.ringRadius).toBeGreaterThan(100);
    expect(geometry.outerRadius).toBeLessThanOrEqual(stepCategoryBounds.width / 2);
  });

  it('does not arm a selection when the long press first activates', () => {
    const anchor = { x: 40, y: 550 };

    expect(isRadialMenuDragArmed(anchor, anchor)).toBe(false);
    expect(
      resolveRadialMenuReleaseTarget(
        items,
        getRadialMenuGeometry(stepCategoryBounds),
        anchor,
        anchor,
      ),
    ).toEqual({ type: 'cancel' });
  });

  it('uses the pointer absolute position and requires the visible ring band', () => {
    const geometry = getRadialMenuGeometry(stepCategoryBounds);
    const anchor = { x: 40, y: 650 };
    const relative-onlyTopDrag = {
      x: anchor.x,
      y: anchor.y - geometry.ringRadius,
    };
    const actualTopSegment = {
      x: geometry.center.x,
      y: geometry.center.y - geometry.ringRadius,
    };

    expect(
      resolveRadialMenuReleaseTarget(items, geometry, anchor, relative-onlyTopDrag),
    ).toEqual({ type: 'cancel' });
    expect(
      resolveRadialMenuReleaseTarget(items, geometry, anchor, actualTopSegment),
    ).toEqual({ type: 'item', itemId: 'top' });
    expect(
      findHoveredItem(items, geometry.center, actualTopSegment, undefined, geometry),
    ).toBe('top');
  });

  it('uses the center control for the default action and cancels other misses', () => {
    const geometry = getRadialMenuGeometry(stepCategoryBounds);
    const anchor = { x: 40, y: 550 };

    expect(
      resolveRadialMenuReleaseTarget(items, geometry, anchor, geometry.center),
    ).toEqual({ type: 'default' });
    expect(
      resolveRadialMenuReleaseTarget(items, geometry, anchor, {
        x: geometry.center.x,
        y: geometry.center.y + geometry.maxDragDistance + 1,
      }),
    ).toEqual({ type: 'cancel' });
    expect(
      resolveRadialMenuReleaseTarget(items, geometry, anchor, {
        x: geometry.center.x,
        y: geometry.center.y + geometry.minDragDistance - 1,
      }),
    ).toEqual({ type: 'cancel' });
  });
});
