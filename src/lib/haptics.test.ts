import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "./constants";
import {
  attachSelectionHaptic,
  getHapticFeedbackEnabled,
  setHapticFeedbackEnabled,
  subscribeHapticFeedback,
  supportsIosSelectionHaptics,
  triggerVibrationFeedback,
} from "./haptics";
import { mockIosHapticsPlatform } from "../test/iosHaptics";

let restoreIosPlatform: (() => void) | null = null;

beforeEach(() => {
  window.localStorage.clear();
  restoreIosPlatform = mockIosHapticsPlatform();
});

afterEach(() => {
  restoreIosPlatform?.();
  restoreIosPlatform = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("haptic feedback preference", () => {
  it("defaults to enabled and publishes persisted changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeHapticFeedback(listener);

    expect(getHapticFeedbackEnabled()).toBe(true);

    setHapticFeedbackEnabled(false);

    expect(getHapticFeedbackEnabled()).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEYS.HAPTIC_FEEDBACK)).toBe(
      "false",
    );
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setHapticFeedbackEnabled(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("iOS selection haptic support", () => {
  it("accepts supported iOS releases and rejects the patched iOS 26.5 path", () => {
    expect(
      supportsIosSelectionHaptics({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148",
        platform: "iPhone",
        maxTouchPoints: 5,
      }),
    ).toBe(true);
    expect(
      supportsIosSelectionHaptics({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 26_4 like Mac OS X) Mobile/15E148",
        platform: "iPhone",
        maxTouchPoints: 5,
      }),
    ).toBe(true);
    expect(
      supportsIosSelectionHaptics({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) Mobile/15E148",
        platform: "iPhone",
        maxTouchPoints: 5,
      }),
    ).toBe(false);
    expect(
      supportsIosSelectionHaptics({
        userAgent: "Mozilla/5.0 (Linux; Android 16; Pixel 9 Pro)",
        platform: "Linux armv8l",
        maxTouchPoints: 5,
      }),
    ).toBe(false);
  });
});

describe("selection haptic attachment", () => {
  it("deduplicates the native switch and cleans up the package side effects", () => {
    const button = document.createElement("button");
    button.style.position = "static";
    document.body.append(button);

    const releaseFirst = attachSelectionHaptic(button);
    const releaseSecond = attachSelectionHaptic(button);

    expect(button.querySelectorAll("[data-haptic-trigger]")).toHaveLength(1);
    expect(button.style.position).toBe("relative");

    releaseFirst();
    expect(button.querySelectorAll("[data-haptic-trigger]")).toHaveLength(1);

    releaseSecond();
    releaseSecond();
    expect(button.querySelector("[data-haptic-trigger]")).toBeNull();
    expect(button.style.position).toBe("static");
  });

  it("does not attach when the user has disabled haptic feedback", () => {
    const button = document.createElement("button");
    document.body.append(button);
    setHapticFeedbackEnabled(false);

    const release = attachSelectionHaptic(button);

    expect(button.querySelector("[data-haptic-trigger]")).toBeNull();
    release();
  });
});

describe("vibration fallback", () => {
  it("respects the same preference before vibrating", () => {
    const original = Object.getOwnPropertyDescriptor(window.navigator, "vibrate");
    const vibrate = vi.fn(() => true);
    Object.defineProperty(window.navigator, "vibrate", {
      configurable: true,
      value: vibrate,
    });

    setHapticFeedbackEnabled(false);
    expect(triggerVibrationFeedback(12)).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();

    setHapticFeedbackEnabled(true);
    expect(triggerVibrationFeedback(12)).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(12);

    if (original) {
      Object.defineProperty(window.navigator, "vibrate", original);
    } else {
      delete (window.navigator as Navigator & { vibrate?: unknown }).vibrate;
    }
  });
});
