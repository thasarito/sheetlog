import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TransactionRecord } from "../../lib/types";
import type { AnalyticsViewProps } from "./AnalyticsView";
import {
  AnalyticsSheetMorph,
  calculateCategorySheetProgress,
} from "./AnalyticsSheetMorph";

vi.mock("./AnalyticsView", () => ({
  AnalyticsView: () => (
    <section>
      <output aria-label="Analytics summary update" aria-live="polite">
        Detailed analytics
      </output>
      <div data-testid="analytics-dashboard-scroll">
        <div>
          <button type="button">Detailed control</button>
        </div>
      </div>
    </section>
  ),
}));

const today = new Date("2026-08-19T10:00:00+07:00");
const transaction: TransactionRecord = {
  id: "today-expense",
  type: "expense",
  amount: 1840,
  currency: "THB",
  account: "Cash",
  for: "Me",
  category: "Food & Drink",
  date: "2026-08-19T08:42:00+07:00",
  status: "synced",
  sheetRowValid: true,
  createdAt: "2026-08-19T08:42:00+07:00",
  updatedAt: "2026-08-19T08:42:00+07:00",
};

function analyticsProps(
  overrides: Partial<AnalyticsViewProps> = {},
): AnalyticsViewProps {
  return {
    transactions: [transaction],
    baseCurrency: "THB",
    bigSpendingThreshold: null,
    noBigSpending: false,
    onNoBigSpendingToggle: vi.fn(),
    range: "week",
    onRangeChange: vi.fn(),
    periodOptions: [],
    periodOffset: 0,
    onPeriodChange: vi.fn(),
    customPeriod: { start: today, end: today },
    onCustomPeriodChange: vi.fn(),
    isLoading: false,
    hasCompleteHistory: true,
    isOffline: false,
    error: null,
    onRetry: vi.fn(),
    onSelectTransaction: vi.fn(),
    now: today,
    ...overrides,
  };
}

function rect({
  top = 0,
  height = 0,
}: {
  top?: number;
  height?: number;
}): DOMRect {
  return {
    x: 0,
    y: top,
    width: 390,
    height,
    top,
    right: 390,
    bottom: top + height,
    left: 0,
    toJSON: () => ({}),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("calculateCategorySheetProgress", () => {
  it("normalizes and clamps the visible sheet height", () => {
    expect(calculateCategorySheetProgress(44, 44, 520)).toBe(0);
    expect(calculateCategorySheetProgress(282, 44, 520)).toBe(0.5);
    expect(calculateCategorySheetProgress(520, 44, 520)).toBe(1);
    expect(calculateCategorySheetProgress(20, 44, 520)).toBe(0);
    expect(calculateCategorySheetProgress(700, 44, 520)).toBe(1);
  });
});

describe("AnalyticsSheetMorph", () => {
  it("builds an independent Today summary", () => {
    render(<AnalyticsSheetMorph {...analyticsProps()} rates={[]} />);

    expect(screen.getByText("Today so far")).toBeVisible();
    expect(screen.getAllByText("฿1,840").length).toBeGreaterThan(0);
    expect(screen.getByText("1 transaction")).toBeVisible();
    expect(screen.getByText(/Food & Drink/)).toBeVisible();
  });

  it("tracks the category sheet from expanded to collapsed", async () => {
    let drawerTop = 324;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.dataset.testid === "category-step-layout") {
          return rect({ height: 844 });
        }
        if (this.dataset.testid === "category-sheet-content") {
          return rect({ top: drawerTop, height: 844 });
        }
        if (this.dataset.testid === "category-step-launcher") {
          return rect({ height: 44 });
        }
        if (this.dataset.testid === "category-step-sheet-body") {
          return rect({ height: 520 });
        }
        return rect({ height: 0 });
      },
    );

    render(
      <div
        data-testid="category-step-layout"
        data-category-sheet-state="expanded"
      >
        <div>
          <AnalyticsSheetMorph {...analyticsProps()} rates={[]} />
        </div>
        <section
          role="dialog"
          data-testid="category-sheet-content"
          data-category-sheet-state="expanded"
        >
          <div data-testid="category-step-launcher" />
          <div data-testid="category-step-sheet-body" />
          <div data-testid="category-step-safe-area" />
        </section>
      </div>,
    );

    const root = document.querySelector<HTMLElement>(
      "[data-analytics-sheet-morph]",
    );
    const detail = screen.getByTestId("analytics-dashboard-scroll")
      .firstElementChild as HTMLElement;
    const detailedLiveRegion = document.querySelector<HTMLElement>(
      'output[aria-label="Analytics summary update"]',
    );
    const layout = screen.getByTestId("category-step-layout");
    const drawer = screen.getByTestId("category-sheet-content");

    await waitFor(() => {
      expect(root).toHaveStyle({ "--category-sheet-progress": "1.0000" });
      expect(root).toHaveStyle({
        "--analytics-morph-summary-top": "24.00px",
      });
    });
    expect(detail.inert).toBe(true);
    expect(detail).toHaveAttribute("aria-hidden", "true");
    expect(detailedLiveRegion).toHaveAttribute("aria-hidden", "true");

    drawerTop = 800;
    act(() => {
      layout.dataset.categorySheetState = "collapsed";
      drawer.dataset.categorySheetState = "collapsed";
      drawer.style.transform = "translate3d(0, 800px, 0)";
    });

    await waitFor(() => {
      expect(root).toHaveStyle({ "--category-sheet-progress": "0.0000" });
      expect(root).toHaveStyle({
        "--analytics-morph-summary-top": "12.00px",
      });
      expect(root).toHaveAttribute(
        "data-category-sheet-state",
        "collapsed",
      );
    });
    expect(detail.inert).toBe(false);
    expect(detail).not.toHaveAttribute("aria-hidden");
    expect(detailedLiveRegion).not.toHaveAttribute("aria-hidden");

    const scroll = screen.getByTestId("analytics-dashboard-scroll");
    scroll.scrollTop = 100;
    fireEvent.scroll(scroll);
    expect(root).toHaveStyle({
      "--analytics-morph-summary-opacity": "0.0000",
    });

    drawerTop = 324;
    act(() => {
      layout.dataset.categorySheetState = "expanded";
      drawer.dataset.categorySheetState = "expanded";
      drawer.style.transform = "translate3d(0, 324px, 0)";
    });

    await waitFor(() => {
      expect(root).toHaveStyle({
        "--analytics-morph-summary-opacity": "1.0000",
      });
      expect(root).toHaveStyle({
        "--analytics-morph-summary-top": "24.00px",
      });
      expect(root).toHaveAttribute("data-category-sheet-state", "expanded");
      expect(scroll.scrollTop).toBe(0);
    });
    expect(detail.inert).toBe(true);

    drawerTop = 800;
    act(() => {
      layout.dataset.categorySheetState = "collapsed";
      drawer.dataset.categorySheetState = "collapsed";
      drawer.style.transform = "translate3d(0, 800px, 0)";
    });

    await waitFor(() => expect(scroll.scrollTop).toBe(100));
  });

  it("applies No Big Spending to the Today cover", () => {
    const largeExpense: TransactionRecord = {
      ...transaction,
      id: "large-expense",
      amount: 5000,
    };

    render(
      <AnalyticsSheetMorph
        {...analyticsProps({
          transactions: [transaction, largeExpense],
          bigSpendingThreshold: 3000,
          noBigSpending: true,
        })}
        rates={[]}
      />,
    );

    expect(screen.getAllByText("฿1,840").length).toBeGreaterThan(0);
    expect(screen.getByText(/1 expense excluded/)).toBeVisible();
  });
});
