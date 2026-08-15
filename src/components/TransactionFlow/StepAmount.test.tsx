import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PlaceSuggestion } from "../../lib/googlePlaces";
import { StepAmount } from "./StepAmount";
import { useTransactionForm } from "./useTransactionForm";

const starbucks = {
  placeId: "starbucks-asok",
  name: "Starbucks",
} satisfies PlaceSuggestion;

const terminal21 = {
  placeId: "terminal-21",
  name: "Terminal 21",
  secondaryText: "Asok",
} satisfies PlaceSuggestion;

function StepAmountHarness({
  suggestions = [],
  isLoading = false,
  canSearch = false,
  initialNote = "",
  onSubmit = vi.fn(),
  onNearbyPlaceSelect = vi.fn(),
  onSearchPlaces = vi.fn(),
  searchButtonRef,
}: {
  suggestions?: PlaceSuggestion[];
  isLoading?: boolean;
  canSearch?: boolean;
  initialNote?: string;
  onSubmit?: () => void;
  onNearbyPlaceSelect?: (suggestion: PlaceSuggestion) => void;
  onSearchPlaces?: () => void;
  searchButtonRef?: React.Ref<HTMLButtonElement>;
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
      canSearchPlaces={canSearch}
      onNearbyPlaceSelect={(suggestion) => {
        onNearbyPlaceSelect(suggestion);
        form.setFieldValue("note", suggestion.name);
      }}
      onSearchPlaces={onSearchPlaces}
      searchButtonRef={searchButtonRef}
    />
  );
}

describe("StepAmount nearby place suggestions", () => {
  it("replaces an empty note when a structured place is selected", async () => {
    const user = userEvent.setup();
    const onNearbyPlaceSelect = vi.fn();
    render(
      <StepAmountHarness
        suggestions={[starbucks]}
        onNearbyPlaceSelect={onNearbyPlaceSelect}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Use Starbucks as note" })
    );

    expect(screen.getByPlaceholderText("Add a note...")).toHaveValue(
      "Starbucks"
    );
    expect(onNearbyPlaceSelect).toHaveBeenCalledWith(starbucks);
  });

  it("replaces an existing note when a place is selected", async () => {
    const user = userEvent.setup();
    render(
      <StepAmountHarness
        suggestions={[terminal21]}
        initialNote="Lunch"
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Use Terminal 21 as note" })
    );

    expect(screen.getByPlaceholderText("Add a note...")).toHaveValue(
      "Terminal 21"
    );
  });

  it("opens place search even when there are no nearby suggestions", async () => {
    const user = userEvent.setup();
    const onSearchPlaces = vi.fn();
    render(
      <StepAmountHarness
        canSearch
        onSearchPlaces={onSearchPlaces}
      />
    );

    await user.click(screen.getByRole("button", { name: "Search places" }));

    expect(onSearchPlaces).toHaveBeenCalledTimes(1);
  });

  it("exposes the Search button ref for focus restoration", () => {
    const searchButtonRef = createRef<HTMLButtonElement>();
    render(
      <StepAmountHarness canSearch searchButtonRef={searchButtonRef} />
    );

    expect(searchButtonRef.current).toBe(
      screen.getByRole("button", { name: "Search places" })
    );
  });

  it("does not disable submit while suggestions are loading", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<StepAmountHarness isLoading onSubmit={onSubmit} />);

    const submitButton = screen.getByRole("button", { name: /submit/i });
    expect(submitButton).toBeEnabled();

    await user.click(submitButton);

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
