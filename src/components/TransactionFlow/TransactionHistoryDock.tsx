import { Search, X } from "lucide-react";
import {
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { createPortal, flushSync } from "react-dom";
import { cn } from "../../lib/utils";
import { useCategoryStepSheetAccessory } from "./CategoryStepSheetAccessory";

export type TransactionHistoryDockProps = {
  search: string;
  onSearchChange: (value: string) => void;
  motionRef?: RefObject<TransactionHistoryDockMotionHandle | null>;
};

export type TransactionHistoryDockMotion = {
  x: number;
  viewportWidth: number;
  interactive: boolean;
  moving: boolean;
};

export type TransactionHistoryDockMotionHandle = {
  setMotion: (motion: TransactionHistoryDockMotion) => void;
};

type PendingKeyboardTap = {
  input: HTMLInputElement;
  pointerId: number;
};

type ScrollTimelineConstructor = new (options: {
  source: Element;
  axis: "x";
}) => AnimationTimeline;

type ScrollDrivenAnimation = {
  source: HTMLElement;
  viewportWidth: number;
  animation: Animation;
};

type DockSemanticState = {
  interactive: boolean;
  moving: boolean;
  hidden: boolean;
};

function scrollTimelineConstructor(): ScrollTimelineConstructor | null {
  const constructor = (
    window as Window & { ScrollTimeline?: ScrollTimelineConstructor }
  ).ScrollTimeline;
  return typeof constructor === "function" ? constructor : null;
}

export function TransactionHistoryDock({
  search,
  onSearchChange,
  motionRef,
}: TransactionHistoryDockProps) {
  const accessory = useCategoryStepSheetAccessory();
  const dockRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const pendingKeyboardTapRef = useRef<PendingKeyboardTap | null>(null);
  const documentClickGuardRef = useRef<((event: MouseEvent) => void) | null>(
    null,
  );
  const clickGuardTimeoutRef = useRef<number | null>(null);
  const scrollDrivenAnimationRef = useRef<ScrollDrivenAnimation | null>(null);
  const scrollTimelineSupportedRef = useRef<boolean | null>(null);
  const semanticStateRef = useRef<DockSemanticState | null>(null);
  const portalled = accessory.provided;

  const clearPendingKeyboardTap = useCallback(() => {
    const clickGuard = documentClickGuardRef.current;
    if (clickGuard) {
      document.removeEventListener("click", clickGuard, true);
      documentClickGuardRef.current = null;
    }
    if (clickGuardTimeoutRef.current !== null) {
      window.clearTimeout(clickGuardTimeoutRef.current);
      clickGuardTimeoutRef.current = null;
    }
    pendingKeyboardTapRef.current = null;
  }, []);

  const clearSearch = () => {
    onSearchChange("");
    window.requestAnimationFrame(() =>
      searchRef.current?.focus({ preventScroll: true }),
    );
  };

  const prepareKeyboardState = useCallback(
    (event: ReactPointerEvent<HTMLInputElement>) => {
      const requestKeyboard = accessory.requestKeyboard;
      if (
        !portalled ||
        !requestKeyboard ||
        document.activeElement === event.currentTarget
      ) {
        return;
      }

      clearPendingKeyboardTap();
      const input = event.currentTarget;
      pendingKeyboardTapRef.current = {
        input,
        pointerId: event.pointerId,
      };

      const guardRetargetedClick = (clickEvent: MouseEvent) => {
        const pendingTap = pendingKeyboardTapRef.current;
        if (!pendingTap || pendingTap.input !== input) return;

        // The dock moves before pointerup. Mobile Safari can therefore retarget
        // the synthesized click to the transaction row now under the finger.
        // Consume that click globally and keep Search as the activation target.
        clickEvent.preventDefault();
        clickEvent.stopImmediatePropagation();
        pendingTap.input.focus({ preventScroll: true });
        clearPendingKeyboardTap();
      };
      documentClickGuardRef.current = guardRetargetedClick;
      document.addEventListener("click", guardRetargetedClick, true);

      // Keep Vaul out of this pointer sequence and retain the original target
      // while the sheet changes height underneath the stationary finger.
      event.stopPropagation();
      try {
        if (!input.hasPointerCapture(event.pointerId)) {
          input.setPointerCapture(event.pointerId);
        }
      } catch {
        // Pointer capture is best-effort; the document click guard is the
        // fallback for browsers that reject capture on form controls.
      }

      flushSync(requestKeyboard);
    },
    [accessory.requestKeyboard, clearPendingKeyboardTap, portalled],
  );

  const finishKeyboardTap = useCallback(
    (event: ReactPointerEvent<HTMLInputElement>) => {
      const pendingTap = pendingKeyboardTapRef.current;
      if (!pendingTap || pendingTap.pointerId !== event.pointerId) return;

      event.stopPropagation();
      pendingTap.input.focus({ preventScroll: true });
      try {
        if (pendingTap.input.hasPointerCapture(event.pointerId)) {
          pendingTap.input.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Pointer capture may already have been released by the browser.
      }

      // A synthesized click normally follows immediately. Avoid leaving a
      // one-shot global guard behind if a browser omits it.
      clickGuardTimeoutRef.current = window.setTimeout(() => {
        clearPendingKeyboardTap();
        if (document.activeElement !== pendingTap.input) {
          accessory.releaseKeyboard?.();
        }
      }, 500);
    },
    [accessory.releaseKeyboard, clearPendingKeyboardTap],
  );

  const cancelKeyboardTap = useCallback(
    (event: ReactPointerEvent<HTMLInputElement>) => {
      const pendingTap = pendingKeyboardTapRef.current;
      if (!pendingTap || pendingTap.pointerId !== event.pointerId) return;

      event.stopPropagation();
      clearPendingKeyboardTap();
      if (document.activeElement !== pendingTap.input) {
        accessory.releaseKeyboard?.();
      }
    },
    [accessory.releaseKeyboard, clearPendingKeyboardTap],
  );

  const setDockRef = useCallback(
    (element: HTMLDivElement | null) => {
      dockRef.current = element;
      if (element) element.inert = portalled;
    },
    [portalled],
  );

  const ensureScrollDrivenMotion = useCallback(
    (element: HTMLDivElement, viewportWidth: number): boolean => {
      if (scrollTimelineSupportedRef.current === false) return false;

      const existing = scrollDrivenAnimationRef.current;
      if (existing && existing.viewportWidth === viewportWidth) {
        return true;
      }

      const ScrollTimeline = scrollTimelineConstructor();
      if (!ScrollTimeline || typeof element.animate !== "function") {
        scrollTimelineSupportedRef.current = false;
        element.dataset.horizontalTracking = "script";
        return false;
      }

      const source = document.querySelector<HTMLElement>(
        '[data-testid="home-carousel-viewport"]',
      );
      if (!source || viewportWidth <= 0) return false;

      if (existing) existing.animation.cancel();
      try {
        const timeline = new ScrollTimeline({ source, axis: "x" });
        const animation = element.animate(
          [
            { transform: `translate3d(${viewportWidth}px, 0, 0)` },
            { transform: `translate3d(${-viewportWidth}px, 0, 0)` },
          ],
          {
            duration: 1,
            fill: "both",
            timeline,
          } as KeyframeAnimationOptions & { timeline: AnimationTimeline },
        );
        scrollDrivenAnimationRef.current = {
          source,
          viewportWidth,
          animation,
        };
        scrollTimelineSupportedRef.current = true;
        element.style.removeProperty("transform");
        element.dataset.horizontalTracking = "scroll-timeline";
        return true;
      } catch {
        scrollTimelineSupportedRef.current = false;
        element.dataset.horizontalTracking = "script";
        return false;
      }
    },
    [],
  );

  const setMotion = useCallback(
    ({ x, viewportWidth, interactive, moving }: TransactionHistoryDockMotion) => {
      const element = dockRef.current;
      if (!element) return;
      const safeX = Number.isFinite(x) ? x : 0;
      const safeViewportWidth = Number.isFinite(viewportWidth)
        ? Math.max(0, viewportWidth)
        : 0;
      const hidden =
        !moving &&
        !interactive &&
        safeViewportWidth > 0 &&
        Math.abs(safeX) >= safeViewportWidth - 1;
      const scrollDriven = ensureScrollDrivenMotion(element, safeViewportWidth);

      if (
        !moving &&
        !interactive &&
        document.activeElement instanceof HTMLElement &&
        element.contains(document.activeElement)
      ) {
        document.activeElement.blur();
      }

      if (!scrollDriven) {
        element.style.transform = `translate3d(${safeX}px, 0, 0)`;
        element.dataset.offsetX = String(safeX);
      }

      const previous = semanticStateRef.current;
      if (
        !previous ||
        previous.interactive !== interactive ||
        previous.moving !== moving ||
        previous.hidden !== hidden
      ) {
        element.style.pointerEvents = interactive ? "auto" : "none";
        element.style.visibility = hidden ? "hidden" : "visible";
        element.inert = !interactive;
        element.setAttribute("aria-hidden", interactive ? "false" : "true");
        element.dataset.motion = moving ? "moving" : "settled";
        semanticStateRef.current = { interactive, moving, hidden };
      }
    },
    [ensureScrollDrivenMotion],
  );
  useImperativeHandle(motionRef, () => ({ setMotion }), [setMotion]);

  useLayoutEffect(() => clearPendingKeyboardTap, [clearPendingKeyboardTap]);

  useLayoutEffect(
    () => () => {
      scrollDrivenAnimationRef.current?.animation.cancel();
      scrollDrivenAnimationRef.current = null;
    },
    [],
  );

  useLayoutEffect(() => {
    if (!accessory.provided || !accessory.host || !dockRef.current) return;

    const measure = () => {
      const height = dockRef.current?.getBoundingClientRect().height ?? 0;
      accessory.reportHeight(height);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(dockRef.current);
    return () => observer.disconnect();
  }, [accessory]);

  if (accessory.provided && !accessory.host) return null;

  const dock = (
    <div
      ref={setDockRef}
      data-testid="transaction-history-dock"
      data-home-carousel-swipe-lock="true"
      data-vaul-no-drag
      data-motion="settled"
      data-horizontal-tracking="script"
      data-offset-x="0"
      aria-hidden={portalled}
      className="pointer-events-auto relative mx-3 rounded-2xl border border-border/70 bg-background/95 p-2 backdrop-blur-md"
      style={
        portalled
          ? {
              pointerEvents: "none",
              transform: "translate3d(100%, 0, 0)",
              visibility: "hidden",
            }
          : undefined
      }
    >
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-full h-2 w-px -translate-x-1/2 bg-border/80"
      />
      <div className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={searchRef}
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          onPointerDown={prepareKeyboardState}
          onPointerUp={finishKeyboardTap}
          onPointerCancel={cancelKeyboardTap}
          onFocus={() => accessory.requestKeyboard?.()}
          onBlur={() => {
            if (!pendingKeyboardTapRef.current) {
              accessory.releaseKeyboard?.();
            }
          }}
          placeholder="Search category, note, or account"
          aria-label="Search transaction history"
          className={cn(
            "h-11 w-full rounded-xl border border-border bg-surface pl-10 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring [&::-webkit-search-cancel-button]:hidden",
            search ? "pr-12" : "pr-3",
          )}
        />
        {search ? (
          <button
            type="button"
            aria-label="Clear transaction search"
            onPointerDown={(event) => event.preventDefault()}
            onClick={clearSearch}
            className="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );

  return accessory.host ? createPortal(dock, accessory.host) : dock;
}
