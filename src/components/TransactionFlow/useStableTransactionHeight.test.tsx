import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import indexHtml from "../../../index.html?raw";
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
  it("requests overlay keyboard behavior in the viewport contract", () => {
    expect(indexHtml).toContain("interactive-widget=overlays-content");
  });

  it("anchors the application shell to a fixed dynamic viewport", () => {
    const documentRoot = new DOMParser().parseFromString(indexHtml, "text/html");

    expect(documentRoot.body).toHaveClass("fixed", "inset-0", "h-[100dvh]");
    expect(documentRoot.getElementById("root")).toHaveClass("h-full", "w-full");
  });

  it("ignores a same-width mobile keyboard contraction", () => {
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    const { result } = renderHook(() => useStableTransactionHeight());
    expect(result.current).toBe(844);

    act(() => {
      setViewport(390, 544);
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current).toBe(844);
    input.remove();
  });

  it("accepts a same-width mobile resize without editable focus", () => {
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    const { result } = renderHook(() => useStableTransactionHeight());

    act(() => {
      setViewport(390, 544);
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current).toBe(544);
    button.remove();
  });

  it("uses the root content height so safe-area padding stays inside the viewport", () => {
    const root = document.createElement("div");
    root.id = "root";
    Object.defineProperty(root, "clientHeight", {
      configurable: true,
      value: 751,
    });
    document.body.append(root);

    const { result } = renderHook(() => useStableTransactionHeight());

    expect(result.current).toBe(751);
    root.remove();
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
