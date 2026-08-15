import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import type { PlaceSuggestion } from "../../lib/googlePlaces";
import { PlaceSearchDrawer } from "./PlaceSearchDrawer";

const suggestions: PlaceSuggestion[] = [
  {
    placeId: "place-1",
    name: "Coffee House",
    secondaryText: "123 Main Street",
  },
];

function renderDrawer(
  overrides: Partial<React.ComponentProps<typeof PlaceSearchDrawer>> = {}
) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    input: "coffee",
    onInputChange: vi.fn(),
    suggestions,
    isLoading: false,
    isError: false,
    error: null,
    isSelecting: false,
    onRetry: vi.fn(),
    onSelect: vi.fn(),
    ...overrides,
  };
  return { ...render(<PlaceSearchDrawer {...props} />), props };
}

describe("PlaceSearchDrawer", () => {
  it("focuses its dedicated search input when opened", async () => {
    renderDrawer({ input: "" });

    await waitFor(() => {
      expect(screen.getByRole("searchbox", { name: "Search places" })).toHaveFocus();
    });
  });

  it("emits changes from the dedicated place query input", () => {
    const { props } = renderDrawer();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search places" }), {
      target: { value: "tea" },
    });

    expect(props.onInputChange).toHaveBeenCalledWith("tea");
  });

  it("renders place names, addresses, and Google Maps attribution", () => {
    renderDrawer();

    expect(screen.getByRole("dialog", { name: "Search places" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Coffee House.*123 Main Street/i })).toBeVisible();
    expect(screen.getByText("Coffee House")).toBeVisible();
    expect(screen.getByText("123 Main Street")).toBeVisible();
    expect(screen.getByText("Google Maps")).toHaveClass("text-xs", "font-normal");
    expect(screen.getByText("Google Maps")).toHaveAttribute("translate", "no");
  });

  it("emits a place suggestion and disables result buttons while selecting", async () => {
    const { props, rerender } = renderDrawer();
    const result = screen.getByRole("button", { name: /Coffee House.*123 Main Street/i });

    fireEvent.click(result);
    expect(props.onSelect).toHaveBeenCalledWith(suggestions[0]);
    expect(props.onOpenChange).not.toHaveBeenCalled();

    rerender(<PlaceSearchDrawer {...props} isSelecting />);
    expect(screen.getByRole("button", { name: /Coffee House.*123 Main Street/i })).toBeDisabled();
  });

  it("keeps the query visible when an error is retried inline", async () => {
    const { props } = renderDrawer({
      input: "coffee",
      suggestions: [],
      isError: true,
      error: new Error("Google Maps is unavailable"),
    });

    expect(screen.getByRole("searchbox", { name: "Search places" })).toHaveValue("coffee");
    expect(screen.getByText("Google Maps is unavailable")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("searchbox", { name: "Search places" })).toHaveValue("coffee");
  });
});
