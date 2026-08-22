import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HapticSelectionButton } from "./HapticSelectionButton";

const haptics = vi.hoisted(() => {
  const cleanupAttachment = vi.fn();
  return {
    cleanupAttachment,
    attachIosSelectionHaptic: vi.fn(() => cleanupAttachment),
  };
});

vi.mock("../../lib/transactionHaptics", () => ({
  attachIosSelectionHaptic: haptics.attachIosSelectionHaptic,
}));

afterEach(() => {
  cleanup();
  haptics.cleanupAttachment.mockReset();
  haptics.attachIosSelectionHaptic.mockClear();
});

describe("HapticSelectionButton", () => {
  it("attaches only while tapping can change a value", () => {
    const { rerender } = render(
      <HapticSelectionButton changesValue={false}>Expense</HapticSelectionButton>,
    );

    expect(haptics.attachIosSelectionHaptic).not.toHaveBeenCalled();

    rerender(
      <HapticSelectionButton changesValue>Income</HapticSelectionButton>,
    );

    expect(haptics.attachIosSelectionHaptic).toHaveBeenCalledWith(
      screen.getByRole("button", { name: "Income" }),
    );
  });

  it("cleans up when disabled or unmounted", () => {
    const { rerender, unmount } = render(
      <HapticSelectionButton changesValue>Income</HapticSelectionButton>,
    );

    expect(haptics.attachIosSelectionHaptic).toHaveBeenCalledTimes(1);

    rerender(
      <HapticSelectionButton changesValue disabled>
        Income
      </HapticSelectionButton>,
    );

    expect(haptics.cleanupAttachment).toHaveBeenCalledTimes(1);
    expect(haptics.attachIosSelectionHaptic).toHaveBeenCalledTimes(1);

    rerender(
      <HapticSelectionButton changesValue>Transfer</HapticSelectionButton>,
    );
    expect(haptics.attachIosSelectionHaptic).toHaveBeenCalledTimes(2);

    unmount();
    expect(haptics.cleanupAttachment).toHaveBeenCalledTimes(2);
  });
});
