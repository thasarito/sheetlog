import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { forwardRef, useEffect, useState } from "react";
import type React from "react";
import { createPortal } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CategoryStepSheet } from "./CategoryStepSheet";
import { useCategoryStepSheetAccessory } from "./CategoryStepSheetAccessory";
import { StepCategoryTypeTabs } from "./StepCategoryTypeTabs";
import { useTransactionForm } from "./useTransactionForm";

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

function renderSheet(onCollapsedControlClick?: () => void) {
  function SheetHarness() {
    const [typeTabsHost, setTypeTabsHost] =
      useState<HTMLFieldSetElement | null>(null);

    return (
      <CategoryStepSheet
        entry={
          <>
            {typeTabsHost
              ? createPortal(
                  <button type="button" onClick={onCollapsedControlClick}>
                    Expense
                  </button>,
                  typeTabsHost,
                )
              : null}
            <div data-testid="entry">Categories</div>
          </>
        }
        layoutHeight={844}
        typeTabsHostRef={setTypeTabsHost}
      >
        <button type="button">Interactive review</button>
      </CategoryStepSheet>
    );
  }

  return render(
    <SheetHarness />,
  );
}

function AccessoryProbe() {
  const accessory = useCategoryStepSheetAccessory();

  useEffect(() => {
    if (accessory.host) accessory.reportHeight(96);
  }, [accessory]);

  return accessory.host
    ? createPortal(
        <>
          <span>Accessory probe</span>
          <input
            aria-label="Accessory search"
            onFocus={accessory.requestExpanded}
          />
        </>,
        accessory.host,
      )
    : null;
}

