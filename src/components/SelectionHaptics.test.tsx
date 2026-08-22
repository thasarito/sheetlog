import {
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../lib/constants";
import type { TransactionRecord } from "../lib/types";
import { mockIosHapticsPlatform } from "../test/iosHaptics";
import { ThemeProvider } from "../theme";
import { DateScroller } from "./DateScroller";
import { ThemeSetting } from "./ThemeSetting";
import { AnalyticsCategories } from "./TransactionFlow/AnalyticsCategories";
import { AnalyticsRangeToggle } from "./TransactionFlow/AnalyticsRangeToggle";
import { AnalyticsView } from "./TransactionFlow/AnalyticsView";
import {
  buildAnalyticsSummary,
  type AnalyticsCategory,
  type AnalyticsPeriodOption,
  type AnalyticsSeries,
} from "./TransactionFlow/analytics";
import { StepCategoryTypeTabs } from "./TransactionFlow/StepCategoryTypeTabs";
import { useTransactionForm } from "./TransactionFlow/useTransactionForm";
import { AnimatedTabs } from "./ui/AnimatedTabs";
import { SelectionHaptics } from "./SelectionHaptics";

const tabs = [
  { value: "expense", label: "Expense", icon: ArrowDownRight },
  { value: "income", label: "Income", icon: ArrowUpRight },
  { value: "transfer", label: "Transfer", icon: ArrowLeftRight },
] as const;

function hasHapticTrigger(element: HTMLElement): boolean {
  return element.querySelector("[data-haptic-trigger]") !== null;
}

function renderWithSelectionHaptics(node: ReactNode) {
  return render(
    <>
      <SelectionHaptics />
      {node}
    </>,
  );
}

let restoreIosPlatform: (() => void) | null = null;

beforeEach(() => {
  window.localStorage.clear();
  restoreIosPlatform = mockIosHapticsPlatform();
});

afterEach(() => {
  cleanup();
  restoreIosPlatform?.();
  restoreIosPlatform = null;
  vi.restoreAllMocks();
});

describe("first-release selection haptics", () => {
  it("attaches only to value-changing compact tabs", async () => {
    renderWithSelectionHaptics(
      <AnimatedTabs
        tabs={[...tabs]}
        value="expense"
        onChange={vi.fn()}
        layoutId="selection-haptics-tabs"
        variant="compact"
      />,
    );

    const expense = screen.getByRole("button", { name: "Expense" });
    const income = screen.getByRole("button", { name: "Income" });
    const transfer = screen.getByRole("button", { name: "Transfer" });

    await waitFor(() => expect(hasHapticTrigger(income)).toBe(true));
    expect(hasHapticTrigger(expense)).toBe(false);
    expect(hasHapticTrigger(transfer)).toBe(true);
  });

  it("moves selection haptics with the transaction-type value", async () => {
    const hook = renderHook(() =>
      useTransactionForm({
        initialValues: {
          type: "expense",
          category: "Food",
        },
      }),
    );
    const user = userEvent.setup();
    renderWithSelectionHaptics(
      <StepCategoryTypeTabs
        form={hook.result.current}
        layoutId="transaction-type-haptics"
      />,
    );

    const expense = screen.getByRole("button", { name: "Expense" });
    const income = screen.getByRole("button", { name: "Income" });
    await waitFor(() => expect(hasHapticTrigger(income)).toBe(true));
    expect(hasHapticTrigger(expense)).toBe(false);

    await user.click(income);
    await waitFor(() =>
      expect(hook.result.current.state.values.type).toBe("income"),
    );
    await waitFor(() => expect(hasHapticTrigger(expense)).toBe(true));
    expect(hasHapticTrigger(income)).toBe(false);
  });

  it("covers analytics range and category-filter changes", async () => {
    const series: AnalyticsSeries[] = [
      {
        key: "food",
        label: "Food",
        tone: "emerald",
        categoryNames: ["Food"],
      },
      {
        key: "travel",
        label: "Travel",
        tone: "cyan",
        categoryNames: ["Travel"],
      },
    ];
    const categories: AnalyticsCategory[] = [
      { category: "Food", amount: 60, share: 60 },
      { category: "Travel", amount: 40, share: 40 },
    ];

    const range = renderWithSelectionHaptics(
      <AnalyticsRangeToggle value="week" onChange={vi.fn()} />,
    );
    const week = screen.getByRole("button", { name: "Week" });
    const month = screen.getByRole("button", { name: "Month" });
    const custom = screen.getByRole("button", { name: "Custom date range" });
    await waitFor(() => expect(hasHapticTrigger(month)).toBe(true));
    expect(hasHapticTrigger(week)).toBe(false);
    expect(hasHapticTrigger(custom)).toBe(false);
    range.unmount();

    renderWithSelectionHaptics(
      <AnalyticsCategories
        series={series}
        categories={categories}
        currency="THB"
        selectedKey="food"
        onSelect={vi.fn()}
      />,
    );

    const food = screen.getByRole("button", { name: /Food/ });
    const travel = screen.getByRole("button", { name: /Travel/ });
    await waitFor(() => expect(hasHapticTrigger(food)).toBe(true));
    expect(hasHapticTrigger(travel)).toBe(true);
  });

  it("covers direct date choices without instrumenting the draggable week", async () => {
    const value = new Date(2026, 7, 19, 12, 30);
    renderWithSelectionHaptics(
      <DateScroller value={value} onChange={vi.fn()} />,
    );

    const selectedDay = screen.getByRole("button", {
      name: "Wednesday, August 19",
    });
    const nextDay = screen.getByRole("button", {
      name: "Thursday, August 20",
    });
    const previousMonth = screen.getByRole("button", {
      name: "Previous month",
    });
    const today = screen.getByRole("button", { name: "Today" });

    await waitFor(() => expect(hasHapticTrigger(nextDay)).toBe(true));
    expect(hasHapticTrigger(selectedDay)).toBe(false);
    expect(hasHapticTrigger(previousMonth)).toBe(true);
    expect(hasHapticTrigger(today)).toBe(true);
    expect(
      screen
        .getByRole("list", { name: "Select date" })
        .querySelector(":scope > [data-haptic-trigger]"),
    ).toBeNull();
  });

  it("persists an Appearance preference and removes active attachments globally", async () => {
    const user = userEvent.setup();
    renderWithSelectionHaptics(
      <ThemeProvider>
        <ThemeSetting />
      </ThemeProvider>,
    );

    const system = screen.getByRole("radio", { name: "System" });
    const dark = screen.getByRole("radio", { name: "Dark" });
    const preference = screen.getByRole("switch", {
      name: "Haptic feedback",
    });

    await waitFor(() => expect(hasHapticTrigger(dark)).toBe(true));
    expect(hasHapticTrigger(system)).toBe(false);
    expect(hasHapticTrigger(preference)).toBe(true);
    expect(preference).toHaveAttribute("aria-checked", "true");

    await user.click(preference);

    expect(preference).toHaveAttribute("aria-checked", "false");
    expect(window.localStorage.getItem(STORAGE_KEYS.HAPTIC_FEEDBACK)).toBe(
      "false",
    );
    await waitFor(() => expect(hasHapticTrigger(dark)).toBe(false));
    expect(hasHapticTrigger(preference)).toBe(true);

    await user.click(preference);

    expect(preference).toHaveAttribute("aria-checked", "true");
    expect(window.localStorage.getItem(STORAGE_KEYS.HAPTIC_FEEDBACK)).toBe(
      "true",
    );
    await waitFor(() => expect(hasHapticTrigger(dark)).toBe(true));
  });

  it("haptically marks No Big Spending only when the toggle can change", async () => {
    const transaction: TransactionRecord = {
      id: "expense",
      type: "expense",
      amount: 120,
      currency: "THB",
      account: "Cash",
      for: "Me",
      category: "Dining Out",
      date: "2026-08-17T12:00:00",
      status: "synced",
      sheetRowValid: true,
      createdAt: "2026-08-17T12:00:00",
      updatedAt: "2026-08-17T12:00:00",
    };
    const now = new Date(2026, 7, 19, 12);
    const customPeriod = {
      start: new Date(2026, 7, 1),
      end: new Date(2026, 7, 19),
    };
    const result = buildAnalyticsSummary({
      transactions: [transaction],
      range: "week",
      baseCurrency: "THB",
      rates: [],
      now,
      customPeriod,
      periodOffset: 0,
    });
    if (result.status !== "ready") throw new Error("Expected ready analytics");
    const periodOptions: AnalyticsPeriodOption[] = [
      {
        key: "week-current",
        offset: 0,
        label: "Aug 17–23",
        accessibleLabel: "August 17, 2026 through August 23, 2026",
        period: {
          start: new Date(2026, 7, 17),
          end: new Date(2026, 7, 23, 23, 59, 59, 999),
        },
      },
    ];
    const baseProps = {
      transactions: [transaction],
      summary: result.summary,
      baseCurrency: "THB",
      bigSpendingThreshold: 100,
      noBigSpending: false,
      onNoBigSpendingToggle: vi.fn(),
      range: "week" as const,
      onRangeChange: vi.fn(),
      periodOptions,
      periodOffset: 0,
      onPeriodChange: vi.fn(),
      customPeriod,
      onCustomPeriodChange: vi.fn(),
      isLoading: false,
      hasCompleteHistory: true,
      isOffline: false,
      updatedAt: undefined,
      error: null,
      onRetry: vi.fn(),
      onSelectTransaction: vi.fn(),
      now,
    };
    const { rerender } = renderWithSelectionHaptics(
      <AnalyticsView {...baseProps} />,
    );

    const available = screen.getByRole("button", {
      name: /Turn on no big spending mode/,
    });
    await waitFor(() => expect(hasHapticTrigger(available)).toBe(true));

    rerender(
      <>
        <SelectionHaptics />
        <AnalyticsView {...baseProps} bigSpendingThreshold={null} />
      </>,
    );

    const unavailable = screen.getByRole("button", {
      name: /No big spending mode unavailable/,
    });
    await waitFor(() => expect(hasHapticTrigger(unavailable)).toBe(false));
  });
});
