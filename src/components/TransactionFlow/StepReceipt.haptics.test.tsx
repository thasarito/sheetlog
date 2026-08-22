import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReceiptData } from "./StepReceipt";
import { StepReceipt } from "./StepReceipt";

const haptics = vi.hoisted(() => ({
  triggerHapticFeedback: vi.fn(),
}));

vi.mock("../../lib/transactionHaptics", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../lib/transactionHaptics")
  >();
  return {
    ...actual,
    triggerHapticFeedback: haptics.triggerHapticFeedback,
  };
});

const receipt: ReceiptData = {
  type: "expense",
  category: "Dining",
  amount: "450",
  currency: "THB",
  account: "Bank",
  forValue: "Me",
  dateObject: new Date("2026-08-22T12:00:00.000Z"),
  note: "Lunch",
};

afterEach(() => {
  haptics.triggerHapticFeedback.mockReset();
});

describe("StepReceipt haptics", () => {
  it("announces local success and a later sync warning without duplicates", () => {
    const { rerender } = render(
      <StepReceipt
        {...receipt}
        isPending
        isSuccess={false}
        isError={false}
      />,
    );

    expect(haptics.triggerHapticFeedback).not.toHaveBeenCalled();

    rerender(
      <StepReceipt
        {...receipt}
        isPending={false}
        isSuccess
        isError={false}
        syncStatus="pending"
      />,
    );
    expect(haptics.triggerHapticFeedback).toHaveBeenLastCalledWith("success");

    rerender(
      <StepReceipt
        {...receipt}
        isPending={false}
        isSuccess
        isError={false}
        syncStatus="error"
      />,
    );
    expect(haptics.triggerHapticFeedback).toHaveBeenLastCalledWith("warning");
    expect(haptics.triggerHapticFeedback).toHaveBeenCalledTimes(2);

    rerender(
      <StepReceipt
        {...receipt}
        isPending={false}
        isSuccess
        isError={false}
        syncStatus="error"
      />,
    );
    expect(haptics.triggerHapticFeedback).toHaveBeenCalledTimes(2);
  });

  it("announces save errors and queued or failed undo outcomes", () => {
    const { rerender } = render(
      <StepReceipt
        {...receipt}
        isPending
        isSuccess={false}
        isError={false}
      />,
    );

    rerender(
      <StepReceipt
        {...receipt}
        isPending={false}
        isSuccess={false}
        isError
      />,
    );
    expect(haptics.triggerHapticFeedback).toHaveBeenLastCalledWith("error");

    rerender(
      <StepReceipt
        {...receipt}
        variant="reimbursement"
        isPending={false}
        isSuccess
        isError={false}
        syncStatus="synced"
        undoOutcome="pending"
      />,
    );
    expect(haptics.triggerHapticFeedback).toHaveBeenLastCalledWith("warning");

    rerender(
      <StepReceipt
        {...receipt}
        variant="reimbursement"
        isPending={false}
        isSuccess
        isError={false}
        syncStatus="synced"
        undoOutcome="error"
      />,
    );
    expect(haptics.triggerHapticFeedback).toHaveBeenLastCalledWith("error");
  });
});
