import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DateScroller } from "./DateScroller";

const haptics = vi.hoisted(() => ({
  triggerHapticFeedback: vi.fn(),
  attachIosSelectionHaptic: vi.fn(() => vi.fn()),
}));

vi.mock("../lib/transactionHaptics", () => ({
  triggerHapticFeedback: haptics.triggerHapticFeedback,
  attachIosSelectionHaptic: haptics.attachIosSelectionHaptic,
}));

afterEach(() => {
  haptics.triggerHapticFeedback.mockReset();
  haptics.attachIosSelectionHaptic.mockClear();
});

describe("DateScroller haptics", () => {
  it("stays silent for the selected date and fires once for a changed date", () => {
    const value = new Date(2026, 7, 19, 12, 30);
    const onChange = vi.fn();
    render(<DateScroller value={value} onChange={onChange} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Wednesday, August 19" }),
    );
    expect(haptics.triggerHapticFeedback).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Thursday, August 20" }),
    );
    expect(haptics.triggerHapticFeedback).toHaveBeenCalledTimes(1);
    expect(haptics.triggerHapticFeedback).toHaveBeenCalledWith("selection");
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
