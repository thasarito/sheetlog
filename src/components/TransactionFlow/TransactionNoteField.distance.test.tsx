import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionNoteField } from "./TransactionNoteField";
import { usePlaceAutocomplete } from "./usePlaceAutocomplete";

vi.mock("./usePlaceAutocomplete", () => ({ usePlaceAutocomplete: vi.fn() }));

const props = {
  value: "ca",
  onManualChange: vi.fn(), onClear: vi.fn(), onPlaceSelect: vi.fn(), onSubmit: vi.fn(),
  canSubmit: false,
  places: {
    enabled: true, nearbySuggestions: [], isNearbyLoading: false,
    locationBias: { lat: 13.7563, lng: 100.5018 },
  },
};

beforeEach(() => {
  vi.mocked(usePlaceAutocomplete).mockReturnValue({
    suggestions: [
      { placeId: "here", name: "Here Cafe", distanceMeters: 0 },
      { placeId: "near", name: "Near Cafe", distanceMeters: 250 },
      { placeId: "far", name: "Far Cafe", distanceMeters: 1234 },
      { placeId: "unknown", name: "Unknown Cafe" },
    ],
    isDebouncing: false, isLoading: false, isError: false, error: null,
    sessionError: null, hasSearched: true, isSelecting: false, selectionError: null,
    selectSuggestion: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function openResults() {
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "cafe" } });
}

describe("place search distance labels", () => {
  it("shows metres and kilometres, including zero, and leaves unknown distances blank", () => {
    render(<TransactionNoteField {...props} />);
    openResults();
    expect(screen.getByText("0 m")).toBeTruthy();
    expect(screen.getByText("250 m")).toBeTruthy();
    expect(screen.getByText("1.2 km")).toBeTruthy();
    const options = screen.getAllByRole("option");
    expect(options[3].textContent).toBe("Unknown Cafe");
    expect(screen.getAllByTitle("Straight-line distance")).toHaveLength(3);
  });

  it("clears the keyboard highlight when location changes before results reorder", () => {
    const { rerender } = render(<TransactionNoteField {...props} />);
    openResults();
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBeTruthy();

    rerender(<TransactionNoteField {...props} places={{
      ...props.places, locationBias: { lat: 13.8, lng: 100.6 },
    }} />);
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
  });
});
