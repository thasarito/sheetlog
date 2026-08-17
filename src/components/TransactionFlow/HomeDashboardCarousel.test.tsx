import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MouseEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AnalyticsPeriodOption,
  AnalyticsRange,
  AnalyticsSummary,
  DatePeriod,
} from "./analytics";
import { HomeDashboardCarousel } from "./HomeDashboardCarousel";

const historyEnabledCalls: boolean[] = [];
const analyticsSlideCalls: Array<{
  range: AnalyticsRange;
  onRangeChange: (range: AnalyticsRange) => void;
  periodOptions: AnalyticsPeriodOption[];
  periodOffset: number;
  onPeriodChange: (offset: number) => void;
  onBucketSelect?: (key: string, trigger: HTMLElement) => void;
  summary?: AnalyticsSummary;
}> = [];
const analyticsDrawerCalls: Array<{
  customPeriod: DatePeriod;
  initialSelectedBucket?: string | null;
  periodOptions: AnalyticsPeriodOption[];
  periodOffset: number;
  onPeriodChange: (offset: number) => void;
}> = [];
const analyticsRangeDrawerCalls: Array<{
  open: boolean;
  value: DatePeriod;
}> = [];

const historyRecords = [
  {
    id: "older-expense",
    type: "expense" as const,
    amount: 100,
    currency: "THB",
    account: "Cash",
    for: "Me",
    category: "Dining Out",
    date: "2026-07-01T12:00:00",
    status: "synced" as const,
    sheetRowValid: true,
    createdAt: "2026-07-01T12:00:00",
    updatedAt: "2026-07-01T12:00:00",
  },
];

vi.mock("./useTransactionHistoryQuery", () => ({
  useTransactionHistoryQuery: (enabled: boolean) => {
    historyEnabledCalls.push(enabled);
    return {
      records: historyRecords,
      meta: null,
      error: null,
      hasCompleteCache: true,
      isLoading: false,
      isRefreshing: false,
      isDownloading: false,
      isOnline: true,
      refresh: vi.fn(),
    };
  },
}));

vi.mock("./TopDashboard", () => ({
  TopDashboard: ({ onViewAll }: { onViewAll: () => void }) => (
    <button type="button" onClick={onViewAll}>
      Transactions content
    </button>
  ),
}));

vi.mock("./AnalyticsSlide", () => ({
  AnalyticsSlide: (props: {
    range: AnalyticsRange;
    onRangeChange: (range: AnalyticsRange) => void;
    periodOptions: AnalyticsPeriodOption[];
    periodOffset: number;
    onPeriodChange: (offset: number) => void;
    onCustomRequest: (trigger: HTMLButtonElement) => void;
    onBucketSelect?: (key: string, trigger: HTMLElement) => void;
    summary?: AnalyticsSummary;
    onViewAll: (event: MouseEvent<HTMLButtonElement>) => void;
  }) => {
    analyticsSlideCalls.push(props);
    return (
      <div>
        <button type="button" onClick={props.onViewAll}>
          Analytics content
        </button>
        <button
          type="button"
          onClick={(event) => props.onBucketSelect?.("2026-07-01", event.currentTarget)}
        >
          Analytics bar
        </button>
        <button type="button" onClick={() => props.onRangeChange("month")}>
          Test month range
        </button>
        <button type="button" onClick={() => props.onPeriodChange(-1)}>
          Test previous period
        </button>
        <button type="button" onClick={() => props.onRangeChange("quarter")}>
          Test quarter range
        </button>
        <button type="button" onClick={() => props.onRangeChange("year")}>
          Test year range
        </button>
        <button
          type="button"
          onClick={(event) => props.onCustomRequest(event.currentTarget)}
        >
          Test custom range
        </button>
        <button type="button" data-home-carousel-swipe-lock="true">
          Nested period swipe target
        </button>
      </div>
    );
  },
}));

vi.mock("./AnalyticsDrawer", () => ({
  AnalyticsDrawer: ({
    open,
    onOpenChange,
    customPeriod,
    initialSelectedBucket,
    periodOptions,
    periodOffset,
    onPeriodChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    customPeriod: DatePeriod;
    initialSelectedBucket?: string | null;
    periodOptions: AnalyticsPeriodOption[];
    periodOffset: number;
    onPeriodChange: (offset: number) => void;
  }) => {
    analyticsDrawerCalls.push({
      customPeriod,
      initialSelectedBucket,
      periodOptions,
      periodOffset,
      onPeriodChange,
    });
    return open ? (
      <button type="button" onClick={() => onOpenChange(false)}>
        Close analytics drawer
      </button>
    ) : null;
  },
}));

vi.mock("./AnalyticsRangeDrawer", () => ({
  AnalyticsRangeDrawer: ({
    open,
    onOpenChange,
    value,
    onApply,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    value: DatePeriod;
    onApply: (period: DatePeriod) => void;
  }) => {
    analyticsRangeDrawerCalls.push({ open, value });
    if (!open) return null;
    return (
      <div role="dialog" aria-label="Custom date range">
        <button
          type="button"
          onClick={() => {
            onApply({
              start: new Date(2026, 7, 5),
              end: new Date(2026, 7, 12),
            });
            onOpenChange(false);
          }}
        >
          Apply test custom range
        </button>
        <button type="button" onClick={() => onOpenChange(false)}>
          Cancel test custom range
        </button>
      </div>
    );
  },
}));

