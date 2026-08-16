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
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("status")).toHaveAttribute("aria-atomic", "true");
  });

  it("gives pending precedence over a stale success flag", () => {
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
    expect(screen.queryByTitle("Check")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Done" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Undo reimbursement" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("gives pending precedence over a stale error flag", () => {
    const { container } = render(
      <StepReceipt
        {...receipt}
        variant="reimbursement"
        isPending
        isSuccess={false}
        isError
        errorMessage="Stale failure"
      />
    );

    expect(screen.getByText("Saving reimbursement")).toBeInTheDocument();
    expect(screen.queryByText("Reimbursement failed")).not.toBeInTheDocument();
    expect(screen.queryByText("Stale failure")).not.toBeInTheDocument();
    expect(container.querySelector(".lucide-circle-x")).not.toBeInTheDocument();
    expect(container.querySelector(".lucide-loader-circle")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
    expect(screen.getByRole("alert")).toHaveAttribute("aria-atomic", "true");
    expect(screen.getByRole("alert")).not.toHaveAttribute("aria-live");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps visuals, announcements, and actions aligned across state transitions", () => {
    const { rerender } = render(
      <StepReceipt
        {...receipt}
        variant="reimbursement"
        isPending
        isSuccess={false}
        isError={false}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("Saving reimbursement");
    expect(screen.queryByRole("button", { name: "Done" })).not.toBeInTheDocument();

    rerender(
      <StepReceipt
        {...receipt}
        variant="reimbursement"
        syncStatus="synced"
        isPending={false}
        isSuccess
        isError={false}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("Reimbursement recorded");
    expect(screen.getByTitle("Check")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();

    rerender(
      <StepReceipt
        {...receipt}
        variant="reimbursement"
        isPending={false}
        isSuccess={false}
        isError
        errorMessage="Could not save"
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Reimbursement failed");
    expect(screen.queryByTitle("Check")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Done" })).not.toBeInTheDocument();
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

  it("disables both receipt actions while a destructive action is pending", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    const onUndo = vi.fn();
    render(
      <StepReceipt
        {...receipt}
        variant="reimbursement"
        syncStatus="synced"
        isPending={false}
        isSuccess
        isError={false}
        actionsDisabled
        onDone={onDone}
        onUndo={onUndo}
      />
    );

    const done = screen.getByRole("button", { name: "Done" });
    const undo = screen.getByRole("button", { name: "Undo reimbursement" });
    expect(done).toBeDisabled();
    expect(undo).toBeDisabled();

    await user.click(done);
    await user.click(undo);
    expect(onDone).not.toHaveBeenCalled();
    expect(onUndo).not.toHaveBeenCalled();
  });

  it("keeps a queued exact undo visible and explains the conservative balance", () => {
    render(
      <StepReceipt
        {...receipt}
        variant="reimbursement"
        syncStatus="synced"
        undoOutcome="pending"
        isPending={false}
        isSuccess
        isError={false}
        onDone={vi.fn()}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("Undo queued");
    expect(
      screen.getByText(
        "This reimbursement stays counted until it is removed from Google Sheets.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Undo reimbursement" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Retry undo" }),
    ).not.toBeInTheDocument();
  });

  it("shows an exact undo failure with a retry action", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(
      <StepReceipt
        {...receipt}
        variant="reimbursement"
        syncStatus="synced"
        undoOutcome="error"
        undoErrorMessage="Reconnect to Google to finish undoing this reimbursement."
        isPending={false}
        isSuccess
        isError={false}
        onDone={vi.fn()}
        onUndo={onUndo}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Undo failed");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Reconnect to Google to finish undoing this reimbursement.",
    );
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry undo" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
