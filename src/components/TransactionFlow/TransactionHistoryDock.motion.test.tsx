import { readFileSync } from "node:fs";
import { act, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CategoryStepSheetAccessoryProvider } from "./CategoryStepSheetAccessory";
import {
  TransactionHistoryDock,
  type TransactionHistoryDockMotionHandle,
} from "./TransactionHistoryDock";

const SCROLL_TIMELINE_DECLARATIONS = new Set([
  "animation-timeline: scroll()",
  "timeline-scope: --home-dashboard-carousel",
]);

function stubScrollTimelineSupport(supported: boolean) {
  vi.stubGlobal("CSS", {
    supports: vi.fn(
      (declaration: string) =>
        supported && SCROLL_TIMELINE_DECLARATIONS.has(declaration),
    ),
  });
}

function PortalledDockHarness({
  motionRef,
}: {
  motionRef: { current: TransactionHistoryDockMotionHandle | null };
}) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  return (
    <CategoryStepSheetAccessoryProvider
      value={{
        provided: true,
        host,
        reportHeight: () => undefined,
        requestExpanded: () => undefined,
      }}
    >
      <div ref={setHost} data-testid="transaction-dock-test-host" />
      <TransactionHistoryDock
        search=""
        onSearchChange={() => undefined}
        motionRef={motionRef}
      />
    </CategoryStepSheetAccessoryProvider>
  );
}

async function renderPortalledDock(scrollTimelineSupported: boolean) {
  stubScrollTimelineSupport(scrollTimelineSupported);
  const motionRef = {
    current: null as TransactionHistoryDockMotionHandle | null,
  };
  render(<PortalledDockHarness motionRef={motionRef} />);
  const dock = await screen.findByTestId("transaction-history-dock");
  await waitFor(() => expect(motionRef.current).not.toBeNull());
  return { dock, motionRef };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("TransactionHistoryDock carousel motion", () => {
  it("delegates horizontal translation to a native scroll timeline when supported", async () => {
    const { dock, motionRef } = await renderPortalledDock(true);

    expect(dock).toHaveAttribute("data-scroll-linked-motion", "true");
    expect(dock).toHaveClass("will-change-transform");
    expect(dock.style.transform).toBe("");

    act(() => {
      motionRef.current?.setMotion({
        x: 125,
        viewportWidth: 390,
        interactive: false,
        moving: true,
      });
    });

    expect(dock.style.transform).toBe("");
    expect(
      dock.style.getPropertyValue(
        "--transaction-history-dock-viewport-width",
      ),
    ).toBe("390px");
    expect(dock).toHaveAttribute("data-motion", "moving");
    expect(dock).toHaveStyle({
      pointerEvents: "none",
      visibility: "visible",
    });

    const setAttribute = vi.spyOn(dock, "setAttribute");
    act(() => {
      motionRef.current?.setMotion({
        x: 80,
        viewportWidth: 390,
        interactive: false,
        moving: true,
      });
    });

    expect(setAttribute).not.toHaveBeenCalledWith(
      "aria-hidden",
      expect.any(String),
    );
    expect(dock.style.transform).toBe("");
  });

  it("keeps the translate3d fallback for browsers without scroll timelines", async () => {
    const { dock, motionRef } = await renderPortalledDock(false);

    expect(dock).toHaveAttribute("data-scroll-linked-motion", "false");

    act(() => {
      motionRef.current?.setMotion({
        x: -125,
        viewportWidth: 390,
        interactive: false,
        moving: true,
      });
    });

    expect(dock).toHaveStyle({
      transform: "translate3d(-125px, 0, 0)",
      visibility: "visible",
    });
  });

  it("defines the scoped scroll timeline and removes live blur during motion", () => {
    const styles = readFileSync(
      new URL("../../styles/globals.css", import.meta.url),
      "utf8",
    );

    expect(styles).toMatch(
      /timeline-scope:\s*--home-dashboard-carousel;/,
    );
    expect(styles).toMatch(
      /scroll-timeline-name:\s*--home-dashboard-carousel;/,
    );
    expect(styles).toMatch(
      /animation-timeline:\s*--home-dashboard-carousel;/,
    );
    expect(styles).toContain(
      "@keyframes transaction-history-dock-carousel-motion",
    );
    expect(styles).toMatch(
      /\[data-testid="transaction-history-dock"\]\[data-motion="moving"\][^{]*\{[^}]*backdrop-filter:\s*none;/s,
    );
  });
});
