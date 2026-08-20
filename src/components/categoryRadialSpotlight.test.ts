import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activateCategoryRadialSpotlight,
  clearCategoryRadialSpotlight,
  getCategoryRadialSpotlight,
} from './categoryRadialSpotlight';

afterEach(() => {
  clearCategoryRadialSpotlight();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('category radial spotlight', () => {
  it('highlights the original category icon and records its pre-highlight bounds', () => {
    const grid = document.createElement('div');
    grid.dataset.testid = 'category-grid';
    const tile = document.createElement('button');
    const iconRegion = document.createElement('span');
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const label = document.createElement('span');
    label.textContent = 'Food';
    iconRegion.append(icon);
    tile.append(iconRegion, label);
    grid.append(tile);
    document.body.append(grid);

    vi.spyOn(document, 'elementFromPoint').mockReturnValue(label);
    vi.spyOn(iconRegion, 'getBoundingClientRect').mockReturnValue({
      x: 22,
      y: 280,
      left: 22,
      top: 280,
      right: 54,
      bottom: 312,
      width: 32,
      height: 32,
      toJSON: () => ({}),
    });

    const spotlight = activateCategoryRadialSpotlight(
      { x: 34, y: 318 },
      '#f97316',
    );

    expect(spotlight?.bounds).toEqual({
      left: 22,
      top: 280,
      width: 32,
      height: 32,
    });
    expect(getCategoryRadialSpotlight()).toMatchObject({ color: '#f97316' });
    expect(iconRegion).toHaveAttribute('data-category-radial-source', 'true');
    expect(iconRegion.querySelector('[data-category-radial-halo="true"]')).toBeTruthy();
    expect(icon).toHaveStyle({ color: 'white' });
  });

  it('removes the transient highlight without replacing the category icon', () => {
    const grid = document.createElement('div');
    grid.dataset.testid = 'category-grid';
    const tile = document.createElement('button');
    const iconRegion = document.createElement('span');
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    iconRegion.append(icon);
    tile.append(iconRegion);
    grid.append(tile);
    document.body.append(grid);

    vi.spyOn(document, 'elementFromPoint').mockReturnValue(tile);
    vi.spyOn(iconRegion, 'getBoundingClientRect').mockReturnValue({
      x: 40,
      y: 300,
      left: 40,
      top: 300,
      right: 72,
      bottom: 332,
      width: 32,
      height: 32,
      toJSON: () => ({}),
    });

    activateCategoryRadialSpotlight({ x: 55, y: 320 }, '#22c55e');
    clearCategoryRadialSpotlight();

    expect(getCategoryRadialSpotlight()).toBeNull();
    expect(iconRegion).not.toHaveAttribute('data-category-radial-source');
    expect(iconRegion.querySelector('[data-category-radial-halo="true"]')).toBeNull();
    expect(icon.isConnected).toBe(true);
  });
});
