import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activateCategoryRadialSpotlight,
  clearCategoryRadialSpotlight,
} from '../categoryRadialSpotlight';
import { RadialMenu } from './index';
import {
  CANCEL_ITEM_ID,
  createEqualAreaRadialLayout,
  type RadialMenuBounds,
  type RadialMenuItemData,
} from './equalAreaSectors';

const items: RadialMenuItemData[] = [
  {
    id: 'apple-pay',
    icon: 'WalletCards',
    label: 'Apple Pay',
    color: '#3b82f6',
  },
  {
    id: 'privileges',
    icon: 'Gem',
    label: 'Privileges',
    color: '#a855f7',
  },
  {
    id: 'promptpay',
    icon: 'ScanLine',
    label: 'PromptPay',
    color: '#14b8a6',
  },
];

const bounds: RadialMenuBounds = {
  left: 0,
  top: 0,
  width: 390,
  height: 844,
};
const anchor = { x: 46, y: 318 };

function installCategoryIcon() {
  const grid = document.createElement('div');
  grid.dataset.testid = 'category-grid';
  const tile = document.createElement('button');
  const iconRegion = document.createElement('span');
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  iconRegion.append(icon);
  tile.append(iconRegion);
  grid.append(tile);
  document.body.append(grid);

  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: vi.fn(() => icon),
  });
  Object.defineProperty(icon, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 22,
      y: 280,
      left: 22,
      top: 280,
      right: 54,
      bottom: 312,
      width: 32,
      height: 32,
      toJSON: () => ({}),
    }),
  });
  Object.defineProperty(iconRegion, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 12,
      y: 260,
      left: 12,
      top: 260,
      right: 72,
      bottom: 328,
      width: 60,
      height: 68,
      toJSON: () => ({}),
    }),
  });

  activateCategoryRadialSpotlight(anchor, '#ef8b55');
  return iconRegion;
}

function renderMenu(dragPosition = anchor) {
  return render(
    <RadialMenu
      items={items}
      anchorPosition={anchor}
      dragPosition={dragPosition}
      bounds={bounds}
      categoryPresentation={{
        label: 'Food',
        icon: 'Utensils',
        color: '#ef8b55',
      }}
      isOpen
      onCancel={vi.fn()}
    />,
  );
}

afterEach(() => {
  clearCategoryRadialSpotlight();
  vi.restoreAllMocks();
});

describe('RadialMenu equal-area full-screen presentation', () => {
  it('colors and enlarges every territory while revealing the real category icon', () => {
    const iconRegion = installCategoryIcon();
    renderMenu();

    expect(screen.getAllByTestId('radial-menu-sector')).toHaveLength(
      items.length + 1,
    );
    expect(screen.queryByTestId('radial-menu-anchor')).not.toBeInTheDocument();
    expect(iconRegion).toHaveAttribute('data-category-radial-source', 'true');
    expect(screen.getByTestId('radial-menu-backdrop')).toHaveAttribute(
      'data-spotlight-center',
      '38,296',
    );
    expect(screen.getByTestId('radial-menu-sector-apple-pay')).toHaveAttribute(
      'data-sector-color',
      '#3b82f6',
    );
    expect(screen.getAllByTestId('radial-menu-node-circle')[0]).toHaveClass(
      'h-14',
      'w-14',
    );
    expect(
      screen
        .getAllByTestId('radial-menu-sector')
        .some(
          (sector: HTMLElement) =>
            sector.getAttribute('data-selected') === 'true',
        ),
    ).toBe(false);
  });

  it('highlights the reached territory with that Quick Note color', () => {
    installCategoryIcon();
    const menuItems = [
      ...items,
      { id: CANCEL_ITEM_ID, icon: 'X', label: 'Cancel', color: '#ef4444' },
    ];
    const layout = createEqualAreaRadialLayout(menuItems, anchor, bounds);
    const target = layout.sectors[1];
    const rendered = renderMenu();

    rendered.rerender(
      <RadialMenu
        items={items}
        anchorPosition={anchor}
        dragPosition={target.labelPoint}
        bounds={bounds}
        categoryPresentation={{
          label: 'Food',
          icon: 'Utensils',
          color: '#ef8b55',
        }}
        isOpen
        onCancel={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId(`radial-menu-sector-${target.id}`),
    ).toHaveAttribute('data-selected', 'true');
    expect(
      screen.getByTestId(`radial-menu-sector-${target.id}`),
    ).toHaveAttribute('data-sector-color', target.color);
    expect(screen.getByTestId('radial-menu-gesture')).toHaveAttribute(
      'data-active-color',
      target.color,
    );
  });
});
