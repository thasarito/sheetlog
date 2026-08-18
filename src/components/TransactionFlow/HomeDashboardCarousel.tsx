import { endOfDay, startOfMonth } from "date-fns";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { TransactionRecord } from "../../lib/types";
import {
  buildAnalyticsPeriodOptions,
  buildAnalyticsSummary,
  type AnalyticsRange,
} from "./analytics";
import { AnalyticsView } from "./AnalyticsView";
import { TransactionHistoryView } from "./TransactionHistoryView";
import type { AnalyticsSyncController } from "./useAnalyticsSync";

type HomeDashboardCarouselProps = {
  baseCurrency: string;
  bigSpendingThreshold: number | null;
  analyticsSync: AnalyticsSyncController;
  onToast: (message: string) => void;
  onEditTransaction: (transaction: TransactionRecord) => void;
};

const SLIDES = ["Analytics", "Transactions"] as const;

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

export function HomeDashboardCarousel({
  baseCurrency,
  bigSpendingThreshold,
  analyticsSync,
  onToast,
  onEditTransaction,
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Array<HTMLElement | null>>([]);
  const pointerStart = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    pointerType: string;
  } | null>(null);
  const suppressClick = useRef(false);
  const settleTimerRef = useRef<number | null>(null);
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

  useEffect(
    () => () => {
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
    },
    [],
  );

  const commitActiveIndex = (index: number) => {
    setActiveIndex(index);
  };

  const scrollToSlide = (index: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const reducedMotion = prefersReducedMotion();
    viewport.scrollTo({
      left: index * viewport.clientWidth,
      behavior: reducedMotion ? "auto" : "smooth",
    });
    if (reducedMotion) commitActiveIndex(index);
  };

  const handleScroll = () => {
    const viewport = viewportRef.current;
    if (!viewport || viewport.clientWidth === 0) return;
    const index = Math.max(
      0,
      Math.min(
        SLIDES.length - 1,
        Math.round(viewport.scrollLeft / viewport.clientWidth),
      ),
    );
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
    }
    settleTimerRef.current = window.setTimeout(
      () => commitActiveIndex(index),
      80,
    );
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (ownsNestedHorizontalGesture(event.target)) {
      pointerStart.current = null;
      suppressClick.current = false;
      return;
    }
    pointerStart.current = {
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      pointerType: event.pointerType,
    };
    suppressClick.current = false;
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = pointerStart.current;
    if (!gesture) return;
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
    const x = Math.abs(event.clientX - gesture.startX);
    const y = Math.abs(event.clientY - gesture.startY);
    if (x > 8 && x > y) suppressClick.current = true;
  };

  const finishPointerGesture = (end?: { x: number; y: number }) => {
    const gesture = pointerStart.current;
    if (gesture && end) {
      gesture.lastX = end.x;
      gesture.lastY = end.y;
    }
    if (gesture?.pointerType === "touch") {
      const deltaX = gesture.lastX - gesture.startX;
      const deltaY = gesture.lastY - gesture.startY;
      if (Math.abs(deltaX) >= 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
        const nextIndex = Math.max(
          0,
          Math.min(SLIDES.length - 1, activeIndex + (deltaX < 0 ? 1 : -1)),
        );
        scrollToSlide(nextIndex);
      }
    }
    pointerStart.current = null;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    finishPointerGesture({ x: event.clientX, y: event.clientY });
  };

  const handleClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClick.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick.current = false;
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
      onKeyDown={(event) => {
        if (event.target !== viewportRef.current) return;
        if (event.key === "ArrowRight") {
          event.preventDefault();
          scrollToSlide(1);
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          scrollToSlide(0);
        }
      }}
    >
        <div
          ref={viewportRef}
          data-testid="home-carousel-viewport"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the scroll viewport needs a keyboard target for arrow-key slide navigation
          tabIndex={0}
          onScroll={handleScroll}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => finishPointerGesture()}
          onClickCapture={handleClickCapture}
          className="flex h-full min-h-0 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [touch-action:pan-y] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <section
            ref={(node) => {
              slideRefs.current[0] = node;
            }}
            aria-label="Analytics, slide 1 of 2"
            aria-hidden={activeIndex !== 0}
            className="h-full min-w-full snap-center snap-always"
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
            aria-label="Transactions, slide 2 of 2"
            aria-hidden={activeIndex !== 1}
            className="h-full min-w-full snap-center snap-always"
          >
            <TransactionHistoryView
              history={analyticsSync.history}
              baseCurrency={baseCurrency}
              onEditTransaction={onEditTransaction}
            />
          </section>
        </div>

        <p className="sr-only" aria-live="polite">
          {SLIDES[activeIndex]}, slide {activeIndex + 1} of {SLIDES.length}
        </p>
    </section>
  );
}
