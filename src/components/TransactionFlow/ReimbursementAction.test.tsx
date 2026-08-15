import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ReimbursementSummary } from "../../lib/reimbursements";
import { ReimbursementAction } from "./ReimbursementAction";

function summary(
  overrides: Partial<ReimbursementSummary> = {}
): ReimbursementSummary {
  return {
    confirmed: 40,
    queued: 20,
    remaining: 40,
    overReimbursed: 0,
    currencyMismatchIds: [],
    ...overrides,
  };
}

function renderAction({
  value = summary(),
  isChecking = false,
  isError = false,
  needsOnlineVerification = false,
  onRetry = vi.fn(),
  onReimburse = vi.fn(),
}: {
  value?: ReimbursementSummary;
  isChecking?: boolean;
  isError?: boolean;
  needsOnlineVerification?: boolean;
  onRetry?: () => void;
  onReimburse?: () => void;
} = {}) {
  render(
    <ReimbursementAction
      summary={value}
      currency="THB"
      isChecking={isChecking}
      isError={isError}
      needsOnlineVerification={needsOnlineVerification}
      onRetry={onRetry}
      onReimburse={onReimburse}
    />
  );
}

describe("ReimbursementAction", () => {
  it("shows confirmed, queued, and remaining amounts compactly", () => {
    renderAction();

    const balance = screen.getByRole("group", {
      name: "Reimbursement balance",
    });
    expect(within(balance).getByText("Confirmed").parentElement).toHaveTextContent(
      "ConfirmedTHB 40"
    );
    expect(within(balance).getByText("Queued").parentElement).toHaveTextContent(
      "QueuedTHB 20"
    );
    expect(within(balance).getByText("Remaining").parentElement).toHaveTextContent(
      "RemainingTHB 40"
    );
  });

  it("disables entry while checking reimbursements", async () => {
    const user = userEvent.setup();
    const onReimburse = vi.fn();
    renderAction({
      value: summary({ confirmed: 0, queued: 0, remaining: 0 }),
      isChecking: true,
      onReimburse,
    });

    expect(screen.getByText("Checking reimbursements...")).toBeInTheDocument();
    const action = screen.getByRole("button", { name: "Reimburse" });
    expect(action).toBeDisabled();
    await user.click(action);
    expect(onReimburse).not.toHaveBeenCalled();
  });

  it("shows an inline Retry action when balance loading fails", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onReimburse = vi.fn();
    renderAction({ isError: true, onRetry, onReimburse });

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Reimburse" })).toBeDisabled();
    expect(onReimburse).not.toHaveBeenCalled();
  });

  it("permits a known positive balance offline and warns that it will be verified", async () => {
    const user = userEvent.setup();
    const onReimburse = vi.fn();
    renderAction({ needsOnlineVerification: true, onReimburse });

    expect(
      screen.getByText("Balance will be verified when online")
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reimburse" }));

    expect(onReimburse).toHaveBeenCalledTimes(1);
  });

  it("shows a disabled fully reimbursed state at zero remaining", () => {
    const onReimburse = vi.fn();
    renderAction({
      value: summary({ confirmed: 80, queued: 20, remaining: 0 }),
      onReimburse,
    });

    expect(
      screen.getByRole("button", { name: "Fully reimbursed" })
    ).toBeDisabled();
    expect(onReimburse).not.toHaveBeenCalled();
  });

  it("surfaces currency mismatches and disables reimbursement", () => {
    renderAction({
      value: summary({ currencyMismatchIds: ["child-2"] }),
    });

    expect(
      screen.getByText("Currency mismatch in linked reimbursements")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reimburse" })).toBeDisabled();
  });

  it("surfaces over-reimbursement and disables reimbursement", () => {
    renderAction({
      value: summary({
        confirmed: 110,
        queued: 0,
        remaining: 0,
        overReimbursed: 10,
      }),
    });

    expect(screen.getByText("Over-reimbursed by THB 10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reimburse" })).toBeDisabled();
  });

  it("does not call the action for an unknown remaining balance", () => {
    const onReimburse = vi.fn();
    renderAction({ value: summary({ remaining: Number.NaN }), onReimburse });

    screen.getByRole("button", { name: "Reimburse" }).click();

    expect(onReimburse).not.toHaveBeenCalled();
  });
});
