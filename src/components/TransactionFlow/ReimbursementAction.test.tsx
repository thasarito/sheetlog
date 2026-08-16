import { render, screen } from "@testing-library/react";
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
  isDeleting = false,
  onRetry = vi.fn(),
  onReimburse = vi.fn(),
}: {
  value?: ReimbursementSummary;
  isChecking?: boolean;
  isError?: boolean;
  isDeleting?: boolean;
  onRetry?: () => void;
  onReimburse?: () => void;
} = {}) {
  render(
    <ReimbursementAction
      summary={value}
      isChecking={isChecking}
      isError={isError}
      isDeleting={isDeleting}
      onRetry={onRetry}
      onReimburse={onReimburse}
    />
  );
}

function expectSilentPresentation() {
  expect(
    screen.queryAllByText(
      /confirmed|queued|remaining|checking reimbursements|retry|fully reimbursed|mismatch|over-reimbursed|balance will be verified/i
    )
  ).toHaveLength(0);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
}

function expectIcon(action: HTMLElement, iconClass: string) {
  const icon = action.querySelector("svg");
  expect(icon).toBeInTheDocument();
  expect(icon).toHaveClass(iconClass);
  expect(icon).toHaveAttribute("aria-hidden", "true");
}

describe("ReimbursementAction", () => {
  it("renders one silent reimbursement icon without balance copy", async () => {
    const user = userEvent.setup();
    const onReimburse = vi.fn();
    renderAction({ onReimburse });

    expectSilentPresentation();
    expect(screen.getAllByRole("button")).toHaveLength(1);

    const action = screen.getByRole("button", { name: "Reimburse" });
    expect(action).toBeEnabled();
    expect(action.textContent).toBe("");
    expect(action).toHaveClass("h-11", "w-11");
    expectIcon(action, "lucide-hand-coins");

    await user.click(action);
    expect(onReimburse).toHaveBeenCalledTimes(1);
  });

  it("uses a disabled loading icon while checking", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onReimburse = vi.fn();
    renderAction({ isChecking: true, isError: true, onRetry, onReimburse });

    expectSilentPresentation();
    const action = screen.getByRole("button", {
      name: "Checking reimbursements",
    });
    expect(action).toBeDisabled();
    expectIcon(action, "lucide-loader-circle");
    expect(action.querySelector("svg")).toHaveClass("animate-spin");

    await user.click(action);
    expect(onRetry).not.toHaveBeenCalled();
    expect(onReimburse).not.toHaveBeenCalled();
  });

  it("uses the silent icon as the retry control after a check failure", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onReimburse = vi.fn();
    renderAction({ isError: true, onRetry, onReimburse });

    expectSilentPresentation();
    const action = screen.getByRole("button", {
      name: "Retry reimbursement check",
    });
    expect(action).toBeEnabled();
    expectIcon(action, "lucide-rotate-ccw");

    await user.click(action);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onReimburse).not.toHaveBeenCalled();
  });

  it.each<{
    name: string;
    value: ReimbursementSummary;
    isChecking?: boolean;
    isError?: boolean;
    isDeleting?: boolean;
    accessibleName: string;
  }>([
    {
      name: "fully reimbursed",
      value: summary({ remaining: 0 }),
      accessibleName: "Fully reimbursed",
    },
    {
      name: "currency mismatch",
      value: summary({ currencyMismatchIds: ["child-2"] }),
      accessibleName: "Reimbursement unavailable",
    },
    {
      name: "over-reimbursed",
      value: summary({ remaining: 0, overReimbursed: 10 }),
      accessibleName: "Reimbursement unavailable",
    },
    {
      name: "unknown balance",
      value: summary({ remaining: Number.NaN }),
      accessibleName: "Reimbursement unavailable",
    },
    {
      name: "source deletion",
      value: summary(),
      isChecking: true,
      isError: true,
      isDeleting: true,
      accessibleName: "Reimbursement unavailable",
    },
  ])(
    "disables the icon for $name",
    async ({
      value,
      isChecking,
      isError,
      isDeleting,
      accessibleName,
    }) => {
      const user = userEvent.setup();
      const onRetry = vi.fn();
      const onReimburse = vi.fn();
      renderAction({
        value,
        isChecking,
        isError,
        isDeleting,
        onRetry,
        onReimburse,
      });

      expectSilentPresentation();
      const action = screen.getByRole("button", { name: accessibleName });
      expect(action).toBeDisabled();
      expectIcon(action, "lucide-hand-coins");

      await user.click(action);
      expect(onRetry).not.toHaveBeenCalled();
      expect(onReimburse).not.toHaveBeenCalled();
    }
  );

  it("keeps a known positive best-known balance actionable without warning copy", async () => {
    const user = userEvent.setup();
    const onReimburse = vi.fn();
    renderAction({ value: summary({ remaining: 25 }), onReimburse });

    expectSilentPresentation();
    const action = screen.getByRole("button", { name: "Reimburse" });
    expect(action).toBeEnabled();

    await user.click(action);
    expect(onReimburse).toHaveBeenCalledTimes(1);
  });
});
