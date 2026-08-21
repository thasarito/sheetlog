import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StepReceipt, type ReceiptData } from "./StepReceipt";

const receipt: ReceiptData = {
  type: "expense",
  category: "Food",
  amount: "248",
  currency: "THB",
  account: "Wallet",
  forValue: "Me",
  dateObject: new Date("2026-08-21T10:30:00.000Z"),
  note: "Lunch",
};

describe("StepReceipt full-canvas layout", () => {
  it("identifies the receipt step so the transaction canvas can hide the title reel", () => {
    render(
      <StepReceipt
        {...receipt}
        isPending={false}
        isSuccess
        isError={false}
      />,
    );

    expect(screen.getByTestId("step-receipt")).toHaveAttribute(
      "data-transaction-step",
      "receipt",
    );
  });
});
