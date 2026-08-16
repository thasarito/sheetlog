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
    selectionError: null,
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

  it("renders place names and addresses without attribution", () => {
    renderDrawer();

    expect(screen.getByRole("dialog", { name: "Search places" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Coffee House.*123 Main Street/i })).toBeVisible();
    expect(screen.getByText("Coffee House")).toBeVisible();
    expect(screen.getByText("123 Main Street")).toBeVisible();
    expect(
      screen.queryByText("Google Maps", { exact: true })
    ).not.toBeInTheDocument();
  });

  it("emits a place suggestion and disables result buttons while selecting", async () => {
    const { props, rerender } = renderDrawer();
    const result = screen.getByRole("button", { name: /Coffee House.*123 Main Street/i });

    fireEvent.click(result);
    expect(props.onSelect).toHaveBeenCalledWith(suggestions[0]);
    expect(props.onOpenChange).not.toHaveBeenCalled();

    rerender(<PlaceSearchDrawer {...props} isSelecting />);
    expect(screen.getByRole("button", { name: /Coffee House.*123 Main Street/i })).toBeDisabled();
    expect(screen.getByRole("searchbox", { name: "Search places" })).toBeDisabled();
  });

  it("does not dismiss while a selection is pending", () => {
    const { props } = renderDrawer({ isSelecting: true });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it("shows selection recovery guidance without a query retry action", () => {
    const { props } = renderDrawer({
      selectionError: new Error("selection unavailable"),
    });

    expect(screen.getByText("Couldn’t select that place. Tap it again.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    const result = screen.getByRole("button", { name: /Coffee House.*123 Main Street/i });
    expect(result).toBeEnabled();
    fireEvent.click(result);
    expect(props.onSelect).toHaveBeenCalledWith(suggestions[0]);
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
