import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "./drawer";

function standaloneMatchMedia(query: string): MediaQueryList {
  return {
    matches: query === "(display-mode: standalone)",
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  };
}

function TestContent({ contained = false }: { contained?: boolean }) {
  return (
    <Drawer open>
      <DrawerContent contained={contained}>
        <DrawerTitle>Test drawer</DrawerTitle>
        <DrawerDescription>Test drawer content</DrawerDescription>
      </DrawerContent>
    </Drawer>
  );
}

describe("Drawer", () => {
  beforeEach(() => {
    document.body.style.paddingTop = "";
    vi.stubGlobal("matchMedia", vi.fn(standaloneMatchMedia));
  });

  afterEach(() => {
    cleanup();
    document.body.style.paddingTop = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps the standalone safe-area top stable while a drawer opens", async () => {
    const getComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
      if (element === document.body) {
        return { paddingTop: "62px" } as CSSStyleDeclaration;
      }
      return getComputedStyle(element);
    });

    const { rerender } = render(<Drawer open={false} />);

    await waitFor(() => expect(document.body.style.paddingTop).toBe("62px"));

    rerender(<Drawer open />);
    expect(document.body.style.paddingTop).toBe("62px");
  });

  it("provides a card-colored fill for the iOS system bottom area", () => {
    render(<TestContent />);

    expect(
      document.querySelector("[data-drawer-system-area-fill]"),
    ).toHaveClass(
      "pointer-events-none",
      "fixed",
      "inset-x-0",
      "bottom-0",
      "z-50",
      "h-[max(env(safe-area-inset-bottom),34px)]",
      "bg-card",
    );
  });

  it("does not add a viewport fill to contained demo drawers", () => {
    render(<TestContent contained />);

    expect(
      document.querySelector("[data-drawer-system-area-fill]"),
    ).not.toBeInTheDocument();
  });
});
