import { endOfDay, startOfMonth } from 'date-fns';
import { useEffect, useMemo, useState, type CSSProperties, type RefObject } from 'react';
import type { TransactionRecord } from '../../lib/types';
import type { DashboardHeaderMotionHandle } from '../Header';
import {
  buildAnalyticsPeriodOptions,
  buildAnalyticsSummary,
  type AnalyticsRange,
} from './analytics';
import { AnalyticsView } from './AnalyticsView';
import {
  DASHBOARD_SLIDES,
  HEADER_COLLAPSE_DISTANCE,
} from './homeDashboardCarouselMotion';
import { TransactionHistoryView } from './TransactionHistoryView';
import type { AnalyticsSyncController } from './useAnalyticsSync';
import { useHomeDashboardCarouselMotion } from './useHomeDashboardCarouselMotion';

type HomeDashboardCarouselProps = {
  baseCurrency: string;
  bigSpendingThreshold: number | null;
  analyticsSync: AnalyticsSyncController;
  onToast: (message: string) => void;
  onEditTransaction: (transaction: TransactionRecord) => void;
  headerMotionRef?: RefObject<DashboardHeaderMotionHandle | null>;
};

export function HomeDashboardCarousel({
  baseCurrency,
  bigSpendingThreshold,
  analyticsSync,
  onToast,
  onEditTransaction,
  headerMotionRef,
}: HomeDashboardCarouselProps) {
  const [range, setRange] = useState<AnalyticsRange>('week');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [noBigSpending, setNoBigSpending] = useState(false);
  const [analyticsNow, setAnalyticsNow] = useState(() => new Date());
  const [customPeriod, setCustomPeriod] = useState(() => ({
    start: startOfMonth(analyticsNow),
    end: endOfDay(analyticsNow),
  }));
  const {
    activeIndex,
    viewportRef,
    slideRefs,
    transactionDockMotionRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleClickCapture,
    handleContentScroll,
    handleKeyDown,
  } = useHomeDashboardCarouselMotion({ headerMotionRef });
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
    analyticsResult?.status === 'ready' ? analyticsResult.summary : undefined;
  const analyticsUpdatedAt = analyticsSync.lastSyncedAt
    ? Date.parse(analyticsSync.lastSyncedAt)
    : undefined;

  useEffect(() => {
    if (range === 'custom') {
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

  const handleRangeChange = (nextRange: AnalyticsRange) => {
    setRange(nextRange);
    setPeriodOffset(0);
  };

  const handleNoBigSpendingToggle = () => {
    if (bigSpendingThreshold === null) {
      onToast('Set a big spending cutoff in Settings.');
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
        data-motion-progress="0.000"
        data-motion-status="settled"
        data-selected-snap="0"
        data-target-snap="0"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the scroll viewport needs a keyboard target for arrow-key slide navigation
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClickCapture={handleClickCapture}
        className="h-full min-h-0 overflow-hidden overscroll-x-none [touch-action:pan-y]"
      >
        <div
          data-testid="home-carousel-track"
          className="relative h-full min-h-0 backface-hidden"
        >
          <section
            ref={(node: HTMLElement | null) => {
              slideRefs.current[0] = node;
            }}
            aria-label="Analytics, slide 1 of 2"
            aria-hidden={activeIndex !== 0}
            data-home-carousel-slide-index="0"
            className="absolute inset-0 h-full w-full min-w-0 [will-change:transform]"
            style={{ transform: 'translate3d(0%, 0, 0)' }}
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
              isLoading={!analyticsSync.hasLocalHistory}
              hasCompleteHistory={analyticsSync.history.hasCompleteCache}
              isOffline={analyticsSync.status === 'offline'}
              updatedAt={analyticsUpdatedAt}
              error={analyticsSync.history.error}
              onRetry={analyticsSync.resync}
              onSelectTransaction={onEditTransaction}
              now={analyticsNow}
            />
          </section>
          <section
            ref={(node: HTMLElement | null) => {
              slideRefs.current[1] = node;
            }}
            aria-label="Transactions, slide 2 of 2"
            aria-hidden={activeIndex !== 1}
            data-home-carousel-slide-index="1"
            className="absolute inset-0 h-full w-full min-w-0 [will-change:transform]"
            style={
              {
                '--dashboard-header-space': `${HEADER_COLLAPSE_DISTANCE}px`,
                transform: 'translate3d(100%, 0, 0)',
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
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {DASHBOARD_SLIDES[activeIndex]}, slide {activeIndex + 1} of{' '}
        {DASHBOARD_SLIDES.length}
      </p>
    </section>
  );
}
