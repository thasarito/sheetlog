import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InstallGateScreen } from "./InstallGateScreen";

const transaction = {
  id: "transaction-1",
  type: "expense" as const,
  amount: 120,
  currency: "THB",
  account: "KBank",
  for: "Me",
  category: "Coffee & Snacks",
  date: "2026-08-26T10:00:00.000Z",
  status: "pending" as const,
  createdAt: "2026-08-26T10:00:00.000Z",
  updatedAt: "2026-08-26T10:00:00.000Z",
};

describe("InstallGateScreen", () => {
  it("uses the playful install layout while keeping the hard gate", () => {
    render(<InstallGateScreen transaction={transaction} />);

    expect(screen.getByTestId("tiny-win-mascot")).toBeVisible();
    expect(
      screen.getByRole("heading", {
        name: "Install SheetLog to keep your first log.",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Install SheetLog/ }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "iPhone" }),
    ).toHaveAttribute("aria-pressed");
    expect(screen.queryByText(/Continue in browser/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/No transaction has been stored in this browser/),
    ).toBeVisible();
  });

  it("lets the user switch platform instructions", () => {
    render(<InstallGateScreen transaction={transaction} />);

    fireEvent.click(screen.getByRole("button", { name: "Android" }));
    expect(
      screen.getByText("Approve Chrome’s installation prompt."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Android" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
