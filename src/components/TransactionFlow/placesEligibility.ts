import type { TransactionType } from "../../lib/types";

export type PlacesFlowMode = "create" | "edit" | "reimburse" | "quick-note";

export type PlacesEligibilityInput = {
  step: number;
  type: TransactionType;
  mode: PlacesFlowMode;
  hasReceipt: boolean;
};

export function isPlacesEligible({
  step,
  type,
  mode,
  hasReceipt,
}: PlacesEligibilityInput) {
  return (
    step === 1 &&
    type === "expense" &&
    mode === "create" &&
    !hasReceipt
  );
}
