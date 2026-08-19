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

function setReelMeasurements(
  reel: HTMLElement,
  items: HTMLElement[],
  width: number,
) {
  Object.defineProperty(reel, "clientWidth", {
    configurable: true,
    value: width,
  });
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
}

describe("Header dashboard title reel", () => {
  it("renders one passive fixed-order title for each dashboard screen", () => {
    render(<Header showSettings onToast={() => undefined} analyticsSync={{}} />);

    const reel = screen.getByTestId("dashboard-title-reel");
    expect(reel).toHaveAttribute("aria-hidden", "true");
    expect(reel).not.toHaveAttribute("tabindex");
    expect(reel).toHaveClass("pointer-events-none");
    expect(reel).toHaveAttribute("data-selected-label", "Analytics");
    expect(screen.queryByRole("button", { name: "Open settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close settings" })).not.toBeInTheDocument();

    const items = screen.getAllByTestId("dashboard-title-reel-item");
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.textContent)).toEqual([
      "Analytics",
      "Transactions",
      "Settings",
    ]);
    expect(items.map((item) => item.dataset.index)).toEqual(["0", "1", "2"]);
  });

  it("keeps all titles fixed when they fit and transfers selection emphasis", () => {
    const motionRef = createRef<DashboardHeaderMotionHandle>();
    render(<Header ref={motionRef} />);

    const reel = screen.getByTestId("dashboard-title-reel");
    const items = screen.getAllByTestId("dashboard-title-reel-item");
    setReelMeasurements(reel, items, 390);

    act(() => motionRef.current?.syncHorizontalSelection?.("Analytics"));
    const settledPositions = items.map(reelX);
    expect(visibleItems(items).map((item) => item.textContent)).toEqual([
      "Analytics",
      "Transactions",
      "Settings",
    ]);
    expect(reel).toHaveAttribute("data-visible-count", "3");

    act(() => motionRef.current?.setHorizontalMotion(1, 0.5));
    expect(reel).toHaveAttribute("data-direction", "forward");
    expect(reel).toHaveAttribute("data-progress", "0.500");
    expect(items.map(reelX)).toEqual(settledPositions);
    expect(Number(items[0].style.opacity)).toBeCloseTo(
      Number(items[1].style.opacity),
      5,
    );

    act(() => motionRef.current?.syncHorizontalSelection?.("Transactions"));
    expect(reel).toHaveAttribute("data-selected-label", "Transactions");
    expect(items[1]).toHaveAttribute("data-active", "true");
    expect(items[0]).toHaveAttribute("data-active", "false");
    expect(items.map(reelX)).toEqual(settledPositions);
  });

  it("slides the fixed rail only as needed on narrow widths", () => {
    const motionRef = createRef<DashboardHeaderMotionHandle>();
    render(<Header ref={motionRef} />);

    const reel = screen.getByTestId("dashboard-title-reel");
    const items = screen.getAllByTestId("dashboard-title-reel-item");
    setReelMeasurements(reel, items, 190);

    act(() => motionRef.current?.syncHorizontalSelection?.("Analytics"));
    const analyticsX = reelX(items[0]);
    const transactionsX = reelX(items[1]);

    act(() => motionRef.current?.setHorizontalMotion(1, 0.5));
    expect(reelX(items[0])).toBeLessThan(analyticsX);
    expect(reelX(items[1])).toBeLessThan(transactionsX);

    act(() => motionRef.current?.syncHorizontalSelection?.("Settings"));
    expect(reel).toHaveAttribute("data-selected-label", "Settings");
    expect(items[2]).toHaveAttribute("data-active", "true");
    expect(reelX(items[2]) + measuredWidth(items[2])).toBeLessThanOrEqual(190.5);
  });

  it("does not preview beyond either end of the bounded title rail", () => {
    const motionRef = createRef<DashboardHeaderMotionHandle>();
    render(<Header ref={motionRef} />);

    const reel = screen.getByTestId("dashboard-title-reel");
    const items = screen.getAllByTestId("dashboard-title-reel-item");
    setReelMeasurements(reel, items, 300);

    act(() => motionRef.current?.syncHorizontalSelection?.("Analytics"));
    act(() => motionRef.current?.setHorizontalMotion(-1, 0.8));
    expect(reel).toHaveAttribute("data-selected-label", "Analytics");
    expect(reel).toHaveAttribute("data-direction", "settled");
    expect(reel).toHaveAttribute("data-progress", "0.000");

    act(() => motionRef.current?.syncHorizontalSelection?.("Settings"));
    act(() => motionRef.current?.setHorizontalMotion(1, 0.8));
    expect(reel).toHaveAttribute("data-selected-label", "Settings");
    expect(reel).toHaveAttribute("data-direction", "settled");
    expect(reel).toHaveAttribute("data-progress", "0.000");
  });

  it("reconciles live motion to the authoritative carousel destination", () => {
    const motionRef = createRef<DashboardHeaderMotionHandle>();
    render(<Header ref={motionRef} />);

    act(() => motionRef.current?.setHorizontalMotion(1, 0.8));
    act(() => motionRef.current?.syncHorizontalSelection?.("Settings"));

    const reel = screen.getByTestId("dashboard-title-reel");
    expect(reel).toHaveAttribute("data-selected-label", "Settings");
    expect(reel).toHaveAttribute("data-direction", "settled");
    expect(reel).toHaveAttribute("data-progress", "0.000");
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
