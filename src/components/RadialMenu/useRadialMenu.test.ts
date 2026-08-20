import { act, renderHook } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANCEL_ITEM_ID,
  createEqualAreaRadialLayout,
  type RadialMenuItemData,
} from './equalAreaSectors';
import { useRadialMenu } from './useRadialMenu';

const spotlightMocks = vi.hoisted(() => ({
  activate: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('../categoryRadialSpotlight', () => ({
  activateCategoryRadialSpotlight: spotlightMocks.activate,
  clearCategoryRadialSpotlight: spotlightMocks.clear,
}));

type Note = {
  id: string;
  icon: string;
  label: string;
  color?: string;
};

const notes: Note[] = [
  {
    id: 'apple-pay',
    icon: 'WalletCards',
    label: 'Apple Pay',
    color: '#123456',
  },
  { id: 'privileges', icon: 'Gem', label: 'Privileges' },
  { id: 'promptpay', icon: 'ScanLine', label: 'PromptPay' },
];

const fullscreenBounds = {
  left: 0,
  top: 0,
  width: 390,
  height: 844,
};
const originalViewport = {
  width: window.innerWidth,
  height: window.innerHeight,
};

function setViewport(width: number, height: number) {
  Object.defineProperties(window, {
    innerWidth: { configurable: true, value: width },
    innerHeight: { configurable: true, value: height },
  });
}

beforeEach(() => {
  setViewport(fullscreenBounds.width, fullscreenBounds.height);
  spotlightMocks.activate.mockReset();
  spotlightMocks.clear.mockReset();
});

afterAll(() => {
  setViewport(originalViewport.width, originalViewport.height);
});

describe('useRadialMenu equal-area relative drag', () => {
  it('uses the full screen, resolves distinct colors, and spotlights the pressed category', () => {
    const onSelect = vi.fn();
    const onDefault = vi.fn();
    const hook = renderHook(() =>
      useRadialMenu<Note>({
        getItems: () => notes,
        getItemId: (note) => note.id,
        getItemIcon: (note) => note.icon,
        getItemLabel: (note) => note.label,
        getCategoryPresentation: () => ({
          label: 'Food',
          icon: 'Utensils',
          color: '#f97316',
        }),
        onSelect,
        onDefault,
      }),
    );
    const anchor = { x: 46, y: 318 };

    act(() => {
      hook.result.current.handlers.onLongPressStart('Food', anchor, {
        left: 12,
        top: 244,
        width: 351,
        height: 351,
      });
    });

    expect(hook.result.current.state?.bounds).toEqual(fullscreenBounds);
    expect(spotlightMocks.activate).toHaveBeenCalledWith(anchor, '#f97316');
    expect(hook.result.current.menuItems[0]?.color).toBe('#123456');
    expect(
      new Set(hook.result.current.menuItems.map(({ color }) => color)),
    ).toHaveSize(notes.length);

    const menuItems: RadialMenuItemData[] = [
      ...hook.result.current.menuItems,
      { id: CANCEL_ITEM_ID, icon: 'X', label: 'Cancel', color: '#ef4444' },
    ];
    const layout = createEqualAreaRadialLayout(
      menuItems,
      anchor,
      fullscreenBounds,
    );

    act(() => {
      hook.result.current.handlers.onRelease(layout.sectors[1].labelPoint);
    });

    expect(onSelect).toHaveBeenCalledWith(notes[1], 'Food');
    expect(onDefault).not.toHaveBeenCalled();
    expect(spotlightMocks.clear).toHaveBeenCalledOnce();
  });

  it('does not commit anything inside the anchor zone and removes the spotlight', () => {
    const onSelect = vi.fn();
    const onDefault = vi.fn();
    const hook = renderHook(() =>
      useRadialMenu<Note>({
        getItems: () => notes,
        getItemId: (note) => note.id,
        getItemIcon: (note) => note.icon,
        getItemLabel: (note) => note.label,
        onSelect,
        onDefault,
      }),
    );
    const anchor = { x: 46, y: 318 };

    act(() => {
      hook.result.current.handlers.onLongPressStart('Food', anchor);
    });
    act(() => {
      hook.result.current.handlers.onRelease(anchor);
    });

    expect(onSelect).not.toHaveBeenCalled();
    expect(onDefault).not.toHaveBeenCalled();
    expect(spotlightMocks.clear).toHaveBeenCalledOnce();
  });
});