function renderSheetWithMeasurements({
  contentHeight,
  layoutHeight,
  launcherHeight,
  safeAreaHeight = 0,
}: {
  contentHeight: number;
  layoutHeight: number;
  launcherHeight: number;
  safeAreaHeight?: number;
}) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function getBoundingClientRect(this: HTMLElement) {
      if (this.dataset.testid === "category-step-layout") {
        return rect(layoutHeight);
      }
      if (this.dataset.testid === "category-step-launcher") {
        return rect(launcherHeight);
      }
      if (this.dataset.testid === "category-step-safe-area") {
        return rect(safeAreaHeight);
      }
      return rect(0);
    },
  );
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
    function scrollHeight(this: HTMLElement) {
      return this.dataset.testid === "entry"
        ? Math.max(0, contentHeight - launcherHeight)
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
      repositionInputs: false,
      activeSnapPoint: "520px",
      snapPoints: ["44px", "520px"],
    });
    expect(drawerMock.rootProps?.container).toBe(
      screen.getByTestId("category-step-layout"),
    );
    expect(screen.getByTestId("category-step-layout")).toHaveStyle({
      "--category-sheet-occlusion": "520px",
    });
    expect(
      screen.getByRole("button", { name: "Interactive review" }),
    ).toBeEnabled();
    const entryRegion = screen.getByTestId("entry").parentElement;
    const typeTabsHost = screen.getByTestId("category-step-type-tabs");
    const expenseTab = screen.getByRole("button", { name: "Expense" });
    expect(
      screen.getByRole("group", { name: "Transaction type" }),
    ).toBe(typeTabsHost);
    expect(entryRegion).not.toHaveAttribute("aria-hidden", "true");
    expect(entryRegion?.inert).toBe(false);
    expect(typeTabsHost).toBeVisible();

    const collapse = screen.getByRole("button", {
      name: "Collapse transaction entry",
    });
    expect(collapse).toHaveClass("min-h-11");
    await userEvent.setup().click(collapse);

    expect(
      screen.getByRole("button", { name: "Expand transaction entry" }),
    ).toBeVisible();
    expect(screen.queryByText("Log transaction")).not.toBeInTheDocument();
    expect(screen.getByTestId("category-step-type-tabs")).toBe(typeTabsHost);
    expect(screen.getByRole("button", { name: "Expense" })).toBe(expenseTab);
    expect(expenseTab).toBeVisible();
    expect(screen.getByTestId("category-step-layout")).toHaveStyle({
      "--category-sheet-occlusion": "44px",
    });
    expect(drawerMock.rootProps?.activeSnapPoint).toBe("44px");
    expect(entryRegion).toHaveAttribute("aria-hidden", "true");
    expect(entryRegion?.inert).toBe(true);
  });

  it("expands from nested controls and unused launcher space while collapsed", async () => {
    const onCollapsedControlClick = vi.fn();
    const user = userEvent.setup();
    renderSheet(onCollapsedControlClick);

    await user.click(
      screen.getByRole("button", { name: "Collapse transaction entry" }),
    );
    await user.tab();
    const expenseTab = screen.getByRole("button", { name: "Expense" });
    expect(expenseTab).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(onCollapsedControlClick).toHaveBeenCalledOnce();
    const collapse = screen.getByRole("button", {
      name: "Collapse transaction entry",
    });
    expect(collapse).toBeVisible();
    expect(expenseTab).toHaveFocus();

    await user.click(collapse);
    await user.click(screen.getByTestId("category-step-launcher"));

    expect(
      screen.getByRole("button", { name: "Collapse transaction entry" }),
    ).toBeVisible();
  });

  it("keeps one type-tabs instance mounted while a selection expands the sheet", async () => {
    const form = renderHook(() =>
      useTransactionForm({
        initialValues: { type: "expense", category: "Food" },
      }),
    ).result.current;
    const user = userEvent.setup();

    function TypeTabsSheet() {
      const [typeTabsHost, setTypeTabsHost] =
        useState<HTMLFieldSetElement | null>(null);

      return (
        <CategoryStepSheet
          entry={
            <>
              {typeTabsHost
                ? createPortal(
                    <StepCategoryTypeTabs
                      form={form}
                      layoutId="transactionType"
                    />,
                    typeTabsHost,
                  )
                : null}
              <div>Categories</div>
            </>
          }
          layoutHeight={844}
          typeTabsHostRef={setTypeTabsHost}
        >
          <button type="button">Interactive review</button>
        </CategoryStepSheet>
      );
    }

    render(
      <TypeTabsSheet />,
    );

    const typeTabs = screen.getByTestId("animated-tabs-compact");
    expect(screen.getAllByTestId("animated-tabs-compact")).toHaveLength(1);

    await user.click(
      screen.getByRole("button", { name: "Collapse transaction entry" }),
    );
    expect(screen.getByTestId("animated-tabs-compact")).toBe(typeTabs);
    await user.click(within(typeTabs).getByRole("button", { name: "Income" }));

    await waitFor(() => expect(form.state.values.type).toBe("income"));
    expect(form.state.values.category).toBe("");
    expect(within(typeTabs).getByRole("button", { name: "Income" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("animated-tabs-compact")).toBe(typeTabs);
  });

  it("uses the same compact handle height in both sheet states", async () => {
    renderSheet();

    const collapse = screen.getByRole("button", {
      name: "Collapse transaction entry",
    });
    expect(collapse).toHaveClass("min-h-11");
    expect(collapse).not.toHaveClass("min-h-16");

    await userEvent.setup().click(collapse);

    const expand = screen.getByRole("button", {
      name: "Expand transaction entry",
    });
    expect(expand).toHaveClass("min-h-11");
    expect(expand.querySelector('[aria-hidden="true"]')).toHaveClass(
      "h-1",
      "w-8",
    );
  });

  it("clamps content height and never accepts a null dismiss point", () => {
    renderSheetWithMeasurements({
      contentHeight: 900,
      layoutHeight: 700,
      launcherHeight: 64,
    });

    expect(drawerMock.rootProps?.snapPoints).toEqual(["64px", "700px"]);
    expect(drawerMock.rootProps?.activeSnapPoint).toBe("700px");
    expect(screen.getByTestId("category-step-sheet-body")).toHaveStyle({
      height: "700px",
    });
    expect(screen.getByTestId("entry").parentElement).toHaveClass(
      "flex-1",
      "overflow-y-auto",
    );

    act(() => drawerMock.rootProps?.setActiveSnapPoint?.(null));

    expect(
      screen.getByRole("button", { name: "Collapse transaction entry" }),
    ).toBeVisible();
    expect(drawerMock.rootProps?.activeSnapPoint).toBe("700px");
  });

  it("lets the expanded entry consume the bottom safe area", async () => {
    renderSheetWithMeasurements({
      contentHeight: 400,
      layoutHeight: 700,
      launcherHeight: 64,
      safeAreaHeight: 24,
    });

    const launcher = screen.getByTestId("category-step-launcher");
    const entryRegion = screen.getByTestId("entry").parentElement;
    const safeArea = screen.getByTestId("category-step-safe-area");
    expect(drawerMock.rootProps?.snapPoints).toEqual(["88px", "400px"]);
    expect(screen.getByTestId("category-step-sheet-body")).toHaveClass(
      "relative",
    );
    expect(entryRegion).toHaveClass("order-2");
    expect(safeArea).toHaveClass(
      "absolute",
      "inset-x-0",
      "bottom-0",
      "invisible",
    );

    await userEvent
      .setup()
      .click(
        screen.getByRole("button", { name: "Collapse transaction entry" }),
      );

    expect(drawerMock.rootProps?.activeSnapPoint).toBe("88px");
    expect(launcher).toHaveClass("order-1");
    expect(safeArea).toHaveClass("order-2");
    expect(safeArea).not.toHaveClass("absolute", "invisible");
    expect(entryRegion).toHaveClass("order-3");
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

  it("provides a non-drag accessory host without changing sheet geometry", () => {
    renderSheetWithMeasurements({
      contentHeight: 164,
      layoutHeight: 700,
      launcherHeight: 44,
    });

    const host = screen.getByTestId("category-step-accessory-host");
    const body = screen.getByTestId("category-step-sheet-body");
    expect(host).toHaveAttribute("data-vaul-no-drag");
    expect(host.style.transform).toContain(
      "--transaction-history-keyboard-offset",
    );
    expect(body).not.toContainElement(host);
    expect(screen.getByTestId("category-step-layout")).toHaveStyle({
      "--transaction-history-dock-height": "60px",
    });
    expect(drawerMock.rootProps?.snapPoints).toEqual(["44px", "164px"]);
    expect(screen.getByTestId("category-sheet-content").className).not.toMatch(
      /shadow/,
    );
  });

  it("portals sheet-owned accessories and publishes their reported height", async () => {
    render(
      <CategoryStepSheet entry={<div>Categories</div>} layoutHeight={844}>
        <AccessoryProbe />
      </CategoryStepSheet>,
    );

    const host = screen.getByTestId("category-step-accessory-host");
    expect(host).toContainElement(await screen.findByText("Accessory probe"));
    await waitFor(() =>
      expect(screen.getByTestId("category-step-layout")).toHaveStyle({
        "--transaction-history-dock-height": "96px",
      }),
    );
  });

  it("lets a focused sheet accessory request the existing expanded snap", async () => {
    const user = userEvent.setup();
    render(
      <CategoryStepSheet entry={<div>Categories</div>} layoutHeight={844}>
        <AccessoryProbe />
      </CategoryStepSheet>,
    );

    await user.click(
      screen.getByRole("button", { name: "Collapse transaction entry" }),
    );
    expect(drawerMock.rootProps?.activeSnapPoint).toBe("44px");

    await user.click(await screen.findByRole("textbox", {
      name: "Accessory search",
    }));

    expect(drawerMock.rootProps?.activeSnapPoint).toBe("520px");
    expect(
      screen.getByRole("button", { name: "Collapse transaction entry" }),
    ).toBeVisible();
  });
});
