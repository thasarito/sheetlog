import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CategoryGrid } from "./CategoryGrid";

const haptics = vi.hoisted(() => ({
  triggerHapticFeedback: vi.fn(),
  attachIosSelectionHaptic: vi.fn(() => vi.fn()),
}));

vi.mock("../lib/transactionHaptics", () => ({
  triggerHapticFeedback: haptics.triggerHapticFeedback,
  attachIosSelectionHaptic: haptics.attachIosSelectionHaptic,
}));

const categories = [
  { name: "Food", icon: "Utensils", color: "#ef4444" },
];

afterEach(() => {
  vi.useRealTimers();
  haptics.triggerHapticFeedback.mockReset();
  haptics.attachIosSelectionHaptic.mockClear();
});

describe("CategoryGrid haptics", () => {
  it("uses a real sibling switch as the direct category tap target", () => {
    const onSelect = vi.fn();
    render(
      <CategoryGrid
        categories={categories}
        transactionType="expense"
        onSelect={onSelect}
        onLongPress={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: "Food" });
    const hapticSwitch =
      button.parentElement?.querySelector<HTMLInputElement>(
        'input[type="checkbox"][data-category-haptic-switch]',
      ) ?? null;

    expect(hapticSwitch).not.toBeNull();
    expect(button.contains(hapticSwitch)).toBe(false);
    expect(hapticSwitch).toHaveAttribute("switch", "");

    fireEvent.click(hapticSwitch as HTMLInputElement);

    expect(haptics.triggerHapticFeedback).toHaveBeenCalledOnce();
    expect(haptics.triggerHapticFeedback).toHaveBeenCalledWith("selection");
    expect(onSelect).toHaveBeenCalledWith("Food");
  });

  it("uses selection feedback for an ordinary category choice", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <CategoryGrid
        categories={categories}
        transactionType="expense"
        onSelect={onSelect}
        onLongPress={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Food" }));

    expect(haptics.triggerHapticFeedback).toHaveBeenCalledWith("selection");
    expect(onSelect).toHaveBeenCalledWith("Food");
  });

  it("uses impact feedback only when the long-press threshold activates", async () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    render(
      <CategoryGrid
        categories={categories}
        transactionType="expense"
        onSelect={vi.fn()}
        onLongPress={onLongPress}
      />,
    );
    const tile = screen.getByRole("button", { name: "Food" });
    Object.defineProperties(tile, {
      hasPointerCapture: { configurable: true, value: () => false },
      setPointerCapture: { configurable: true, value: vi.fn() },
    });

    fireEvent.pointerDown(tile, {
      pointerId: 7,
      clientX: 24,
      clientY: 28,
    });
    await act(async () => vi.advanceTimersByTimeAsync(399));
    expect(haptics.triggerHapticFeedback).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(1));

    expect(haptics.triggerHapticFeedback).toHaveBeenCalledTimes(1);
    expect(haptics.triggerHapticFeedback).toHaveBeenCalledWith("impact");
    expect(onLongPress).toHaveBeenCalledWith("Food", { x: 24, y: 28 });
  });
});
