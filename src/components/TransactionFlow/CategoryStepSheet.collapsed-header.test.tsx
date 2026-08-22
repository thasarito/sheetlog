import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { forwardRef, useState } from "react";
import type React from "react";
import { createPortal } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CategoryStepSheet } from "./CategoryStepSheet";

type DrawerRootProps = {
  open?: boolean;
  modal?: boolean;
  dismissible?: boolean;
  shouldScaleBackground?: boolean;
  noBodyStyles?: boolean;
  disablePreventScroll?: boolean;
  repositionInputs?: boolean;
  container?: HTMLElement | null;
  snapPoints?: Array<number | string>;
  activeSnapPoint?: number | string | null;
  setActiveSnapPoint?: (point: number | string | null) => void;
  children?: React.ReactNode;
};

const drawerMock = vi.hoisted(() => ({
  rootProps: null as DrawerRootProps | null,
}));

vi.mock("../ui/drawer", () => ({
  Drawer: (props: DrawerRootProps) => {
    drawerMock.rootProps = props;
    return <>{props.children}</>;
  },
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

function rect(height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 390,
    height,
    top: 0,
    right: 390,
    bottom: height,
    left: 0,
    toJSON: () => ({}),
  };
}

function renderSheet() {
  function SheetHarness() {
    const [typeTabsHost, setTypeTabsHost] =
      useState<HTMLFieldSetElement | null>(null);

    return (
      <CategoryStepSheet
        entry={
          <>
            {typeTabsHost
              ? createPortal(
                  <button type="button">Expense</button>,
                  typeTabsHost,
                )
              : null}
            <div data-testid="entry-content">Categories</div>
          </>
        }
        layoutHeight={700}
        typeTabsHostRef={setTypeTabsHost}
      >
        <div>Dashboard</div>
      </CategoryStepSheet>
    );
  }

  return render(<SheetHarness />);
}

afterEach(() => {
  drawerMock.rootProps = null;
  vi.restoreAllMocks();
});

describe("CategoryStepSheet collapsed header band", () => {
  it("shares one 60px band between the launcher and type tabs only while collapsed", async () => {
    const user = userEvent.setup();
    renderSheet();

    const launcher = screen.getByTestId("category-step-launcher");
    const typeTabsHost = screen.getByTestId("category-step-type-tabs");
    const expenseTab = screen.getByRole("button", { name: "Expense" });
    const collapse = screen.getByRole("button", {
      name: "Collapse transaction entry",
    });

    expect(launcher).not.toHaveClass("grid", "grid-cols-1", "grid-rows-1");
    expect(launcher).not.toHaveStyle({ height: "60px" });
    expect(collapse).toHaveClass("min-h-11", "items-center");
    expect(typeTabsHost).toHaveClass("pb-3");

    await user.click(collapse);

    const expand = screen.getByRole("button", {
      name: "Expand transaction entry",
    });
    expect(launcher).toHaveClass("grid", "grid-cols-1", "grid-rows-1");
    expect(launcher).toHaveStyle({ height: "60px" });
    expect(expand).toHaveClass(
      "col-start-1",
      "row-start-1",
      "h-full",
      "min-h-11",
      "items-start",
      "pt-1",
    );
    expect(typeTabsHost).toHaveClass(
      "relative",
      "z-10",
      "col-start-1",
      "row-start-1",
      "mx-4",
      "mt-2",
      "self-start",
    );
    expect(typeTabsHost).not.toHaveClass("pb-3");
    expect(screen.getByRole("button", { name: "Expense" })).toBe(expenseTab);

    await user.click(expand);

    expect(launcher).not.toHaveClass("grid", "grid-cols-1", "grid-rows-1");
    expect(launcher).not.toHaveStyle({ height: "60px" });
    expect(typeTabsHost).toHaveClass("pb-3");
  });

  it("keeps the expanded snap point when the collapsed launcher becomes shorter", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.dataset.testid === "category-step-layout") return rect(700);
        if (this.dataset.testid === "category-step-launcher") {
          const state = this.closest("[data-category-sheet-state]")?.getAttribute(
            "data-category-sheet-state",
          );
          return rect(state === "collapsed" ? 60 : 108);
        }
        return rect(0);
      },
    );
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
      function scrollHeight(this: HTMLElement) {
        return this.dataset.testid === "entry-content" ? 400 : 0;
      },
    );

    const user = userEvent.setup();
    renderSheet();

    expect(drawerMock.rootProps?.snapPoints).toEqual(["60px", "508px"]);
    expect(drawerMock.rootProps?.activeSnapPoint).toBe("508px");

    await user.click(
      screen.getByRole("button", { name: "Collapse transaction entry" }),
    );

    expect(drawerMock.rootProps?.snapPoints).toEqual(["60px", "508px"]);
    expect(drawerMock.rootProps?.activeSnapPoint).toBe("60px");

    await user.click(
      screen.getByRole("button", { name: "Expand transaction entry" }),
    );

    expect(drawerMock.rootProps?.snapPoints).toEqual(["60px", "508px"]);
    expect(drawerMock.rootProps?.activeSnapPoint).toBe("508px");
  });
});
