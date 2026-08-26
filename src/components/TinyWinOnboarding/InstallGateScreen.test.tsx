import { render, screen } from "@testing-library/react";
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
  it("requires installation and never offers browser continuation", () => {
    render(<InstallGateScreen transaction={transaction} />);
    expect(
      screen.getByRole("button", { name: /Install SheetLog/ }),
    ).toBeVisible();
    expect(screen.queryByText(/Continue in browser/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/No transaction has been stored in this browser/),
    ).toBeVisible();
  });
});
