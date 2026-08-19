import { endOfDay, startOfDay } from "date-fns";
import { BadgeDollarSign, GripHorizontal } from "lucide-react";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type RefObject,
} from "react";
import type { ExchangeRateRecord } from "../../lib/types";
import { Skeleton } from "../ui/skeleton";
import {
  buildAnalyticsSummary,
  formatAnalyticsAmount,
  type AnalyticsSummary,
} from "./analytics";
import { AnalyticsView, type AnalyticsViewProps } from "./AnalyticsView";

type CategorySheetState = "collapsed" | "expanded" | "keyboard";

type AnalyticsSheetMorphProps = AnalyticsViewProps & {
  rates: ExchangeRateRecord[];
};

type SheetElements = {
  drawer: HTMLElement | null;
  launcher: HTMLElement | null;
  body: HTMLElement | null;
  safeArea: HTMLElement | null;
};

const MORPH_TRACKING_TIMEOUT_MS = 700;
const MORPH_STABLE_FRAME_COUNT = 4;
const MORPH_PROGRESS_EPSILON = 0.001;
const MORPH_SCROLL_DISTANCE = 72;

const MORPH_STYLES = `
[data-analytics-sheet-morph] {
  position: relative;
}

[data-analytics-sheet-morph] [data-testid="analytics-dashboard-scroll"] {
  padding-top: calc(var(--dashboard-header-height, 68px) + 7rem) !important;
}

[data-analytics-sheet-morph] [data-testid="analytics-dashboard-scroll"] > div {
  opacity: var(--analytics-morph-detail-opacity);
  transform: translate3d(0, var(--analytics-morph-detail-offset), 0);
  will-change: opacity, transform;
}

[data-analytics-sheet-morph][data-category-sheet-state="expanded"]
  [data-testid="analytics-dashboard-scroll"],
[data-analytics-sheet-morph][data-category-sheet-state="keyboard"]
  [data-testid="analytics-dashboard-scroll"] {
  overflow-y: hidden;
}

[data-analytics-sheet-morph][data-category-sheet-state="expanded"]
  [data-testid="analytics-dashboard-scroll"] > div,
[data-analytics-sheet-morph][data-category-sheet-state="keyboard"]
  [data-testid="analytics-dashboard-scroll"] > div {
  pointer-events: none;
}

.analytics-today-morph {
  position: absolute;
  z-index: 20;
  left: 1rem;
  right: 1rem;
  top: calc(var(--dashboard-header-height, 68px) + var(--analytics-morph-summary-top));
  opacity: var(--analytics-morph-summary-opacity);
  pointer-events: none;
  transform: translate3d(0, var(--analytics-morph-summary-scroll-offset), 0);
  will-change: opacity, transform, top;
}

.analytics-today-morph__amount {
  font-size: var(--analytics-morph-amount-size);
}

.analytics-today-morph__metrics {
  opacity: var(--analytics-morph-metrics-opacity);
  transform: translate3d(0, var(--analytics-morph-metrics-offset), 0);
  will-change: opacity, transform;
}

@media (max-height: 720px) {
  .analytics-today-morph__top-category,
  .analytics-today-morph__hint {
    display: none;
  }
}
`;

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateCategorySheetProgress(
  visibleHeight: number,
  collapsedHeight: number,
  expandedHeight: number,
): number {
  if (
    !Number.isFinite(visibleHeight) ||
    !Number.isFinite(collapsedHeight) ||
    !Number.isFinite(expandedHeight) ||
    expandedHeight <= collapsedHeight
  ) {
    return 0;
  }

  return clamp(
    (visibleHeight - collapsedHeight) / (expandedHeight - collapsedHeight),
  );
}

function categorySheetState(element: HTMLElement): CategorySheetState {
  const value = element.dataset.categorySheetState;
  return value === "collapsed" || value === "keyboard" ? value : "expanded";
}

function findSheetElements(layout: HTMLElement): SheetElements {
  return {
    drawer: layout.querySelector<HTMLElement>(
      '[role="dialog"][data-category-sheet-state]',
    ),
    launcher: layout.querySelector<HTMLElement>(
      '[data-testid="category-step-launcher"]',
    ),
    body: layout.querySelector<HTMLElement>(
      '[data-testid="category-step-sheet-body"]',
    ),
    safeArea: layout.querySelector<HTMLElement>(
      '[data-testid="category-step-safe-area"]',
    ),
  };
}

function fallbackProgress(state: CategorySheetState): number {
  return state === "expanded" ? 1 : 0;
}

