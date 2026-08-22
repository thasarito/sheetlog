import { useLayoutEffect, useRef, useState } from 'react';

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

function createAutoStickyDateRegistry(
  scrollRoot: HTMLElement,
): AutoStickyDateRegistry {
  const entries = new Map<HTMLDivElement, AutoStickyDateEntry>();
  let frame: number | null = null;

  const update = () => {
    frame = null;
    const firstEntry = entries.values().next().value as
      | AutoStickyDateEntry
      | undefined;
    let activeHeader: HTMLDivElement | null = null;

    if (firstEntry && scrollRoot.scrollTop > 0.5) {
      const rootRect = scrollRoot.getBoundingClientRect();
      const firstRect = firstEntry.element.getBoundingClientRect();
      const computedTop = Number.parseFloat(
        window.getComputedStyle(firstEntry.element).top,
      );
      const topOffset = Number.isFinite(computedTop) ? computedTop : 0;
      const stickyLine = rootRect.top + topOffset + 1;

      if (typeof document.elementFromPoint === 'function') {
        const x = Math.min(
          rootRect.right - 1,
          Math.max(rootRect.left + 1, rootRect.right - 16),
        );
        const y = Math.min(
          rootRect.bottom - 1,
          stickyLine + Math.min(firstRect.height / 2, 16),
        );
        const topElement = document.elementFromPoint(x, y);
        const candidate = topElement?.closest<HTMLDivElement>(
          '[data-auto-sticky-date-header="true"]',
        );
        if (candidate && entries.has(candidate)) activeHeader = candidate;
      }

      if (!activeHeader) {
        for (const entry of entries.values()) {
          const rect = entry.element.getBoundingClientRect();
          if (rect.top <= stickyLine && rect.bottom > stickyLine) {
            activeHeader = entry.element;
          }
        }
      }
    }

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
