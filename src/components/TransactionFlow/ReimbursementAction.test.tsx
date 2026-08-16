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

function expectSilentPresentation(accessibleName: string) {
  expect(
    screen.queryAllByText(/confirmed|queued|remaining/i)
  ).toHaveLength(0);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

  const status = screen.getByRole("status");
  expect(status).toHaveClass("sr-only");
  expect(status).toHaveAttribute("aria-live", "polite");
  expect(status).toHaveAttribute("aria-atomic", "true");
  expect(status.textContent).toBe(accessibleName);
  expect(screen.getAllByText(accessibleName, { exact: true })).toEqual([
    status,
  ]);
}

function expectSingleDecorativeIcon(action: HTMLElement) {
  const icons = action.querySelectorAll("svg");
  expect(icons).toHaveLength(1);
  const icon = icons[0];
  expect(icon).toBeInTheDocument();
  expect(icon).toHaveAttribute("aria-hidden", "true");
  return icon;
}

describe("ReimbursementAction", () => {
  it("renders one silent reimbursement icon without balance copy", async () => {
    const user = userEvent.setup();
    const onReimburse = vi.fn();
    renderAction({ onReimburse });

    expectSilentPresentation("Reimburse");
    expect(screen.getAllByRole("button")).toHaveLength(1);

    const action = screen.getByRole("button", { name: "Reimburse" });
    expect(action).toBeEnabled();
    expect(action.textContent).toBe("");
    expect(action).toHaveClass("h-11", "w-11");
    expectSingleDecorativeIcon(action);

    await user.click(action);
    expect(onReimburse).toHaveBeenCalledTimes(1);
  });

  it("uses a disabled loading icon while checking", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onReimburse = vi.fn();
    renderAction({ isChecking: true, isError: true, onRetry, onReimburse });

    const action = screen.getByRole("button", {
      name: "Checking reimbursements",
    });
    expect(action).toBeDisabled();
    expect(expectSingleDecorativeIcon(action)).toHaveClass(
      "animate-spin",
      "motion-reduce:animate-none"
    );
    expectSilentPresentation("Checking reimbursements");

    await user.click(action);
    expect(onRetry).not.toHaveBeenCalled();
    expect(onReimburse).not.toHaveBeenCalled();
  });

  it("uses the silent icon as the retry control after a check failure", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onReimburse = vi.fn();
    renderAction({ isError: true, onRetry, onReimburse });

    expectSilentPresentation("Retry reimbursement check");
    const action = screen.getByRole("button", {
      name: "Retry reimbursement check",
    });
    expect(action).toBeEnabled();
    expectSingleDecorativeIcon(action);

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

      expectSilentPresentation(accessibleName);
      const action = screen.getByRole("button", { name: accessibleName });
      expect(action).toBeDisabled();
      expectSingleDecorativeIcon(action);

      await user.click(action);
      expect(onRetry).not.toHaveBeenCalled();
      expect(onReimburse).not.toHaveBeenCalled();
    }
  );

  it("keeps a known positive best-known balance actionable without warning copy", async () => {
    const user = userEvent.setup();
    const onReimburse = vi.fn();
    renderAction({ value: summary({ remaining: 25 }), onReimburse });

    expectSilentPresentation("Reimburse");
    const action = screen.getByRole("button", { name: "Reimburse" });
    expect(action).toBeEnabled();

    await user.click(action);
    expect(onReimburse).toHaveBeenCalledTimes(1);
  });
});
