import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaceSuggestion } from "../../lib/googlePlaces";
import { NearbyPlaceChips } from "./NearbyPlaceChips";

const suggestions: PlaceSuggestion[] = Array.from(
  { length: 6 },
  (_, index) => ({
    placeId: `place-${index}`,
    name: `Place ${index}`,
  })
);

function renderChips({
  places = [],
  isLoading = false,
  canSearch = false,
  onSelect = vi.fn(),
  onSearch = vi.fn(),
}: {
  places?: PlaceSuggestion[];
  isLoading?: boolean;
  canSearch?: boolean;
  onSelect?: (suggestion: PlaceSuggestion) => void;
  onSearch?: () => void;
} = {}) {
  return render(
    <NearbyPlaceChips
      suggestions={places}
      isLoading={isLoading}
      canSearch={canSearch}
      onSelect={onSelect}
      onSearch={onSearch}
    />
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("NearbyPlaceChips", () => {
  it("renders nothing without loading, suggestions, or search", () => {
    const { container } = renderChips();

    expect(container).toBeEmptyDOMElement();
  });

  it("renders a quiet loading state after 300 ms", async () => {
    vi.useFakeTimers();
    renderChips({ isLoading: true });

    expect(screen.queryByText("Finding places")).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(screen.getByText("Nearby")).toBeInTheDocument();
    expect(screen.getByText("Finding places")).toBeInTheDocument();
    expect(screen.getByText("Google Maps")).toHaveAttribute("translate", "no");
  });

  it("keeps Search available while nearby places are loading", () => {
    vi.useFakeTimers();
    renderChips({ isLoading: true, canSearch: true });

    expect(
      screen.getByRole("button", { name: "Search places" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Finding places")).not.toBeInTheDocument();
    expect(screen.getByText("Google Maps")).toBeInTheDocument();
  });

  it("caps nearby results at five and renders Search last", () => {
    renderChips({ places: suggestions, canSearch: true });

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(6);
    expect(
      screen.getByRole("button", { name: "Use Place 4 as note" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Use Place 5 as note" })
    ).not.toBeInTheDocument();
    expect(buttons.at(-1)).toHaveAccessibleName("Search places");
  });

  it("renders Search with attribution when nearby results are empty", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    renderChips({ canSearch: true, onSearch });

    const searchButton = screen.getByRole("button", { name: "Search places" });
    expect(searchButton).toBeInTheDocument();
    expect(screen.getByText("Google Maps")).toHaveAttribute("translate", "no");

    await user.click(searchButton);

    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("passes the selected structured suggestion to the owner", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const terminal21 = {
      placeId: "terminal-21",
      name: "Terminal 21",
      secondaryText: "Asok",
    } satisfies PlaceSuggestion;
    renderChips({ places: [terminal21], onSelect });

    await user.click(
      screen.getByRole("button", { name: "Use Terminal 21 as note" })
    );

    expect(onSelect).toHaveBeenCalledWith(terminal21);
  });
});
