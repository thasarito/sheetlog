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
  onSelect = vi.fn(),
}: {
  places?: PlaceSuggestion[];
  isLoading?: boolean;
  onSelect?: (suggestion: PlaceSuggestion) => void;
} = {}) {
  return render(
    <NearbyPlaceChips
      suggestions={places}
      isLoading={isLoading}
      onSelect={onSelect}
    />
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("NearbyPlaceChips", () => {
  it("renders nothing without loading or suggestions", () => {
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
    expect(
      screen.queryByText("Google Maps", { exact: true })
    ).not.toBeInTheDocument();
  });

  it("caps nearby results at five without a Search control", () => {
    renderChips({ places: suggestions });

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(5);
    expect(
      screen.getByRole("button", { name: "Use Place 4 as note" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Use Place 5 as note" })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Search places" })).not.toBeInTheDocument();
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
