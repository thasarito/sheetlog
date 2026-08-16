import { describe, expect, it } from "vitest";
import { createFlowGeneration } from "./flowGeneration";

describe("createFlowGeneration", () => {
  it("makes late work stale whenever a newer flow transition starts", () => {
    const flow = createFlowGeneration("dashboard");
    const expenseA = flow.transition("edit:expense-a");
    const expenseB = flow.transition("edit:expense-b");

    expect(flow.isCurrent(expenseA, "edit:expense-a")).toBe(false);
    expect(flow.isCurrent(expenseB, "edit:expense-b")).toBe(true);
  });

  it("lets an operation capture a flow without advancing it", () => {
    const flow = createFlowGeneration("dashboard");
    flow.transition("receipt:child-a");
    const undo = flow.capture();

    expect(flow.isCurrent(undo, "receipt:child-a")).toBe(true);
    flow.transition("create");
    expect(flow.isCurrent(undo, "receipt:child-a")).toBe(false);
  });
});
