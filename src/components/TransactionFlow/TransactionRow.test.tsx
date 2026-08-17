import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TransactionRecord } from "../../lib/types";
import { TransactionRow } from "./TransactionRow";

describe("TransactionRow", () => {
  it("presents an invalid Sheet row as read-only", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const transaction: TransactionRecord = {
      id: "row-7",
      type: "expense",
      amount: 100,
      currency: "THB",
      account: "Cash",
      for: "Me",
      category: "Malformed row",
      date: "2026-08-17T10:00:00.000Z",
      status: "synced",
      createdAt: "2026-08-17T10:00:00.000Z",
      updatedAt: "2026-08-17T10:00:00.000Z",
      sheetRow: 7,
      sheetRowValid: false,
    };

    render(<TransactionRow transaction={transaction} onSelect={onSelect} />);

    const row = screen.getByRole("button", { name: /Read only/i });
    expect(row).toBeDisabled();
    expect(screen.getByText("Read only")).toBeInTheDocument();
    await user.click(row);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
