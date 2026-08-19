import { act, createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Header, type DashboardHeaderMotionHandle } from "./Header";

function reelX(element: HTMLElement): number {
  const match = element.style.transform.match(
    /translate3d\((-?[\d.]+)px,\s*-50%,\s*0(?:px)?\)/,
  );
  if (!match) throw new Error(`Missing reel transform: ${element.style.transform}`);
  return Number(match[1]);
}

function measuredWidth(element: HTMLElement): number {
  if (element.textContent === "Transactions") return 118;
  if (element.textContent === "Settings") return 78;
  return 82;
}

function visibleItems(items: HTMLElement[]): HTMLElement[] {
  return items
    .filter((item) => item.dataset.visible === "true")
    .sort((left, right) => reelX(left) - reelX(right));
}

describe("Header dashboard title reel", () => {
  it("renders a passive Analytics-first reel without Settings chrome", () => {
    render(<Header showSettings onToast={() => undefined} analyticsSync={{}} />);

    const reel = screen.getByTestId("dashboard-title-reel");
    expect(reel).toHaveAttribute("aria-hidden", "true");
    expect(reel).not.toHaveAttribute("tabindex");
    expect(reel).toHaveClass("pointer-events-none");
    expect(reel).toHaveAttribute("data-selected-label", "Analytics");
    expect(screen.queryByRole("button", { name: "Open settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close settings" })).not.toBeInTheDocument();

    const items = screen.getAllByTestId("dashboard-title-reel-item");
    expect(items).toHaveLength(7);
    expect(items.find((item) => item.dataset.offset === "0")).toHaveTextContent(
      "Analytics",
    );
    expect(items.find((item) => item.dataset.offset === "1")).toHaveTextContent(
      "Transactions",
    );
    expect(items.find((item) => item.dataset.offset === "2")).toHaveTextContent(
      "Settings",
    );
  });

  it("shows every unique title that fits and advances from direction plus committed steps", () => {
    const motionRef = createRef<DashboardHeaderMotionHandle>();
    render(<Header ref={motionRef} />);

    const reel = screen.getByTestId("dashboard-title-reel");
    Object.defineProperty(reel, "clientWidth", {
      configurable: true,
      value: 300,
    });
    const items = screen.getAllByTestId("dashboard-title-reel-item");
    for (const item of items) {
      item.getBoundingClientRect = () =>
        ({
          width: measuredWidth(item),
          height: 27,
          x: 0,
          y: 0,
          top: 0,
          right: measuredWidth(item),
          bottom: 27,
          left: 0,
          toJSON: () => ({}),
        }) as DOMRect;
    }

    act(() => motionRef.current?.resetHorizontalSelection?.());
    expect(visibleItems(items).map((item) => item.textContent)).toEqual([
      "Analytics",
      "Transactions",
    ]);
    expect(reel).toHaveAttribute("data-visible-count", "2");

    Object.defineProperty(reel, "clientWidth", {
      configurable: true,
      value: 390,
    });
    act(() => motionRef.current?.resetHorizontalSelection?.());
    expect(visibleItems(items).map((item) => item.textContent)).toEqual([
      "Analytics",
      "Transactions",
      "Settings",
    ]);
    expect(reel).toHaveAttribute("data-visible-count", "3");

    act(() => motionRef.current?.setHorizontalMotion(1, 0.4));

    expect(reel).toHaveAttribute("data-direction", "forward");
    expect(Number(reel.dataset.progress)).toBeCloseTo(0.4, 3);
    const forwardItems = visibleItems(items);
    expect(forwardItems.map((item) => item.textContent)).toEqual([
      "Analytics",
      "Transactions",
      "Settings",
    ]);
    expect(new Set(forwardItems.map((item) => item.textContent)).size).toBe(3);
    const forwardGaps = forwardItems.slice(1).map((item, index) => {
      const previous = forwardItems[index];
      return reelX(item) - reelX(previous) - measuredWidth(previous);
    });
    expect(forwardGaps[0]).toBeCloseTo(forwardGaps[1], 2);
    expect(forwardGaps[0]).toBeCloseTo(Number(reel.dataset.gap), 2);

    act(() => motionRef.current?.settleHorizontalMotion?.(1));
    expect(reel).toHaveAttribute("data-selected-label", "Transactions");
    expect(items.find((item) => item.dataset.offset === "0")).toHaveTextContent(
      "Transactions",
    );
    expect(items.find((item) => item.dataset.offset === "1")).toHaveTextContent(
      "Settings",
    );
    expect(items.find((item) => item.dataset.offset === "2")).toHaveTextContent(
      "Analytics",
    );

    act(() => motionRef.current?.setHorizontalMotion(-1, 0.4));
    expect(reel).toHaveAttribute("data-direction", "backward");
    expect(Number(reel.dataset.progress)).toBeCloseTo(-0.4, 3);
    expect(items.find((item) => item.dataset.offset === "-1")).toHaveTextContent(
      "Analytics",
    );

    act(() => motionRef.current?.settleHorizontalMotion?.(-1));
    expect(reel).toHaveAttribute("data-selected-label", "Analytics");
  });

  it("cancels uncommitted motion without changing the selected title", () => {
    const motionRef = createRef<DashboardHeaderMotionHandle>();
    render(<Header ref={motionRef} />);

    act(() => motionRef.current?.setHorizontalMotion(1, 0.45));
    act(() => motionRef.current?.settleHorizontalMotion?.(0));

    expect(screen.getByTestId("dashboard-title-reel")).toHaveAttribute(
      "data-selected-label",
      "Analytics",
    );
  });

  it("hides the complete top bar in proportion to active content scroll", () => {
    const motionRef = createRef<DashboardHeaderMotionHandle>();
    render(<Header ref={motionRef} />);
    const header = screen.getByTestId("dashboard-header");
    header.getBoundingClientRect = () =>
      ({
        width: 390,
        height: 68,
        x: 0,
        y: 0,
        top: 0,
        right: 390,
        bottom: 68,
        left: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    act(() => motionRef.current?.setVerticalProgress(0.5));

    expect(header).toHaveAttribute("data-hide-progress", "0.500");
    expect(header.style.transform).toBe("translate3d(0, -34.00px, 0)");
    expect(header.style.opacity).toBe("0.5");
  });
});
