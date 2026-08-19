import { endOfDay, startOfMonth } from "date-fns";
import useEmblaCarousel from "embla-carousel-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type UIEvent as ReactUIEvent,
} from "react";
import type { TransactionRecord } from "../../lib/types";
import { DASHBOARD_SLIDES } from "../dashboardSlides";
import type { DashboardTitleDirection } from "../DashboardTitleReel";
import type { DashboardHeaderMotionHandle } from "../Header";
import { SettingsView } from "../SettingsView";
import {
  buildAnalyticsPeriodOptions,
  buildAnalyticsSummary,
  type AnalyticsRange,
} from "./analytics";
import { AnalyticsView } from "./AnalyticsView";
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

type EmblaCarouselApi = NonNullable<ReturnType<typeof useEmblaCarousel>[1]>;
type EmblaCarouselOptions = NonNullable<
  Parameters<typeof useEmblaCarousel>[0]
>;

type HorizontalMotion = {
  active: boolean;
  originSlide: HTMLElement | null;
  direction: DashboardTitleDirection | 0;
};

const SLIDES = DASHBOARD_SLIDES;
const HEADER_COLLAPSE_DISTANCE = 68;
const EMBLA_FOCUS_NODE_NAMES = new Set(["INPUT", "SELECT", "TEXTAREA"]);

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function ownsNestedHorizontalGesture(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('[data-home-carousel-swipe-lock="true"]') !== null
  );
}

function blocksCarouselDrag(target: EventTarget | null): boolean {
  return (
    ownsNestedHorizontalGesture(target) ||
    (target instanceof Element && EMBLA_FOCUS_NODE_NAMES.has(target.nodeName))
  );
}

function allowCarouselDrag(
  _emblaApi: EmblaCarouselApi,
  event: MouseEvent | TouchEvent,
): boolean {
  return !(event instanceof MouseEvent) && !blocksCarouselDrag(event.target);
}

const EMBLA_OPTIONS: EmblaCarouselOptions = {
  align: "start",
  // Pointer handling below suppresses only the click emitted by the active
  // gesture. Keep Embla's delayed click guard from consuming a later control
  // click when a touch drag does not emit a compatibility click.
  dragThreshold: Number.MAX_SAFE_INTEGER,
  duration: 25,
  loop: false,
  skipSnaps: false,
  watchDrag: allowCarouselDrag,
};

