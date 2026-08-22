import { useLayoutEffect, useRef, useState } from 'react';
import { findStickyDatePositionFromOffsets } from './transactionStickyDate';

type AutoStickyDateEntry = {
  element: HTMLDivElement;
  isSticky: boolean;
  setSticky: (isSticky: boolean) => void;
};

type AutoStickyDateRegistry = {
  entries: Map<HTMLDivElement, AutoStickyDateEntry>;
  scheduleUpdate: () => void;
  dispose: () => void;
};

const autoStickyDateRegistries = new WeakMap<
  HTMLElement,
  AutoStickyDateRegistry
>();

function getDocumentOffsetTop(element: HTMLElement): number {
  let offset = 0;
  let current: HTMLElement | null = element;
  while (current) {
    offset += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return offset;
}

function getOffsetWithinScrollRoot(
  scrollRoot: HTMLElement,
  element: HTMLElement,
): number {
  return getDocumentOffsetTop(element) - getDocumentOffsetTop(scrollRoot);
}

function createAutoStickyDateRegistry(
  scrollRoot: HTMLElement,
): AutoStickyDateRegistry {
  const entries = new Map<HTMLDivElement, AutoStickyDateEntry>();
  let frame: number | null = null;

  const update = () => {
    frame = null;
    const orderedEntries = Array.from(entries.values())
      .map((entry) => ({
        entry,
        offset: getOffsetWithinScrollRoot(scrollRoot, entry.element),
      }))
      .sort((left, right) => left.offset - right.offset);
    const firstEntry = orderedEntries[0]?.entry;
    const computedTop = firstEntry
      ? Number.parseFloat(window.getComputedStyle(firstEntry.element).top)
      : Number.NaN;
    const topOffset = Number.isFinite(computedTop) ? computedTop : 0;
    const activePosition = findStickyDatePositionFromOffsets(
      orderedEntries.map(({ offset }) => offset),
      scrollRoot.scrollTop,
      topOffset,
    );
    const activeHeader =
      activePosition === null
        ? null
        : orderedEntries[activePosition]?.entry.element ?? null;

    for (const entry of entries.values()) {
      const nextSticky = entry.element === activeHeader;
      if (entry.isSticky === nextSticky) continue;
      entry.isSticky = nextSticky;
      entry.setSticky(nextSticky);
    }
  };
  const scheduleUpdate = () => {
    if (frame !== null) return;
    frame = window.requestAnimationFrame(update);
  };
  const dispose = () => {
    scrollRoot.removeEventListener('scroll', scheduleUpdate);
    window.removeEventListener('resize', scheduleUpdate);
    if (frame !== null) window.cancelAnimationFrame(frame);
  };

  scrollRoot.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate);
  return { entries, scheduleUpdate, dispose };
}

function registerAutoStickyDateHeader(
  scrollRoot: HTMLElement,
  element: HTMLDivElement,
  setSticky: (isSticky: boolean) => void,
) {
  let registry = autoStickyDateRegistries.get(scrollRoot);
  if (!registry) {
    registry = createAutoStickyDateRegistry(scrollRoot);
    autoStickyDateRegistries.set(scrollRoot, registry);
  }

  registry.entries.set(element, { element, isSticky: false, setSticky });
  registry.scheduleUpdate();
  return () => {
    registry?.entries.delete(element);
    if (registry?.entries.size === 0) {
      registry.dispose();
      autoStickyDateRegistries.delete(scrollRoot);
      return;
    }
    registry?.scheduleUpdate();
  };
}

export function useAutoStickyDateHeader(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [isSticky, setIsSticky] = useState(false);

  useLayoutEffect(() => {
    if (!enabled) {
      setIsSticky(false);
      return;
    }

    const header = ref.current;
    const scrollRoot = header?.closest<HTMLElement>(
      '[data-dashboard-scroll="true"]',
    );
    if (!header || !scrollRoot) {
      setIsSticky(false);
      return;
    }

    return registerAutoStickyDateHeader(scrollRoot, header, setIsSticky);
  }, [enabled]);

  return { ref, isSticky };
}
