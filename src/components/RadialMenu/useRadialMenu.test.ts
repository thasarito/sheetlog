import { act, renderHook } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANCEL_ITEM_ID,
  createEqualAreaRadialLayout,
  type RadialMenuItemData,
} from './equalAreaSectors';
import { useRadialMenu } from './useRadialMenu';

type Note = {
  id: string;
  icon: string;
  label: string;
};

const notes: Note[] = [
  { id: 'apple-pay', icon: 'WalletCards', label: 'Apple Pay' },
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
});

afterAll(() => {
  setViewport(originalViewport.width, originalViewport.height);
});

describe('useRadialMenu equal-area relative drag', () => {
  it('uses the full screen and selects the territory reached from the press point', () => {
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
      hook.result.current.handlers.onLongPressStart('Food', anchor, {
        left: 12,
        top: 244,
        width: 351,
        height: 351,
      });
    });

    expect(hook.result.current.state?.bounds).toEqual(fullscreenBounds);

    const menuItems: RadialMenuItemData[] = [
      ...notes,
      { id: CANCEL_ITEM_ID, icon: 'X', label: 'Cancel' },
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
  });

  it('does not commit anything when released inside the anchor dead zone', () => {
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
  });
});
