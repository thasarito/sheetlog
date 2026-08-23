import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CategoryGrid } from './CategoryGrid';
import {
  CATEGORY_GESTURE_SELECTION_ATTRIBUTE,
  installCategoryGestureSelectionGuard,
} from './categoryGestureSelectionLock';

function touch(identifier: number, clientX: number, clientY: number): Touch {
  return { identifier, clientX, clientY } as Touch;
}

function dispatchTouch(
  target: HTMLElement | Document,
  type: 'touchstart' | 'touchmove' | 'touchend',
  touches: Touch[],
  changedTouches: Touch[],
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    touches: { configurable: true, value: touches },
    changedTouches: { configurable: true, value: changedTouches },
  });
  fireEvent(target, event);
  return event;
}

function renderLongPressGrid(onSelect = vi.fn()) {
  const removeSelectionGuard = installCategoryGestureSelectionGuard(document);
  const onLongPress = vi.fn();
  const onDrag = vi.fn();
  const onRelease = vi.fn();

  render(
    <CategoryGrid
      categories={[{ name: 'Food', icon: 'Utensils', color: '#ef4444' }]}
      transactionType="expense"
      onSelect={onSelect}
      onLongPress={onLongPress}
      onDrag={onDrag}
      onRelease={onRelease}
    />,
  );

  return {
    tile: screen.getByRole('button', { name: 'Food' }),
    onSelect,
    onLongPress,
    onDrag,
    onRelease,
    removeSelectionGuard,
  };
}

async function releaseStationaryLongPress(tile: HTMLElement, identifier: number) {
  const start = touch(identifier, 28, 620);
  dispatchTouch(tile, 'touchstart', [start], [start]);
  await act(async () => vi.advanceTimersByTimeAsync(400));
  return dispatchTouch(document, 'touchend', [], [start]);
}

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.removeAttribute(
    CATEGORY_GESTURE_SELECTION_ATTRIBUTE,
  );
});

it('does not select the category after a long-press drag and delayed touch click', async () => {
  vi.useFakeTimers();
  const {
    tile,
    onSelect,
    onDrag,
    onRelease,
    removeSelectionGuard,
  } = renderLongPressGrid();

  try {
    const start = touch(73, 28, 620);

    dispatchTouch(tile, 'touchstart', [start], [start]);
    expect(document.documentElement).toHaveAttribute(
      CATEGORY_GESTURE_SELECTION_ATTRIBUTE,
      'true',
    );
    await act(async () => vi.advanceTimersByTimeAsync(400));

    const moved = touch(73, 188, 420);
    const moveEvent = dispatchTouch(document, 'touchmove', [moved], [moved]);
    const endEvent = dispatchTouch(document, 'touchend', [], [moved]);

    expect(moveEvent.defaultPrevented).toBe(true);
    expect(endEvent.defaultPrevented).toBe(true);
    expect(onDrag).toHaveBeenCalledWith({ x: 188, y: 420 });
    expect(onRelease).toHaveBeenCalledWith({ x: 188, y: 420 });
    expect(document.documentElement).not.toHaveAttribute(
      CATEGORY_GESTURE_SELECTION_ATTRIBUTE,
    );

    await act(async () => vi.advanceTimersByTimeAsync(300));
    fireEvent.click(tile, { detail: 1 });

    expect(onSelect).not.toHaveBeenCalled();
  } finally {
    removeSelectionGuard();
  }
});

it('suppresses a deferred category click after a stationary long press', async () => {
  vi.useFakeTimers();
  const { tile, onSelect, onRelease, removeSelectionGuard } =
    renderLongPressGrid();

  try {
    const endEvent = await releaseStationaryLongPress(tile, 74);

    expect(endEvent.defaultPrevented).toBe(true);
    expect(onRelease).toHaveBeenCalledWith({ x: 28, y: 620 });

    // Safari can defer the synthetic category click until a later tap elsewhere.
    // It must remain suppressed even after the previous one-second timeout.
    await act(async () => vi.advanceTimersByTimeAsync(1500));
    fireEvent.click(tile, { detail: 1 });

    expect(onSelect).not.toHaveBeenCalled();
  } finally {
    removeSelectionGuard();
  }
});

it('allows a fresh intentional tap after a stationary long press', async () => {
  vi.useFakeTimers();
  const { tile, onSelect, removeSelectionGuard } = renderLongPressGrid();

  try {
    await releaseStationaryLongPress(tile, 75);
    await act(async () => vi.advanceTimersByTimeAsync(1500));

    const nextTap = touch(76, 28, 620);
    dispatchTouch(tile, 'touchstart', [nextTap], [nextTap]);
    dispatchTouch(document, 'touchend', [], [nextTap]);
    fireEvent.click(tile, { detail: 1 });

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith('Food');
  } finally {
    removeSelectionGuard();
  }
});
