import { describe, expect, it } from "vitest";
import {
  advanceDashboardCarouselLoopMotion,
  dashboardCarouselProgressFromTravel,
  unwrapDashboardCarouselLoopDelta,
} from "./dashboardCarouselLoopMotion";

describe("unwrapDashboardCarouselLoopDelta", () => {
  it("keeps ordinary carousel movement unchanged", () => {
    expect(unwrapDashboardCarouselLoopDelta(-42, 900)).toBe(-42);
    expect(unwrapDashboardCarouselLoopDelta(37, 900)).toBe(37);
  });

  it("removes a full forward loop teleport while retaining real travel", () => {
    expect(unwrapDashboardCarouselLoopDelta(880, 900)).toBe(-20);
  });

  it("removes a full backward loop teleport while retaining real travel", () => {
    expect(unwrapDashboardCarouselLoopDelta(-880, 900)).toBe(20);
  });
});

describe("advanceDashboardCarouselLoopMotion", () => {
  it("keeps accumulated forward travel continuous across a loop reposition", () => {
    const state = advanceDashboardCarouselLoopMotion(
      { lastOffset: -60, travel: -60 },
      820,
      900,
    );

    expect(state).toEqual({ lastOffset: 820, travel: -80 });
    expect(dashboardCarouselProgressFromTravel(state.travel, 300)).toBeCloseTo(
      0.267,
      3,
    );
  });

  it("keeps accumulated backward travel continuous across a loop reposition", () => {
    const state = advanceDashboardCarouselLoopMotion(
      { lastOffset: 60, travel: 60 },
      -820,
      900,
    );

    expect(state).toEqual({ lastOffset: -820, travel: 80 });
    expect(dashboardCarouselProgressFromTravel(state.travel, 300)).toBeCloseTo(
      0.267,
      3,
    );
  });

  it("returns zero progress for invalid or zero-sized viewports", () => {
    expect(dashboardCarouselProgressFromTravel(200, 0)).toBe(0);
    expect(dashboardCarouselProgressFromTravel(Number.NaN, 300)).toBe(0);
  });
});
