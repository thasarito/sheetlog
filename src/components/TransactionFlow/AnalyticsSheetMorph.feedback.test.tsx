import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AnalyticsViewProps } from "./AnalyticsView";
import { AnalyticsSheetMorph } from "./AnalyticsSheetMorph";

vi.mock("./AnalyticsView", () => ({
  AnalyticsView: () => (
    <section>
      <output aria-label="Analytics summary update">Detailed analytics</output>
      <div data-testid="analytics-dashboard-scroll">
        <div>
          <button type="button">Detailed control</button>
        </div>
      </div>
    </section>
  ),
}));

const now = new Date("2026-08-19T10:00:00+07:00");

function analyticsProps(): AnalyticsViewProps {
  return {
    transactions: [],
    baseCurrency: "THB",
    bigSpendingThreshold: null,
    noBigSpending: false,
    onNoBigSpendingToggle: vi.fn(),
    range: "week",
    onRangeChange: vi.fn(),
    periodOptions: [],
    periodOffset: 0,
    onPeriodChange: vi.fn(),
    customPeriod: { start: now, end: now },
    onCustomPeriodChange: vi.fn(),
    isLoading: false,
    hasCompleteHistory: true,
    isOffline: false,
    error: null,
    onRetry: vi.fn(),
    onSelectTransaction: vi.fn(),
    now,
  };
}

describe("AnalyticsSheetMorph state observation", () => {
  it("mirrors the layout state once without observing its own mirrored attribute", async () => {
    render(
      <div
        data-testid="category-step-layout"
        data-category-sheet-state="expanded"
      >
        <AnalyticsSheetMorph {...analyticsProps()} rates={[]} />
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

    const layout = screen.getByTestId("category-step-layout");
    const root = document.querySelector<HTMLElement>(
      "[data-analytics-sheet-morph]",
    );
    expect(root).not.toBeNull();

    let mirroredStateMutations = 0;
    const observer = new MutationObserver((records) => {
      mirroredStateMutations += records.filter(
        (record) =>
          record.type === "attributes" &&
          record.attributeName === "data-category-sheet-state",
      ).length;
    });
    observer.observe(root as HTMLElement, {
      attributes: true,
      attributeFilter: ["data-category-sheet-state"],
    });

    act(() => {
      layout.dataset.categorySheetState = "collapsed";
    });

    await waitFor(() =>
      expect(root).toHaveAttribute("data-category-sheet-state", "collapsed"),
    );
    await new Promise((resolve) => window.setTimeout(resolve, 20));

    observer.disconnect();
    expect(mirroredStateMutations).toBe(1);
  });
});
