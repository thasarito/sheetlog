import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { forwardRef } from "react";
import type React from "react";
import { createPortal } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CategoryStepSheet } from "./CategoryStepSheet";
import { useCategoryStepSheetAccessory } from "./CategoryStepSheetAccessory";

type DrawerRootProps = {
  children?: React.ReactNode;
};

class TestVisualViewport extends EventTarget {
  height = 844;
  offsetTop = 0;
  width = 390;

  setHeight(height: number) {
    this.height = height;
    this.dispatchEvent(new Event("resize"));
  }
}

vi.mock("../ui/drawer", () => ({
  Drawer: ({ children }: DrawerRootProps) => <>{children}</>,
  DrawerContent: forwardRef<
    HTMLElement,
    React.HTMLAttributes<HTMLElement> & {
      contained?: boolean;
      showHandle?: boolean;
    }
  >(function MockDrawerContent(
    {
      children,
      contained: _contained,
      showHandle: _showHandle,
      ...props
    },
    ref,
  ) {
    return (
      <section ref={ref} data-testid="category-sheet-content" {...props}>
        {children}
      </section>
    );
  }),
  DrawerTitle: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 {...props} />
  ),
  DrawerDescription: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p {...props} />
  ),
}));

function KeyboardAccessoryProbe() {
  const accessory = useCategoryStepSheetAccessory();

  return accessory.host
    ? createPortal(
        <input
          aria-label="Keyboard accessory search"
          onFocus={accessory.requestKeyboard}
        />,
        accessory.host,
      )
    : null;
}

function renderKeyboardSheet() {
  return render(
    <CategoryStepSheet entry={<div>Categories</div>} layoutHeight={844}>
      <KeyboardAccessoryProbe />
    </CategoryStepSheet>,
  );
}

afterEach(() => {
  document.documentElement.style.removeProperty(
    "--transaction-history-keyboard-offset",
  );
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("CategoryStepSheet keyboard accessory clearance", () => {
  it("raises a focused transaction search above the iOS input assistant", async () => {
    const viewport = new TestVisualViewport();
    vi.stubGlobal("visualViewport", viewport);
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    );
    const user = userEvent.setup();
    renderKeyboardSheet();

    const root = document.documentElement;
    const host = screen.getByTestId("category-step-accessory-host");
    expect(host.style.transform).toContain(
      "--transaction-history-keyboard-offset",
    );
    await waitFor(() =>
      expect(root).toHaveStyle({
        "--transaction-history-keyboard-offset": "0px",
      }),
    );

    await user.click(
      await screen.findByRole("textbox", {
        name: "Keyboard accessory search",
      }),
    );
    act(() => viewport.setHeight(524));

    expect(host).toHaveAttribute("data-category-sheet-state", "keyboard");
    await waitFor(() =>
      expect(root).toHaveStyle({
        "--transaction-history-keyboard-offset": "-48px",
      }),
    );
  });

  it("keeps the normal dock gap for keyboards outside iOS", async () => {
    const viewport = new TestVisualViewport();
    vi.stubGlobal("visualViewport", viewport);
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Linux; Android 16; Pixel 9 Pro)",
    );
    const user = userEvent.setup();
    renderKeyboardSheet();

    const root = document.documentElement;
    const host = screen.getByTestId("category-step-accessory-host");
    await user.click(
      await screen.findByRole("textbox", {
        name: "Keyboard accessory search",
      }),
    );
    act(() => viewport.setHeight(524));

    expect(host).toHaveAttribute("data-category-sheet-state", "keyboard");
    await waitFor(() =>
      expect(root).toHaveStyle({
        "--transaction-history-keyboard-offset": "0px",
      }),
    );
  });
});
