import { describe, expect, it } from 'vitest';
import {
  createEqualAreaRadialLayout,
  type RadialMenuBounds,
  type RadialMenuItemData,
} from './equalAreaSectors';

const bounds: RadialMenuBounds = {
  left: 0,
  top: 0,
  width: 390,
  height: 844,
};

const items: RadialMenuItemData[] = [
  { id: 'apple-pay', icon: 'WalletCards', label: 'Apple Pay', color: '#3b82f6' },
  { id: 'privileges', icon: 'Gem', label: 'Privileges', color: '#a855f7' },
  { id: 'promptpay', icon: 'ScanLine', label: 'PromptPay', color: '#14b8a6' },
  { id: 'cash', icon: 'Banknote', label: 'Cash', color: '#f59e0b' },
  { id: '__cancel__', icon: 'X', label: 'Cancel', color: '#ef4444' },
];

describe('larger equal-area radial targets', () => {
  it('reserves room for larger visible nodes and a larger node hit target', () => {
    const layout = createEqualAreaRadialLayout(items, { x: 46, y: 318 }, bounds);

    expect(layout.nodeHitRadius).toBeGreaterThanOrEqual(40);
    for (const sector of layout.sectors) {
      expect(sector.labelPoint.x).toBeGreaterThanOrEqual(66);
      expect(sector.labelPoint.x).toBeLessThanOrEqual(324);
      expect(sector.labelPoint.y).toBeGreaterThanOrEqual(52);
      expect(sector.labelPoint.y).toBeLessThanOrEqual(792);
      expect(sector.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
