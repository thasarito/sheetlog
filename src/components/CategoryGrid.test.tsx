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

function touch(identifier: number, clientX: number, clientY: number): Touch {
  return { identifier, clientX, clientY } as Touch;
}

function dispatchTouch(
  target: HTMLElement | Document,
  type: "touchstart" | "touchmove" | "touchend" | "touchcancel",
  touches: Touch[],
  changedTouches: Touch[],
) {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperties(event, {
    touches: { configurable: true, value: touches },
    changedTouches: { configurable: true, value: changedTouches },
  });
  fireEvent(target, event);
  return event;
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

  it("keeps an ordinary native touch tap selecting the category", () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    const onLongPress = vi.fn();
    renderGrid({ onSelect, onLongPress });
    const tile = screen.getByRole("button", { name: "Food Delivery" });
    const start = touch(40, 24, 28);

    dispatchTouch(tile, "touchstart", [start], [start]);
    dispatchTouch(document, "touchend", [], [start]);
    fireEvent.click(tile);

    expect(onSelect).toHaveBeenCalledWith("Food Delivery");
    expect(onLongPress).not.toHaveBeenCalled();
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

  it("keeps native touch ownership outside the tile and ignores touch-derived pointer cancellation", async () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const onDrag = vi.fn();
    const onRelease = vi.fn();
    const onCancel = vi.fn();
    const onSelect = vi.fn();
    renderGrid({ onLongPress, onDrag, onRelease, onCancel, onSelect });
    const tile = screen.getByRole("button", { name: "Food Delivery" });
    const setPointerCapture = vi.fn();
    Object.defineProperties(tile, {
      hasPointerCapture: { configurable: true, value: () => false },
      setPointerCapture: { configurable: true, value: setPointerCapture },
    });
    const start = touch(41, 24, 28);

    dispatchTouch(tile, "touchstart", [start], [start]);
    fireEvent.pointerDown(tile, {
      pointerId: 41,
      pointerType: "touch",
      clientX: 24,
      clientY: 28,
    });
    await act(async () => vi.advanceTimersByTimeAsync(400));

    expect(onLongPress).toHaveBeenCalledWith("Food Delivery", {
      x: 24,
      y: 28,
    });
    expect(setPointerCapture).not.toHaveBeenCalled();

    fireEvent.pointerLeave(tile, {
      pointerId: 41,
      pointerType: "touch",
      clientX: 80,
      clientY: -72,
    });
    fireEvent.pointerCancel(tile, {
      pointerId: 41,
      pointerType: "touch",
    });

    const moved = touch(41, 80, -72);
    const moveEvent = dispatchTouch(document, "touchmove", [moved], [moved]);

    expect(moveEvent.defaultPrevented).toBe(true);
    expect(onDrag).toHaveBeenLastCalledWith({ x: 80, y: -72 });
    expect(onCancel).not.toHaveBeenCalled();

    dispatchTouch(document, "touchend", [], [moved]);

    expect(onRelease).toHaveBeenCalledWith({ x: 80, y: -72 });
    fireEvent.click(tile);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("leaves native scrolling available before touch activation", async () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    renderGrid({ onLongPress });
    const tile = screen.getByRole("button", { name: "Food Delivery" });
    const start = touch(42, 20, 20);

    dispatchTouch(tile, "touchstart", [start], [start]);
    fireEvent.pointerDown(tile, {
      pointerId: 42,
      pointerType: "touch",
      clientX: 20,
      clientY: 20,
    });
    const moved = touch(42, 36, 20);
    const moveEvent = dispatchTouch(document, "touchmove", [moved], [moved]);

    expect(moveEvent.defaultPrevented).toBe(false);
    await act(async () => vi.advanceTimersByTimeAsync(400));
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("cancels an active native touch for matching touchcancel and suppresses its click", async () => {
    vi.useFakeTimers();
    const onCancel = vi.fn();
    const onSelect = vi.fn();
    renderGrid({ onCancel, onSelect });
    const tile = screen.getByRole("button", { name: "Food Delivery" });
    const start = touch(43, 24, 28);

    dispatchTouch(tile, "touchstart", [start], [start]);
    await act(async () => vi.advanceTimersByTimeAsync(400));
    dispatchTouch(document, "touchcancel", [], [start]);

    expect(onCancel).toHaveBeenCalledOnce();
    fireEvent.click(tile);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("cancels an active native touch when a second touch begins anywhere", async () => {
    vi.useFakeTimers();
    const onCancel = vi.fn();
    const onDrag = vi.fn();
    const onSelect = vi.fn();
    renderGrid({ onCancel, onDrag, onSelect });
    const tile = screen.getByRole("button", { name: "Food Delivery" });
    const first = touch(44, 24, 28);
    const second = touch(45, 240, 400);

    dispatchTouch(tile, "touchstart", [first], [first]);
    await act(async () => vi.advanceTimersByTimeAsync(400));
    dispatchTouch(document, "touchstart", [first, second], [second]);
    dispatchTouch(document, "touchmove", [first], [first]);

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onDrag).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(0));
    const endEvent = dispatchTouch(document, "touchend", [second], [first]);
    expect(endEvent.defaultPrevented).toBe(true);
    fireEvent.click(tile);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("cancels a pending native touch when a second touch begins anywhere", async () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const onCancel = vi.fn();
    renderGrid({ onLongPress, onCancel });
    const tile = screen.getByRole("button", { name: "Food Delivery" });
    const first = touch(48, 24, 28);
    const second = touch(49, 240, 400);

    dispatchTouch(tile, "touchstart", [first], [first]);
    dispatchTouch(document, "touchstart", [first, second], [second]);
    await act(async () => vi.advanceTimersByTimeAsync(400));

    expect(onLongPress).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("does not release when touchend omits the initiating identifier", async () => {
    vi.useFakeTimers();
    const onRelease = vi.fn();
    const onCancel = vi.fn();
    renderGrid({ onRelease, onCancel });
    const tile = screen.getByRole("button", { name: "Food Delivery" });
    const start = touch(46, 24, 28);

    dispatchTouch(tile, "touchstart", [start], [start]);
    await act(async () => vi.advanceTimersByTimeAsync(400));
    dispatchTouch(document, "touchend", [], [touch(99, 80, 80)]);

    expect(onRelease).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it.each(["mouse", "pen"] as const)(
    "keeps an active %s pointer captured across leave and cancels it on pointercancel",
    async (pointerType) => {
      vi.useFakeTimers();
      const onDrag = vi.fn();
      const onCancel = vi.fn();
      const onSelect = vi.fn();
      renderGrid({ onDrag, onCancel, onSelect });
      const tile = screen.getByRole("button", { name: "Food Delivery" });
      let captured = false;
      const setPointerCapture = vi.fn(() => {
        captured = true;
      });
      const releasePointerCapture = vi.fn(() => {
        captured = false;
      });
      Object.defineProperties(tile, {
        hasPointerCapture: { configurable: true, value: () => captured },
        setPointerCapture: { configurable: true, value: setPointerCapture },
        releasePointerCapture: {
          configurable: true,
          value: releasePointerCapture,
        },
      });

      fireEvent.pointerDown(tile, {
        pointerId: 47,
        pointerType,
        clientX: 24,
        clientY: 28,
      });
      await act(async () => vi.advanceTimersByTimeAsync(400));
      fireEvent.pointerLeave(tile, {
        pointerId: 47,
        pointerType,
      });
      fireEvent.pointerMove(tile, {
        pointerId: 47,
        pointerType,
        clientX: 64,
        clientY: 12,
      });

      expect(onDrag).toHaveBeenCalledWith({ x: 64, y: 12 });
      expect(onCancel).not.toHaveBeenCalled();

      fireEvent.pointerCancel(tile, {
        pointerId: 47,
        pointerType,
      });

      expect(releasePointerCapture).toHaveBeenCalledWith(47);
      expect(onCancel).toHaveBeenCalledOnce();
      fireEvent.click(tile);
      expect(onSelect).not.toHaveBeenCalled();
    },
  );

  it.each(["mouse", "pen"] as const)(
    "releases an active %s pointer at its final coordinates",
    async (pointerType) => {
      vi.useFakeTimers();
      const onRelease = vi.fn();
      renderGrid({ onRelease });
      const tile = screen.getByRole("button", { name: "Food Delivery" });

      fireEvent.pointerDown(tile, {
        pointerId: 51,
        pointerType,
        clientX: 24,
        clientY: 28,
      });
      await act(async () => vi.advanceTimersByTimeAsync(400));
      fireEvent.pointerUp(tile, {
        pointerId: 51,
        pointerType,
        clientX: 72,
        clientY: 16,
      });

      expect(onRelease).toHaveBeenCalledWith({ x: 72, y: 16 });
    },
  );

  it("removes native document listeners when a pending tile unmounts", async () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const onDrag = vi.fn();
    const onRelease = vi.fn();
    const { unmount } = renderGrid({ onLongPress, onDrag, onRelease });
    const tile = screen.getByRole("button", { name: "Food Delivery" });
    const start = touch(50, 24, 28);

    dispatchTouch(tile, "touchstart", [start], [start]);
    unmount();
    dispatchTouch(document, "touchmove", [touch(50, 80, -72)], []);
    dispatchTouch(document, "touchend", [], [touch(50, 80, -72)]);
    await act(async () => vi.advanceTimersByTimeAsync(400));

    expect(onLongPress).not.toHaveBeenCalled();
    expect(onDrag).not.toHaveBeenCalled();
    expect(onRelease).not.toHaveBeenCalled();
  });

  it("cancels an active native touch when its tile is removed", async () => {
    vi.useFakeTimers();
    const onCancel = vi.fn();
    const { rerender, props } = renderGrid({ onCancel });
    const tile = screen.getByRole("button", { name: "Food Delivery" });
    const start = touch(52, 24, 28);

    dispatchTouch(tile, "touchstart", [start], [start]);
    await act(async () => vi.advanceTimersByTimeAsync(400));
    rerender(<CategoryGrid {...props} categories={[categories[1]]} />);

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("cancels an active captured pointer when its tile is removed", async () => {
    vi.useFakeTimers();
    const onCancel = vi.fn();
    const { rerender, props } = renderGrid({ onCancel });
    const tile = screen.getByRole("button", { name: "Food Delivery" });
    let captured = false;
    const releasePointerCapture = vi.fn(() => {
      captured = false;
    });
    Object.defineProperties(tile, {
      hasPointerCapture: { configurable: true, value: () => captured },
      setPointerCapture: {
        configurable: true,
        value: vi.fn(() => {
          captured = true;
        }),
      },
      releasePointerCapture: {
        configurable: true,
        value: releasePointerCapture,
      },
    });

    fireEvent.pointerDown(tile, {
      pointerId: 53,
      pointerType: "mouse",
      clientX: 24,
      clientY: 28,
    });
    await act(async () => vi.advanceTimersByTimeAsync(400));
    rerender(<CategoryGrid {...props} categories={[categories[1]]} />);

    expect(releasePointerCapture).toHaveBeenCalledWith(53);
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
