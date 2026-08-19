import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { forwardRef, useLayoutEffect, useRef, useState } from "react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CategoryStepSheet } from "./CategoryStepSheet";
import {
  TransactionHistoryDock,
  type TransactionHistoryDockMotionHandle,
} from "./TransactionHistoryDock";

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

class TestVisualViewport extends EventTarget {
  height = 844;
  offsetTop = 0;
  width = 390;

  setHeight(height: number) {
    this.height = height;
    this.dispatchEvent(new Event("resize"));
  }
}

let viewport: TestVisualViewport;

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

function KeyboardSheetHarness({
  onUnderlyingTransaction = () => undefined,
}: {
  onUnderlyingTransaction?: () => void;
}) {
  const [search, setSearch] = useState("");
  const motionRef = useRef<TransactionHistoryDockMotionHandle | null>(null);

  useLayoutEffect(() => {
    let frame = 0;
    const makeDockInteractive = () => {
      const motion = motionRef.current;
      if (!motion) {
        frame = window.requestAnimationFrame(makeDockInteractive);
        return;
      }

      frame = 0;
      motion.setMotion({
        x: 0,
        viewportWidth: 390,
        interactive: true,
        moving: false,
      });
    };

    makeDockInteractive();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <CategoryStepSheet
      entry={<div data-testid="entry-content">Categories</div>}
      layoutHeight={844}
    >
      <button type="button" onClick={onUnderlyingTransaction}>
        Underlying transaction
      </button>
      <TransactionHistoryDock
        search={search}
        onSearchChange={setSearch}
        motionRef={motionRef}
      />
    </CategoryStepSheet>
  );
}

beforeEach(() => {
  viewport = new TestVisualViewport();
  vi.stubGlobal("visualViewport", viewport);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function getBoundingClientRect(this: HTMLElement) {
      if (this.dataset.testid === "category-step-layout") return rect(844);
      if (this.dataset.testid === "category-step-launcher") return rect(44);
      if (this.dataset.testid === "category-step-safe-area") return rect(0);
      if (this.dataset.testid === "transaction-history-dock") return rect(104);
      return rect(0);
    },
  );
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
    function scrollHeight(this: HTMLElement) {
      return this.dataset.testid === "entry-content" ? 476 : 0;
    },
  );
});

afterEach(() => {
  drawerMock.rootProps = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CategoryStepSheet keyboard state", () => {
  it("captures an expanded-sheet search tap instead of selecting the row underneath", async () => {
    const onUnderlyingTransaction = vi.fn();
    render(
      <KeyboardSheetHarness
        onUnderlyingTransaction={onUnderlyingTransaction}
      />,
    );

    await waitFor(() =>
      expect(drawerMock.rootProps?.activeSnapPoint).toBe("520px"),
    );
    const layout = screen.getByTestId("category-step-layout");
    const search = await screen.findByRole("searchbox", {
      name: "Search transaction history",
    });
    const dock = screen.getByTestId("transaction-history-dock");
    await waitFor(() => expect(dock.inert).toBe(false));

    fireEvent.pointerDown(search, { pointerId: 1 });

    expect(layout).toHaveAttribute("data-category-sheet-state", "keyboard");
    expect(drawerMock.rootProps?.activeSnapPoint).toBe("300px");
    expect(search).not.toHaveFocus();

    fireEvent.pointerUp(search, { pointerId: 1 });

    expect(search).toHaveFocus();
    const clickAllowed = fireEvent.click(
      screen.getByRole("button", { name: "Underlying transaction" }),
    );
    expect(clickAllowed).toBe(false);
    expect(onUnderlyingTransaction).not.toHaveBeenCalled();
    expect(search).toHaveFocus();
    expect(drawerMock.rootProps?.activeSnapPoint).toBe("300px");
  });

  it("focuses search on the first tap from collapsed and then matches the measured keyboard", async () => {
    render(<KeyboardSheetHarness />);

    await waitFor(() =>
      expect(drawerMock.rootProps?.activeSnapPoint).toBe("520px"),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Collapse transaction entry" }),
    );
    expect(drawerMock.rootProps?.activeSnapPoint).toBe("44px");

    const layout = screen.getByTestId("category-step-layout");
    const content = screen.getByTestId("category-sheet-content");
    const host = screen.getByTestId("category-step-accessory-host");
    const search = await screen.findByRole("searchbox", {
      name: "Search transaction history",
    });
    const dock = screen.getByTestId("transaction-history-dock");
    await waitFor(() => expect(dock.inert).toBe(false));
    const stateSeenOnFocus: string[] = [];
    search.addEventListener("focus", () => {
      stateSeenOnFocus.push(layout.dataset.categorySheetState ?? "missing");
    });

    fireEvent.pointerDown(search, { pointerId: 2 });

    expect(layout).toHaveAttribute("data-category-sheet-state", "keyboard");
    expect(drawerMock.rootProps?.snapPoints).toEqual([
      "44px",
      "300px",
      "520px",
    ]);
    expect(drawerMock.rootProps?.activeSnapPoint).toBe("300px");
    expect(layout).toHaveStyle({ "--category-sheet-occlusion": "300px" });
    expect(content).toHaveClass("![transition:none]");
    expect(search).not.toHaveFocus();
    expect(stateSeenOnFocus).toEqual([]);

    fireEvent.pointerUp(search, { pointerId: 2 });

    expect(search).toHaveFocus();
    expect(stateSeenOnFocus).toEqual(["keyboard"]);
    const clickAllowed = fireEvent.click(search);
    expect(clickAllowed).toBe(false);
    expect(search).toHaveFocus();
    expect(drawerMock.rootProps?.activeSnapPoint).toBe("300px");

    act(() => viewport.setHeight(524));

    await waitFor(() =>
      expect(drawerMock.rootProps?.activeSnapPoint).toBe("320px"),
    );
    expect(drawerMock.rootProps?.snapPoints).toEqual([
      "44px",
      "320px",
      "520px",
    ]);
    expect(layout).toHaveStyle({ "--category-sheet-occlusion": "320px" });
    expect(host).toHaveAttribute("data-keyboard-active", "true");
    expect(host).toHaveAttribute("data-keyboard-height", "320");
    expect(host).toHaveAttribute("data-keyboard-top", "524");

    act(() => search.blur());
    expect(drawerMock.rootProps?.activeSnapPoint).toBe("320px");

    act(() => viewport.setHeight(844));

    await waitFor(() =>
      expect(drawerMock.rootProps?.activeSnapPoint).toBe("44px"),
    );
    expect(layout).toHaveAttribute("data-category-sheet-state", "collapsed");
    expect(host).toHaveAttribute("data-keyboard-active", "false");
    expect(host).toHaveAttribute("data-keyboard-height", "0");
    expect(host).toHaveAttribute("data-keyboard-top", "844");
  });

  it("restores the previous state when a captured tap is cancelled", async () => {
    render(<KeyboardSheetHarness />);

    await waitFor(() =>
      expect(drawerMock.rootProps?.activeSnapPoint).toBe("520px"),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Collapse transaction entry" }),
    );
    const search = await screen.findByRole("searchbox", {
      name: "Search transaction history",
    });

    fireEvent.pointerDown(search, { pointerId: 3 });
    expect(drawerMock.rootProps?.activeSnapPoint).toBe("300px");

    fireEvent.pointerCancel(search, { pointerId: 3 });

    expect(drawerMock.rootProps?.activeSnapPoint).toBe("44px");
    expect(search).not.toHaveFocus();
  });
});
