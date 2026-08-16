import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  requestVirtualKeyboardOverlay,
  useStableTransactionHeight,
} from "./useStableTransactionHeight";

const originalWidth = window.innerWidth;
const originalHeight = window.innerHeight;

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  });
}

beforeEach(() => {
  setViewport(390, 844);
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: true }),
  );
});

afterEach(() => {
  setViewport(originalWidth, originalHeight);
  vi.unstubAllGlobals();
});

describe("useStableTransactionHeight", () => {
  it("ignores a same-width mobile keyboard contraction", () => {
    const { result } = renderHook(() => useStableTransactionHeight());
    expect(result.current).toBe(844);

    act(() => {
      setViewport(390, 544);
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current).toBe(844);
  });

  it("accepts a genuine orientation-size change", () => {
    const { result } = renderHook(() => useStableTransactionHeight());

    act(() => {
      setViewport(844, 390);
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current).toBe(390);
  });

  it("keeps normal desktop resizing responsive", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: false }),
    );
    const { result } = renderHook(() => useStableTransactionHeight());

    act(() => {
      setViewport(390, 600);
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current).toBe(600);
  });

  it("requests keyboard overlay only when the API exists", () => {
    const keyboard = { overlaysContent: false };
    const restore = requestVirtualKeyboardOverlay({
      virtualKeyboard: keyboard,
    });
    expect(keyboard.overlaysContent).toBe(true);
    restore();
    expect(keyboard.overlaysContent).toBe(false);
    expect(() => requestVirtualKeyboardOverlay({})()).not.toThrow();
  });
});
