import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StepReceipt, type ReceiptData } from "./StepReceipt";

const receipt: ReceiptData = {
  type: "income",
  category: "Reimbursement",
  amount: "40",
  currency: "THB",
  account: "Bank",
  forValue: "Me",
  dateObject: new Date("2026-08-15T10:30:00.000Z"),
  note: "Coffee",
};

describe("StepReceipt", () => {
  it("preserves the ordinary transaction success copy and timed progress by default", () => {
    render(
      <StepReceipt
        {...receipt}
        isPending={false}
        isSuccess
        isError={false}
      />
    );

    expect(screen.getByText("Payment Successful")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(screen.getByTestId("receipt-timed-progress")).toBeInTheDocument();
  });

  it("shows saving copy while a reimbursement mutation is pending", () => {
    render(
      <StepReceipt
        {...receipt}
        variant="reimbursement"
        syncStatus="synced"
        isPending
        isSuccess
        isError={false}
      />
    );

    expect(screen.getByText("Saving reimbursement")).toBeInTheDocument();
    expect(
      screen.getByText("Hang tight while we record this reimbursement.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Reimbursement recorded")).not.toBeInTheDocument();
  });

  it("describes a pending reimbursement as queued locally", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    const onUndo = vi.fn();
    render(
      <StepReceipt
        {...receipt}
        variant="reimbursement"
        syncStatus="pending"
        isPending={false}
        isSuccess
        isError={false}
        onDone={onDone}
        onUndo={onUndo}
      />
    );

    expect(screen.getByText("Reimbursement queued")).toBeInTheDocument();
    expect(
      screen.getByText("Saved locally and will sync to Google Sheets.")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("receipt-timed-progress")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(
      screen.getByRole("button", { name: "Undo reimbursement" })
    );
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("describes a synced reimbursement as recorded in Sheets", () => {
    render(
      <StepReceipt
        {...receipt}
        variant="reimbursement"
        syncStatus="synced"
        isPending={false}
        isSuccess
        isError={false}
      />
    );

    expect(screen.getByText("Reimbursement recorded")).toBeInTheDocument();
    expect(screen.getByText("Saved to Google Sheets.")).toBeInTheDocument();
  });

  it("shows reimbursement error copy only for mutation failure", () => {
    const { rerender } = render(
      <StepReceipt
        {...receipt}
        variant="reimbursement"
        syncStatus="error"
        isPending={false}
        isSuccess
        isError={false}
      />
    );

    expect(screen.queryByText("Reimbursement failed")).not.toBeInTheDocument();

    rerender(
      <StepReceipt
        {...receipt}
        variant="reimbursement"
        syncStatus="error"
        isPending={false}
        isSuccess={false}
        isError
        errorMessage="Amount exceeds remaining reimbursement balance"
      />
    );

    expect(screen.getByText("Reimbursement failed")).toBeInTheDocument();
    expect(
      screen.getByText("Amount exceeds remaining reimbursement balance")
    ).toBeInTheDocument();
  });

  it("supports focused action labels and an explicit progress override", () => {
    render(
      <StepReceipt
        {...receipt}
        isPending={false}
        isSuccess
        isError={false}
        doneLabel="Close"
        undoLabel="Remove entry"
        showTimedProgress={false}
      />
    );

    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove entry" })
    ).toBeInTheDocument();
    expect(screen.queryByTestId("receipt-timed-progress")).not.toBeInTheDocument();
  });
});
