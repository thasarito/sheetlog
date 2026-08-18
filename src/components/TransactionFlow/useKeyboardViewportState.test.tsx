import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calculateKeyboardViewportState,
  useKeyboardViewportState,
} from "./useKeyboardViewportState";

class TestVisualViewport extends EventTarget {
  height = 844;
  offsetTop = 0;
  width = 390;

  setHeight(height: number) {
    this.height = height;
    this.dispatchEvent(new Event("resize"));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("keyboard viewport state", () => {
  it("reports the exact keyboard height and ignores browser-toolbar noise", () => {
    expect(
      calculateKeyboardViewportState({
        layoutHeight: 844,
        viewportHeight: 524,
        viewportOffsetTop: 0,
      }),
    ).toEqual({ active: true, height: 320, top: 524 });

    expect(
      calculateKeyboardViewportState({
        layoutHeight: 844,
        viewportHeight: 500,
        viewportOffsetTop: 24,
      }),
    ).toEqual({ active: true, height: 320, top: 524 });

    expect(
      calculateKeyboardViewportState({
        layoutHeight: 844,
        viewportHeight: 810,
        viewportOffsetTop: 0,
      }),
    ).toEqual({ active: false, height: 0, top: 844 });
  });

  it("keeps using the stable app height when the layout viewport contracts", () => {
    expect(
      calculateKeyboardViewportState({
        layoutHeight: 844,
        viewportHeight: 544,
        viewportOffsetTop: 0,
      }),
    ).toEqual({ active: true, height: 300, top: 544 });
  });

  it("tracks keyboard resize and dismissal events", () => {
    const viewport = new TestVisualViewport();
    vi.stubGlobal("visualViewport", viewport);

    const { result } = renderHook(() => useKeyboardViewportState(844));
    expect(result.current).toEqual({ active: false, height: 0, top: 844 });

    act(() => viewport.setHeight(524));
    expect(result.current).toEqual({ active: true, height: 320, top: 524 });

    act(() => viewport.setHeight(844));
    expect(result.current).toEqual({ active: false, height: 0, top: 844 });
  });

  it("stays inactive when VisualViewport is unavailable", () => {
    vi.stubGlobal("visualViewport", undefined);

    const { result } = renderHook(() => useKeyboardViewportState(844));

    expect(result.current).toEqual({ active: false, height: 0, top: 844 });
  });
});
