import { endOfDay, startOfMonth } from "date-fns";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { tryParseDate } from "../../lib/date-utils";
import type { TransactionRecord } from "../../lib/types";
import { cn } from "../../lib/utils";
import { AnalyticsDrawer } from "./AnalyticsDrawer";
import { AnalyticsRangeDrawer } from "./AnalyticsRangeDrawer";
import {
  buildAnalyticsPeriodOptions,
  buildAnalyticsSummary,
  getAnalyticsRateRequest,
  type AnalyticsRange,
} from "./analytics";
import { AnalyticsSlide } from "./AnalyticsSlide";
import { useHistoricalRatesQuery } from "./exchangeRateQueries";
import { TopDashboard } from "./TopDashboard";
import { useTransactionHistoryQuery } from "./useTransactionHistoryQuery";

type HomeDashboardCarouselProps = {
  baseCurrency: string;
  bigSpendingThreshold: number | null;
  onToast: (message: string) => void;
  onEditTransaction: (transaction: TransactionRecord) => void;
  onViewAllTransactions: () => void;
};

const SLIDES = ["Transactions", "Analytics"] as const;

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
  onToast,
  onEditTransaction,
  onViewAllTransactions,
}: HomeDashboardCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [historyActivated, setHistoryActivated] = useState(false);
  const [range, setRange] = useState<AnalyticsRange>("week");
  const [periodOffset, setPeriodOffset] = useState(0);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [initialAnalyticsBucket, setInitialAnalyticsBucket] = useState<string | null>(null);
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const [noBigSpending, setNoBigSpending] = useState(false);
  const [analyticsNow, setAnalyticsNow] = useState(() => new Date());
  const [customPeriod, setCustomPeriod] = useState(() => ({
    start: startOfMonth(analyticsNow),
    end: endOfDay(analyticsNow),
  }));
  const viewportRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Array<HTMLElement | null>>([]);
  const analyticsTriggerRef = useRef<HTMLElement | null>(null);
  const customRangeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const pointerStart = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    pointerType: string;
  } | null>(null);
  const suppressClick = useRef(false);
  const settleTimerRef = useRef<number | null>(null);
  const history = useTransactionHistoryQuery(
    historyActivated || analyticsOpen || customRangeOpen,
  );
  const transactions = history.records;
  const periodOptions = useMemo(
    () => buildAnalyticsPeriodOptions(range, transactions, analyticsNow),
    [analyticsNow, range, transactions],
  );
  const rateRequest = useMemo(
    () =>
      history.hasCompleteCache
        ? getAnalyticsRateRequest({
            transactions,
            range,
            baseCurrency,
            now: analyticsNow,
            customPeriod,
            periodOffset,
          })
        : null,
    [
      analyticsNow,
      baseCurrency,
      customPeriod,
      history.hasCompleteCache,
      periodOffset,
      range,
      transactions,
    ],
  );
  const analyticsEnabled = historyActivated || analyticsOpen || customRangeOpen;
  const ratesQuery = useHistoricalRatesQuery(rateRequest, analyticsEnabled);
  const analyticsResult = useMemo(() => {
    if (!history.hasCompleteCache) return undefined;
    if (rateRequest && ratesQuery.data === undefined && !ratesQuery.error) {
      return undefined;
    }
    return buildAnalyticsSummary({
      transactions,
      range,
      baseCurrency,
      rates: ratesQuery.data?.rates ?? [],
      now: analyticsNow,
      customPeriod,
      periodOffset,
    });
  }, [
    analyticsNow,
    baseCurrency,
    customPeriod,
    history.hasCompleteCache,
    periodOffset,
    range,
    rateRequest,
    ratesQuery.data,
    ratesQuery.error,
    transactions,
  ]);
  const summary =
    analyticsResult?.status === "ready" ? analyticsResult.summary : undefined;
  const drawerAnalyticsResult = useMemo(() => {
    if (!noBigSpending || bigSpendingThreshold === null) return analyticsResult;
    if (!history.hasCompleteCache) return undefined;
    if (rateRequest && ratesQuery.data === undefined && !ratesQuery.error) return undefined;
    return buildAnalyticsSummary({
      transactions,
      range,
      baseCurrency,
      bigSpendingThreshold,
      rates: ratesQuery.data?.rates ?? [],
      now: analyticsNow,
      customPeriod,
      periodOffset,
    });
  }, [
    analyticsNow,
    analyticsResult,
    baseCurrency,
    bigSpendingThreshold,
    customPeriod,
    history.hasCompleteCache,
    noBigSpending,
    periodOffset,
    range,
    rateRequest,
    ratesQuery.data,
    ratesQuery.error,
    transactions,
  ]);
  const drawerSummary =
    drawerAnalyticsResult?.status === 'ready' ? drawerAnalyticsResult.summary : undefined;
  const missingRate =
    analyticsResult?.status === "missing-rates"
      ? analyticsResult.missingRates[0]
      : undefined;
  const analyticsLoading =
    history.isLoading ||
    history.isDownloading ||
    (rateRequest !== null && ratesQuery.data === undefined && !ratesQuery.error);
  const hasCompleteAnalytics =
    history.hasCompleteCache &&
    (rateRequest === null || ratesQuery.data !== undefined || Boolean(ratesQuery.error));
  const analyticsError = useMemo(
    () =>
      history.error ??
      ratesQuery.error ??
      (ratesQuery.data?.refreshFailed ? new Error("Rate refresh failed") : null),
    [history.error, ratesQuery.data?.refreshFailed, ratesQuery.error],
  );
  const earliestDate = useMemo(() => {
    const dates = transactions
      .map((transaction) => tryParseDate(transaction.date))
      .filter((date): date is Date => date !== null);
    if (dates.length === 0) return customPeriod.start;
    return new Date(Math.min(...dates.map((date) => date.getTime())));
  }, [customPeriod.start, transactions]);
  const updatedAt = history.meta
    ? tryParseDate(history.meta.capturedAt)?.getTime()
    : undefined;
  const analyticsUpdatedAt = useMemo(() => {
    const timestamps = [
      updatedAt,
      rateRequest ? ratesQuery.data?.updatedAt : undefined,
    ].filter((value): value is number => typeof value === 'number' && value > 0);
    return timestamps.length > 0 ? Math.min(...timestamps) : undefined;
  }, [rateRequest, ratesQuery.data?.updatedAt, updatedAt]);

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
    if (index === 1) setHistoryActivated(true);
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

  const handleAnalyticsOpenChange = (open: boolean) => {
    setAnalyticsOpen(open);
    if (open) setHistoryActivated(true);
    if (!open) {
      setNoBigSpending(false);
      window.requestAnimationFrame(() => analyticsTriggerRef.current?.focus());
    }
  };

  const handleCustomRangeRequest = (trigger: HTMLButtonElement) => {
    customRangeTriggerRef.current = trigger;
    setHistoryActivated(true);
    setCustomRangeOpen(true);
  };

  const handleRangeChange = (nextRange: AnalyticsRange) => {
    setRange(nextRange);
    setPeriodOffset(0);
  };

  const retryAnalytics = () => {
    void history.refresh();
    if (rateRequest) void ratesQuery.refetch();
  };

  return (
    <>
      <section
        className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_1.5rem]"
        aria-roledescription="carousel"
        aria-label="Home activity"
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (
            target !== viewportRef.current &&
            target.dataset.carouselDot !== "true"
          ) {
            return;
          }
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
          className="flex min-h-0 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [touch-action:pan-y] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <section
            ref={(node) => {
              slideRefs.current[0] = node;
            }}
            aria-label="Transactions, slide 1 of 2"
            aria-hidden={activeIndex !== 0}
            className="h-full min-w-full snap-center snap-always"
          >
            <TopDashboard
              baseCurrency={baseCurrency}
              onEditTransaction={onEditTransaction}
              onViewAll={onViewAllTransactions}
            />
          </section>
          <section
            ref={(node) => {
              slideRefs.current[1] = node;
            }}
            aria-label="Analytics, slide 2 of 2"
            aria-hidden={activeIndex !== 1}
            className="h-full min-w-full snap-center snap-always"
          >
            <AnalyticsSlide
              range={range}
              onRangeChange={handleRangeChange}
              periodOptions={periodOptions}
              periodOffset={periodOffset}
              onPeriodChange={setPeriodOffset}
              onCustomRequest={handleCustomRangeRequest}
              summary={summary}
              missingRate={missingRate}
              isLoading={analyticsLoading}
              isOffline={!history.isOnline}
              updatedAt={analyticsUpdatedAt}
              error={analyticsError}
              onRetry={retryAnalytics}
              onBucketSelect={(key, trigger) => {
                analyticsTriggerRef.current = trigger;
                setInitialAnalyticsBucket(key);
                setHistoryActivated(true);
                setAnalyticsOpen(true);
              }}
              onViewAll={(event) => {
                analyticsTriggerRef.current = event.currentTarget;
                setInitialAnalyticsBucket(null);
                setHistoryActivated(true);
                setAnalyticsOpen(true);
              }}
            />
          </section>
        </div>

        <fieldset className="m-0 flex min-w-0 items-center justify-center border-0 p-0">
          <legend className="sr-only">Carousel slides</legend>
          {SLIDES.map((slide, index) => (
            <button
              key={slide}
              type="button"
              data-carousel-dot="true"
              aria-label={`${slide} slide`}
              aria-current={activeIndex === index ? "true" : undefined}
              onClick={() => scrollToSlide(index)}
              className="flex h-11 w-11 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <span
                className={cn(
                  "block bg-muted-foreground/35 transition-[width,background-color] motion-reduce:transition-none",
                  activeIndex === index
                    ? "h-1.5 w-4 rounded-full bg-primary"
                    : "h-1.5 w-1.5 rounded-full",
                )}
              />
            </button>
          ))}
        </fieldset>
        <p className="sr-only" aria-live="polite">
          {SLIDES[activeIndex]}, slide {activeIndex + 1} of {SLIDES.length}
        </p>
      </section>

      <AnalyticsRangeDrawer
        open={customRangeOpen}
        onOpenChange={setCustomRangeOpen}
        value={customPeriod}
        minDate={earliestDate}
        maxDate={analyticsNow}
        onApply={(period) => {
          setCustomPeriod(period);
          setRange("custom");
        }}
        returnFocusTo={customRangeTriggerRef.current}
      />

      <AnalyticsDrawer
        open={analyticsOpen}
        initialSelectedBucket={initialAnalyticsBucket}
        onOpenChange={handleAnalyticsOpenChange}
        transactions={transactions}
        summary={drawerSummary}
        missingRate={missingRate}
        baseCurrency={baseCurrency}
        bigSpendingThreshold={bigSpendingThreshold}
        noBigSpending={noBigSpending}
        onNoBigSpendingToggle={() => {
          if (bigSpendingThreshold === null) {
            onToast('Set a big spending cutoff in Settings.');
            return;
          }
          setNoBigSpending((current) => !current);
        }}
        range={range}
        onRangeChange={handleRangeChange}
        periodOptions={periodOptions}
        periodOffset={periodOffset}
        onPeriodChange={setPeriodOffset}
        customPeriod={customPeriod}
        onCustomPeriodChange={setCustomPeriod}
        isLoading={analyticsLoading}
        hasCompleteHistory={hasCompleteAnalytics}
        isOffline={!history.isOnline}
        updatedAt={analyticsUpdatedAt}
        error={analyticsError}
        onRetry={retryAnalytics}
        onSelectTransaction={onEditTransaction}
        now={analyticsNow}
      />
    </>
  );
}
