import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HAPTIC_VIBRATION_PATTERNS,
  attachIosSelectionHaptic,
  resolveReceiptHapticFeedback,
  triggerHapticFeedback,
  type HapticNavigatorLike,
  type ReceiptHapticSnapshot,
} from "./transactionHaptics";

const iosNavigator: HapticNavigatorLike = {
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15",
  platform: "iPhone",
  maxTouchPoints: 5,
};

const desktopNavigator: HapticNavigatorLike = {
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  platform: "MacIntel",
  maxTouchPoints: 0,
};

const pendingReceipt: ReceiptHapticSnapshot = {
  isPending: true,
  isSuccess: false,
  isError: false,
};

const successfulReceipt: ReceiptHapticSnapshot = {
  isPending: false,
  isSuccess: true,
  isError: false,
  syncStatus: "pending",
};

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("transaction haptic primitives", () => {
  it("maps semantic events to deliberately distinct vibration patterns", () => {
    const vibrate = vi.fn(() => true);

    for (const kind of [
      "selection",
      "impact",
      "success",
      "warning",
      "error",
    ] as const) {
      expect(triggerHapticFeedback(kind, { vibrate })).toBe(true);
      expect(vibrate).toHaveBeenLastCalledWith(HAPTIC_VIBRATION_PATTERNS[kind]);
    }
  });

  it("fails silently when vibration is unavailable or rejected", () => {
    expect(triggerHapticFeedback("selection", undefined)).toBe(false);
    expect(
      triggerHapticFeedback("selection", {
        vibrate: () => {
          throw new Error("unsupported");
        },
      }),
    ).toBe(false);
  });

  it("attaches and cleans up the upstream-style iOS switch overlay", () => {
    const button = document.createElement("button");
    document.body.append(button);

    const cleanup = attachIosSelectionHaptic(button, iosNavigator);
    const input = button.querySelector<HTMLInputElement>(
      "input[data-haptic-trigger]",
    );

    expect(input).not.toBeNull();
    expect(input).toHaveAttribute("type", "checkbox");
    expect(input).toHaveAttribute("switch", "");
    expect(input).toHaveAttribute("aria-hidden", "true");
    expect(input).toHaveAttribute("tabindex", "-1");
    expect(button.style.position).toBe("relative");

    cleanup();

    expect(button.querySelector("[data-haptic-trigger]")).toBeNull();
    expect(button.style.position).toBe("");
  });

  it("does not instrument disabled controls or non-iOS browsers", () => {
    const disabled = document.createElement("button");
    disabled.disabled = true;
    const desktop = document.createElement("button");

    attachIosSelectionHaptic(disabled, iosNavigator);
    attachIosSelectionHaptic(desktop, desktopNavigator);

    expect(disabled.querySelector("[data-haptic-trigger]")).toBeNull();
    expect(desktop.querySelector("[data-haptic-trigger]")).toBeNull();
  });
});

describe("receipt haptic semantics", () => {
  it("stays silent while a save is only pending", () => {
    expect(resolveReceiptHapticFeedback(null, pendingReceipt)).toBeNull();
  });

  it("announces local save success once", () => {
    expect(
      resolveReceiptHapticFeedback(pendingReceipt, successfulReceipt),
    ).toBe("success");
    expect(
      resolveReceiptHapticFeedback(successfulReceipt, successfulReceipt),
    ).toBeNull();
  });

  it("uses warning when a locally saved transaction needs sync attention", () => {
    expect(
      resolveReceiptHapticFeedback(successfulReceipt, {
        ...successfulReceipt,
        syncStatus: "error",
      }),
    ).toBe("warning");
  });

  it("uses error for save and undo failures", () => {
    expect(
      resolveReceiptHapticFeedback(pendingReceipt, {
        isPending: false,
        isSuccess: false,
        isError: true,
      }),
    ).toBe("error");
    expect(
      resolveReceiptHapticFeedback(
        { ...successfulReceipt, undoOutcome: "pending" },
        { ...successfulReceipt, undoOutcome: "error" },
      ),
    ).toBe("error");
  });

  it("uses warning when an undo is accepted but still queued", () => {
    expect(
      resolveReceiptHapticFeedback(successfulReceipt, {
        ...successfulReceipt,
        undoOutcome: "pending",
      }),
    ).toBe("warning");
  });
});
