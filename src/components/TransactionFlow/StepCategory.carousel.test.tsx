import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CategoryItem, TransactionType } from "../../lib/types";
import { StepCategory } from "./StepCategory";
import { useTransactionForm } from "./useTransactionForm";

vi.mock("../../hooks/useQuickNotes", () => ({
  getQuickNotesForCategory: () => [],
  useQuickNotesQuery: () => ({ data: {} }),
}));

const dateTimeDrawerMock = vi.hoisted(() => ({
  nested: undefined as boolean | undefined,
}));

vi.mock("../DateTimeDrawer", () => ({
  DateTimeDrawer: ({
    open,
    nested,
  }: {
    open: boolean;
    nested?: boolean;
  }) => {
    dateTimeDrawerMock.nested = nested;
    return open ? <div role="dialog">Date &amp; time</div> : null;
  },
}));

const categoryGroups: Record<TransactionType, CategoryItem[]> = {
  expense: [{ name: "Food Delivery", icon: "Wallet", color: "#ef4444" }],
  income: [{ name: "Salary", icon: "Wallet", color: "#22c55e" }],
  transfer: [],
};

function Harness({ dateDrawerNested = false }: { dateDrawerNested?: boolean }) {
  const form = useTransactionForm({
    initialValues: { type: "expense", category: "Food Delivery" },
  });
  const values = form.useStore((state) => state.values);
  return (
    <>
      <output data-testid="form-type">{values.type}</output>
      <output data-testid="form-category">{values.category || "empty"}</output>
      <StepCategory
        form={form}
        categoryGroups={categoryGroups}
        onConfirm={vi.fn()}
        dateDrawerNested={dateDrawerNested}
      />
    </>
  );
}

function renderCarousel() {
  render(<Harness />);
  const viewport = screen.getByTestId("transaction-type-carousel");
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
  return viewport;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("StepCategory carousel", () => {
  it("can open Date & time as a nested drawer", () => {
    render(<Harness dateDrawerNested />);

    expect(dateTimeDrawerMock.nested).toBe(true);
  });

  it("syncs a tab click to the form and clears the old category", async () => {
    const user = userEvent.setup();
    renderCarousel();

    await user.click(screen.getByRole("button", { name: "Income" }));

    await waitFor(() =>
      expect(screen.getByTestId("form-type")).toHaveTextContent("income"),
    );
    expect(screen.getByTestId("form-category")).toHaveTextContent("empty");
    expect(screen.getByRole("button", { name: "Income" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByLabelText("Income categories, slide 2 of 3"),
    ).not.toHaveAttribute("aria-hidden", "true");
  });

  it("commits the nearest finite slide after scrolling", async () => {
    const viewport = renderCarousel();
    viewport.scrollLeft = 999;
    fireEvent.scroll(viewport);

    await waitFor(() =>
      expect(screen.getByTestId("form-type")).toHaveTextContent("transfer"),
    );
    const emptyTransferSlide = screen.getByLabelText(
      "Transfer categories, slide 3 of 3",
    );
    expect(emptyTransferSlide).not.toHaveAttribute("aria-hidden", "true");
    expect(
      within(emptyTransferSlide).queryByRole("button"),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(viewport, { key: "ArrowRight" });
    await waitFor(() =>
      expect(screen.getByTestId("form-type")).toHaveTextContent("transfer"),
    );
  });

  it("animates tab progress before committing the nearest slide", async () => {
    vi.useFakeTimers();
    const viewport = renderCarousel();

    fireEvent.touchStart(viewport);
    viewport.scrollLeft = 150;
    fireEvent.scroll(viewport);

    expect(
      screen.getByTestId("animated-tabs-compact-indicator"),
    ).toHaveStyle({ transform: "translateX(calc(50% + 2px))" });
    expect(screen.getByTestId("form-type")).toHaveTextContent("expense");
    expect(screen.getByRole("button", { name: "Expense" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await act(async () => vi.advanceTimersByTimeAsync(160));
    expect(screen.getByTestId("form-type")).toHaveTextContent("expense");

    fireEvent.touchEnd(viewport);
    await act(async () => vi.advanceTimersByTimeAsync(80));
    expect(screen.getByTestId("form-type")).toHaveTextContent("income");
  });

  it("advances through rapid sequential arrow navigation", async () => {
    const viewport = renderCarousel();

    fireEvent.keyDown(viewport, { key: "ArrowRight" });
    fireEvent.keyDown(viewport, { key: "ArrowRight" });

    await waitFor(() =>
      expect(screen.getByTestId("form-type")).toHaveTextContent("transfer"),
    );
    expect(viewport.scrollLeft).toBe(600);
  });

  it("fills the available step width", () => {
    renderCarousel();
    const categorySection = screen.getByRole("region", {
      name: "Transaction type and categories",
    });

    expect(categorySection).toHaveClass("w-full");
    expect(categorySection).not.toHaveClass("mx-auto", "max-w-[390px]");
  });

  it("insets category content inside each full-width slide", () => {
    renderCarousel();

    for (const label of ["Expense", "Income", "Transfer"]) {
      const slide = screen.getByLabelText(
        new RegExp(`^${label} categories, slide`),
      );
      expect(slide).toHaveClass("min-w-full", "px-2");
    }
  });

  it("reserves a square four-row viewport with hidden vertical scrollbars", () => {
    const viewport = renderCarousel();

    expect(viewport).toHaveClass("aspect-square", "w-full", "flex-none");
    expect(viewport).not.toHaveClass("flex-1");

    for (const label of ["Expense", "Income", "Transfer"]) {
      const slide = screen.getByLabelText(
        new RegExp(`^${label} categories, slide`),
      );
      expect(slide).toHaveClass(
        "overflow-y-auto",
        "[scrollbar-width:none]",
        "[&::-webkit-scrollbar]:hidden",
      );
    }
  });

  it("suppresses category selection after a horizontal drag but preserves a tap", () => {
    renderCarousel();
    const category = screen.getByRole("button", { name: "Food Delivery" });

    fireEvent.pointerDown(category, {
      pointerId: 1,
      clientX: 250,
      clientY: 80,
    });
    fireEvent.pointerMove(category, {
      pointerId: 1,
      clientX: 120,
      clientY: 84,
    });
    fireEvent.pointerUp(category, {
      pointerId: 1,
      clientX: 120,
      clientY: 84,
    });
    fireEvent.click(category);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(category);
    expect(screen.getByRole("dialog")).toHaveTextContent("Date & time");
  });
});
