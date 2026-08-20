import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CategoryGrid } from './CategoryGrid';
import { CATEGORY_GESTURE_SELECTION_ATTRIBUTE } from './categoryGestureSelectionLock';

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

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.removeAttribute(
    CATEGORY_GESTURE_SELECTION_ATTRIBUTE,
  );
});

it('does not select the category after a long-press drag and delayed touch click', async () => {
  vi.useFakeTimers();
  const onSelect = vi.fn();
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
  const tile = screen.getByRole('button', { name: 'Food' });
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
  fireEvent.click(tile);

  expect(onSelect).not.toHaveBeenCalled();
});
