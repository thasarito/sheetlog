import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

describe('useRadialMenu equal-area relative drag', () => {
  it('selects the territory reached relative to the long-press position', () => {
    Object.defineProperties(window, {
      innerWidth: { configurable: true, value: 390 },
      innerHeight: { configurable: true, value: 844 },
    });
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
      (
        hook.result.current.handlers.onLongPressStart as unknown as (
          category: string,
          position: { x: number; y: number },
        ) => void
      )('Food', anchor);
    });

    const menuItems: RadialMenuItemData[] = [
      ...notes,
      { id: CANCEL_ITEM_ID, icon: 'X', label: 'Cancel' },
    ];
    const layout = createEqualAreaRadialLayout(menuItems, anchor, {
      left: 0,
      top: 0,
      width: 390,
      height: 844,
    });

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
      (
        hook.result.current.handlers.onLongPressStart as unknown as (
          category: string,
          position: { x: number; y: number },
        ) => void
      )('Food', anchor);
      hook.result.current.handlers.onRelease(anchor);
    });

    expect(onSelect).not.toHaveBeenCalled();
    expect(onDefault).not.toHaveBeenCalled();
  });
});
