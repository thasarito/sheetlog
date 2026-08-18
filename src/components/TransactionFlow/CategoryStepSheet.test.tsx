import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  DrawerContent: ({
    children,
    showHandle: _showHandle,
    ...props
  }: React.HTMLAttributes<HTMLElement> & { showHandle?: boolean }) => (
    <section data-testid="category-sheet-content" {...props}>
      {children}
    </section>
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
  return render(
    <CategoryStepSheet entry={<div data-testid="entry">Categories</div>}>
      <button type="button">Interactive review</button>
    </CategoryStepSheet>,
  );
}

function renderSheetWithMeasurements({
  contentHeight,
  layoutHeight,
  launcherHeight,
}: {
  contentHeight: number;
  layoutHeight: number;
  launcherHeight: number;
}) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function getBoundingClientRect(this: HTMLElement) {
      if (this.dataset.testid === "category-step-layout") {
        return rect(layoutHeight);
      }
      if (this.dataset.testid === "category-step-launcher") {
        return rect(launcherHeight);
      }
      return rect(0);
    },
  );
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
    function scrollHeight(this: HTMLElement) {
      return this.dataset.testid === "category-step-sheet-body"
        ? contentHeight
        : 0;
    },
  );

  return renderSheet();
}

afterEach(() => {
  drawerMock.rootProps = null;
  vi.restoreAllMocks();
});

describe("CategoryStepSheet", () => {
  it("opens expanded, publishes its occlusion, and collapses to the launcher", async () => {
    renderSheet();

    expect(drawerMock.rootProps).toMatchObject({
      open: true,
      modal: false,
      dismissible: false,
      shouldScaleBackground: false,
      noBodyStyles: true,
      disablePreventScroll: true,
      activeSnapPoint: "520px",
      snapPoints: ["64px", "520px"],
    });
    expect(screen.getByTestId("category-step-layout")).toHaveStyle({
      "--category-sheet-occlusion": "520px",
    });
    expect(
      screen.getByRole("button", { name: "Interactive review" }),
    ).toBeEnabled();

    const collapse = screen.getByRole("button", {
      name: "Collapse transaction entry",
    });
    expect(collapse).toHaveClass("min-h-11");
    await userEvent.setup().click(collapse);

    expect(
      screen.getByRole("button", { name: "Expand transaction entry" }),
    ).toBeVisible();
    expect(screen.getByText("Log transaction")).toBeVisible();
    expect(screen.getByTestId("category-step-layout")).toHaveStyle({
      "--category-sheet-occlusion": "64px",
    });
    expect(drawerMock.rootProps?.activeSnapPoint).toBe("64px");
  });

  it("clamps content height and never accepts a null dismiss point", () => {
    renderSheetWithMeasurements({
      contentHeight: 900,
      layoutHeight: 700,
      launcherHeight: 64,
    });

    expect(drawerMock.rootProps?.snapPoints).toEqual(["64px", "700px"]);
    expect(drawerMock.rootProps?.activeSnapPoint).toBe("700px");

    act(() => drawerMock.rootProps?.setActiveSnapPoint?.(null));

    expect(
      screen.getByRole("button", { name: "Collapse transaction entry" }),
    ).toBeVisible();
    expect(drawerMock.rootProps?.activeSnapPoint).toBe("700px");
  });

  it("keeps entry controls out of the drag region and omits visual elevation", () => {
    renderSheet();

    expect(screen.getByTestId("entry").parentElement).toHaveAttribute(
      "data-vaul-no-drag",
    );
    expect(screen.getByTestId("category-sheet-content").className).not.toMatch(
      /shadow/,
    );
  });
});
