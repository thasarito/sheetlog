import { endOfDay, startOfMonth } from "date-fns";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  type UIEvent as ReactUIEvent,
} from "react";
import type { TransactionRecord } from "../../lib/types";
import { DASHBOARD_SLIDES } from "../dashboardSlides";
import type { DashboardHeaderMotionHandle } from "../Header";
import { SettingsView } from "../SettingsView";
import {
  buildAnalyticsPeriodOptions,
  buildAnalyticsSummary,
  type AnalyticsRange,
} from "./analytics";
import { AnalyticsSheetMorph } from "./AnalyticsSheetMorph";
import type { TransactionHistoryDockMotionHandle } from "./TransactionHistoryDock";
import { TransactionHistoryView } from "./TransactionHistoryView";
import type { AnalyticsSyncController } from "./useAnalyticsSync";

type HomeDashboardCarouselProps = {
  baseCurrency: string;
  bigSpendingThreshold: number | null;
  analyticsSync: AnalyticsSyncController;
  onToast: (message: string) => void;
  onEditTransaction: (transaction: TransactionRecord) => void;
  headerMotionRef?: RefObject<DashboardHeaderMotionHandle | null>;
};

const SLIDES = DASHBOARD_SLIDES;
const HEADER_COLLAPSE_DISTANCE = 68;
const SCROLL_SETTLE_DELAY_MS = 150;
const SNAP_TOLERANCE_PX = 1.25;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function headerCollapseProgress(element: HTMLElement): number {
  return Math.min(
    1,
    Math.max(0, element.scrollTop / HEADER_COLLAPSE_DISTANCE),
  );
}

function slideIndexForPosition(position: number): number {
  return clamp(Math.round(position), 0, SLIDES.length - 1);
}

function settledDirection(fromIndex: number, toIndex: number): string {
  if (toIndex > fromIndex) return "forward";
  if (toIndex < fromIndex) return "backward";
  return "none";
}