function setProgressVariables(root: HTMLElement, progress: number) {
  const normalized = clamp(progress);
  const detailOpacity = 1 - normalized;
  const metricsOpacity = clamp((normalized - 0.42) * 2.2);

  root.style.setProperty("--category-sheet-progress", normalized.toFixed(4));
  root.style.setProperty(
    "--analytics-morph-detail-opacity",
    detailOpacity.toFixed(4),
  );
  root.style.setProperty(
    "--analytics-morph-detail-offset",
    `${(normalized * 26).toFixed(2)}px`,
  );
  root.style.setProperty(
    "--analytics-morph-summary-top",
    `${(12 + normalized * 30).toFixed(2)}px`,
  );
  root.style.setProperty(
    "--analytics-morph-amount-size",
    `${(30 + normalized * 20).toFixed(2)}px`,
  );
  root.style.setProperty(
    "--analytics-morph-metrics-opacity",
    metricsOpacity.toFixed(4),
  );
  root.style.setProperty(
    "--analytics-morph-metrics-offset",
    `${((1 - normalized) * -8).toFixed(2)}px`,
  );
}

function setScrollVariables(root: HTMLElement, scrollTop: number) {
  const progress = clamp(scrollTop / MORPH_SCROLL_DISTANCE);
  root.style.setProperty(
    "--analytics-morph-summary-opacity",
    (1 - progress).toFixed(4),
  );
  root.style.setProperty(
    "--analytics-morph-summary-scroll-offset",
    `${(progress * -40).toFixed(2)}px`,
  );
}

function setDetailedContentAvailability(
  content: HTMLElement,
  liveRegion: HTMLElement | null,
  state: CategorySheetState,
) {
  const hidden = state !== "collapsed";
  content.inert = hidden;
  if (hidden) {
    content.setAttribute("aria-hidden", "true");
    liveRegion?.setAttribute("aria-hidden", "true");
  } else {
    content.removeAttribute("aria-hidden");
    liveRegion?.removeAttribute("aria-hidden");
  }
}

