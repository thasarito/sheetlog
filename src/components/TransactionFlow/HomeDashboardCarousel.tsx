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
import { buildAnalyticsSummary, type AnalyticsRange } from "./analytics";
import { AnalyticsSlide } from "./AnalyticsSlide";
import { TopDashboard } from "./TopDashboard";
import { useTransactionHistoryQuery } from "./useTransactionHistoryQuery";

type HomeDashboardCarouselProps = {
  currency: string;
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

export function HomeDashboardCarousel({
  currency,
  onEditTransaction,
  onViewAllTransactions,
}: HomeDashboardCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [historyActivated, setHistoryActivated] = useState(false);
  const [range, setRange] = useState<AnalyticsRange>("week");
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const [drawerCurrency, setDrawerCurrency] = useState(currency);
  const [analyticsNow, setAnalyticsNow] = useState(() => new Date());
  const [customPeriod, setCustomPeriod] = useState(() => ({
    start: startOfMonth(analyticsNow),
    end: endOfDay(analyticsNow),
  }));
  const viewportRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Array<HTMLElement | null>>([]);
  const analyticsTriggerRef = useRef<HTMLButtonElement | null>(null);
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
  const summary = useMemo(
    () =>
      history.hasCompleteCache
        ? buildAnalyticsSummary({
            transactions,
            range,
            currency,
            now: analyticsNow,
            customPeriod,
          })
        : undefined,
    [
      analyticsNow,
      currency,
      customPeriod,
      history.hasCompleteCache,
      range,
      transactions,
    ],
  );
  const currencies = useMemo(() => {
    const values = new Set(
      transactions.map((transaction) => transaction.currency),
    );
    values.add(currency);
    return [...values].sort();
  }, [currency, transactions]);
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

  useEffect(() => {
    for (const [index, slide] of slideRefs.current.entries()) {
      if (slide) slide.inert = index !== activeIndex;
    }
  }, [activeIndex]);

  useEffect(() => {
    if (analyticsOpen) setDrawerCurrency(currency);
  }, [analyticsOpen, currency]);

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
      window.requestAnimationFrame(() => analyticsTriggerRef.current?.focus());
    }
  };

  const handleCustomRangeRequest = (trigger: HTMLButtonElement) => {
    customRangeTriggerRef.current = trigger;
    setHistoryActivated(true);
    setCustomRangeOpen(true);
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
              onRangeChange={setRange}
              onCustomRequest={handleCustomRangeRequest}
              summary={summary}
              isLoading={history.isLoading || history.isDownloading}
              isOffline={!history.isOnline}
              updatedAt={updatedAt}
              error={history.error}
              onRetry={() => {
                void history.refresh();
              }}
              onViewAll={(event) => {
                analyticsTriggerRef.current = event.currentTarget;
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
        onOpenChange={handleAnalyticsOpenChange}
        transactions={transactions}
        range={range}
        onRangeChange={setRange}
        customPeriod={customPeriod}
        onCustomPeriodChange={setCustomPeriod}
        currency={drawerCurrency}
        onCurrencyChange={setDrawerCurrency}
        currencies={currencies}
        isLoading={history.isLoading || history.isDownloading}
        hasCompleteHistory={history.hasCompleteCache}
        isOffline={!history.isOnline}
        updatedAt={updatedAt}
        error={history.error}
        onRetry={() => {
          void history.refresh();
        }}
        onSelectTransaction={onEditTransaction}
        now={analyticsNow}
      />
    </>
  );
}