function renderCarousel() {
  const onViewAllTransactions = vi.fn();
  render(
    <HomeDashboardCarousel
      currency="THB"
      onEditTransaction={vi.fn()}
      onViewAllTransactions={onViewAllTransactions}
    />,
  );
  const viewport = screen.getByTestId("home-carousel-viewport");
  Object.defineProperty(viewport, "clientWidth", {
    configurable: true,
    value: 300,
  });
  Object.defineProperty(viewport, "scrollTo", {
    configurable: true,
    value: ({ left }: ScrollToOptions) => {
      viewport.scrollLeft = Number(left ?? 0);
      fireEvent.scroll(viewport);
    },
  });
  return { onViewAllTransactions, viewport };
}

describe("HomeDashboardCarousel", () => {
  beforeEach(() => {
    historyEnabledCalls.splice(0);
    analyticsSlideCalls.splice(0);
    analyticsDrawerCalls.splice(0);
    analyticsRangeDrawerCalls.splice(0);
  });

  it("starts on Transactions and lazily enables history on Analytics", async () => {
    const user = userEvent.setup();
    renderCarousel();

    expect(
      screen.getByRole("button", { name: "Transactions slide" }),
    ).toHaveAttribute("aria-current", "true");
    expect(
      screen.getByLabelText("Transactions, slide 1 of 2"),
    ).not.toHaveAttribute("aria-hidden", "true");
    expect(historyEnabledCalls.at(-1)).toBe(false);
    await user.click(screen.getByRole("button", { name: "Analytics slide" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Analytics slide" }),
      ).toHaveAttribute("aria-current", "true"),
    );
    expect(
      screen.getByLabelText("Analytics, slide 2 of 2"),
    ).not.toHaveAttribute("aria-hidden", "true");
    expect(historyEnabledCalls.at(-1)).toBe(true);
    await user.click(
      screen.getByRole("button", { name: "Transactions slide" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Transactions slide" }),
      ).toHaveAttribute("aria-current", "true"),
    );
    expect(historyEnabledCalls.at(-1)).toBe(true);
  });

  it("supports arrow keys and opens each dedicated sheet flow", async () => {
    const user = userEvent.setup();
    const { onViewAllTransactions, viewport } = renderCarousel();
    fireEvent.keyDown(viewport, { key: "ArrowRight" });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Analytics slide" }),
      ).toHaveAttribute("aria-current", "true"),
    );
    const analyticsTrigger = screen.getByText("Analytics content");
    await user.click(analyticsTrigger);
    await user.click(screen.getByText("Close analytics drawer"));
    await waitFor(() => expect(analyticsTrigger).toHaveFocus());
    fireEvent.keyDown(viewport, { key: "ArrowLeft" });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Transactions slide" }),
      ).toHaveAttribute("aria-current", "true"),
    );
    await user.click(screen.getByText("Transactions content"));
    expect(onViewAllTransactions).toHaveBeenCalledTimes(1);
  });

  it("opens Analytics from a compact bar and keeps View all unfiltered", async () => {
    const user = userEvent.setup();
    const { viewport } = renderCarousel();
    fireEvent.keyDown(viewport, { key: "ArrowRight" });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Analytics slide" }),
      ).toHaveAttribute("aria-current", "true"),
    );

    const bar = screen.getByRole("button", { name: "Analytics bar" });
    await user.click(bar);
    expect(analyticsDrawerCalls.at(-1)?.initialSelectedBucket).toBe("2026-07-01");
    await user.click(screen.getByText("Close analytics drawer"));
    await waitFor(() => expect(bar).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Analytics content" }));
    expect(analyticsDrawerCalls.at(-1)?.initialSelectedBucket).toBeNull();
  });

  it("snaps on touch swipes while leaving mouse drags inert", async () => {
    const { viewport } = renderCarousel();
    expect(viewport.className).toContain("[touch-action:pan-y]");
    expect(viewport.className).not.toContain("[touch-action:pan-x_pan-y]");

    fireEvent.pointerDown(viewport, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 260,
      clientY: 90,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 100,
      clientY: 94,
    });
    fireEvent.pointerUp(viewport, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 100,
      clientY: 94,
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Analytics slide" }),
      ).toHaveAttribute("aria-current", "true"),
    );

    const nestedTarget = screen.getByRole("button", {
      name: "Nested period swipe target",
    });
    fireEvent.pointerDown(nestedTarget, {
      pointerId: 3,
      pointerType: "touch",
      clientX: 100,
      clientY: 90,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 3,
      pointerType: "touch",
      clientX: 260,
      clientY: 94,
    });
    fireEvent.pointerUp(viewport, {
      pointerId: 3,
      pointerType: "touch",
      clientX: 260,
      clientY: 94,
    });
    expect(screen.getByRole("button", { name: "Analytics slide" })).toHaveAttribute(
      "aria-current",
      "true",
    );

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Transactions slide" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Transactions slide" }),
      ).toHaveAttribute("aria-current", "true"),
    );

    fireEvent.pointerDown(viewport, {
      pointerId: 2,
      pointerType: "mouse",
      clientX: 260,
      clientY: 90,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 2,
      pointerType: "mouse",
      clientX: 100,
      clientY: 94,
    });
    fireEvent.pointerUp(viewport, {
      pointerId: 2,
      pointerType: "mouse",
      clientX: 100,
      clientY: 94,
    });
    expect(screen.getByRole("button", { name: "Transactions slide" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("builds daily month, weekly quarter, monthly year, and shared custom state", async () => {
    const user = userEvent.setup();
    renderCarousel();
    await user.click(screen.getByRole("button", { name: "Analytics slide" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Analytics slide" }),
      ).toHaveAttribute("aria-current", "true"),
    );

    await user.click(screen.getByRole("button", { name: "Test month range" }));
    const monthSummary = analyticsSlideCalls.at(-1)?.summary;
    expect(monthSummary?.range).toBe("month");
    expect(monthSummary?.buckets.every((bucket) => !bucket.key.endsWith("-week"))).toBe(true);

    await user.click(screen.getByRole("button", { name: "Test quarter range" }));
    const quarterSummary = analyticsSlideCalls.at(-1)?.summary;
    expect(quarterSummary?.range).toBe("quarter");
    expect(quarterSummary?.buckets.every((bucket) => bucket.key.endsWith("-week"))).toBe(true);

    await user.click(screen.getByRole("button", { name: "Test year range" }));
    const yearSummary = analyticsSlideCalls.at(-1)?.summary;
    expect(yearSummary?.range).toBe("year");
    expect(yearSummary?.periods.current.start.getMonth()).toBe(0);
    expect(yearSummary?.buckets.every((bucket) => bucket.key.endsWith("-month"))).toBe(true);

    await user.click(screen.getByRole("button", { name: "Test custom range" }));
    expect(analyticsSlideCalls.at(-1)?.summary?.range).toBe("year");
    expect(
      screen.getByRole("dialog", { name: "Custom date range" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Close analytics drawer" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Apply test custom range" }),
    );
    const customSummary = analyticsSlideCalls.at(-1)?.summary;
    const customDrawer = analyticsDrawerCalls.at(-1);
    expect(customSummary?.range).toBe("custom");
    expect(customSummary?.periods.current.start).toEqual(new Date(2026, 7, 5));
    expect(customSummary?.periods.current.end.getDate()).toBe(12);
    expect(customDrawer?.customPeriod).toEqual({
      start: new Date(2026, 7, 5),
      end: new Date(2026, 7, 12),
    });
    expect(analyticsRangeDrawerCalls.at(-1)?.open).toBe(false);
    expect(
      screen.queryByRole("button", { name: "Close analytics drawer" }),
    ).not.toBeInTheDocument();
  });

  it("shares the selected period with the sheet and resets it when range changes", async () => {
    const user = userEvent.setup();
    renderCarousel();
    await user.click(screen.getByRole("button", { name: "Analytics slide" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Analytics slide" }),
      ).toHaveAttribute("aria-current", "true"),
    );

    expect(analyticsSlideCalls.at(-1)?.periodOptions.length).toBeGreaterThan(1);
    await user.click(screen.getByRole("button", { name: "Test previous period" }));
    expect(analyticsSlideCalls.at(-1)?.periodOffset).toBe(-1);
    expect(analyticsDrawerCalls.at(-1)?.periodOffset).toBe(-1);
    expect(analyticsSlideCalls.at(-1)?.summary?.periods.current.end).toEqual(
      analyticsDrawerCalls.at(-1)?.periodOptions.find(({ offset }) => offset === -1)?.period.end,
    );

    await user.click(screen.getByRole("button", { name: "Test month range" }));
    expect(analyticsSlideCalls.at(-1)?.range).toBe("month");
    expect(analyticsSlideCalls.at(-1)?.periodOffset).toBe(0);
    expect(analyticsDrawerCalls.at(-1)?.periodOffset).toBe(0);
  });

  it("suppresses an accidental action click after a horizontal touch drag", () => {
    const { onViewAllTransactions, viewport } = renderCarousel();
    const trigger = screen.getByText("Transactions content");

    fireEvent.pointerDown(trigger, {
      clientX: 250,
      clientY: 80,
      pointerType: "touch",
    });
    fireEvent.pointerMove(viewport, {
      clientX: 120,
      clientY: 84,
      pointerType: "touch",
    });
    fireEvent.pointerUp(viewport, {
      clientX: 120,
      clientY: 84,
      pointerType: "touch",
    });
    fireEvent.click(trigger);

    expect(onViewAllTransactions).not.toHaveBeenCalled();
  });
});