function useCategorySheetMorph(rootRef: RefObject<HTMLElement>) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const layout = root.closest<HTMLElement>(
      '[data-testid="category-step-layout"]',
    );
    const scroll = root.querySelector<HTMLElement>(
      '[data-testid="analytics-dashboard-scroll"]',
    );
    const detailedContent = scroll?.firstElementChild as HTMLElement | null;
    const detailedLiveRegion =
      scroll?.parentElement?.querySelector<HTMLElement>(
        'output[aria-label="Analytics summary update"]',
      ) ?? null;

    if (!layout || !scroll || !detailedContent) {
      if (root.dataset.categorySheetState !== "collapsed") {
        root.dataset.categorySheetState = "collapsed";
      }
      setProgressVariables(root, 0);
      setScrollVariables(root, 0);
      return;
    }

    let elements = findSheetElements(layout);
    let observedDrawer: HTMLElement | null = null;
    let trackingFrame = 0;
    let trackingStartedAt = 0;
    let stableFrames = 0;
    let previousProgress = Number.NaN;
    let previousState: CategorySheetState | null = null;
    let preservedDetailScrollTop = scroll.scrollTop;

    const setDetailScrollTop = (nextScrollTop: number) => {
      if (Math.abs(scroll.scrollTop - nextScrollTop) < 1) return;
      scroll.scrollTop = nextScrollTop;
      scroll.dispatchEvent(new Event("scroll", { bubbles: true }));
    };

    const updateScrollVariables = () => {
      const state = categorySheetState(layout);
      setScrollVariables(root, state === "collapsed" ? scroll.scrollTop : 0);
    };

    const applySheetState = () => {
      const state = categorySheetState(layout);
      if (state !== "collapsed" && previousState !== state) {
        if (previousState === null || previousState === "collapsed") {
          preservedDetailScrollTop = scroll.scrollTop;
        }
        setDetailScrollTop(0);
      } else if (
        state === "collapsed" &&
        previousState !== null &&
        previousState !== "collapsed"
      ) {
        setDetailScrollTop(preservedDetailScrollTop);
      }
      previousState = state;
      if (root.dataset.categorySheetState !== state) {
        root.dataset.categorySheetState = state;
      }
      setDetailedContentAvailability(
        detailedContent,
        detailedLiveRegion,
        state,
      );
      updateScrollVariables();
    };

    const measureProgress = () => {
      elements = findSheetElements(layout);
      const state = categorySheetState(layout);
      const layoutRect = layout.getBoundingClientRect();
      const drawerRect = elements.drawer?.getBoundingClientRect();
      const launcherHeight =
        elements.launcher?.getBoundingClientRect().height ?? 0;
      const safeAreaHeight =
        elements.safeArea?.getBoundingClientRect().height ?? 0;
      const expandedHeight = elements.body?.getBoundingClientRect().height ?? 0;
      const visibleHeight = drawerRect
        ? layoutRect.bottom - drawerRect.top
        : Number.NaN;
      const collapsedHeight = launcherHeight + safeAreaHeight;
      const hasGeometry =
        layoutRect.height > 0 &&
        expandedHeight > collapsedHeight &&
        Number.isFinite(visibleHeight);
      const progress = hasGeometry
        ? calculateCategorySheetProgress(
            visibleHeight,
            collapsedHeight,
            expandedHeight,
          )
        : fallbackProgress(state);

      setProgressVariables(root, progress);
      return progress;
    };

    const stopTracking = () => {
      if (trackingFrame !== 0) window.cancelAnimationFrame(trackingFrame);
      trackingFrame = 0;
    };

    const trackFrame = (time: number) => {
      const progress = measureProgress();
      if (
        Number.isFinite(previousProgress) &&
        Math.abs(progress - previousProgress) <= MORPH_PROGRESS_EPSILON
      ) {
        stableFrames += 1;
      } else {
        stableFrames = 0;
      }
      previousProgress = progress;

      if (
        stableFrames >= MORPH_STABLE_FRAME_COUNT ||
        time - trackingStartedAt >= MORPH_TRACKING_TIMEOUT_MS
      ) {
        trackingFrame = 0;
        return;
      }

      trackingFrame = window.requestAnimationFrame(trackFrame);
    };

    const startTracking = () => {
      trackingStartedAt = performance.now();
      stableFrames = 0;
      previousProgress = Number.NaN;
      if (trackingFrame === 0) {
        trackingFrame = window.requestAnimationFrame(trackFrame);
      }
    };

    const drawerObserver = new MutationObserver(startTracking);
    const resizeObserver = new ResizeObserver(startTracking);

    const observeElements = () => {
      elements = findSheetElements(layout);
      resizeObserver.disconnect();
      resizeObserver.observe(layout);
      for (const element of [
        elements.drawer,
        elements.launcher,
        elements.body,
        elements.safeArea,
      ]) {
        if (element) resizeObserver.observe(element);
      }

      if (elements.drawer === observedDrawer) return;
      drawerObserver.disconnect();
      observedDrawer?.removeEventListener("pointerdown", startTracking);
      observedDrawer = elements.drawer;
      if (observedDrawer) {
        drawerObserver.observe(observedDrawer, {
          attributes: true,
          attributeFilter: ["style"],
        });
        observedDrawer.addEventListener("pointerdown", startTracking);
      }
    };

    const stateObserver = new MutationObserver((records) => {
      const layoutStateChanged = records.some(
        (record) =>
          record.type === "attributes" && record.target === layout,
      );
      if (!layoutStateChanged) return;
      applySheetState();
      startTracking();
    });
    stateObserver.observe(layout, {
      attributes: true,
      attributeFilter: ["data-category-sheet-state"],
    });

    const childrenObserver = new MutationObserver(() => {
      observeElements();
      startTracking();
    });
    childrenObserver.observe(layout, { childList: true, subtree: true });

    observeElements();
    applySheetState();
    measureProgress();
    startTracking();
    scroll.addEventListener("scroll", updateScrollVariables, { passive: true });

    return () => {
      stopTracking();
      scroll.removeEventListener("scroll", updateScrollVariables);
      observedDrawer?.removeEventListener("pointerdown", startTracking);
      drawerObserver.disconnect();
      stateObserver.disconnect();
      childrenObserver.disconnect();
      resizeObserver.disconnect();
      detailedContent.inert = false;
      detailedContent.removeAttribute("aria-hidden");
      detailedLiveRegion?.removeAttribute("aria-hidden");
    };
  }, [rootRef]);
}

function signedAnalyticsAmount(amount: number, currency: string): string {
  const value = formatAnalyticsAmount(amount, currency);
  return amount > 0 ? `+${value}` : value;
}