function clampHorizontalProgress(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function headerCollapseProgress(element: HTMLElement): number {
  return Math.min(
    1,
    Math.max(0, element.scrollTop / HEADER_COLLAPSE_DISTANCE),
  );
}

function canNavigate(
  api: EmblaCarouselApi,
  direction: DashboardTitleDirection,
): boolean {
  return direction > 0 ? api.canScrollNext() : api.canScrollPrev();
}

function resetHorizontalMotion(motion: HorizontalMotion) {
  motion.active = false;
  motion.originSlide = null;
  motion.direction = 0;
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
  const horizontalMotionRef = useRef<HorizontalMotion>({
    active: false,
    originSlide: null,
    direction: 0,
  });
  const pointerStart = useRef<{
    startX: number;
    startY: number;
    horizontal: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [setEmblaViewport, emblaApi] = useEmblaCarousel(EMBLA_OPTIONS);
  const setViewportRef = useCallback(
    (node: HTMLDivElement | null) => {
      viewportRef.current = node;
      setEmblaViewport(node);
    },
    [setEmblaViewport],
  );
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

  const renderTransactionDockMotion = useCallback(
    (interactive: boolean, moving: boolean) => {
      const viewport = viewportRef.current;
      const transactionSlide = slideRefs.current[1];
      if (!viewport || !transactionSlide) return;
      const viewportRect = viewport.getBoundingClientRect();
      if (viewportRect.width === 0) return;
      const transactionRect = transactionSlide.getBoundingClientRect();
      transactionDockMotionRef.current?.setMotion({
        x: transactionRect.left - viewportRect.left,
        viewportWidth: viewportRect.width,
        interactive,
        moving,
      });
    },
    [],
  );

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

  const commitActiveIndex = useCallback(
    (index: number) => {
      activeIndexRef.current = index;
      setActiveIndex(index);
      headerMotionRef?.current?.syncHorizontalSelection?.(
        SLIDES[index] ?? SLIDES[0],
      );
      headerMotionRef?.current?.setVerticalProgress(
        verticalProgressRef.current[index] ?? 0,
      );
      renderTransactionDockMotion(index === 1, false);
      const viewport = viewportRef.current;
      if (viewport) viewport.dataset.selectedSnap = String(index);
    },
    [headerMotionRef, renderTransactionDockMotion],
  );

  const beginHorizontalMotion = useCallback(
    (direction: DashboardTitleDirection) => {
      const motion = horizontalMotionRef.current;
      const isStarting = !motion.active;
      if (isStarting) {
        motion.active = true;
        motion.originSlide = slideRefs.current[activeIndexRef.current] ?? null;
      }
      motion.direction = direction;
      const viewport = viewportRef.current;
      if (viewport) {
        viewport.dataset.motionStatus = "moving";
        viewport.dataset.inputDirection =
          direction > 0 ? "forward" : "backward";
      }
      if (isStarting) renderTransactionDockMotion(false, false);
    },
    [renderTransactionDockMotion],
  );

  const renderHorizontalMotion = useCallback(() => {
    const viewport = viewportRef.current;
    const motion = horizontalMotionRef.current;
    const origin = motion.originSlide;
    if (
      !viewport ||
      !origin ||
      !motion.active ||
      motion.direction === 0
    ) {
      return;
    }
    const viewportRect = viewport.getBoundingClientRect();
    if (viewportRect.width === 0) return;
    const originRect = origin.getBoundingClientRect();
    const progress = clampHorizontalProgress(
      Math.abs(originRect.left - viewportRect.left) / viewportRect.width,
    );
    headerMotionRef?.current?.setHorizontalMotion(
      motion.direction,
      progress,
    );
    renderTransactionDockMotion(false, true);
    viewport.dataset.motionProgress = (
      motion.direction * progress
    ).toFixed(3);
  }, [headerMotionRef, renderTransactionDockMotion]);

  const releasePointerGesture = useCallback(() => {
    pointerStart.current = null;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  }, []);

  const cancelHorizontalPreview = useCallback(() => {
    const motion = horizontalMotionRef.current;
    if (!motion.active) return;
    resetHorizontalMotion(motion);
    headerMotionRef?.current?.syncHorizontalSelection?.(
      SLIDES[activeIndexRef.current] ?? SLIDES[0],
    );
    renderTransactionDockMotion(activeIndexRef.current === 1, false);
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.dataset.motionProgress = "0.000";
      viewport.dataset.motionStatus = "settled";
    }
  }, [headerMotionRef, renderTransactionDockMotion]);

  const settleHorizontalMotion = useCallback(
    (api: EmblaCarouselApi) => {
      const motion = horizontalMotionRef.current;
      const direction =
        motion.direction > 0
          ? "forward"
          : motion.direction < 0
            ? "backward"
            : "none";
      resetHorizontalMotion(motion);
      pointerStart.current = null;
      const viewport = viewportRef.current;
      if (viewport) {
        viewport.dataset.lastSettledDirection = direction;
        viewport.dataset.motionProgress = "0.000";
        viewport.dataset.motionStatus = "settled";
      }
      commitActiveIndex(api.selectedScrollSnap());
    },
    [commitActiveIndex],
  );

  useEffect(() => {
    headerMotionRef?.current?.syncHorizontalSelection?.(
      SLIDES[activeIndexRef.current] ?? SLIDES[0],
    );
    headerMotionRef?.current?.setVerticalProgress(
      verticalProgressRef.current[activeIndexRef.current] ?? 0,
    );
  }, [headerMotionRef]);

  useEffect(() => {
    if (!emblaApi) return;
    const onScroll = () => {
      const motion = horizontalMotionRef.current;
      if (!motion.active || motion.direction === 0) return;
      renderHorizontalMotion();
    };
    const onSelect = () => {
      const selected = emblaApi.selectedScrollSnap();
      setActiveIndex(selected);
      const viewport = viewportRef.current;
      if (viewport) viewport.dataset.targetSnap = String(selected);
    };
    const onSettle = () => settleHorizontalMotion(emblaApi);
    const onPointerUp = () => releasePointerGesture();
    const onReInit = () => {
      resetHorizontalMotion(horizontalMotionRef.current);
      commitActiveIndex(emblaApi.selectedScrollSnap());
    };
    emblaApi.on("scroll", onScroll);
    emblaApi.on("select", onSelect);
    emblaApi.on("settle", onSettle);
    emblaApi.on("pointerUp", onPointerUp);
    emblaApi.on("reInit", onReInit);
    commitActiveIndex(emblaApi.selectedScrollSnap());
    return () => {
      emblaApi.off("scroll", onScroll);
      emblaApi.off("select", onSelect);
      emblaApi.off("settle", onSettle);
      emblaApi.off("pointerUp", onPointerUp);
      emblaApi.off("reInit", onReInit);
      resetHorizontalMotion(horizontalMotionRef.current);
    };
  }, [
    commitActiveIndex,
    emblaApi,
    releasePointerGesture,
    renderHorizontalMotion,
    settleHorizontalMotion,
  ]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || blocksCarouselDrag(event.target)) {
      pointerStart.current = null;
      suppressClick.current = false;
      return;
    }
    pointerStart.current = {
      startX: event.clientX,
      startY: event.clientY,
      horizontal: false,
    };
    suppressClick.current = false;
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = pointerStart.current;
    if (!gesture || !emblaApi) return;
    const x = Math.abs(event.clientX - gesture.startX);
    const y = Math.abs(event.clientY - gesture.startY);
    if (x > 8 && x > y) {
      gesture.horizontal = true;
      suppressClick.current = true;
      const direction: DashboardTitleDirection =
        event.clientX < gesture.startX ? 1 : -1;
      if (!canNavigate(emblaApi, direction)) {
        cancelHorizontalPreview();
        return;
      }
      beginHorizontalMotion(direction);
      renderHorizontalMotion();
    }
  };

  const finishPointerGesture = (cancelled = false) => {
    const gesture = pointerStart.current;
    if ((gesture && !gesture.horizontal) || cancelled) {
      cancelHorizontalPreview();
      const viewport = viewportRef.current;
      if (viewport) {
        viewport.dataset.motionProgress = "0.000";
        viewport.dataset.motionStatus = "settled";
      }
    }
    releasePointerGesture();
  };

  const handleClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClick.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick.current = false;
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
    if (event.target !== viewportRef.current || !emblaApi) return;
    const direction: DashboardTitleDirection | 0 =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (direction === 0) return;
    event.preventDefault();
    if (
      horizontalMotionRef.current.active ||
      !canNavigate(emblaApi, direction)
    ) {
      return;
    }
    beginHorizontalMotion(direction);
    const jump = prefersReducedMotion();
    if (direction > 0) emblaApi.scrollNext(jump);
    else emblaApi.scrollPrev(jump);
    if (jump && horizontalMotionRef.current.active) {
      settleHorizontalMotion(emblaApi);
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
        ref={setViewportRef}
        data-testid="home-carousel-viewport"
        data-input-direction="none"
        data-last-settled-direction="none"
        data-motion-progress="0.000"
        data-motion-status="settled"
        data-selected-snap="0"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the scroll viewport needs a keyboard target for arrow-key slide navigation
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => finishPointerGesture()}
        onPointerCancel={() => finishPointerGesture(true)}
        onClickCapture={handleClickCapture}
        className="h-full min-h-0 overflow-hidden overscroll-x-none [touch-action:pan-y]"
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
            className="h-full min-w-0 flex-[0_0_100%]"
          >
            <AnalyticsView
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
            className="h-full min-w-0 flex-[0_0_100%]"
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
            className="h-full min-w-0 flex-[0_0_100%]"
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
