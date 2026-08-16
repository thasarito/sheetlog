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
  suggestions: [] as PlaceSuggestion[],
  isDebouncing: false,
  isLoading: false,
  isError: false,
  error: null as Error | null,
  sessionError: null as Error | null,
  hasSearched: false,
  isSelecting: false,
  selectionError: null as Error | null,
  selectSuggestion: vi.fn(),
  observedSessionIds: [] as string[],
}));

vi.mock("./usePlaceAutocomplete", () => ({
  usePlaceAutocomplete: (options: { sessionId: string }) => {
    hookState.observedSessionIds.push(options.sessionId);
    return hookState;
  },
}));

function renderField({
  initialValue = "",
  activeResults = [],
  isLoading = false,
  onClear = vi.fn<() => void>(),
  onSubmit = vi.fn<() => void>(),
  onPlaceSelect = vi.fn<(selection: ResolvedPlaceSelection) => void>(),
  nearbySuggestions = [] as PlaceSuggestion[],
  placesEnabled = true,
  reactStrictMode = false,
}: {
  initialValue?: string;
  activeResults?: PlaceSuggestion[];
  isLoading?: boolean;
  onClear?: () => void;
  onSubmit?: () => void;
  onPlaceSelect?: (selection: ResolvedPlaceSelection) => void;
  nearbySuggestions?: PlaceSuggestion[];
  placesEnabled?: boolean;
  reactStrictMode?: boolean;
} = {}) {
  hookState.suggestions = activeResults;
  hookState.isLoading = isLoading;
  hookState.hasSearched = !isLoading;
  hookState.selectSuggestion.mockImplementation(
    async (suggestion: PlaceSuggestion) => ({
      displayName: suggestion.name,
      placeId: suggestion.placeId,
    }),
  );

  function Harness() {
    const [value, setValue] = useState(initialValue);
    return (
      <TransactionNoteField
        value={value}
        onManualChange={setValue}
        onClear={() => {
          onClear();
          setValue("");
        }}
        onPlaceSelect={(selection) => {
          onPlaceSelect(selection);
          setValue(selection.displayName);
        }}
        onSubmit={onSubmit}
        canSubmit
        places={{
          enabled: placesEnabled,
          nearbySuggestions,
          isNearbyLoading: false,
        }}
      />
    );
  }

  const rendered = render(<Harness />, { reactStrictMode });
  return {
    ...rendered,
    refresh() {
      rendered.rerender(<Harness />);
    },
  };
}

beforeEach(() => {
  hookState.suggestions = [];
  hookState.isDebouncing = false;
  hookState.isLoading = false;
  hookState.isError = false;
  hookState.error = null;
  hookState.sessionError = null;
  hookState.hasSearched = false;
  hookState.isSelecting = false;
  hookState.selectionError = null;
  hookState.selectSuggestion.mockReset();
  hookState.observedSessionIds = [];
});

