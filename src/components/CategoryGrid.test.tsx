import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CategoryGrid } from "./CategoryGrid";

const categories = [
  { name: "Food Delivery", icon: "Wallet", color: "#ef4444" },
  { name: "Dining Out", icon: "Utensils", color: "#f97316" },
];

function renderGrid(
  overrides: Partial<React.ComponentProps<typeof CategoryGrid>> = {},
) {
  const props: React.ComponentProps<typeof CategoryGrid> = {
    categories,
    transactionType: "expense",
    onSelect: vi.fn(),
    onLongPress: vi.fn(),
    onDrag: vi.fn(),
    onRelease: vi.fn(),
    ...overrides,
  };
  const result = render(<CategoryGrid {...props} />);
  return { ...result, props };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("CategoryGrid", () => {
  it("renders four-column square theme-surface tiles with an 8px gap", () => {
    renderGrid();

    expect(screen.getByTestId("category-grid")).toHaveClass(
      "grid-cols-4",
      "gap-2",
    );
    expect(screen.getByRole("button", { name: "Food Delivery" })).toHaveClass(
      "aspect-square",
      "bg-surface-2",
      "[touch-action:pan-x_pan-y]",
    );
    expect(screen.getByText("Food Delivery").closest("button")).toBe(
      screen.getByRole("button", { name: "Food Delivery" }),
    );
  });

  it("optically lowers the icon and clamps the bottom-half label", () => {
    renderGrid();

    const tile = screen.getByRole("button", { name: "Food Delivery" });
    const icon = tile.querySelector("svg");
    const iconRegion = icon?.parentElement;
    const label = screen.getByText("Food Delivery");
    const labelRegion = label.parentElement;

    expect(tile).toHaveClass("grid", "grid-rows-2", "p-0");
    expect(iconRegion).toHaveClass(
      "flex",
      "h-full",
      "w-full",
      "items-center",
      "justify-center",
    );
    expect(icon).toHaveClass("translate-y-2.5");
    expect(labelRegion).toHaveClass(
      "flex",
      "h-full",
      "items-center",
      "justify-center",
    );
    expect(label).toHaveClass("line-clamp-2");
  });

  it("constrains extreme custom colors to a contrast-safe foreground mix", () => {
    const extremeCategories = [
      { name: "White Icon", icon: "Wallet", color: "#ffffff" },
      { name: "Black Icon", icon: "Wallet", color: "#000000" },
    ];
    renderGrid({ categories: extremeCategories });

    for (const category of extremeCategories) {
      const icon = screen
        .getByRole("button", { name: category.name })
        .querySelector("svg");
      expect(icon).toHaveStyle({
        color: `color-mix(in srgb, ${category.color} 30%, hsl(var(--foreground)))`,
      });
    }
  });

  it("keeps an ordinary tap selecting the category", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderGrid({ onSelect });

    await user.click(screen.getByRole("button", { name: "Food Delivery" }));

    expect(onSelect).toHaveBeenCalledWith("Food Delivery");
  });

  it("cancels long press when movement exceeds the tolerance", async () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    renderGrid({ onLongPress });
    const tile = screen.getByRole("button", { name: "Food Delivery" });

    fireEvent.pointerDown(tile, { pointerId: 1, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(tile, { pointerId: 1, clientX: 36, clientY: 20 });
    await act(async () => vi.advanceTimersByTimeAsync(400));

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("defers pointer capture until a stationary long press activates", async () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    renderGrid({ onLongPress });
    const tile = screen.getByRole("button", { name: "Food Delivery" });
    const setPointerCapture = vi.fn();
    Object.defineProperties(tile, {
      hasPointerCapture: { configurable: true, value: () => false },
      setPointerCapture: { configurable: true, value: setPointerCapture },
    });

    fireEvent.pointerDown(tile, { pointerId: 7, clientX: 24, clientY: 28 });
    expect(setPointerCapture).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(400));

    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(onLongPress).toHaveBeenCalledWith("Food Delivery", { x: 24, y: 28 });
  });

  it("locks native scrolling only after long press activation and reports cancellation", async () => {
    vi.useFakeTimers();
    const onDrag = vi.fn();
    const onCancel = vi.fn();
    renderGrid({ onDrag, onCancel });
    const tile = screen.getByRole("button", { name: "Food Delivery" });
    Object.defineProperties(tile, {
      hasPointerCapture: { configurable: true, value: () => false },
      setPointerCapture: { configurable: true, value: vi.fn() },
    });

    fireEvent.pointerDown(tile, { pointerId: 9, clientX: 24, clientY: 28 });
    const pendingMove = new Event("touchmove", {
      bubbles: true,
      cancelable: true,
    });
    tile.dispatchEvent(pendingMove);
    expect(pendingMove.defaultPrevented).toBe(false);

    await act(async () => vi.advanceTimersByTimeAsync(400));
    const lockedMove = new Event("touchmove", {
      bubbles: true,
      cancelable: true,
    });
    tile.dispatchEvent(lockedMove);
    fireEvent.pointerMove(tile, {
      pointerId: 9,
      clientX: 32,
      clientY: 36,
    });
    fireEvent.pointerCancel(tile, { pointerId: 9 });

    expect(lockedMove.defaultPrevented).toBe(true);
    expect(onDrag).toHaveBeenCalledWith({ x: 32, y: 36 });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("cancels a pending long press when its tile unmounts", async () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const { unmount } = renderGrid({ onLongPress });
    const tile = screen.getByRole("button", { name: "Food Delivery" });

    fireEvent.pointerDown(tile, { pointerId: 11, clientX: 24, clientY: 28 });
    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(400));

    expect(onLongPress).not.toHaveBeenCalled();
  });
});
