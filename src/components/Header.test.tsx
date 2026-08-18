import { act, createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Header, type DashboardHeaderMotionHandle } from "./Header";

vi.mock("./AuthUserProfile", () => ({
  AuthUserProfile: () => <span data-testid="auth-user-profile">Profile</span>,
}));

vi.mock("./SettingsDrawer", () => ({
  SettingsDrawer: () => <div data-testid="settings-drawer" />,
}));

function reelX(element: HTMLElement): number {
  const match = element.style.transform.match(
    /translate3d\((-?[\d.]+)px,\s*-50%,\s*0(?:px)?\)/,
  );
  if (!match) throw new Error(`Missing reel transform: ${element.style.transform}`);
  return Number(match[1]);
}

function measuredWidth(element: HTMLElement): number {
  return element.textContent === "Transactions" ? 118 : 82;
}

describe("Header dashboard title reel", () => {
  it("replaces the Sheetlog identity and profile with a passive Analytics-first reel", () => {
    render(
      <Header showSettings onToast={vi.fn()} analyticsSync={{} as never} />,
    );

    const reel = screen.getByTestId("dashboard-title-reel");
    expect(reel).toHaveAttribute("aria-hidden", "true");
    expect(reel).not.toHaveAttribute("tabindex");
    expect(reel).toHaveClass("pointer-events-none");
    expect(screen.queryByAltText("Sheetlog logo")).not.toBeInTheDocument();
    expect(screen.queryByText("Sheetlog", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByTestId("auth-user-profile")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open settings" })).toBeVisible();
    expect(
      screen
        .getByTestId("settings-drawer")
        .closest('[data-testid="dashboard-header"]'),
    ).toBeNull();

    const items = screen.getAllByTestId("dashboard-title-reel-item");
    expect(items).toHaveLength(5);
    expect(items.find((item) => item.dataset.offset === "0")).toHaveTextContent(
      "Analytics",
    );
    expect(items.find((item) => item.dataset.offset === "1")).toHaveTextContent(
      "Transactions",
    );
  });

  it("keeps one measured gap while the reel follows signed motion", () => {
    const motionRef = createRef<DashboardHeaderMotionHandle>();
    render(<Header ref={motionRef} showSettings />);

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

    act(() => motionRef.current?.setHorizontalMotion(0, 0.4));

    expect(reel).toHaveAttribute("data-direction", "forward");
    expect(Number(reel.dataset.progress)).toBeCloseTo(0.4, 3);
    const forwardItems = items
      .filter((item) => item.style.visibility !== "hidden")
      .sort((left, right) => reelX(left) - reelX(right));
    expect(forwardItems.map((item) => item.textContent)).toEqual([
      "Analytics",
      "Transactions",
      "Analytics",
    ]);
    const forwardGaps = forwardItems.slice(1).map((item, index) => {
      const previous = forwardItems[index];
      return reelX(item) - reelX(previous) - measuredWidth(previous);
    });
    expect(forwardGaps[0]).toBeCloseTo(forwardGaps[1], 2);
    expect(forwardGaps[0]).toBeCloseTo(Number(reel.dataset.gap), 2);

    act(() => motionRef.current?.setHorizontalMotion(0, -0.4));
    expect(reel).toHaveAttribute("data-direction", "backward");
    expect(Number(reel.dataset.progress)).toBeCloseTo(-0.4, 3);
  });

  it("hides the complete top bar in proportion to active content scroll", () => {
    const motionRef = createRef<DashboardHeaderMotionHandle>();
    render(<Header ref={motionRef} showSettings />);
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
