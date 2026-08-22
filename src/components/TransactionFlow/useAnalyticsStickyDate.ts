import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { findStickyDatePositionFromOffsets } from './transactionStickyDate';

const DEFAULT_DASHBOARD_HEADER_HEIGHT = 68;

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

function resolvedDashboardHeaderSpace(scrollRoot: HTMLElement): number {
  const slide = scrollRoot.closest<HTMLElement>(
    '[data-home-carousel-slide-index]',
  );
  const owner = slide ?? scrollRoot;
  const declaredSpace = Number.parseFloat(
    window
      .getComputedStyle(owner)
      .getPropertyValue('--dashboard-header-space'),
  );
  if (Number.isFinite(declaredSpace)) return Math.max(0, declaredSpace);

  const declaredHeight = Number.parseFloat(
    window
      .getComputedStyle(scrollRoot)
      .getPropertyValue('--dashboard-header-height'),
  );
  const headerHeight = Number.isFinite(declaredHeight)
    ? declaredHeight
    : DEFAULT_DASHBOARD_HEADER_HEIGHT;
  return Math.max(0, headerHeight - scrollRoot.scrollTop);
}

export function useAnalyticsStickyDate(dateKeys: readonly string[]) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const transactionSectionRef = useRef<HTMLElement>(null);
  const frameRef = useRef<number | null>(null);
  const [stickyDateKey, setStickyDateKey] = useState<string | null>(null);

  const update = useCallback(() => {
    const scrollRoot = scrollRef.current;
    const transactionSection = transactionSectionRef.current;
    if (!scrollRoot || !transactionSection) {
      setStickyDateKey(null);
      return;
    }

    const validDateKeys = new Set(dateKeys);
    const orderedHeaders = Array.from(
      transactionSection.querySelectorAll<HTMLElement>(
        '[data-transaction-history-date-key]',
      ),
    )
      .map((element) => ({
        element,
        dateKey: element.dataset.transactionHistoryDateKey ?? '',
        offset: getOffsetWithinScrollRoot(scrollRoot, element),
      }))
      .filter(({ dateKey }) => validDateKeys.has(dateKey))
      .sort((left, right) => left.offset - right.offset);

    const activePosition = findStickyDatePositionFromOffsets(
      orderedHeaders.map(({ offset }) => offset),
      scrollRoot.scrollTop,
      resolvedDashboardHeaderSpace(scrollRoot),
    );
    const nextDateKey =
      activePosition === null
        ? null
        : orderedHeaders[activePosition]?.dateKey || null;
    setStickyDateKey((current) =>
      current === nextDateKey ? current : nextDateKey,
    );
  }, [dateKeys]);

  const scheduleUpdate = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      update();
    });
  }, [update]);

  useLayoutEffect(() => {
    update();
    const scrollRoot = scrollRef.current;
    const transactionSection = transactionSectionRef.current;
    if (
      !scrollRoot ||
      !transactionSection ||
      typeof ResizeObserver === 'undefined'
    ) {
      return;
    }

    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(scrollRoot);
    observer.observe(transactionSection);
    return () => observer.disconnect();
  }, [scheduleUpdate, update]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    },
    [],
  );

  return {
    scrollRef,
    transactionSectionRef,
    stickyDateKey,
    scheduleUpdate,
  };
}
