import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RadialMenu } from './index';
import {
  CANCEL_ITEM_ID,
  createEqualAreaRadialLayout,
  type RadialMenuBounds,
  type RadialMenuItemData,
} from './equalAreaSectors';

const items: RadialMenuItemData[] = [
  { id: 'apple-pay', icon: 'WalletCards', label: 'Apple Pay' },
  { id: 'privileges', icon: 'Gem', label: 'Privileges' },
  { id: 'promptpay', icon: 'ScanLine', label: 'PromptPay' },
];

const bounds: RadialMenuBounds = {
  left: 0,
  top: 0,
  width: 390,
  height: 844,
};
const anchor = { x: 46, y: 318 };

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

describe('RadialMenu constellation lens presentation', () => {
  it('draws curved territory contours and keeps the category lens at the press point', () => {
    renderMenu();

    expect(screen.getAllByTestId('radial-menu-contour')).toHaveLength(
      items.length + 1,
    );
    expect(screen.queryByTestId('radial-menu-spotlight')).not.toBeInTheDocument();
    expect(screen.getByTestId('radial-menu-anchor')).toHaveStyle({
      left: `${anchor.x}px`,
      top: `${anchor.y}px`,
    });
    expect(screen.getByTestId('radial-menu-anchor')).toHaveAttribute(
      'data-variant',
      'constellation',
    );
    expect(screen.getByTestId('radial-menu-anchor-label')).toHaveTextContent(
      'Food',
    );
    expect(
      screen
        .getAllByTestId('radial-menu-node')
        .every(
          (node: HTMLElement) =>
            node.getAttribute('data-variant') === 'constellation' &&
            node.getAttribute('data-selected') === 'false',
        ),
    ).toBe(true);
  });

  it('spotlights the selected territory and renders the luminous drag trail', () => {
    const menuItems = [
      ...items,
      { id: CANCEL_ITEM_ID, icon: 'X', label: 'Cancel' },
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

    expect(screen.getByTestId('radial-menu-spotlight')).toHaveAttribute(
      'data-sector-id',
      target.id,
    );
    const selectedNode = screen
      .getAllByTestId('radial-menu-node')
      .find((node) => node.getAttribute('data-sector-id') === target.id);
    expect(selectedNode).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('radial-menu-gesture')).toBeInTheDocument();
    expect(screen.getByTestId('radial-menu-gesture-glow')).toBeInTheDocument();
    expect(screen.getByTestId('radial-menu-gesture-core')).toBeInTheDocument();
    expect(screen.getByTestId('radial-menu-gesture-pointer')).toBeInTheDocument();
  });
});
