import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setHapticFeedbackEnabled } from "../../lib/haptics";
import { mockIosHapticsPlatform } from "../../test/iosHaptics";
import { HapticSelectionButton } from "./HapticSelectionButton";

let restoreIosPlatform: (() => void) | null = null;

beforeEach(() => {
  window.localStorage.clear();
  restoreIosPlatform = mockIosHapticsPlatform();
});

afterEach(() => {
  restoreIosPlatform?.();
  restoreIosPlatform = null;
});

describe("HapticSelectionButton", () => {
  it("adds the native invisible switch without replacing button activation", () => {
    let presses = 0;
    render(
      <HapticSelectionButton onClick={() => presses += 1}>
        Month
      </HapticSelectionButton>,
    );

    const button = screen.getByRole("button", { name: "Month" });
    const trigger = button.querySelector<HTMLInputElement>(
      "[data-haptic-trigger]",
    );

    expect(trigger).not.toBeNull();
    fireEvent.click(trigger as HTMLInputElement);
    expect(presses).toBe(1);
  });

  it("removes its attachment when inactive, disabled, or globally switched off", () => {
    const { rerender } = render(
      <HapticSelectionButton hapticActive>Month</HapticSelectionButton>,
    );
    const button = screen.getByRole("button", { name: "Month" });

    expect(button.querySelector("[data-haptic-trigger]")).not.toBeNull();

    rerender(
      <HapticSelectionButton hapticActive={false}>Month</HapticSelectionButton>,
    );
    expect(button.querySelector("[data-haptic-trigger]")).toBeNull();

    rerender(
      <HapticSelectionButton hapticActive disabled>
        Month
      </HapticSelectionButton>,
    );
    expect(button.querySelector("[data-haptic-trigger]")).toBeNull();

    rerender(<HapticSelectionButton hapticActive>Month</HapticSelectionButton>);
    expect(button.querySelector("[data-haptic-trigger]")).not.toBeNull();

    act(() => setHapticFeedbackEnabled(false));
    expect(button.querySelector("[data-haptic-trigger]")).toBeNull();

    act(() => setHapticFeedbackEnabled(true));
    expect(button.querySelector("[data-haptic-trigger]")).not.toBeNull();
  });

  it("removes the injected switch and restores inline positioning on unmount", () => {
    const { unmount } = render(
      <HapticSelectionButton style={{ position: "static" }}>
        Month
      </HapticSelectionButton>,
    );
    const button = screen.getByRole("button", { name: "Month" });
    const trigger = button.querySelector("[data-haptic-trigger]");

    expect(button.style.position).toBe("relative");
    expect(trigger).not.toBeNull();

    unmount();

    expect(trigger?.isConnected).toBe(false);
    expect(button.style.position).toBe("static");
  });
});