function TodaySummary({
  summary,
  isLoading,
  noBigSpending,
}: {
  summary: AnalyticsSummary | null;
  isLoading: boolean;
  noBigSpending: boolean;
}) {
  if (isLoading || !summary) {
    return (
      <section aria-label="Loading today summary" className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-12 w-40" />
        <Skeleton className="h-4 w-24" />
      </section>
    );
  }

  const transactionCount = summary.transactions.length;
  const topCategory = summary.categories.find(
    (category) => category.amount > 0,
  );
  const expenseCaption =
    summary.expenseTotal < 0
      ? "net refunds today"
      : summary.expenseTotal === 0
        ? "No spending yet today"
        : "spent today";

  return (
    <section
      aria-labelledby="analytics-today-summary-title"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="flex min-h-5 items-center justify-between gap-3 text-[11px] font-semibold text-muted-foreground">
        <h2
          id="analytics-today-summary-title"
          className="text-[11px] font-semibold text-foreground"
        >
          Today so far
        </h2>
        <span>
          {transactionCount}{" "}
          {transactionCount === 1 ? "transaction" : "transactions"}
        </span>
      </div>

      <p className="analytics-today-morph__amount mt-2 font-semibold leading-none tracking-[-0.055em] tabular-nums text-foreground">
        {formatAnalyticsAmount(summary.expenseTotal, summary.currency)}
      </p>
      <p className="mt-1.5 text-xs font-medium text-muted-foreground">
        {expenseCaption}
      </p>

      <div className="analytics-today-morph__metrics mt-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-medium text-muted-foreground">
              Income
            </p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-primary">
              {signedAnalyticsAmount(summary.incomeTotal, summary.currency)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium text-muted-foreground">
              Net
            </p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
              {signedAnalyticsAmount(summary.netTotal, summary.currency)}
            </p>
          </div>
        </div>

        {topCategory ? (
          <div className="analytics-today-morph__top-category grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1.5 text-xs font-semibold">
            <span
              className="h-2 w-2 rounded-full bg-primary"
              aria-hidden="true"
            />
            <span className="min-w-0 truncate text-foreground">
              {topCategory.category}{" "}
              <span className="font-medium text-muted-foreground">
                · {topCategory.share}%
              </span>
            </span>
            <span className="tabular-nums text-foreground">
              {formatAnalyticsAmount(topCategory.amount, summary.currency)}
            </span>
            <span className="col-start-2 col-end-4 h-1 overflow-hidden rounded-full bg-surface-2">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${clamp(topCategory.share, 0, 100)}%` }}
              />
            </span>
          </div>
        ) : null}

        {noBigSpending && summary.excludedBigSpendingCount > 0 ? (
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
            <BadgeDollarSign
              className="h-3.5 w-3.5 text-primary"
              aria-hidden="true"
            />
            <span>
              Filtered · {summary.excludedBigSpendingCount}{" "}
              {summary.excludedBigSpendingCount === 1
                ? "expense"
                : "expenses"}{" "}
              excluded
            </span>
          </div>
        ) : null}

        <div className="analytics-today-morph__hint flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
          <GripHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Pull Step Category down to explore</span>
        </div>
      </div>
    </section>
  );
}

export function AnalyticsSheetMorph({
  rates,
  now,
  transactions,
  baseCurrency,
  bigSpendingThreshold,
  noBigSpending,
  isLoading,
  ...analyticsViewProps
}: AnalyticsSheetMorphProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const fallbackNowRef = useRef(new Date());
  const resolvedNow = now ?? fallbackNowRef.current;
  const resolvedNowTime = resolvedNow.getTime();

  useCategorySheetMorph(rootRef);

  const todaySummary = useMemo(() => {
    if (isLoading) return null;
    const today = new Date(resolvedNowTime);
    return buildAnalyticsSummary({
      transactions,
      range: "custom",
      baseCurrency,
      rates,
      now: today,
      customPeriod: {
        start: startOfDay(today),
        end: endOfDay(today),
      },
      bigSpendingThreshold: noBigSpending ? bigSpendingThreshold : undefined,
    }).summary;
  }, [
    baseCurrency,
    bigSpendingThreshold,
    isLoading,
    noBigSpending,
    rates,
    resolvedNowTime,
    transactions,
  ]);

  return (
    <section
      ref={rootRef}
      data-analytics-sheet-morph
      data-category-sheet-state="expanded"
      className="relative h-full min-h-0"
      style={
        {
          "--category-sheet-progress": "1",
          "--analytics-morph-detail-opacity": "0",
          "--analytics-morph-detail-offset": "26px",
          "--analytics-morph-summary-top": "42px",
          "--analytics-morph-amount-size": "50px",
          "--analytics-morph-metrics-opacity": "1",
          "--analytics-morph-metrics-offset": "0px",
          "--analytics-morph-summary-opacity": "1",
          "--analytics-morph-summary-scroll-offset": "0px",
        } as CSSProperties
      }
    >
      <style>{MORPH_STYLES}</style>
      <AnalyticsView
        transactions={transactions}
        baseCurrency={baseCurrency}
        bigSpendingThreshold={bigSpendingThreshold}
        noBigSpending={noBigSpending}
        isLoading={isLoading}
        now={now}
        {...analyticsViewProps}
      />
      <div className="analytics-today-morph">
        <TodaySummary
          summary={todaySummary}
          isLoading={isLoading}
          noBigSpending={noBigSpending}
        />
      </div>
    </section>
  );
}
