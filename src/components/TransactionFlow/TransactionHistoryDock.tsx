import { RefreshCw, Search, X } from "lucide-react";
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
  countLabel: string;
  statusLabel: string;
  canRefresh: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
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

export function TransactionHistoryDock({
  search,
  onSearchChange,
  countLabel,
  statusLabel,
  canRefresh,
  isRefreshing,
  onRefresh,
  motionRef,
}: TransactionHistoryDockProps) {
  const accessory = useCategoryStepSheetAccessory();
  const dockRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const portalled = accessory.provided;

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

      // Prevent the browser's default focus, commit the no-transition keyboard
      // snap synchronously, and only then focus while the pointer event still
      // carries mobile user activation.
      event.preventDefault();
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      flushSync(requestKeyboard);
      if (accessory.host?.dataset.categorySheetState === "keyboard") {
        event.currentTarget.focus({ preventScroll: true });
      }
    },
    [accessory.host, accessory.requestKeyboard, portalled],
  );

  const setDockRef = useCallback(
    (element: HTMLDivElement | null) => {
      dockRef.current = element;
      if (element) element.inert = portalled;
    },
    [portalled],
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

      if (
        !moving &&
        !interactive &&
        document.activeElement instanceof HTMLElement &&
        element.contains(document.activeElement)
      ) {
        document.activeElement.blur();
      }
      element.style.transform = `translate3d(${safeX}px, 0, 0)`;
      element.style.pointerEvents = interactive ? "auto" : "none";
      element.style.visibility = hidden ? "hidden" : "visible";
      element.inert = !interactive;
      element.setAttribute("aria-hidden", interactive ? "false" : "true");
      element.dataset.motion = moving ? "moving" : "settled";
      element.dataset.offsetX = String(safeX);
    },
    [],
  );
  useImperativeHandle(motionRef, () => ({ setMotion }), [setMotion]);

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
          onFocus={() => accessory.requestKeyboard?.()}
          onBlur={() => accessory.releaseKeyboard?.()}
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
      <div
        data-testid="transaction-history-metadata"
        className="flex min-h-11 items-center justify-between gap-3 px-1 text-[11px] text-muted-foreground"
      >
        <span>{countLabel}</span>
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate text-right">{statusLabel}</span>
          <button
            type="button"
            aria-label="Refresh transaction history"
            disabled={!canRefresh}
            onClick={onRefresh}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors active:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <RefreshCw
              className={cn("h-4 w-4", isRefreshing && "animate-spin")}
            />
          </button>
        </div>
      </div>
    </div>
  );

  return accessory.host ? createPortal(dock, accessory.host) : dock;
}
