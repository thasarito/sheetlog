import { render, screen } from "@testing-library/react";
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
  vi.restoreAllMocks();
});

describe("CategoryStepSheet keyboard accessory clearance", () => {
  it("raises a focused transaction search above the iOS input assistant", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    );
    const user = userEvent.setup();
    renderKeyboardSheet();

    const host = screen.getByTestId("category-step-accessory-host");
    expect(host).toHaveStyle({
      "--transaction-history-keyboard-offset": "0px",
    });

    await user.click(
      await screen.findByRole("textbox", {
        name: "Keyboard accessory search",
      }),
    );

    expect(host).toHaveAttribute("data-category-sheet-state", "keyboard");
    expect(host).toHaveStyle({
      "--transaction-history-keyboard-offset": "-48px",
    });
  });

  it("keeps the normal dock gap for keyboards outside iOS", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Linux; Android 16; Pixel 9 Pro)",
    );
    const user = userEvent.setup();
    renderKeyboardSheet();

    const host = screen.getByTestId("category-step-accessory-host");
    await user.click(
      await screen.findByRole("textbox", {
        name: "Keyboard accessory search",
      }),
    );

    expect(host).toHaveAttribute("data-category-sheet-state", "keyboard");
    expect(host).toHaveStyle({
      "--transaction-history-keyboard-offset": "0px",
    });
  });
});
