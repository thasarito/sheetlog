import { fireEvent, render, screen } from "@testing-library/react";
import { forwardRef } from "react";
import type React from "react";
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

afterEach(() => {
  drawerMock.rootProps = null;
  vi.restoreAllMocks();
});

describe("CategoryStepSheet bottom safe area", () => {
  it("extends the expanded entry through the safe area without changing its snap point", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.dataset.testid === "category-step-layout") return rect(700);
        if (this.dataset.testid === "category-step-launcher") return rect(64);
        if (this.dataset.testid === "category-step-safe-area") return rect(24);
        return rect(0);
      },
    );
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
      function scrollHeight(this: HTMLElement) {
        return this.dataset.testid === "entry-content" ? 336 : 0;
      },
    );

    render(
      <CategoryStepSheet
        entry={<div data-testid="entry-content">Categories</div>}
        layoutHeight={700}
      >
        <div>Dashboard</div>
      </CategoryStepSheet>,
    );

    const body = screen.getByTestId("category-step-sheet-body");
    expect(drawerMock.rootProps?.snapPoints).toEqual(["88px", "400px"]);
    expect(drawerMock.rootProps?.activeSnapPoint).toBe("400px");
    expect(body).toHaveStyle({
      height: "calc(400px + var(--category-sheet-safe-area))",
    });
    expect(screen.getByTestId("category-step-layout")).toHaveStyle({
      "--category-sheet-occlusion": "400px",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Collapse transaction entry" }),
    );

    expect(drawerMock.rootProps?.activeSnapPoint).toBe("88px");
    expect(body).toHaveStyle({ height: "400px" });
  });
});
