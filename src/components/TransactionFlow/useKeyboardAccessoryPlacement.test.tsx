import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateKeyboardAccessoryPlacement,
  useKeyboardAccessoryPlacement,
} from "./useKeyboardAccessoryPlacement";

class TestVisualViewport extends EventTarget {
  height = 844;
  offsetTop = 0;
  width = 390;
}

const originalInnerHeight = window.innerHeight;

function rect(top: number): DOMRect {
  return {
    bottom: 844,
    height: 844 - top,
    left: 0,
    right: 390,
    top,
    width: 390,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}

beforeEach(() => {
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 844,
  });
});

afterEach(() => {
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: originalInnerHeight,
  });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("keyboard accessory placement", () => {
  it("calculates a dock offset from a real keyboard inset and ignores toolbar noise", () => {
    expect(
      calculateKeyboardAccessoryPlacement({
        windowHeight: 844,
        viewportHeight: 544,
        viewportOffsetTop: 0,
        drawerTop: 324,
      }),
    ).toEqual({ active: true, keyboardTop: 544, offset: 220 });

    expect(
      calculateKeyboardAccessoryPlacement({
        windowHeight: 844,
        viewportHeight: 810,
        viewportOffsetTop: 0,
        drawerTop: 324,
      }),
    ).toEqual({ active: false, keyboardTop: 844, offset: 0 });
  });

  it("updates and resets only the accessory transform values", () => {
    const viewport = new TestVisualViewport();
    vi.stubGlobal("visualViewport", viewport);
    const drawer = document.createElement("section");
    const host = document.createElement("div");
    vi.spyOn(drawer, "getBoundingClientRect").mockReturnValue(rect(324));

    renderHook(() =>
      useKeyboardAccessoryPlacement({
        drawerElement: drawer,
        accessoryHost: host,
        layoutHeight: 844,
      }),
    );

    act(() => {
      viewport.height = 544;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(
      host.style.getPropertyValue("--transaction-history-keyboard-offset"),
    ).toBe("220px");
    expect(host).toHaveAttribute("data-keyboard-active", "true");
    expect(host).toHaveAttribute("data-keyboard-top", "544");

    act(() => {
      viewport.height = 844;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(
      host.style.getPropertyValue("--transaction-history-keyboard-offset"),
    ).toBe("0px");
    expect(host).toHaveAttribute("data-keyboard-active", "false");
    expect(host).toHaveAttribute("data-keyboard-top", "844");
  });

  it("uses the stable app height when the live layout viewport also contracts", () => {
    const viewport = new TestVisualViewport();
    viewport.height = 544;
    vi.stubGlobal("visualViewport", viewport);
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 544,
    });
    const drawer = document.createElement("section");
    const host = document.createElement("div");
    vi.spyOn(drawer, "getBoundingClientRect").mockReturnValue(rect(324));

    renderHook(() =>
      useKeyboardAccessoryPlacement({
        drawerElement: drawer,
        accessoryHost: host,
        layoutHeight: 844,
      }),
    );

    expect(
      host.style.getPropertyValue("--transaction-history-keyboard-offset"),
    ).toBe("220px");
    expect(host).toHaveAttribute("data-keyboard-active", "true");
    expect(host).toHaveAttribute("data-keyboard-top", "544");
  });

  it("recalculates after a keyboard-triggered drawer snap settles", () => {
    const viewport = new TestVisualViewport();
    viewport.height = 544;
    vi.stubGlobal("visualViewport", viewport);
    const drawer = document.createElement("section");
    const host = document.createElement("div");
    let drawerTop = 736;
    vi.spyOn(drawer, "getBoundingClientRect").mockImplementation(() =>
      rect(drawerTop),
    );

    renderHook(() =>
      useKeyboardAccessoryPlacement({
        drawerElement: drawer,
        accessoryHost: host,
        layoutHeight: 844,
      }),
    );
    expect(
      host.style.getPropertyValue("--transaction-history-keyboard-offset"),
    ).toBe("0px");

    drawerTop = 324;
    act(() => drawer.dispatchEvent(new Event("transitionend")));

    expect(
      host.style.getPropertyValue("--transaction-history-keyboard-offset"),
    ).toBe("220px");
  });

  it("tracks the drawer transform while the keyboard-triggered snap animates", () => {
    const viewport = new TestVisualViewport();
    viewport.height = 544;
    vi.stubGlobal("visualViewport", viewport);
    const frames: FrameRequestCallback[] = [];
    const requestFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame");
    const drawer = document.createElement("section");
    const host = document.createElement("div");
    let drawerTop = 736;
    vi.spyOn(drawer, "getBoundingClientRect").mockImplementation(() =>
      rect(drawerTop),
    );

    renderHook(() =>
      useKeyboardAccessoryPlacement({
        drawerElement: drawer,
        accessoryHost: host,
        layoutHeight: 844,
      }),
    );

    act(() => drawer.dispatchEvent(new Event("transitionrun")));
    expect(requestFrame).toHaveBeenCalledOnce();

    drawerTop = 424;
    act(() => frames.shift()?.(0));
    expect(
      host.style.getPropertyValue("--transaction-history-keyboard-offset"),
    ).toBe("120px");
    expect(frames).toHaveLength(1);

    act(() => drawer.dispatchEvent(new Event("transitionend")));
    expect(cancelFrame).toHaveBeenCalled();
  });

  it("keeps the ordinary sheet attachment when VisualViewport is unavailable", () => {
    vi.stubGlobal("visualViewport", undefined);
    const drawer = document.createElement("section");
    const host = document.createElement("div");

    renderHook(() =>
      useKeyboardAccessoryPlacement({
        drawerElement: drawer,
        accessoryHost: host,
        layoutHeight: 844,
      }),
    );

    expect(
      host.style.getPropertyValue("--transaction-history-keyboard-offset"),
    ).toBe("0px");
    expect(host).toHaveAttribute("data-keyboard-active", "false");
  });
});
