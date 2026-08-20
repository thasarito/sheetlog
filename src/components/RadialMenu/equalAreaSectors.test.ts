import { describe, expect, it } from 'vitest';
import {
  createEqualAreaRadialLayout,
  findEqualAreaSector,
  resolveEqualAreaRadialRelease,
  type RadialMenuBounds,
  type RadialMenuItemData,
  type RadialMenuPoint,
} from './equalAreaSectors';

const items: RadialMenuItemData[] = [
  { id: 'privileges', icon: 'Gem', label: 'Privileges' },
  { id: 'apple-pay', icon: 'WalletCards', label: 'Apple Pay' },
  { id: 'promptpay', icon: 'ScanLine', label: 'PromptPay' },
  { id: 'cash', icon: 'Banknote', label: 'Cash' },
  { id: '__cancel__', icon: 'X', label: 'Cancel' },
];

const fullscreenBounds: RadialMenuBounds = {
  left: 0,
  top: 0,
  width: 390,
  height: 844,
};

function polygonArea(points: RadialMenuPoint[]): number {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return Math.abs(twiceArea) / 2;
}

describe('equal-area warped radial sectors', () => {
  it('keeps the exact long-press position as the center', () => {
    const anchor = { x: 46, y: 318 };
    const layout = createEqualAreaRadialLayout(items, anchor, fullscreenBounds);

    expect(layout.anchor).toEqual(anchor);
    expect(layout.bounds).toEqual(fullscreenBounds);
  });

  it('partitions the usable screen into approximately equal target areas', () => {
    const layout = createEqualAreaRadialLayout(
      items,
      { x: 46, y: 318 },
      fullscreenBounds,
    );
    const areas = layout.sectors.map((sector) => polygonArea(sector.polygon));
    const averageArea = areas.reduce((sum, area) => sum + area, 0) / areas.length;

    for (const area of areas) {
      expect(area / averageArea).toBeGreaterThan(0.88);
      expect(area / averageArea).toBeLessThan(1.12);
    }
  });

  it('makes every warped territory reachable from a top-left category', () => {
    const layout = createEqualAreaRadialLayout(
      items,
      { x: 46, y: 318 },
      fullscreenBounds,
    );

    for (const sector of layout.sectors) {
      expect(findEqualAreaSector(layout, sector.labelPoint)?.id).toBe(sector.id);
    }
    expect(
      Math.min(...layout.sectors[0].polygon.map((point) => point.x)),
    ).toBeLessThanOrEqual(layout.safeBounds.left + 1);
  });

  it('assigns the exact leftward seam to the first warped sector', () => {
    const anchor = { x: 46, y: 318 };
    const layout = createEqualAreaRadialLayout(items, anchor, fullscreenBounds);
    const leftPoint = { x: layout.safeBounds.left, y: anchor.y };

    expect(findEqualAreaSector(layout, leftPoint)?.id).toBe(items[0].id);
  });

  it('opens neutrally and commits only after leaving the anchor dead zone', () => {
    const anchor = { x: 46, y: 318 };
    const layout = createEqualAreaRadialLayout(items, anchor, fullscreenBounds);

    expect(findEqualAreaSector(layout, anchor)).toBeNull();
    expect(resolveEqualAreaRadialRelease(layout, anchor)).toEqual({
      type: 'cancel',
    });

    const target = layout.sectors[1];
    expect(resolveEqualAreaRadialRelease(layout, target.labelPoint)).toEqual({
      type: 'item',
      itemId: target.id,
    });
  });
});
