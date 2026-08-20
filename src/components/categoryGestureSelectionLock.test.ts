import { describe, expect, it, vi } from 'vitest';
import {
  acquireCategoryGestureSelectionLock,
  CATEGORY_GESTURE_SELECTION_ATTRIBUTE,
} from './categoryGestureSelectionLock';

type StoredListener = EventListenerOrEventListenerObject;

function createFakeDocument() {
  const attributes = new Map<string, string>();
  const listeners = new Map<string, Set<StoredListener>>();
  let rangeCount = 1;
  const removeAllRanges = vi.fn(() => {
    rangeCount = 0;
  });

  const documentElement = {
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
    hasAttribute: (name: string) => attributes.has(name),
    getAttribute: (name: string) => attributes.get(name) ?? null,
  } as unknown as HTMLElement;

  const document = {
    documentElement,
    getSelection: () => ({
      get rangeCount() {
        return rangeCount;
      },
      removeAllRanges,
    }),
    addEventListener: (type: string, listener: StoredListener) => {
      const typeListeners = listeners.get(type) ?? new Set<StoredListener>();
      typeListeners.add(listener);
      listeners.set(type, typeListeners);
    },
    removeEventListener: (type: string, listener: StoredListener) => {
      listeners.get(type)?.delete(listener);
    },
  } as unknown as Document;

  const dispatch = (type: string) => {
    const event = new Event(type, { cancelable: true });
    for (const listener of listeners.get(type) ?? []) {
      if (typeof listener === 'function') {
        listener.call(document, event);
      } else {
        listener.handleEvent(event);
      }
    }
    return event;
  };

  return {
    document,
    dispatch,
    listenerCount: (type: string) => listeners.get(type)?.size ?? 0,
    removeAllRanges,
    setRangeCount: (value: number) => {
      rangeCount = value;
    },
  };
}

describe('category gesture document selection lock', () => {
  it('prevents and clears native selection until the final owner releases', () => {
    const fake = createFakeDocument();

    const releaseFirst = acquireCategoryGestureSelectionLock(fake.document);
    const releaseSecond = acquireCategoryGestureSelectionLock(fake.document);

    expect(
      fake.document.documentElement.getAttribute(
        CATEGORY_GESTURE_SELECTION_ATTRIBUTE,
      ),
    ).toBe('true');
    expect(fake.listenerCount('selectstart')).toBe(1);
    expect(fake.listenerCount('selectionchange')).toBe(1);
    expect(fake.removeAllRanges).toHaveBeenCalledOnce();

    fake.setRangeCount(1);
    const selectStart = fake.dispatch('selectstart');
    expect(selectStart.defaultPrevented).toBe(true);
    expect(fake.removeAllRanges).toHaveBeenCalledTimes(2);

    fake.setRangeCount(1);
    fake.dispatch('selectionchange');
    expect(fake.removeAllRanges).toHaveBeenCalledTimes(3);

    releaseFirst();
    expect(
      fake.document.documentElement.hasAttribute(
        CATEGORY_GESTURE_SELECTION_ATTRIBUTE,
      ),
    ).toBe(true);

    releaseSecond();
    expect(
      fake.document.documentElement.hasAttribute(
        CATEGORY_GESTURE_SELECTION_ATTRIBUTE,
      ),
    ).toBe(false);
    expect(fake.listenerCount('selectstart')).toBe(0);
    expect(fake.listenerCount('selectionchange')).toBe(0);
  });
});
