import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MouseEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AnalyticsRange,
  AnalyticsSummary,
  DatePeriod,
} from "./analytics";
import { HomeDashboardCarousel } from "./HomeDashboardCarousel";

const historyEnabledCalls: boolean[] = [];
const analyticsSlideCalls: Array<{
  range: AnalyticsRange;
  onRangeChange: (range: AnalyticsRange) => void;
  summary?: AnalyticsSummary;
}> = [];
const analyticsDrawerCalls: Array<{
  customPeriod: DatePeriod;
}> = [];

vi.mock("./useTransactionHistoryQuery", () => ({
  useTransactionHistoryQuery: (enabled: boolean) => {
    historyEnabledCalls.push(enabled);
    return {
      records: [],
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
    summary?: AnalyticsSummary;
    onViewAll: (event: MouseEvent<HTMLButtonElement>) => void;
  }) => {
    analyticsSlideCalls.push(props);
    return (
      <div>
        <button type="button" onClick={props.onViewAll}>
          Analytics content
        </button>
        <button type="button" onClick={() => props.onRangeChange("month")}>
          Test month range
        </button>
        <button type="button" onClick={() => props.onRangeChange("quarter")}>
          Test quarter range
        </button>
        <button type="button" onClick={() => props.onRangeChange("custom")}>
          Test custom range
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
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    customPeriod: DatePeriod;
  }) => {
    analyticsDrawerCalls.push({ customPeriod });
    return open ? (
      <button type="button" onClick={() => onOpenChange(false)}>
        Close analytics drawer
      </button>
    ) : null;
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

  it("builds daily month, weekly quarter, and shared month-to-date custom state", async () => {
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

    await user.click(screen.getByRole("button", { name: "Test custom range" }));
    const customSummary = analyticsSlideCalls.at(-1)?.summary;
    const customDrawer = analyticsDrawerCalls.at(-1);
    expect(customSummary?.range).toBe("custom");
    expect(customSummary?.periods.current.start.getDate()).toBe(1);
    expect(customSummary?.buckets.every((bucket) => !bucket.key.endsWith("-week"))).toBe(true);
    expect(customDrawer?.customPeriod).toEqual(customSummary?.periods.current);
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