export function HomeDashboardCarousel({
  baseCurrency,
  bigSpendingThreshold,
  analyticsSync,
  onToast,
  onEditTransaction,
  headerMotionRef,
}: HomeDashboardCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [range, setRange] = useState<AnalyticsRange>("week");
  const [periodOffset, setPeriodOffset] = useState(0);
  const [noBigSpending, setNoBigSpending] = useState(false);
  const [analyticsNow, setAnalyticsNow] = useState(() => new Date());
  const [customPeriod, setCustomPeriod] = useState(() => ({
    start: startOfMonth(analyticsNow),
    end: endOfDay(analyticsNow),
  }));
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<Array<HTMLElement | null>>([]);
  const transactionDockMotionRef =
    useRef<TransactionHistoryDockMotionHandle | null>(null);
  const activeIndexRef = useRef(0);
  const verticalProgressRef = useRef<number[]>(SLIDES.map(() => 0));
  const settleTimerRef = useRef<number | undefined>(undefined);
  const settleHorizontalScrollRef = useRef<() => void>(() => undefined);

  const transactions = analyticsSync.records;
  const periodOptions = useMemo(
    () => buildAnalyticsPeriodOptions(range, transactions, analyticsNow),
    [analyticsNow, range, transactions],
  );
  const analyticsResult = useMemo(() => {
    if (!analyticsSync.hasLocalHistory) return undefined;
    return buildAnalyticsSummary({
      transactions,
      range,
      baseCurrency,
      bigSpendingThreshold:
        noBigSpending && bigSpendingThreshold !== null
          ? bigSpendingThreshold
          : undefined,
      rates: analyticsSync.rates,
      now: analyticsNow,
      customPeriod,
      periodOffset,
    });
  }, [
    analyticsNow,
    analyticsSync.hasLocalHistory,
    analyticsSync.rates,
    baseCurrency,
    bigSpendingThreshold,
    customPeriod,
    noBigSpending,
    periodOffset,
    range,
    transactions,
  ]);
  const summary =
    analyticsResult?.status === "ready" ? analyticsResult.summary : undefined;
  const analyticsLoading = !analyticsSync.hasLocalHistory;
  const analyticsUpdatedAt = analyticsSync.lastSyncedAt
    ? Date.parse(analyticsSync.lastSyncedAt)
    : undefined;

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current === undefined) return;
    window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = undefined;
  }, []);

  const scheduleHorizontalSettle = useCallback(() => {
    clearSettleTimer();
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = undefined;
      settleHorizontalScrollRef.current();
    }, SCROLL_SETTLE_DELAY_MS);
  }, [clearSettleTimer]);

  const renderTransactionDockMotion = useCallback(
    (interactive: boolean, moving: boolean) => {
      const viewport = viewportRef.current;
      if (!viewport || viewport.clientWidth <= 0) return;
      const viewportWidth = viewport.clientWidth;
      const position = viewport.scrollLeft / viewportWidth;
      transactionDockMotionRef.current?.setMotion({
        x: (1 - position) * viewportWidth,
        viewportWidth,
        interactive,
        moving,
      });
    },
    [],
  );

  const renderHorizontalPosition = useCallback(
    (moving: boolean) => {
      const viewport = viewportRef.current;
      if (!viewport || viewport.clientWidth <= 0) return null;
      const position = viewport.scrollLeft / viewport.clientWidth;
      const relativePosition = position - activeIndexRef.current;
      headerMotionRef?.current?.setHorizontalPosition?.(position);
      renderTransactionDockMotion(
        !moving && activeIndexRef.current === 1,
        moving,
      );
      viewport.dataset.motionPosition = position.toFixed(3);
      viewport.dataset.motionProgress = relativePosition.toFixed(3);
      viewport.dataset.inputDirection =
        relativePosition > 0.001
          ? "forward"
          : relativePosition < -0.001
            ? "backward"
            : "none";
      if (moving) viewport.dataset.motionStatus = "moving";
      return position;
    },
    [headerMotionRef, renderTransactionDockMotion],
  );

  const commitActiveIndex = useCallback(
    (incomingIndex: number) => {
      const index = clamp(Math.trunc(incomingIndex), 0, SLIDES.length - 1);
      activeIndexRef.current = index;
      setActiveIndex(index);
      for (const [slideIndex, slide] of slideRefs.current.entries()) {
        if (slide) slide.inert = slideIndex !== index;
      }
      headerMotionRef?.current?.syncHorizontalSelection?.(
        SLIDES[index] ?? SLIDES[0],
      );
      headerMotionRef?.current?.setVerticalProgress(
        verticalProgressRef.current[index] ?? 0,
      );
      renderTransactionDockMotion(index === 1, false);
      const viewport = viewportRef.current;
      if (!viewport) return;
      viewport.dataset.inputDirection = "none";
      viewport.dataset.motionPosition = index.toFixed(3);
      viewport.dataset.motionProgress = "0.000";
      viewport.dataset.motionStatus = "settled";
      viewport.dataset.selectedSnap = String(index);
      viewport.dataset.targetSnap = String(index);
    },
    [headerMotionRef, renderTransactionDockMotion],
  );

  const settleHorizontalScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || viewport.clientWidth <= 0) return;
    clearSettleTimer();

    const position = viewport.scrollLeft / viewport.clientWidth;
    const targetIndex = slideIndexForPosition(position);
    const targetLeft = targetIndex * viewport.clientWidth;
    const distance = Math.abs(viewport.scrollLeft - targetLeft);
    viewport.dataset.targetSnap = String(targetIndex);

    if (distance > SNAP_TOLERANCE_PX) {
      const jump = prefersReducedMotion();
      viewport.dataset.motionStatus = "moving";
      viewport.scrollTo({
        left: targetLeft,
        behavior: jump ? "auto" : "smooth",
      });
      if (jump) {
        renderHorizontalPosition(false);
        viewport.dataset.lastSettledDirection = settledDirection(
          activeIndexRef.current,
          targetIndex,
        );
        commitActiveIndex(targetIndex);
      } else {
        scheduleHorizontalSettle();
      }
      return;
    }

    viewport.dataset.lastSettledDirection = settledDirection(
      activeIndexRef.current,
      targetIndex,
    );
    renderHorizontalPosition(false);
    commitActiveIndex(targetIndex);
  }, [
    clearSettleTimer,
    commitActiveIndex,
    renderHorizontalPosition,
    scheduleHorizontalSettle,
  ]);

  useLayoutEffect(() => {
    settleHorizontalScrollRef.current = settleHorizontalScroll;
  }, [settleHorizontalScroll]);

  useEffect(() => {
    for (const [index, slide] of slideRefs.current.entries()) {
      if (slide) slide.inert = index !== activeIndex;
    }
  }, [activeIndex]);

  useEffect(() => {
    if (range === "custom") {
      if (periodOffset !== 0) setPeriodOffset(0);
      return;
    }
    if (periodOptions.some((option) => option.offset === periodOffset)) return;
    const earliestOffset = periodOptions[0]?.offset ?? 0;
    const latestOffset = periodOptions.at(-1)?.offset ?? 0;
    setPeriodOffset(
      Math.max(earliestOffset, Math.min(latestOffset, periodOffset)),
    );
  }, [periodOffset, periodOptions, range]);

  useEffect(() => {
    if (bigSpendingThreshold === null) setNoBigSpending(false);
  }, [bigSpendingThreshold]);

  useEffect(() => {
    let timer: number | undefined;
    const scheduleMidnightRefresh = () => {
      const nextMidnight = new Date();
      nextMidnight.setHours(24, 0, 0, 50);
      timer = window.setTimeout(() => {
        setAnalyticsNow(new Date());
        scheduleMidnightRefresh();
      }, nextMidnight.getTime() - Date.now());
    };
    scheduleMidnightRefresh();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const alignSettledSlide = () => {
      const width = viewport.clientWidth;
      if (width <= 0) {
        headerMotionRef?.current?.syncHorizontalSelection?.(
          SLIDES[activeIndexRef.current] ?? SLIDES[0],
        );
        headerMotionRef?.current?.setVerticalProgress(
          verticalProgressRef.current[activeIndexRef.current] ?? 0,
        );
        return;
      }
      const left = activeIndexRef.current * width;
      if (Math.abs(viewport.scrollLeft - left) > SNAP_TOLERANCE_PX) {
        viewport.scrollTo({ left, behavior: "auto" });
      }
      renderHorizontalPosition(false);
      commitActiveIndex(activeIndexRef.current);
    };

    alignSettledSlide();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(alignSettledSlide);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [commitActiveIndex, headerMotionRef, renderHorizontalPosition]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const handleScrollEnd = () => settleHorizontalScrollRef.current();
    viewport.addEventListener("scrollend", handleScrollEnd);
    return () => viewport.removeEventListener("scrollend", handleScrollEnd);
  }, []);

  useEffect(() => clearSettleTimer, [clearSettleTimer]);

  const handleViewportScroll = () => {
    renderHorizontalPosition(true);
    scheduleHorizontalSettle();
  };

  const handleContentScroll = (event: ReactUIEvent<HTMLElement>) => {
    const target = event.target;
    if (
      !(target instanceof HTMLElement) ||
      target.dataset.dashboardScroll !== "true"
    ) {
      return;
    }
    const slide = target.closest<HTMLElement>(
      "[data-home-carousel-slide-index]",
    );
    const index = Number(slide?.dataset.homeCarouselSlideIndex);
    if (!Number.isInteger(index) || index < 0 || index >= SLIDES.length) return;
    const progress = headerCollapseProgress(target);
    verticalProgressRef.current[index] = progress;
    const remainingHeaderSpace = HEADER_COLLAPSE_DISTANCE * (1 - progress);
    slide?.style.setProperty(
      "--dashboard-header-space",
      `${Number(remainingHeaderSpace.toFixed(2))}px`,
    );
    if (index === activeIndexRef.current) {
      headerMotionRef?.current?.setVerticalProgress(progress);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const viewport = viewportRef.current;
    if (event.target !== viewport || !viewport || viewport.clientWidth <= 0) {
      return;
    }
    const direction =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (direction === 0) return;

    const currentPosition = viewport.scrollLeft / viewport.clientWidth;
    const currentVisualIndex = slideIndexForPosition(currentPosition);
    const targetIndex = clamp(
      currentVisualIndex + direction,
      0,
      SLIDES.length - 1,
    );
    if (targetIndex === currentVisualIndex) return;

    event.preventDefault();
    const jump = prefersReducedMotion();
    viewport.dataset.inputDirection = direction > 0 ? "forward" : "backward";
    viewport.dataset.motionStatus = "moving";
    viewport.dataset.targetSnap = String(targetIndex);
    viewport.scrollTo({
      left: targetIndex * viewport.clientWidth,
      behavior: jump ? "auto" : "smooth",
    });
    if (jump) {
      renderHorizontalPosition(false);
      viewport.dataset.lastSettledDirection = settledDirection(
        activeIndexRef.current,
        targetIndex,
      );
      commitActiveIndex(targetIndex);
    } else {
      renderHorizontalPosition(true);
      scheduleHorizontalSettle();
    }
  };

  const handleRangeChange = (nextRange: AnalyticsRange) => {
    setRange(nextRange);
    setPeriodOffset(0);
  };

  const handleNoBigSpendingToggle = () => {
    if (bigSpendingThreshold === null) {
      onToast("Set a big spending cutoff in Settings.");
      return;
    }
    setNoBigSpending((current) => !current);
  };

  return (
    <section
      className="h-full min-h-0"
      aria-roledescription="carousel"
      aria-label="Home activity"
      onKeyDown={handleKeyDown}
      onScrollCapture={handleContentScroll}
    >
      <div
        ref={viewportRef}
        data-testid="home-carousel-viewport"
        data-input-direction="none"
        data-last-settled-direction="none"
        data-motion-position="0.000"
        data-motion-progress="0.000"
        data-motion-status="settled"
        data-selected-snap="0"
        data-target-snap="0"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the scroll viewport needs a keyboard target for arrow-key slide navigation
        tabIndex={0}
        onScroll={handleViewportScroll}
        className="h-full min-h-0 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-auto scroll-smooth [scrollbar-width:none] [touch-action:pan-x_pan-y] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden"
      >
        <div
          data-testid="home-carousel-track"
          className="flex h-full min-h-0 backface-hidden"
        >
          <section
            ref={(node) => {
              slideRefs.current[0] = node;
            }}
            aria-label="Analytics, slide 1 of 3"
            aria-hidden={activeIndex !== 0}
            data-home-carousel-slide-index="0"
            className="h-full min-w-0 flex-[0_0_100%] snap-start snap-always"
          >
            <AnalyticsSheetMorph
              rates={analyticsSync.rates}
              transactions={transactions}
              summary={summary}
              baseCurrency={baseCurrency}
              bigSpendingThreshold={bigSpendingThreshold}
              noBigSpending={noBigSpending}
              onNoBigSpendingToggle={handleNoBigSpendingToggle}
              range={range}
              onRangeChange={handleRangeChange}
              periodOptions={periodOptions}
              periodOffset={periodOffset}
              onPeriodChange={setPeriodOffset}
              customPeriod={customPeriod}
              onCustomPeriodChange={setCustomPeriod}
              isLoading={analyticsLoading}
              hasCompleteHistory={analyticsSync.history.hasCompleteCache}
              isOffline={analyticsSync.status === "offline"}
              updatedAt={analyticsUpdatedAt}
              error={analyticsSync.history.error}
              onRetry={analyticsSync.resync}
              onSelectTransaction={onEditTransaction}
              now={analyticsNow}
            />
          </section>
          <section
            ref={(node) => {
              slideRefs.current[1] = node;
            }}
            aria-label="Transactions, slide 2 of 3"
            aria-hidden={activeIndex !== 1}
            data-home-carousel-slide-index="1"
            className="h-full min-w-0 flex-[0_0_100%] snap-start snap-always"
            style={
              {
                "--dashboard-header-space": `${HEADER_COLLAPSE_DISTANCE}px`,
              } as CSSProperties
            }
          >
            <TransactionHistoryView
              history={analyticsSync.history}
              baseCurrency={baseCurrency}
              onEditTransaction={onEditTransaction}
              dockMotionRef={transactionDockMotionRef}
            />
          </section>
          <section
            ref={(node) => {
              slideRefs.current[2] = node;
            }}
            aria-label="Settings, slide 3 of 3"
            aria-hidden={activeIndex !== 2}
            data-home-carousel-slide-index="2"
            className="h-full min-w-0 flex-[0_0_100%] snap-start snap-always"
            style={
              {
                "--dashboard-header-space": `${HEADER_COLLAPSE_DISTANCE}px`,
              } as CSSProperties
            }
          >
            <SettingsView onToast={onToast} analyticsSync={analyticsSync} />
          </section>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {SLIDES[activeIndex]}, slide {activeIndex + 1} of {SLIDES.length}
      </p>
    </section>
  );
}
