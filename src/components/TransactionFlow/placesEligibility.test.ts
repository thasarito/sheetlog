import { describe, expect, it } from "vitest";
import type { TransactionType } from "../../lib/types";
import {
  isPlacesEligible,
  type PlacesEligibilityInput,
  type PlacesFlowMode,
} from "./placesEligibility";

const eligibleInput: PlacesEligibilityInput = {
  step: 1,
  type: "expense",
  mode: "create",
  hasReceipt: false,
};

describe("isPlacesEligible", () => {
  it("allows only a new expense on the amount step without a receipt", () => {
    expect(isPlacesEligible(eligibleInput)).toBe(true);
  });

  it.each([
    ["income", { type: "income" as TransactionType }],
    ["transfer", { type: "transfer" as TransactionType }],
    ["category step", { step: 0 }],
    ["receipt step", { step: 2 }],
    ["existing receipt", { hasReceipt: true }],
  ])("rejects %s", (_label, overrides) => {
    expect(isPlacesEligible({ ...eligibleInput, ...overrides })).toBe(false);
  });

  it.each(["edit", "reimburse", "quick-note"] satisfies PlacesFlowMode[])(
    "rejects %s mode",
    (mode) => {
      expect(isPlacesEligible({ ...eligibleInput, mode })).toBe(false);
    }
  );
});
