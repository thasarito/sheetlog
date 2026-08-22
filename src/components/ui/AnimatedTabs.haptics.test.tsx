import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimatedTabs } from "./AnimatedTabs";

const haptics = vi.hoisted(() => ({
  attachIosSelectionHaptic: vi.fn(() => vi.fn()),
}));

vi.mock("../../lib/transactionHaptics", () => ({
  attachIosSelectionHaptic: haptics.attachIosSelectionHaptic,
}));

const tabs = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
] as const;

afterEach(() => {
  cleanup();
  haptics.attachIosSelectionHaptic.mockClear();
});

describe("AnimatedTabs transaction haptics", () => {
  it("instruments only unselected values when explicitly enabled", () => {
    render(
      <AnimatedTabs
        tabs={[...tabs]}
        value="expense"
        onChange={vi.fn()}
        layoutId="transaction-types"
        variant="compact"
        selectionHaptics
      />,
    );

    const attachedLabels = haptics.attachIosSelectionHaptic.mock.calls.map(
      ([element]) => (element as HTMLButtonElement).textContent?.trim(),
    );
    expect(attachedLabels).toEqual(["Income", "Transfer"]);
  });

  it("leaves unrelated tab groups untouched by default", () => {
    render(
      <AnimatedTabs
        tabs={[...tabs]}
        value="expense"
        onChange={vi.fn()}
        layoutId="ordinary-tabs"
        variant="compact"
      />,
    );

    expect(haptics.attachIosSelectionHaptic).not.toHaveBeenCalled();
  });
});
