import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import globalsCss from "../../styles/globals.css?raw";
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

describe("StepReceipt ledger timeline", () => {
  it("renders a full-canvas timeline for a synced transaction", () => {
    render(
      <StepReceipt
        {...receipt}
        syncStatus="synced"
        isPending={false}
        isSuccess
        isError={false}
      />,
    );

    expect(screen.getByTestId("step-receipt")).toHaveAttribute(
      "data-transaction-step",
      "receipt",
    );
    expect(screen.getByTestId("receipt-amount-card")).toHaveTextContent(
      "THB 248",
    );
    expect(screen.getByTestId("receipt-timeline")).toBeInTheDocument();
    expect(screen.getByTestId("receipt-timeline-step-captured")).toHaveAttribute(
      "data-state",
      "complete",
    );
    expect(screen.getByTestId("receipt-timeline-step-local")).toHaveAttribute(
      "data-state",
      "complete",
    );
    expect(screen.getByTestId("receipt-timeline-step-sync")).toHaveAttribute(
      "data-state",
      "complete",
    );
    expect(screen.getByText("Captured")).toBeInTheDocument();
    expect(screen.getByText("Saved locally")).toBeInTheDocument();
    expect(screen.getByText("Synced to Sheets")).toBeInTheDocument();
    expect(globalsCss).toContain(
      ':has([data-transaction-step="receipt"])',
    );
  });

  it("separates local completion from queued Google Sheets sync", () => {
    render(
      <StepReceipt
        {...receipt}
        variant="reimbursement"
        syncStatus="pending"
        isPending={false}
        isSuccess
        isError={false}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Reimbursement queued",
    );
    expect(screen.getByTestId("receipt-timeline-step-local")).toHaveAttribute(
      "data-state",
      "complete",
    );
    expect(screen.getByTestId("receipt-timeline-step-sync")).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByText("Queued for Google Sheets.")).toBeInTheDocument();
  });

  it("does not claim local or remote completion when saving fails", () => {
    render(
      <StepReceipt
        {...receipt}
        isPending={false}
        isSuccess={false}
        isError
        errorMessage="Could not save"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Save failed");
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save");
    expect(screen.getByTestId("receipt-timeline-step-local")).toHaveAttribute(
      "data-state",
      "error",
    );
    expect(screen.getByTestId("receipt-timeline-step-sync")).toHaveAttribute(
      "data-state",
      "pending",
    );
  });

  it("turns a queued reimbursement undo into a removal timeline", () => {
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
      />,
    );

    expect(screen.getByText("Undo requested")).toBeInTheDocument();
    expect(screen.getByText("Queued locally")).toBeInTheDocument();
    expect(screen.getByText("Removed from Sheets")).toBeInTheDocument();
    expect(screen.getByTestId("receipt-timeline-step-sync")).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Undo reimbursement" }),
    ).not.toBeInTheDocument();
  });
});
