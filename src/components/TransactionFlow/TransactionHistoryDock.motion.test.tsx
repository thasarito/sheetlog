import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransactionHistoryDock } from "./TransactionHistoryDock";
import type { TransactionHistoryDockMotionHandle } from "./TransactionHistoryDock";

type ScrollTimelineOptions = {
  source: Element;
  axis: "x";
};

describe("TransactionHistoryDock horizontal motion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "ScrollTimeline");
  });

  it("uses the carousel scroll timeline instead of rewriting transform on every scroll", () => {
    const timelineInstances: ScrollTimelineOptions[] = [];
    class ScrollTimelineMock {
      constructor(options: ScrollTimelineOptions) {
        timelineInstances.push(options);
      }
    }
    Object.defineProperty(window, "ScrollTimeline", {
      configurable: true,
      value: ScrollTimelineMock,
    });
    const cancel = vi.fn();
    const animate = vi
      .spyOn(HTMLElement.prototype, "animate")
      .mockReturnValue({ cancel } as unknown as Animation);
    const motionRef = {
      current: null as TransactionHistoryDockMotionHandle | null,
    };

    render(
      <>
        <div data-testid="home-carousel-viewport" />
        <TransactionHistoryDock
          search=""
          onSearchChange={vi.fn()}
          motionRef={motionRef}
        />
      </>,
    );

    const viewport = screen.getByTestId("home-carousel-viewport");
    const dock = screen.getByTestId("transaction-history-dock");
    act(() => {
      motionRef.current?.setMotion({
        x: 150,
        viewportWidth: 300,
        interactive: false,
        moving: true,
      });
    });

    expect(timelineInstances).toEqual([{ source: viewport, axis: "x" }]);
    expect(animate).toHaveBeenCalledWith(
      [
        { transform: "translate3d(300px, 0, 0)" },
        { transform: "translate3d(-300px, 0, 0)" },
      ],
      expect.objectContaining({ duration: 1, fill: "both" }),
    );
    expect(dock).toHaveAttribute("data-horizontal-tracking", "scroll-timeline");
    expect(dock.style.transform).toBe("");

    act(() => {
      motionRef.current?.setMotion({
        x: 120,
        viewportWidth: 300,
        interactive: false,
        moving: true,
      });
    });
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it("keeps script-driven transforms as a fallback without ScrollTimeline", () => {
    const motionRef = {
      current: null as TransactionHistoryDockMotionHandle | null,
    };
    render(
      <>
        <div data-testid="home-carousel-viewport" />
        <TransactionHistoryDock
          search=""
          onSearchChange={vi.fn()}
          motionRef={motionRef}
        />
      </>,
    );

    const dock = screen.getByTestId("transaction-history-dock");
    act(() => {
      motionRef.current?.setMotion({
        x: -125,
        viewportWidth: 390,
        interactive: false,
        moving: true,
      });
    });

    expect(dock).toHaveAttribute("data-horizontal-tracking", "script");
    expect(dock).toHaveStyle({ transform: "translate3d(-125px, 0, 0)" });
  });
});
