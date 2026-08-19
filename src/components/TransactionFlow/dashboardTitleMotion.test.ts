import { describe, expect, it } from "vitest";
import { resolveDashboardTitleSteps } from "./dashboardTitleMotion";

describe("resolveDashboardTitleSteps", () => {
  it("commits one title from explicit forward and backward input", () => {
    expect(
      resolveDashboardTitleSteps({
        direction: 1,
        stepDirection: 1,
        committedSteps: 1,
        pendingSelections: 0,
        returnedToOrigin: false,
      }),
    ).toBe(1);
    expect(
      resolveDashboardTitleSteps({
        direction: -1,
        stepDirection: -1,
        committedSteps: -1,
        pendingSelections: 0,
        returnedToOrigin: false,
      }),
    ).toBe(-1);
  });

  it("cancels the title change when the initiating slide returns to origin", () => {
    expect(
      resolveDashboardTitleSteps({
        direction: 1,
        stepDirection: -1,
        committedSteps: 0,
        pendingSelections: 0,
        returnedToOrigin: true,
      }),
    ).toBe(0);
  });

  it("uses final touch direction without reading a carousel index", () => {
    expect(
      resolveDashboardTitleSteps({
        direction: 1,
        stepDirection: -1,
        committedSteps: 0,
        pendingSelections: 1,
        returnedToOrigin: false,
      }),
    ).toBe(1);
  });

  it("preserves multiple explicit keyboard steps", () => {
    expect(
      resolveDashboardTitleSteps({
        direction: 1,
        stepDirection: 1,
        committedSteps: 2,
        pendingSelections: 0,
        returnedToOrigin: false,
      }),
    ).toBe(2);
  });

  it("ignores selection events that have no touch or keyboard direction", () => {
    expect(
      resolveDashboardTitleSteps({
        direction: 0,
        stepDirection: 0,
        committedSteps: 0,
        pendingSelections: 1,
        returnedToOrigin: false,
      }),
    ).toBe(0);
  });
});