describe("TransactionNoteField", () => {
  it("keeps the flat note visual and clears through a 44px trailing control", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    renderField({ initialValue: "Lunch", onClear });

    const input = screen.getByRole("combobox", { name: "Transaction note" });
    expect(input).toHaveClass("bg-transparent", "pr-10");
    const clear = screen.getByRole("button", { name: "Clear note" });
    expect(clear).toHaveClass("absolute", "size-11");
    await user.click(clear);
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(clear).not.toBeInTheDocument();
    await waitFor(() => expect(input).toHaveFocus());
  });

  it("submits with Enter only while the autocomplete popup is closed", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderField({ onSubmit });
    const input = screen.getByRole("combobox", { name: "Transaction note" });

    await user.type(input, "c{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);

    hookState.isLoading = true;
    await user.type(input, "entral{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("navigates visible options and selects with Enter", async () => {
    const user = userEvent.setup();
    const onPlaceSelect = vi.fn();
    renderField({
      activeResults: [centralCafe, centralWorld],
      onPlaceSelect,
    });
    const input = screen.getByRole("combobox", { name: "Transaction note" });

    await user.type(input, "central{ArrowDown}{ArrowDown}");
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      expect.stringContaining("option-1"),
    );
    expect(screen.getByRole("option", { name: /Central World/ })).toHaveClass(
      "bg-muted",
      "text-foreground",
    );
    await user.keyboard("{Enter}");

    expect(onPlaceSelect).toHaveBeenCalledWith({
      displayName: "Central World",
      placeId: "central-world",
    });
    await waitFor(() => expect(input).toHaveFocus());
  });

  it("renders a bounded overlay and announces loading, results, empty, and error", async () => {
    const user = userEvent.setup();
    const rendered = renderField({ isLoading: true });
    const input = screen.getByRole("combobox", { name: "Transaction note" });
    await user.type(input, "central");

    const listbox = screen.getByRole("listbox");
    expect(listbox).toHaveClass("absolute", "z-50", "max-h-56", "overflow-y-auto");
    expect(listbox.className).not.toContain("shadow");
    expect(screen.getByText("Searching places")).toHaveAttribute(
      "aria-live",
      "polite",
    );

    hookState.isLoading = false;
    hookState.hasSearched = true;
    hookState.suggestions = [centralCafe, centralWorld];
    rendered.refresh();
    expect(screen.getByText("2 places found")).toBeInTheDocument();

    hookState.suggestions = [];
    rendered.refresh();
    expect(screen.getByText("No places found")).toBeInTheDocument();

    hookState.isError = true;
    hookState.error = new Error("private provider text");
    rendered.refresh();
    expect(screen.getByText("Couldn’t search places")).toBeInTheDocument();
    expect(screen.queryByText("private provider text")).not.toBeInTheDocument();
  });

  it("shows nearby choices only for an empty note, caps five, and restores focus", async () => {
    const user = userEvent.setup();
    const onPlaceSelect = vi.fn();
    const nearbySuggestions = Array.from({ length: 6 }, (_, index) => ({
      placeId: `near-${index}`,
      name: `Nearby ${index}`,
    }));
    renderField({ nearbySuggestions, onPlaceSelect });
    const input = screen.getByRole("combobox", { name: "Transaction note" });

    expect(screen.getAllByRole("button", { name: /Use Nearby/ })).toHaveLength(5);
    await user.click(screen.getByRole("button", { name: "Use Nearby 0 as note" }));
    expect(onPlaceSelect).toHaveBeenCalledWith({
      displayName: "Nearby 0",
      placeId: "near-0",
    });
    await waitFor(() => expect(input).toHaveFocus());
    expect(screen.queryByRole("button", { name: /Use Nearby/ })).not.toBeInTheDocument();
  });

  it("protects pointer selection from blur and closes on outside pointer", async () => {
    const user = userEvent.setup();
    const onPlaceSelect = vi.fn();
    renderField({ activeResults: [centralCafe], onPlaceSelect });
    const input = screen.getByRole("combobox", { name: "Transaction note" });
    await user.type(input, "central");
    const option = screen.getByRole("option", { name: /Central Cafe/ });

    expect(fireEvent.pointerDown(option)).toBe(false);
    await user.click(option);
    expect(onPlaceSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(input).toHaveFocus());

    await user.type(input, " more");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("handles Escape and IME composition without submitting or selecting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onPlaceSelect = vi.fn();
    renderField({ activeResults: [centralCafe], onSubmit, onPlaceSelect });
    const input = screen.getByRole("combobox", { name: "Transaction note" });
    await user.type(input, "central");

    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onPlaceSelect).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("drops a deferred selection after the user edits again", async () => {
    const user = userEvent.setup();
    let resolveSelection!: (selection: {
      displayName: string;
      placeId: string;
    }) => void;
    const selected = new Promise<{ displayName: string; placeId: string }>(
      (resolve) => {
        resolveSelection = resolve;
      },
    );
    const onPlaceSelect = vi.fn();
    renderField({ activeResults: [centralCafe], onPlaceSelect });
    hookState.selectSuggestion.mockReturnValue(selected);
    const input = screen.getByRole("combobox", { name: "Transaction note" });
    await user.type(input, "central");
    await user.click(screen.getByRole("option", { name: /Central Cafe/ }));
    await user.type(input, " x");
    resolveSelection({
      displayName: centralCafe.name,
      placeId: centralCafe.placeId,
    });
    await selected;

    expect(onPlaceSelect).not.toHaveBeenCalled();
  });

  it("rotates a failed session on the next edit without a Retry control", async () => {
    const user = userEvent.setup();
    hookState.sessionError = new Error("session unavailable");
    renderField();
    const input = screen.getByRole("combobox", { name: "Transaction note" });
    const initialSession = hookState.observedSessionIds.at(-1);
    await user.type(input, "central");

    expect(hookState.observedSessionIds.at(-1)).not.toBe(initialSession);
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("resets an out-of-bounds active option when results shrink", async () => {
    const user = userEvent.setup();
    const rendered = renderField({ activeResults: [centralCafe, centralWorld] });
    const input = screen.getByRole("combobox", { name: "Transaction note" });
    await user.type(input, "central{ArrowDown}{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant");

    hookState.suggestions = [centralCafe];
    rendered.refresh();
    await waitFor(() =>
      expect(input).not.toHaveAttribute("aria-activedescendant"),
    );
    await user.keyboard("{Enter}");
    expect(hookState.selectSuggestion).not.toHaveBeenCalled();
  });

  it("survives the Strict Mode effect probe and selects exactly once", async () => {
    const user = userEvent.setup();
    const onPlaceSelect = vi.fn();
    renderField({
      activeResults: [centralCafe],
      onPlaceSelect,
      reactStrictMode: true,
    });
    const input = screen.getByRole("combobox", { name: "Transaction note" });
    await user.type(input, "central{ArrowDown}{Enter}");

    expect(onPlaceSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(input).toHaveFocus());
  });
});
