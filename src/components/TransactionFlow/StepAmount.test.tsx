import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StepAmount } from "./StepAmount";
import { useTransactionForm } from "./useTransactionForm";

function StepAmountHarness({
  suggestions = [],
  isLoading = false,
  initialNote = "",
  onSubmit = vi.fn(),
}: {
  suggestions?: string[];
  isLoading?: boolean;
  initialNote?: string;
  onSubmit?: () => void;
}) {
  const form = useTransactionForm({
    initialValues: {
      category: "Coffee",
      amount: "125",
      currency: "THB",
      account: "Wallet",
      note: initialNote,
    },
  });

  return (
    <StepAmount
      form={form}
      accounts={["Wallet"]}
      onBack={vi.fn()}
      onSubmit={onSubmit}
      nearbyPlaceSuggestions={suggestions}
      isNearbyPlacesLoading={isLoading}
      onNearbyPlaceSelect={(placeName) => form.setFieldValue("note", placeName)}
    />
  );
}

describe("StepAmount nearby place suggestions", () => {
  it("replaces an empty note when a place chip is tapped", async () => {
    const user = userEvent.setup();

    render(<StepAmountHarness suggestions={["Starbucks"]} />);

    await user.click(screen.getByRole("button", { name: "Use Starbucks as note" }));

    expect(screen.getByPlaceholderText("Add a note...")).toHaveValue("Starbucks");
  });

  it("replaces an existing note when a place chip is tapped", async () => {
    const user = userEvent.setup();

    render(<StepAmountHarness suggestions={["Terminal 21"]} initialNote="Lunch" />);

    await user.click(screen.getByRole("button", { name: "Use Terminal 21 as note" }));

    expect(screen.getByPlaceholderText("Add a note...")).toHaveValue("Terminal 21");
  });

  it("does not disable submit while suggestions are loading", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<StepAmountHarness isLoading onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
