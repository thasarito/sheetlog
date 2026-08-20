import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaceSuggestion } from "../../lib/googlePlaces";
import { TransactionNoteField } from "./TransactionNoteField";
import type { ResolvedPlaceSelection } from "./transactionNoteForm";

const centralCafe = {
  placeId: "central-cafe",
  name: "Central Cafe",
  secondaryText: "1 Main Street",
} satisfies PlaceSuggestion;
const centralWorld = {
  placeId: "central-world",
  name: "Central World",
  secondaryText: "2 Main Street",
} satisfies PlaceSuggestion;

const hookState = vi.hoisted(() => ({
  suggestions: [centralCafe, centralWorld] as PlaceSuggestion[],
  isDebouncing: false,
  isLoading: false,
  isError: false,
  error: null as Error | null,
  sessionError: null as Error | null,
  hasSearched: true,
  isSelecting: false,
  selectionError: null as Error | null,
  selectSuggestion: vi.fn(),
}));

vi.mock("./usePlaceAutocomplete", () => ({
  usePlaceAutocomplete: () => hookState,
}));

function renderField({
  onPlaceSelect = vi.fn<(selection: ResolvedPlaceSelection) => void>(),
  onSubmit = vi.fn<() => void>(),
}: {
  onPlaceSelect?: (selection: ResolvedPlaceSelection) => void;
  onSubmit?: () => void;
} = {}) {
  hookState.selectSuggestion.mockImplementation(
    async (suggestion: PlaceSuggestion) => ({
      displayName: suggestion.name,
      placeId: suggestion.placeId,
    }),
  );

  function Harness() {
    const [value, setValue] = useState("");
    const [searchOverlayTarget, setSearchOverlayTarget] =
      useState<HTMLDivElement | null>(null);

    return (
      <div>
        <div className="relative h-72" data-testid="place-search-stage">
          <div
            ref={setSearchOverlayTarget}
            data-testid="place-search-overlay-target"
            className="absolute inset-0"
          />
        </div>
        <TransactionNoteField
          value={value}
          onManualChange={setValue}
          onClear={() => setValue("")}
          onPlaceSelect={(selection) => {
            onPlaceSelect(selection);
            setValue(selection.displayName);
          }}
          onSubmit={onSubmit}
          canSubmit
          searchOverlayTarget={searchOverlayTarget}
          places={{
            enabled: true,
            nearbySuggestions: [],
            isNearbyLoading: false,
          }}
        />
      </div>
    );
  }

  render(<Harness />);
  return screen.getByRole("combobox", { name: "Transaction note" });
}

beforeEach(() => {
  hookState.suggestions = [centralCafe, centralWorld];
  hookState.isLoading = false;
  hookState.isError = false;
  hookState.error = null;
  hookState.sessionError = null;
  hookState.hasSearched = true;
  hookState.isSelecting = false;
  hookState.selectionError = null;
  hookState.selectSuggestion.mockReset();
});

describe("TransactionNoteField backdrop veil", () => {
  it("portals a flat full-stage result surface above the note field", async () => {
    const user = userEvent.setup();
    const input = renderField();

    await user.type(input, "central");

    const target = screen.getByTestId("place-search-overlay-target");
    const veil = screen.getByTestId("place-search-backdrop-veil");
    const listbox = screen.getByRole("listbox");
    expect(target).toContainElement(veil);
    expect(veil).toHaveClass(
      "absolute",
      "inset-0",
      "pointer-events-auto",
      "overflow-hidden",
    );
    expect(input.parentElement).not.toContainElement(listbox);
    expect(listbox).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-y-auto",
      "overscroll-contain",
    );
    expect(listbox).not.toHaveClass("max-h-56", "rounded-xl", "border");
    expect(
      screen.getByRole("button", { name: "Cancel place search" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 places found")).toBeInTheDocument();
  });

  it("treats portaled results as part of the active field lifecycle", async () => {
    const user = userEvent.setup();
    const onPlaceSelect = vi.fn();
    const input = renderField({ onPlaceSelect });
    await user.type(input, "central");
    const option = screen.getByRole("option", { name: /Central Cafe/ });

    expect(fireEvent.pointerDown(option)).toBe(false);
    await user.click(option);

    expect(onPlaceSelect).toHaveBeenCalledWith({
      displayName: "Central Cafe",
      placeId: "central-cafe",
    });
    await waitFor(() => expect(input).not.toHaveFocus());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("dismisses through Cancel or the backdrop without submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const input = renderField({ onSubmit });
    await user.type(input, "central");

    await user.click(
      screen.getByRole("button", { name: "Cancel place search" }),
    );
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await waitFor(() => expect(input).not.toHaveFocus());

    await user.click(input);
    await user.type(input, " market");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Dismiss place search" }),
    );
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await waitFor(() => expect(input).not.toHaveFocus());
  });
});
